import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { runOnce } from '../../src/cli/run.ts';
import { projectRoot } from '../../src/paths.ts';
import {
  cleanupTrackedDirs,
  emptySourceFetch,
  fakeNotifierRegistry,
  fakeProviderRegistry,
  fakeSourceFetch,
  makeDataRoot,
  makeRecipeDir,
  mockModel,
  RECIPE_YAML,
  RSS_FEED,
  trackedTmpDir,
} from './helpers.ts';

after(cleanupTrackedDirs);

const NOW = new Date('2026-08-09T12:00:00.000Z');

function neverDeliverFetch() {
  return async (): Promise<never> => {
    throw new Error('no debía llamarse a fetch de entrega en este test');
  };
}

/** `RECIPE_YAML` declara el modelo `test-provider` con la credencial `TEST_MODEL_KEY`: hace falta
 * en todos los tests que necesiten llegar a `synthesize()`. */
function secretWithModelKey(name: string): string | undefined {
  return name === 'TEST_MODEL_KEY' ? 'clave-de-prueba' : undefined;
}

/** `RECIPE_YAML` declara el canal `test-channel`: `validateDelivery` lo rechazaría como "canal
 * desconocido" si el `notifierRegistry` inyectado no lo registra, incluso en tests que nunca
 * llegan a entregar. Este noop cubre esos casos. */
function noopNotifierRegistry() {
  return fakeNotifierRegistry(async () => {});
}

test('camino feliz: archiva, marca seen, entrega, y sale con 0', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();
  let delivered = false;

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: fakeNotifierRegistry(async () => {
      delivered = true;
    }),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result, 'ok');
  assert.equal(delivered, true);
  const recipeName = recipeDir.split('/').pop();
  assert.ok(existsSync(join(dataRoot, 'archive', `2026-08-09--${recipeName}.json`)));
  // Rutas exactas de H2/D2: `state/` es un directorio, y la memoria lleva el nombre de la receta.
  assert.ok(existsSync(join(dataRoot, 'state', `seen--${recipeName}.json`)));
  assert.ok(existsSync(join(dataRoot, 'state', 'runs.ndjson')));
});

test('receta inválida (delivery mal declarado) ⇒ código 1', async () => {
  const recipeYamlInvalido = `
language: es
topics: [pruebas]
model:
  provider: test-provider
  id: test-model
sources: []
window: { days: 30 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery:
  - id: email
    enabled: false
health: { windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }
`;
  const recipeDir = makeRecipeDir({ recipeYaml: recipeYamlInvalido });
  const dataRoot = makeDataRoot();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: () => undefined,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
  });

  assert.equal(result.exitCode, 1);
  assert.equal(result.result, 'config_error');
});

test('RF-G01: todas las fuentes vacías ⇒ código 2, jamás cero', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: emptySourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: noopNotifierRegistry(),
  });

  assert.equal(result.exitCode, 2);
  assert.equal(result.result, 'no_items');
});

test('el modelo doblado devuelve una salida que no valida ⇒ código 3', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ otraCosa: 'x' }))),
    notifierRegistry: noopNotifierRegistry(),
    retry: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
  });

  assert.equal(result.exitCode, 3);
  assert.equal(result.result, 'model_failed');
});

test('informe generado y todos los canales de entrega fallando ⇒ código 4', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: fakeNotifierRegistry(async () => {
      throw new Error('caído');
    }),
  });

  assert.equal(result.exitCode, 4);
  assert.equal(result.result, 'delivery_failed');
  // Aun con la entrega fallida, el informe ya quedó archivado (RF-C04/contrato de la fase).
  assert.ok(
    existsSync(join(dataRoot, 'archive', `2026-08-09--${recipeDir.split('/').pop()}.json`)),
  );
});

test('el canal que falla deja su causa en runs.ndjson, no solo un booleano', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();

  await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: fakeNotifierRegistry(async () => {
      throw new Error('el servidor no respondió a tiempo');
    }),
  });

  const record = JSON.parse(
    readFileSync(join(dataRoot, 'state', 'runs.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .at(-1) ?? '',
  );
  const failed = record.delivery.find((channel: { ok: boolean }) => !channel.ok);
  assert.equal(failed.error, 'el servidor no respondió a tiempo');
  assert.equal(typeof failed.durationMs, 'number');
});

