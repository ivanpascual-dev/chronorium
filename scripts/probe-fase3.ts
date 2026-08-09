// La prueba con red real de la fase 3 (T14 del plan). Consume `synthesize()`, `diagnoseChain()` y
// `collect()` tal cual (R10): no reimplementa la cadena, el reintento ni la síntesis.
//
// Tres partes, cada una con su condición:
//   1. Diagnóstico de la cadena: siempre, sin credencial.
//   2. Informe real: si hay al menos una credencial. Con dos, además fuerza el fallo del
//      principal (identificador de modelo inexistente) para ver la caída al respaldo de verdad.
//   3. Inyección contra el modelo real: si hay credencial, cuela `inyeccion-en-titulo.xml` entre
//      los elementos y guarda la salida para que el dueño la lea.
//
// Sin ninguna credencial, no se simula nada: se deja listo y se dice el comando exacto.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { diagnoseChain } from '../src/model/chain.ts';
import { synthesize } from '../src/model/synthesize.ts';
import { projectRoot, resolveRecipeDir } from '../src/paths.ts';
import { runPipeline } from '../src/rank/pipeline.ts';
import { loadRecipe } from '../src/recipe/load.ts';
import type { ModelConfig } from '../src/recipe/types.ts';
import { collect } from '../src/sources/collect.ts';
import { feedReader } from '../src/sources/feed.ts';
import { defaultRegistry } from '../src/sources/registry.ts';
import type { FetchLike, Item } from '../src/sources/types.ts';

const GOOGLE_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY';
const OPENAI_KEY = 'OPENAI_API_KEY';

// Segundo eslabón real (decisión del dueño tras comparar contra Groq): Groq es gratuito, pero su
// capa gratuita revienta por tokens por minuto con un informe completo (8K TPM, ~22K tokens que
// pide `recipes/example`). `gpt-5.6-luna` cuesta menos de un centavo por informe y no tiene ese
// techo. Vía el paquete oficial `@ai-sdk/openai` (ADR-018): solo hace falta declarar
// `reasoningEffort`, el resto de la convención de llamada la resuelve el SDK.
const lunaFallback = {
  provider: 'openai',
  id: 'gpt-5.6-luna',
  apiKeyEnv: OPENAI_KEY,
  reasoningEffort: 'medium',
} as const;

const realFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, { headers: init.headers, signal: init.signal });
  return { ok: response.ok, status: response.status, text: () => response.text() };
};

const secret = (name: string): string | undefined => process.env[name];

function printDiagnosis(model: ModelConfig): void {
  const diagnosis = diagnoseChain(model, { secret });

  console.log('Diagnóstico de la cadena de proveedores (sin red, sin llamar a ningún modelo):');
  for (const spec of diagnosis.usable) {
    console.log(`  vivo:      ${spec.provider}/${spec.id}`);
  }
  for (const discard of diagnosis.discarded) {
    console.log(`  descartado: ${discard.spec.provider}/${discard.spec.id} · ${discard.reason}`);
  }
  if (diagnosis.warnings.length === 0) {
    console.log('  sin avisos.');
  }
  for (const warning of diagnosis.warnings) {
    console.log(`  AVISO: ${warning}`);
  }
  console.log('');
}

async function collectExampleItems(): Promise<readonly Item[]> {
  const recipe = loadRecipe(resolveRecipeDir('example'));
  const now = new Date();

  const { items, results } = await collect(recipe.sources, defaultRegistry, {
    now,
    fetch: realFetch,
    timeoutMs: 10_000,
    userAgent: 'chronorium-probe/1.0',
    dataRoot: projectRoot,
    windowDays: recipe.window.days,
    secret,
  });

  for (const result of results) {
    const estado = result.ok ? `ok, ${result.items} elementos` : `FALLO: ${result.error}`;
    console.log(`  - ${result.id} (${result.type}): ${estado}`);
  }

  return runPipeline(items, { now, recipe, isSeen: () => false });
}

