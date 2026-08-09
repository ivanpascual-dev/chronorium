// La prueba con red real de la fase 2 (T16 del plan). Consume `collect.ts`, el pipeline de
// `rank/` y `model/client.ts` tal cual, sin reimplementar nada (R10).
//
// Mitad 1, recolección: siempre se ejecuta, no necesita ninguna credencial. Mitad 2, síntesis:
// solo si GOOGLE_GENERATIVE_AI_API_KEY está definida. Si no lo está, no se simula nada: se deja
// listo y se dice el comando exacto.

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateReport } from '../src/model/client.ts';
import { composePrompt } from '../src/model/prompt.ts';
import { defaultProviderRegistry } from '../src/model/providers.ts';
import { projectRoot, resolveRecipeDir } from '../src/paths.ts';
import { runPipeline } from '../src/rank/pipeline.ts';
import { loadRecipe } from '../src/recipe/load.ts';
import { deriveSections } from '../src/recipe/schema.ts';
import { collect } from '../src/sources/collect.ts';
import { defaultRegistry } from '../src/sources/registry.ts';
import type { FetchLike } from '../src/sources/types.ts';

const GOOGLE_API_KEY_ENV_VAR = 'GOOGLE_GENERATIVE_AI_API_KEY';

const realFetch: FetchLike = async (url, init) => {
  const response = await fetch(url, { headers: init.headers, signal: init.signal });
  return { ok: response.ok, status: response.status, text: () => response.text() };
};

async function main(): Promise<void> {
  const recipe = loadRecipe(resolveRecipeDir('example'));
  const now = new Date();

  console.log(`Recolectando de verdad de recipes/example (ventana: ${recipe.window.days} días).`);
  console.log(
    'Memoria: esta prueba parte de memoria vacía; state/seen.json real vive en la instancia privada (ADR-002).',
  );
  console.log('');

  const { items, results } = await collect(recipe.sources, defaultRegistry, {
    now,
    fetch: realFetch,
    timeoutMs: 10_000,
    userAgent: 'chronorium-probe/1.0',
    dataRoot: projectRoot,
    windowDays: recipe.window.days,
    secret: (name) => process.env[name],
  });

  for (const result of results) {
    const estado = result.ok ? `ok, ${result.items} elementos` : `FALLO: ${result.error}`;
    console.log(`  - ${result.id} (${result.type}): ${estado} [${result.durationMs}ms]`);
  }

  const okCount = results.filter((result) => result.ok).length;
  console.log('');
  console.log(
    `${okCount}/${results.length} fuentes respondieron. ${items.length} elementos crudos recolectados.`,
  );

  const ranked = runPipeline(items, { now, recipe, isSeen: () => false });
  console.log(
    `${ranked.length} elementos tras deduplicar, filtrar por ventana, puntuar y aplicar los topes.`,
  );
  console.log('');
  for (const item of ranked) {
    console.log(`  [${item.source}] (${item.score.toFixed(2)}) ${item.title}`);
  }

  const apiKey = process.env[GOOGLE_API_KEY_ENV_VAR];
  if (!apiKey) {
    console.log('');
    console.log(
      `${GOOGLE_API_KEY_ENV_VAR} no está definida: la recolección queda probada, pero no`,
    );
    console.log('se llama al modelo. Para completar la prueba con síntesis real:');
    console.log('');
    console.log(`  ${GOOGLE_API_KEY_ENV_VAR}=... pnpm run probe:fase2`);
    return;
  }

  if (ranked.length === 0) {
    throw new Error(
      'la recolección real no produjo ningún elemento; no hay nada que enviar al modelo',
    );
  }

  const derivedResult = deriveSections(recipe.sections);
  if (!derivedResult.ok) {
    const detail = derivedResult.issues
      .map((issue) => `${issue.campo}: ${issue.motivo}`)
      .join('; ');
    throw new Error(`recipes/example no deriva un esquema válido: ${detail}`);
  }

  const prompt = composePrompt(recipe, ranked);
  const googleProvider = defaultProviderRegistry.get('google');
  if (!googleProvider) {
    throw new Error('el registro de proveedores no tiene "google" (¿fase 3 rompió el registro?)');
  }
  const model = await googleProvider.create(recipe.model, apiKey);
  const report = await generateReport({ model, prompt, derived: derivedResult.value });

  const outDir = join(projectRoot, 'tmp');
  mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'probe-fase2.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');

  console.log('');
  console.log(`Informe generado con el modelo real: ${outPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