test('una fuente caída con la ejecución en 0: se nombra, no solo se cuenta', async () => {
  const recipeConDosFuentes = RECIPE_YAML.replace(
    '    url: https://example.com/feed.xml',
    '    url: https://example.com/feed.xml\n  - id: la-que-se-cae\n    type: feed\n    url: https://rota.example.com/feed.xml',
  );
  const recipeDir = makeRecipeDir({ recipeYaml: recipeConDosFuentes });
  const dataRoot = makeDataRoot();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: async (url: string) => {
      if (url.includes('rota.example.com')) throw new Error('getaddrinfo ENOTFOUND');
      return { ok: true, status: 200, text: async () => RSS_FEED };
    },
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: noopNotifierRegistry(),
  });

  // El informe sale, y por eso mismo la fuente caída se pasaría por alto si no se dijera en voz alta.
  assert.equal(result.exitCode, 0);
  assert.ok(result.degradations?.some((aviso) => aviso.includes('la-que-se-cae')));

  const record = JSON.parse(
    readFileSync(join(dataRoot, 'state', 'runs.ndjson'), 'utf8')
      .trim()
      .split('\n')
      .at(-1) ?? '',
  );
  assert.deepEqual(record.sources, { ok: 1, failed: 1 });
  assert.equal(record.sourcesFailedDetail[0].id, 'la-que-se-cae');
  assert.match(record.sourcesFailedDetail[0].error, /ENOTFOUND/);
});

test('--dry-run no escribe nada: ni archivo, ni seen.json, ni runs.ndjson, ni entrega', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();
  let delivered = false;

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: true,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: fakeNotifierRegistry(async () => {
      delivered = true;
    }),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result, 'ok');
  assert.ok(
    result.rendered !== undefined,
    'debe traer el informe renderizado para la salida estándar',
  );
  assert.equal(delivered, false);
  assert.deepEqual(
    readdirSync(dataRoot),
    [],
    'el directorio de datos debe quedar idéntico (vacío)',
  );
});

test('el informe de hoy ya archivado ⇒ no se llama al modelo, y se sale con 0 (skipped_existing)', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();
  mkdirSync(join(dataRoot, 'archive'), { recursive: true });
  const recipeName = recipeDir.split('/').pop();
  writeFileSync(
    join(dataRoot, 'archive', `2026-08-09--${recipeName}.json`),
    JSON.stringify({ schemaVersion: 2, recipe: recipeName, date: '2026-08-09' }),
    'utf8',
  );

  let modelCalled = false;
  const spyModel = mockModel(JSON.stringify({ pulse: { text: 'x' } }));

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: async () => {
      modelCalled = true; // si llega a recolectar, algo salió mal: no debería llegar aquí
      throw new Error('no debía recolectar');
    },
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(spyModel),
    notifierRegistry: noopNotifierRegistry(),
  });

  assert.equal(result.exitCode, 0);
  assert.equal(result.result, 'skipped_existing');
  assert.equal(modelCalled, false);

  const lines = readFileSync(join(dataRoot, 'state', 'runs.ndjson'), 'utf8')
    .trim()
    .split('\n');
  assert.equal(JSON.parse(lines[lines.length - 1] ?? '').result, 'skipped_existing');
});

test('RF-C01: seen.json se marca con lo que salió en el informe, no con lo recogido', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();

  await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: fakeNotifierRegistry(async () => {}),
  });

  const recipeName = recipeDir.split('/').pop();
  const seen = JSON.parse(
    readFileSync(join(dataRoot, 'state', `seen--${recipeName}.json`), 'utf8'),
  ) as {
    entries: readonly unknown[];
  };
  // La sección "pulse" no lleva ningún campo url ni coincide con item.url: nada se marca (el
  // texto del modelo no es la URL de la fuente recogida).
  assert.equal(seen.entries.length, 0);
});

test('una ruta de datos relativa se rechaza, no se resuelve contra el directorio de trabajo (RF-A07)', async () => {
  const recipeDir = makeRecipeDir({});

  await assert.rejects(() =>
    runOnce({
      recipeDir,
      dataRoot: 'datos-relativos',
      dryRun: false,
      now: NOW,
      secret: () => undefined,
      sourceFetch: fakeSourceFetch(),
      deliverFetch: neverDeliverFetch(),
      userAgent: 'test/1.0',
    }),
  );
});

// H1/D1/ADR-021: la memoria de lo ya mostrado es por receta, no por instancia. Dos recetas sobre
// el mismo `dataRoot` no pueden pisarse la una a la otra: la semanal destila la diaria por la
// fuente `archive`, y el elemento que saca tiene la misma url y el mismo título que la diaria ya
// marcó como visto. Con un solo `seen.json` compartido, `runPipeline` lo descartaría entero.
const ITEMS_SECTIONS_YAML = `
sections:
  - key: items
    title: Elementos
    cardinality: list
    min: 0
    max: 10
    condition: non-empty
    fields:
      - { name: title, type: string }
      - { name: link, type: url }
`;

