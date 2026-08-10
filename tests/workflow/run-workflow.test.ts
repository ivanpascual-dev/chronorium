import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { projectRoot } from '../../src/paths.ts';

// T3: un test de forma, no de comportamiento (lo dice el plan de la fase 5). No sustituye a T7
// (ejecutarlo de verdad): comprueba que las garantías que RF-C06, RF-C04, A6 y A4 exigen están
// declaradas en el fichero que CI sí ejecuta, en vez de vivir como buena intención en un YAML que
// nadie parsea.

const workflowPath = join(projectRoot, '.github', 'workflows', 'run.yml');
const raw = readFileSync(workflowPath, 'utf8');
const workflow = parseYaml(raw) as Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function jobs(): Record<string, unknown> {
  const value = workflow.jobs;
  if (!isRecord(value)) {
    throw new Error('el workflow no declara jobs');
  }
  return value;
}

function onlyJob(): Record<string, unknown> {
  const all = jobs();
  const values = Object.values(all);
  assert.equal(values.length, 1, 'el reutilizable declara un único job');
  const job = values[0];
  if (!isRecord(job)) {
    throw new Error('el job no es un objeto');
  }
  return job;
}

interface Step {
  readonly id?: string;
  readonly name?: string;
  readonly uses?: string;
  readonly run?: string;
  readonly with?: Record<string, unknown>;
  readonly if?: string;
  readonly [key: string]: unknown;
}

function steps(): readonly Step[] {
  const job = onlyJob();
  const value = job.steps;
  if (!Array.isArray(value)) {
    throw new Error('el job no declara steps');
  }
  return value as Step[];
}

function stepById(id: string): Step {
  const found = steps().find((step) => step.id === id);
  assert.ok(found !== undefined, `falta el paso con id "${id}"`);
  return found as Step;
}

function stepIndex(id: string): number {
  const index = steps().findIndex((step) => step.id === id);
  assert.ok(index >= 0, `falta el paso con id "${id}"`);
  return index;
}

test('el workflow parsea como YAML válido', () => {
  assert.ok(isRecord(workflow));
});

test('declara on.workflow_call con un input "recipe" requerido', () => {
  const on = workflow.on;
  assert.ok(isRecord(on), 'declara "on"');
  const workflowCall = (on as Record<string, unknown>).workflow_call;
  assert.ok(isRecord(workflowCall), 'declara "on.workflow_call"');
  const inputs = (workflowCall as Record<string, unknown>).inputs;
  assert.ok(isRecord(inputs), 'declara "on.workflow_call.inputs"');
  const recipe = (inputs as Record<string, unknown>).recipe;
  assert.ok(isRecord(recipe), 'declara el input "recipe"');
  assert.equal((recipe as Record<string, unknown>).required, true);
});

// RF-C06: la diaria y la semanal del lunes se serializan porque comparten instancia, no porque
// compartan receta. Agrupar por receta (trampa #3 del plan) dejaría que dos procesos distintos
// escribieran runs.ndjson y empujaran al mismo repositorio a la vez.
test('declara concurrency por repositorio del llamador, no por receta, y no cancela en curso', () => {
  const concurrency = workflow.concurrency;
  assert.ok(isRecord(concurrency), 'declara "concurrency"');
  const group = String((concurrency as Record<string, unknown>).group ?? '');
  assert.ok(group.includes('github.repository'), 'el grupo depende de github.repository');
  assert.ok(!group.includes('inputs.recipe'), 'el grupo NO depende del nombre de la receta');
  assert.equal((concurrency as Record<string, unknown>)['cancel-in-progress'], false);
});

test('permissions.contents: write, para poder commitear y empujar de vuelta a la instancia', () => {
  const permissions = workflow.permissions;
  assert.ok(isRecord(permissions));
  assert.equal((permissions as Record<string, unknown>).contents, 'write');
});

test('ninguna acción de terceros va sin versión fijada (nunca @main ni @master, nunca sin @)', () => {
  const forbidden = new Set(['main', 'master', 'HEAD', '']);
  for (const step of steps()) {
    if (step.uses === undefined) {
      continue;
    }
    const [, ref] = step.uses.split('@');
    assert.ok(
      ref !== undefined && !forbidden.has(ref),
      `"${step.uses}" no está fijado a una versión`,
    );
  }
});

// A6/ADR-014: el checkout de la herramienta va pinado a la referencia exacta que el llamador puso
// en su "uses:", no a una rama. `job.workflow_repository`/`job.workflow_sha` es el mecanismo que
// T0 verificó contra la documentación de GitHub (no `github.workflow_sha`, que en un reusable
// workflow refleja al workflow de nivel superior, no a este fichero).
test('dos checkouts: la instancia primero, y la herramienta pinada a job.workflow_sha, nunca a main', () => {
  const checkouts = steps().filter((step) => step.uses?.startsWith('actions/checkout@'));
  assert.equal(checkouts.length, 2, 'dos checkouts: instancia y herramienta');

  const [instancia, herramienta] = checkouts;
  assert.equal(instancia?.with, undefined, 'el primer checkout es el del llamador, sin "with"');

  const withHerramienta = herramienta?.with ?? {};
  const ref = String(withHerramienta.ref ?? '');
  const repository = String(withHerramienta.repository ?? '');
  assert.ok(ref.includes('job.workflow_sha'), 'pinado a job.workflow_sha, no a una rama');
  assert.ok(repository.includes('job.workflow_repository'));
  assert.ok(!ref.includes('main') && !ref.includes('master'));
});