async function main(): Promise<void> {
  const recipe = loadRecipe(resolveRecipeDir('example'));
  const outDir = join(projectRoot, 'tmp');
  mkdirSync(outDir, { recursive: true });

  const hasGoogle = Boolean(process.env[GOOGLE_KEY]);
  const hasOpenAi = Boolean(process.env[OPENAI_KEY]);

  console.log('=== Parte 1: diagnóstico de la cadena ===');
  console.log('');
  const modelWithFallback: ModelConfig = { ...recipe.model, fallbacks: [lunaFallback] };
  printDiagnosis(modelWithFallback);

  if (!hasGoogle && !hasOpenAi) {
    console.log('Ninguna credencial de modelo está definida: la cadena queda diagnosticada, pero');
    console.log('no se llama a ningún modelo. Para completar la prueba con síntesis real:');
    console.log('');
    console.log(`  ${GOOGLE_KEY}=... pnpm run probe:fase3`);
    console.log(
      `  ${GOOGLE_KEY}=... ${OPENAI_KEY}=... pnpm run probe:fase3   # además prueba la caída al respaldo`,
    );
    return;
  }

  console.log('=== Parte 2: informe real ===');
  console.log('');
  console.log(`Recolectando de verdad de recipes/example (ventana: ${recipe.window.days} días).`);
  const ranked = await collectExampleItems();
  console.log(`${ranked.length} elementos tras el pipeline de rank/.`);
  console.log('');

  if (ranked.length === 0) {
    throw new Error('la recolección real no produjo ningún elemento; no hay nada que sintetizar');
  }

  const modelPrincipalSolo: ModelConfig = hasOpenAi ? modelWithFallback : recipe.model;
  const resultado = await synthesize({
    recipe: { ...recipe, model: modelPrincipalSolo },
    items: ranked,
    secret,
  });

  console.log(
    `Proveedor usado: ${resultado.provider} (respaldo: ${resultado.providerWasFallback})`,
  );
  console.log(`Enlaces descartados: ${resultado.linksDropped}`);
  for (const attempt of resultado.providersTried) {
    console.log(
      `  ${attempt.provider}/${attempt.id}: ${attempt.outcome} (${attempt.attempts} intento(s))`,
    );
  }
  writeFileSync(
    join(outDir, 'probe-fase3-informe.json'),
    JSON.stringify(resultado, null, 2),
    'utf8',
  );
  console.log('');

  if (hasGoogle && hasOpenAi) {
    console.log('Forzando el fallo del principal (identificador de modelo inexistente) para ver');
    console.log('la caída al respaldo de verdad, no solo contra un doble:');
    const modelPrincipalRoto: ModelConfig = {
      ...recipe.model,
      id: 'modelo-que-no-existe-de-verdad',
      fallbacks: [lunaFallback],
    };
    const conCaida = await synthesize({
      recipe: { ...recipe, model: modelPrincipalRoto },
      items: ranked,
      secret,
    });
    console.log(
      `Proveedor usado: ${conCaida.provider} (respaldo: ${conCaida.providerWasFallback})`,
    );
    for (const attempt of conCaida.providersTried) {
      console.log(
        `  ${attempt.provider}/${attempt.id}: ${attempt.outcome} (${attempt.attempts} intento(s))`,
      );
    }
    writeFileSync(
      join(outDir, 'probe-fase3-caida-a-respaldo.json'),
      JSON.stringify(conCaida, null, 2),
      'utf8',
    );
  }
  console.log('');

  console.log('=== Parte 3: inyección contra el modelo real ===');
  console.log('');
  const inyectado = await feedReader.read(
    { id: 'inyeccion-de-prueba', type: 'feed', url: 'https://example.invalid/no-se-usa' },
    {
      now: new Date(),
      fetch: async () => ({
        ok: true,
        status: 200,
        text: async () =>
          readFileSync(
            join(projectRoot, 'tests', 'fixtures', 'feeds', 'inyeccion-en-titulo.xml'),
            'utf8',
          ),
      }),
      timeoutMs: 10_000,
      userAgent: 'chronorium-probe/1.0',
      dataRoot: projectRoot,
      windowDays: recipe.window.days,
      secret,
    },
  );

  const conInyeccion = await synthesize({
    recipe,
    items: [...ranked, ...inyectado],
    secret,
  });

  const outPath = join(outDir, 'probe-fase3-inyeccion.json');
  writeFileSync(outPath, JSON.stringify(conInyeccion, null, 2), 'utf8');
  console.log(`Informe con el elemento hostil colado, generado por el modelo real: ${outPath}`);
  console.log(
    'Léelo: es lo único que dice algo sobre la conducta real del modelo, no lo decide un test.',
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