function distillingRecipeYaml(overrides: { readonly sourceRecipe?: string } = {}): string {
  return `
language: es
topics: [pruebas]
model: { provider: test-provider, id: test-model }
sources:
  - id: destilado
    type: archive
    ${overrides.sourceRecipe !== undefined ? `recipe: ${overrides.sourceRecipe}` : ''}
window: { days: 30 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery: []
health: { windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }
`;
}

test('H1: la receta semanal ve, por la fuente archive, lo que la diaria ya marcó como visto', async () => {
  const dailyDir = makeRecipeDir({ sectionsYaml: ITEMS_SECTIONS_YAML, name: 'daily-fuente-' });
  const dailyName = dailyDir.split('/').pop() as string;
  const dataRoot = makeDataRoot();

  const dailyResult = await runOnce({
    recipeDir: dailyDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(
      mockModel(
        JSON.stringify({ items: [{ title: 'Elemento uno', link: 'https://example.com/uno' }] }),
      ),
    ),
    notifierRegistry: noopNotifierRegistry(),
  });
  assert.equal(dailyResult.result, 'ok');

  const weeklyDir = makeRecipeDir({
    recipeYaml: distillingRecipeYaml({ sourceRecipe: dailyName }),
    sectionsYaml: ITEMS_SECTIONS_YAML,
    name: 'weekly-destila-',
  });

  const weeklyResult = await runOnce({
    recipeDir: weeklyDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: emptySourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ items: [] }))),
    notifierRegistry: noopNotifierRegistry(),
  });

  // El elemento que la diaria publicó tiene que sobrevivir al filtro de memoria de la semanal:
  // son recetas distintas, cada una con su propia huella de lo ya visto (ADR-021).
  assert.equal(weeklyResult.report?.meta.itemsAnalyzed, 1);
});

test('la memoria por receta no deja de proteger a la propia receta: una segunda ejecución de la misma receta no vuelve a ver lo que ella misma publicó', async () => {
  const recipeDir = makeRecipeDir({ sectionsYaml: ITEMS_SECTIONS_YAML, name: 'auto-memoria-' });
  const dataRoot = makeDataRoot();
  const day1 = new Date('2026-08-09T12:00:00.000Z');
  const day2 = new Date('2026-08-10T12:00:00.000Z');

  const providerRegistry = fakeProviderRegistry(
    mockModel(
      JSON.stringify({ items: [{ title: 'Elemento uno', link: 'https://example.com/uno' }] }),
    ),
  );

  const first = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: day1,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry,
    notifierRegistry: noopNotifierRegistry(),
  });
  assert.equal(first.report?.meta.itemsAnalyzed, 1);

  const second = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: day2,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry,
    notifierRegistry: noopNotifierRegistry(),
  });

  assert.equal(second.report?.meta.itemsAnalyzed, 0);
});

test('H2/D2: un directorio de datos recién clonado, sin state/, no falla y lo crea', async () => {
  const recipeDir = makeRecipeDir({});
  const dataRoot = makeDataRoot();
  const recipeName = recipeDir.split('/').pop();

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: false,
    now: NOW,
    secret: secretWithModelKey,
    sourceFetch: fakeSourceFetch(),
    deliverFetch: neverDeliverFetch(),
    userAgent: 'test/1.0',
    providerRegistry: fakeProviderRegistry(mockModel(JSON.stringify({ pulse: { text: 'x' } }))),
    notifierRegistry: noopNotifierRegistry(),
  });

  assert.equal(result.exitCode, 0);
  assert.ok(existsSync(join(dataRoot, 'state', `seen--${recipeName}.json`)));
  assert.ok(existsSync(join(dataRoot, 'state', 'runs.ndjson')));
});

// Los cinco códigos de salida, ejercitando el proceso de verdad como hijo (T10): un valor de
// retorno no es un código de salida. Sin red y sin credenciales (R13): 0 y su variante
// `skipped_existing`, 1 y 2 no necesitan modelo; 3 se provoca dejando la credencial del modelo
// ausente en el entorno del proceso hijo (ChainConfigurationError), también sin red.
const mainPath = join(projectRoot, 'src', 'cli', 'main.ts');

function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [mainPath, ...args], {
    env,
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function minimalEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  if (process.env.PATH !== undefined) base.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) base.HOME = process.env.HOME;
  return { ...base, ...extra };
}