// A4: el paso que ejecuta la herramienta no puede volcar el entorno ni el contexto de secretos.
test('el paso que ejecuta "run" no imprime variables de entorno ni el contexto de secretos', () => {
  const ejecutar = stepById('ejecutar');
  const script = ejecutar.run ?? '';
  assert.ok(!/\bprintenv\b/.test(script));
  assert.ok(!/(^|\n)\s*env\s*($|\n)/.test(script));
  assert.ok(!script.includes('toJSON(secrets)'));
  assert.ok(!script.includes('toJSON(env)'));
});

// D3/T0: si algún paso vuelca `secrets` para exportarlo como entorno (la única vía que respeta que
// el nombre de la variable lo elija la receta, no el workflow público), cada valor tiene que
// quedar enmascarado antes de poder aparecer en ningún log, no solo confiar en el enmascarado
// automático (que la documentación no garantiza para valores transformados).
test('si algún paso serializa secrets, enmascara cada valor antes de exponerlo (nunca los imprime en claro)', () => {
  const withSecretsDump = steps().filter((step) => (step.run ?? '').includes('toJSON(secrets)'));
  for (const step of withSecretsDump) {
    assert.ok(
      (step.run ?? '').includes('add-mask'),
      `el paso "${step.id}" serializa secrets sin enmascarar cada valor`,
    );
  }
});

// Contrato #6 de la fase: un fallo de entrega (código 4) tiene informe archivado y línea en el
// registro, y los dos tienen que volver al repositorio aunque el job acabe marcado como fallido.
test('el commit y el push ocurren antes del paso que decide si el job falla', () => {
  assert.ok(stepIndex('ejecutar') < stepIndex('commit'), '"run" se ejecuta antes de commitear');
  assert.ok(stepIndex('commit') < stepIndex('doctor'), 'se commitea antes de "doctor"');
  assert.ok(stepIndex('doctor') < stepIndex('salir'), '"doctor" corre antes del paso que sale');
});

// RF-G06/trampa #4: abortar en cuanto "run" devuelva distinto de cero perdería el commit del
// archivo y del registro justo en el caso en que más falta hacen. El paso "ejecutar" tiene que
// capturar el código sin dejar que la propia falla del step interrumpa el job.
test('"run" captura su código de salida sin abortar el job de inmediato', () => {
  const ejecutar = stepById('ejecutar');
  const script = ejecutar.run ?? '';
  assert.ok(
    script.includes('exit-code') || script.includes('exitCode'),
    'el paso guarda el código de salida de "run" en un output',
  );
});

test('el job sale con el código que devolvió "run", incluso si "doctor" ya falló antes', () => {
  const salir = stepById('salir');
  const script = salir.run ?? '';
  assert.ok(script.includes('steps.ejecutar.outputs'), 'usa el output guardado por "ejecutar"');
  assert.equal(salir.if, 'always()', 'corre siempre, aunque un paso anterior haya fallado');
});

// Trampa #6: ningún valor por defecto silencioso para un input ausente, misma prohibición que en
// el código (docs/CLAUDE.md, "rellenar campos ausentes... con valores por defecto silenciosos").
test('recipes-root y data-root son opcionales con valor por defecto declarado; recipe no tiene ninguno', () => {
  const inputs = ((workflow.on as Record<string, unknown>).workflow_call as Record<string, unknown>)
    .inputs as Record<string, unknown>;

  const recipesRoot = inputs['recipes-root'] as Record<string, unknown> | undefined;
  const dataRoot = inputs['data-root'] as Record<string, unknown> | undefined;
  const recipe = inputs.recipe as Record<string, unknown>;

  assert.ok(recipesRoot?.default !== undefined, 'recipes-root declara su valor por defecto');
  assert.ok(dataRoot?.default !== undefined, 'data-root declara su valor por defecto');
  assert.equal(recipe.default, undefined, '"recipe" no lleva valor por defecto: es obligatorio');
});

test('ningún paso imprime el input recipe ni el correo del dueño (RF-A02 aplica también aquí)', () => {
  // R12/prohibición de la constitución: nada de dominio (nombre de receta, destinatario) vive en
  // el repositorio público. El workflow puede RECIBIR "recipe" como input, pero no puede tener
  // ningún nombre de receta ni dirección de correo escritos a mano en el propio fichero.
  const withoutBotIdentity = raw.replace(/[\w.-]*noreply[\w.-]*/gi, '');
  assert.ok(!/@[a-z0-9.-]+\.[a-z]{2,}/i.test(withoutBotIdentity));
});
