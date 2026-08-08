// RF-H05: la receta de ejemplo se ejercita en CI con un proveedor de modelo simulado, para que
// una receta de ejemplo rota rompa la construcción. Sin red, sin credenciales.
//
// Desde la fase 2 también ejercita la recolección (T15 del plan de fase 2): el `fetch` se sirve
// desde ficheros guardados en tests/fixtures/, nunca de la red real. No conoce ninguna clave de
// sección de recipes/example (R12): genera una salida simulada recorriendo las secciones que la
// propia receta declare, sean cuales sean.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { generateReport } from '../src/model/client.ts';
import { composePrompt } from '../src/model/prompt.ts';
import { projectRoot, resolveRecipeDir } from '../src/paths.ts';
import { runPipeline } from '../src/rank/pipeline.ts';
import { loadRecipe } from '../src/recipe/load.ts';
import { deriveSections } from '../src/recipe/schema.ts';
import type { FieldSpec, SectionSpec } from '../src/recipe/types.ts';
import { collect } from '../src/sources/collect.ts';
import { defaultRegistry } from '../src/sources/registry.ts';
import type { FetchLike, Item } from '../src/sources/types.ts';

const fixturesDir = join(projectRoot, 'tests', 'fixtures');

function readFixture(...segments: string[]): string {
  return readFileSync(join(fixturesDir, ...segments), 'utf8');
}

/**
 * Sirve cada petición desde un fichero guardado, nunca de la red (R13, RF-H02). El despacho mira
 * la URL para elegir **qué fixture responder**, no para elegir un lector: eso sigue siendo trabajo
 * exclusivo de `sources/registry.ts` por `type` declarado (RF-B01).
 */
const fakeFetch: FetchLike = async (url) => {
  if (url.includes('hnrss.org')) {
    return { ok: true, status: 200, text: async () => readFixture('feeds', 'rss-valido.xml') };
  }
  if (url.includes('dev.to/api/articles')) {
    // Forma real de la API de dev.to: un array en la raíz, no envuelto (a diferencia del fixture
    // genérico http/json-api.json, que existe para probar el mapeo por ruta con un envoltorio).
    return { ok: true, status: 200, text: async () => readFixture('http', 'devto-articles.json') };
  }
  if (url.startsWith('https://api.github.com/search/repositories')) {
    return { ok: true, status: 200, text: async () => readFixture('http', 'repo-search.json') };
  }
  if (url.startsWith('https://api.github.com/repos/') && url.includes('/releases')) {
    return { ok: true, status: 200, text: async () => readFixture('http', 'repo-releases.json') };
  }
  throw new Error(`check-receta-ejemplo: URL no esperada, falta servirla desde un fixture: ${url}`);
};

function mockItem(fields: readonly FieldSpec[], items: readonly Item[]): Record<string, string> {
  const value: Record<string, string> = {};
  for (const field of fields) {
    value[field.name] =
      field.type === 'url'
        ? (items[0]?.url ?? 'https://example.com')
        : `texto de prueba: ${field.name}`;
  }
  return value;
}

function mockReport(
  sections: readonly SectionSpec[],
  items: readonly Item[],
): Record<string, unknown> {
  const report: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.cardinality === 'one') {
      report[section.key] = mockItem(section.fields, items);
    } else {
      const count = Math.max(section.min, 1);
      report[section.key] = Array.from({ length: count }, () => mockItem(section.fields, items));
    }
  }
  return report;
}

function mockModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

// Fija, no `new Date()`: las fechas de los fixtures son fijas, y el reloj de pared de quien
// ejecuta CI no lo es. Con la hora real, este chequeo se degradaría solo con el paso del tiempo,
// cuando los fixtures quedaran fuera de la ventana de la receta (ver `rank/window.ts`, RF-B07).
const FIXED_NOW = new Date('2026-08-08T12:00:00.000Z');

async function main(): Promise<void> {
  const recipe = loadRecipe(resolveRecipeDir('example'));

  const now = FIXED_NOW;
  const { items: collected, results } = await collect(recipe.sources, defaultRegistry, {
    now,
    fetch: fakeFetch,
    timeoutMs: 5000,
    userAgent: 'chronorium-check-receta-ejemplo/1.0',
    dataRoot: fixturesDir,
    windowDays: recipe.window.days,
    secret: () => undefined,
  });

  const failedSources = results.filter((result) => !result.ok);
  if (failedSources.length > 0) {
    const detail = failedSources
      .map((result) => `${result.id} (${result.type}): ${result.error}`)
      .join('; ');
    throw new Error(
      `recipes/example tiene fuentes que fallan contra sus propios fixtures: ${detail}`,
    );
  }
  if (collected.length === 0) {
    throw new Error('recipes/example no recolectó ningún elemento desde los fixtures guardados');
  }

  const ranked = runPipeline(collected, { now, recipe, isSeen: () => false });
  if (ranked.length === 0) {
    throw new Error(
      'recipes/example recolectó elementos pero el pipeline de rank/ los descartó todos ' +
        '(ventana, deduplicación o topes); revisa recipe.yaml y los fixtures servidos',
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
  const mockOutput = mockReport(derivedResult.value.sections, ranked);
  const model = mockModel(JSON.stringify(mockOutput));

  const report = await generateReport({ model, prompt, derived: derivedResult.value });

  if (typeof report !== 'object' || report === null) {
    throw new Error('recipes/example no produjo un informe válido con el modelo simulado');
  }

  console.log(
    `recipes/example recolecta (${collected.length} elementos crudos, ${ranked.length} tras el pipeline de rank/) ` +
      `y produce un informe válido con un modelo simulado (RF-H05).`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