test('proceso hijo, código 1: receta inválida', () => {
  const recipesRoot = trackedTmpDir('chronorium-cli-proc-recipes-');
  const recipeDir = join(recipesRoot, 'rota');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(join(recipeDir, 'recipe.yaml'), 'language: es\n', 'utf8');
  writeFileSync(join(recipeDir, 'sections.yaml'), 'sections: []\n', 'utf8');
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');
  const dataRoot = trackedTmpDir('chronorium-cli-proc-data-');

  const { status } = runCli(
    ['run', '--recipe', 'rota', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(),
  );

  assert.equal(status, 1);
});

test('proceso hijo, código 2: la fuente "archive" sin nada en el directorio produce cero elementos', () => {
  const recipesRoot = trackedTmpDir('chronorium-cli-proc-recipes-');
  const recipeDir = join(recipesRoot, 'sin-items');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(
    join(recipeDir, 'recipe.yaml'),
    `
language: es
topics: [pruebas]
model: { provider: google, id: gemini-test }
sources:
  - id: destilado
    type: archive
window: { days: 30 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery: []
health: { windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }
`,
    'utf8',
  );
  writeFileSync(
    join(recipeDir, 'sections.yaml'),
    'sections:\n  - key: pulse\n    title: Pulso\n    cardinality: one\n    condition: always\n    fields:\n      - { name: text, type: string }\n',
    'utf8',
  );
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');
  const dataRoot = trackedTmpDir('chronorium-cli-proc-data-');

  const { status } = runCli(
    ['run', '--recipe', 'sin-items', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(),
  );

  assert.equal(status, 2);
});

test('proceso hijo, código 3: hay elementos pero ningún proveedor de modelo tiene credencial', () => {
  const recipesRoot = trackedTmpDir('chronorium-cli-proc-recipes-');
  const recipeDir = join(recipesRoot, 'sin-credencial');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(
    join(recipeDir, 'recipe.yaml'),
    `
language: es
topics: [pruebas]
model: { provider: google, id: gemini-test }
sources:
  - id: destilado
    type: archive
window: { days: 3650 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery: []
health: { windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }
`,
    'utf8',
  );
  writeFileSync(
    join(recipeDir, 'sections.yaml'),
    'sections:\n  - key: pulse\n    title: Pulso\n    cardinality: one\n    condition: always\n    fields:\n      - { name: text, type: string }\n',
    'utf8',
  );
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');

  const dataRoot = trackedTmpDir('chronorium-cli-proc-data-');
  mkdirSync(join(dataRoot, 'archive'), { recursive: true });
  writeFileSync(
    join(dataRoot, 'archive', '2020-01-01--otra.json'),
    JSON.stringify({
      schemaVersion: 2,
      recipe: 'otra',
      date: '2020-01-01',
      sections: [
        { key: 'top', title: 'Top', items: [{ title: 'x', link: 'https://real.example/x' }] },
      ],
    }),
    'utf8',
  );

  const { status } = runCli(
    ['run', '--recipe', 'sin-credencial', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(), // deliberadamente sin GOOGLE_GENERATIVE_AI_API_KEY
  );

  assert.equal(status, 3);
});

test('proceso hijo, código 0: el informe de hoy ya existe (skipped_existing)', () => {
  const recipesRoot = trackedTmpDir('chronorium-cli-proc-recipes-');
  const recipeDir = join(recipesRoot, 'ya-existe');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(
    join(recipeDir, 'recipe.yaml'),
    `
language: es
topics: [pruebas]
model: { provider: google, id: gemini-test }
sources: []
window: { days: 30 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery: []
health: { windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }
`,
    'utf8',
  );
  writeFileSync(
    join(recipeDir, 'sections.yaml'),
    'sections:\n  - key: pulse\n    title: Pulso\n    cardinality: one\n    condition: always\n    fields:\n      - { name: text, type: string }\n',
    'utf8',
  );
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');

  const dataRoot = trackedTmpDir('chronorium-cli-proc-data-');
  mkdirSync(join(dataRoot, 'archive'), { recursive: true });
  const today = new Date().toISOString().slice(0, 10);
  writeFileSync(
    join(dataRoot, 'archive', `${today}--ya-existe.json`),
    JSON.stringify({ schemaVersion: 2, recipe: 'ya-existe', date: today, sections: [] }),
    'utf8',
  );

  const { status } = runCli(
    ['run', '--recipe', 'ya-existe', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(),
  );

  assert.equal(status, 0);
});
