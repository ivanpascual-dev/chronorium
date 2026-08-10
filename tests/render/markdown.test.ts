import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SectionSpec } from '../../src/recipe/types.ts';
import { markdownRenderer } from '../../src/render/markdown.ts';
import { buildReport } from '../../src/render/report.ts';
import type { ReportHealth } from '../../src/render/types.ts';
import { makeRecipe } from './helpers.ts';

const noDegradation: ReportHealth = { windowDays: 30, runsOk: 30, runsFailed: 0 };

const genericSections: readonly SectionSpec[] = [
  {
    key: 'alfa',
    title: 'Sección Alfa',
    cardinality: 'list',
    min: 1,
    max: 3,
    condition: 'always',
    fields: [
      { name: 'titulo', type: 'string' },
      { name: 'veredicto', type: 'string', label: 'Veredicto' },
      { name: 'enlace', type: 'url' },
    ],
  },
  {
    key: 'beta',
    title: 'Sección Beta',
    cardinality: 'one',
    condition: 'always',
    fields: [{ name: 'texto', type: 'string' }],
  },
  {
    key: 'gamma',
    title: 'Sección Gamma',
    cardinality: 'list',
    min: 0,
    max: 2,
    condition: 'non-empty',
    fields: [
      { name: 'nombre', type: 'string' },
      { name: 'sitio', type: 'url' },
      { name: 'extra', type: 'url' },
    ],
  },
];

function buildGenericReport(modelOutput: Record<string, unknown>, health = noDegradation) {
  return buildReport({
    recipe: makeRecipe({ sections: genericSections }),
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    modelOutput,
    provider: 'google',
    providerWasFallback: false,
    linksDropped: 0,
    itemsCollected: 5,
    itemsAnalyzed: 5,
    sourcesOk: 2,
    sourcesFailed: 0,
    health,
  });
}

test('R12: el markdown no contiene ninguna clave de sección, solo sus títulos declarados', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: '<script>x</script>', veredicto: 'bien', enlace: 'https://real.example/a' }],
    beta: { texto: 'Resumen.' },
    gamma: [],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(markdown.includes('Sección Alfa'));
  assert.ok(markdown.includes('Sección Beta'));
  assert.ok(!markdown.includes('alfa'));
  assert.ok(!markdown.includes('beta'));
  assert.ok(!markdown.includes('gamma'));
});

test('el título de cada sección es un encabezado y los enlaces salen visibles en claro', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
    gamma: [],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(markdown.includes('## Sección Alfa'));
  assert.ok(markdown.includes('https://real.example/uno'));
});

test('todo valor que viene del modelo pasa por escapeMarkdown (RF-E04)', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: '[a](b) | `c`', veredicto: 'ok', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
    gamma: [],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(markdown.includes('\\[a\\](b) \\| \\`c\\`'));
  assert.equal(
    markdown.includes('\\(b\\)'),
    false,
    'los paréntesis no forman parte del conjunto a escapar',
  );
});

test('un campo con label declarado se renderiza con su etiqueta; sin label, sin ella', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'Bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
    gamma: [{ nombre: 'g1', sitio: 'https://real.example/g1', extra: 'https://real.example/g2' }],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(markdown.includes('Veredicto: Bien'));
  assert.ok(!markdown.includes('veredicto: Bien'));
});

test('un campo vacío (enlace descartado) no se imprime: ni hueco ni [texto]() roto', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'Bien', enlace: '' }],
    beta: { texto: 'x' },
    gamma: [],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(!markdown.includes('[Uno]()'));
  assert.ok(markdown.includes('**Uno**'));
});

test('extra enlaces (más de un campo url) van sueltos al final del elemento', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'Bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
    gamma: [{ nombre: 'g1', sitio: 'https://real.example/g1', extra: 'https://real.example/g2' }],
  });

  const markdown = markdownRenderer.render(report, genericSections);

  assert.ok(markdown.includes('<https://real.example/g2>'));
});

test('RF-F05: una sección non-empty vacía no aparece en el markdown', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'Bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
    gamma: [],
  });

  const markdown = markdownRenderer.render(report, genericSections);
  assert.ok(!markdown.includes('Sección Gamma'));
});

test('la línea de estado aparece cuando meta.degraded no está vacío, y no aparece cuando lo está', () => {
  const sano = buildGenericReport(
    {
      alfa: [{ titulo: 'Uno', veredicto: 'x', enlace: 'https://real.example/uno' }],
      beta: { texto: 'x' },
      gamma: [],
    },
    noDegradation,
  );
  const degradado = buildGenericReport(
    {
      alfa: [{ titulo: 'Uno', veredicto: 'x', enlace: 'https://real.example/uno' }],
      beta: { texto: 'x' },
      gamma: [],
    },
    { windowDays: 30, runsOk: 5, runsFailed: 25 },
  );

  assert.ok(!markdownRenderer.render(sano, genericSections).includes('⚠'));
  assert.ok(markdownRenderer.render(degradado, genericSections).includes('⚠'));
});
