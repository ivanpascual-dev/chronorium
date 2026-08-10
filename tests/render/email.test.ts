import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SectionSpec } from '../../src/recipe/types.ts';
import { emailRenderer } from '../../src/render/email.ts';
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

test('R12: el correo no contiene ninguna clave de sección, solo sus títulos declarados', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
  });

  const html = emailRenderer.render(report, genericSections);

  assert.ok(html.includes('Sección Alfa'));
  assert.ok(html.includes('Sección Beta'));
  assert.ok(!html.includes('>alfa<'));
  assert.ok(!html.includes('>beta<'));
});

test('caso 4 de la batería: marcado en el título llega escapado, nunca activo', () => {
  const report = buildGenericReport({
    alfa: [
      {
        titulo: '<script>alert(1)</script>',
        veredicto: '<img src=x onerror=alert(1)>',
        enlace: 'https://real.example/uno',
      },
    ],
    beta: { texto: 'x' },
  });

  const html = emailRenderer.render(report, genericSections);

  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
});

test('el correo no referencia ningún recurso externo', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
  });

  const html = emailRenderer.render(report, genericSections);

  assert.ok(!html.includes('<img'));
  assert.ok(!/<link\b/.test(html));
  assert.ok(!html.includes('http://') || html.includes('href="https://real.example/uno"'));
  // Ningún `src=` remoto: el único href real es el enlace del propio elemento.
  assert.ok(!/\ssrc="https?:\/\//.test(html));
});

test('un campo con label declarado se renderiza con su etiqueta; sin label, como párrafo suelto', () => {
  const report = buildGenericReport({
    alfa: [{ titulo: 'Uno', veredicto: 'Bien', enlace: 'https://real.example/uno' }],
    beta: { texto: 'x' },
  });

  const html = emailRenderer.render(report, genericSections);

  assert.ok(html.includes('<strong>Veredicto:</strong> Bien'));
  assert.ok(!html.includes('veredicto'));
});

test('RF-F05: una sección non-empty vacía no aparece en el correo', () => {
  const sectionsConGamma: readonly SectionSpec[] = [
    ...genericSections,
    {
      key: 'gamma',
      title: 'Sección Gamma',
      cardinality: 'list',
      min: 0,
      max: 2,
      condition: 'non-empty',
      fields: [{ name: 'nombre', type: 'string' }],
    },
  ];

  const report = buildReport({
    recipe: makeRecipe({ sections: sectionsConGamma }),
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    modelOutput: {
      alfa: [{ titulo: 'Uno', veredicto: 'x', enlace: 'https://real.example/uno' }],
      beta: { texto: 'x' },
      gamma: [],
    },
    provider: 'google',
    providerWasFallback: false,
    linksDropped: 0,
    itemsCollected: 5,
    itemsAnalyzed: 5,
    sourcesOk: 2,
    sourcesFailed: 0,
    health: noDegradation,
  });

  const html = emailRenderer.render(report, sectionsConGamma);
  assert.ok(!html.includes('Sección Gamma'));
});

test('la línea de estado aparece cuando meta.degraded no está vacío, y no aparece cuando lo está', () => {
  const sano = buildGenericReport(
    {
      alfa: [{ titulo: 'Uno', veredicto: 'x', enlace: 'https://real.example/uno' }],
      beta: { texto: 'x' },
    },
    noDegradation,
  );
  const degradado = buildGenericReport(
    {
      alfa: [{ titulo: 'Uno', veredicto: 'x', enlace: 'https://real.example/uno' }],
      beta: { texto: 'x' },
    },
    { windowDays: 30, runsOk: 5, runsFailed: 25 },
  );

  assert.ok(!emailRenderer.render(sano, genericSections).includes('⚠'));
  assert.ok(emailRenderer.render(degradado, genericSections).includes('⚠'));
});
