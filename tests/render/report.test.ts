import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SectionSpec } from '../../src/recipe/types.ts';
import { type BuildReportOptions, buildReport, buildSubject } from '../../src/render/report.ts';
import type { ReportHealth } from '../../src/render/types.ts';
import { makeRecipe } from './helpers.ts';

const healthyHealth: ReportHealth = { windowDays: 30, runsOk: 28, runsFailed: 2 };

function baseOptions(overrides: Partial<BuildReportOptions> = {}): BuildReportOptions {
  return {
    recipe: makeRecipe(),
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    modelOutput: {},
    provider: 'google',
    providerWasFallback: false,
    linksDropped: 0,
    itemsCollected: 10,
    itemsAnalyzed: 8,
    sourcesOk: 4,
    sourcesFailed: 0,
    health: healthyHealth,
    ...overrides,
  };
}

const sectionsExampleShape: readonly SectionSpec[] = [
  {
    key: 'pulse',
    title: 'Pulso del día',
    cardinality: 'one',
    condition: 'always',
    fields: [{ name: 'text', type: 'string' }],
  },
  {
    key: 'top',
    title: 'Lo más relevante',
    cardinality: 'list',
    min: 1,
    max: 3,
    condition: 'always',
    fields: [
      { name: 'title', type: 'string' },
      { name: 'link', type: 'url' },
    ],
  },
  {
    key: 'applicable',
    title: 'Aplícate esto',
    cardinality: 'list',
    min: 0,
    max: 3,
    condition: 'non-empty',
    fields: [{ name: 'title', type: 'string' }],
  },
];

test('buildReport convierte la salida del modelo en sections, array y en el orden declarado', () => {
  const modelOutput = {
    // Deliberadamente en orden distinto al declarado, para probar que manda `recipe.sections`.
    applicable: [],
    top: [{ title: 'Uno', link: 'https://real.example/uno' }],
    pulse: { text: 'Resumen del día.' },
  };

  const report = buildReport(
    baseOptions({ recipe: makeRecipe({ sections: sectionsExampleShape }), modelOutput }),
  );

  // "applicable" es non-empty y llegó vacía: no debe aparecer.
  assert.deepEqual(
    report.sections.map((s) => s.key),
    ['pulse', 'top'],
  );
});

test('una sección cardinality "one" produce un array de exactamente un elemento', () => {
  const report = buildReport(
    baseOptions({
      recipe: makeRecipe({ sections: sectionsExampleShape }),
      modelOutput: { pulse: { text: 'x' }, top: [{ title: 'a', link: 'https://x.example/a' }] },
    }),
  );

  const pulse = report.sections.find((s) => s.key === 'pulse');
  assert.equal(pulse?.items.length, 1);
});

test('RF-F05: una sección "non-empty" con cero elementos no aparece', () => {
  const report = buildReport(
    baseOptions({
      recipe: makeRecipe({ sections: sectionsExampleShape }),
      modelOutput: { pulse: { text: 'x' }, top: [{ title: 'a', link: 'https://x.example/a' }] },
    }),
  );

  assert.equal(
    report.sections.some((s) => s.key === 'applicable'),
    false,
  );
});

test('una sección "always" con cero elementos sí aparece', () => {
  const alwaysEmptyList: SectionSpec = {
    key: 'siempre',
    title: 'Siempre visible',
    cardinality: 'list',
    min: 0,
    max: 5,
    condition: 'always',
    fields: [{ name: 'texto', type: 'string' }],
  };

  const report = buildReport(
    baseOptions({
      recipe: makeRecipe({ sections: [alwaysEmptyList] }),
      modelOutput: { siempre: [] },
    }),
  );

  const found = report.sections.find((s) => s.key === 'siempre');
  assert.ok(found !== undefined);
  assert.deepEqual(found.items, []);
});

test('meta se rellena desde las estadísticas dadas, sin inventar ningún valor', () => {
  const report = buildReport(
    baseOptions({
      provider: 'openai',
      providerWasFallback: true,
      linksDropped: 3,
      itemsCollected: 67,
      itemsAnalyzed: 60,
      sourcesOk: 17,
      sourcesFailed: 2,
    }),
  );

  assert.equal(report.meta.provider, 'openai');
  assert.equal(report.meta.providerWasFallback, true);
  assert.equal(report.meta.linksDropped, 3);
  assert.equal(report.meta.itemsCollected, 67);
  assert.equal(report.meta.itemsAnalyzed, 60);
  assert.equal(report.meta.sourcesOk, 17);
  assert.equal(report.meta.sourcesFailed, 2);
  assert.deepEqual(report.meta.health, healthyHealth);
});

test('meta.degraded contiene fallback-provider cuando el proveedor no fue el principal', () => {
  const report = buildReport(baseOptions({ providerWasFallback: true }));
  assert.ok(report.meta.degraded.includes('fallback-provider'));
});

test('meta.degraded contiene sources-below-threshold cuando la tasa de fuentes fallidas cruza el umbral', () => {
  const recipe = makeRecipe({
    health: { windowDays: 30, runFailureThreshold: 0.9, sourceFailureThreshold: 0.3 },
  });
  const report = buildReport(baseOptions({ recipe, sourcesOk: 5, sourcesFailed: 5 }));
  assert.ok(report.meta.degraded.includes('sources-below-threshold'));
});

test('meta.degraded contiene runs-below-threshold cuando la tasa de ejecuciones fallidas cruza el umbral', () => {
  const recipe = makeRecipe({
    health: { windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.9 },
  });
  const report = buildReport(
    baseOptions({ recipe, health: { windowDays: 30, runsOk: 10, runsFailed: 20 } }),
  );
  assert.ok(report.meta.degraded.includes('runs-below-threshold'));
});

test('meta.degraded queda vacío cuando nada está degradado', () => {
  const report = buildReport(baseOptions());
  assert.deepEqual(report.meta.degraded, []);
});

test('buildSubject usa la plantilla de la receta con {recipe} y {date} sustituidos', () => {
  const recipe = makeRecipe({ name: 'daily', subject: 'Informe de {recipe} · {date}' });
  const report = buildReport(baseOptions({ recipe }));
  assert.equal(buildSubject(recipe, report), 'Informe de daily · 2026-08-09');
});

test('buildSubject sin plantilla declarada usa un formato que no es prosa', () => {
  const recipe = makeRecipe({ name: 'weekly' });
  const report = buildReport(baseOptions({ recipe, date: '2026-08-10' }));
  assert.equal(buildSubject(recipe, report), 'weekly · 2026-08-10');
});
