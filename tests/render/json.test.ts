import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SectionSpec } from '../../src/recipe/types.ts';
import { jsonRenderer } from '../../src/render/json.ts';
import { buildReport } from '../../src/render/report.ts';
import { makeRecipe } from './helpers.ts';

const sections: readonly SectionSpec[] = [
  {
    key: 'alfa',
    title: 'Sección <Alfa> & "rara"',
    cardinality: 'one',
    condition: 'always',
    fields: [{ name: 'texto', type: 'string' }],
  },
];

test('el JSON renderizado vuelve a leerse con JSON.parse y es idéntico al Report de entrada', () => {
  const report = buildReport({
    recipe: makeRecipe({ sections }),
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    modelOutput: { alfa: { texto: '<script>x</script> & cosas "raras"' } },
    provider: 'google',
    providerWasFallback: false,
    linksDropped: 0,
    itemsCollected: 1,
    itemsAnalyzed: 1,
    sourcesOk: 1,
    sourcesFailed: 0,
    health: { windowDays: 30, runsOk: 30, runsFailed: 0 },
  });

  const json = jsonRenderer.render(report, sections);
  const parsed = JSON.parse(json);

  assert.deepEqual(parsed, report);
  // El JSON no escapa: el texto crudo (con `<script>` sin tocar) es el dato canónico.
  assert.equal(parsed.sections[0].items[0].texto, '<script>x</script> & cosas "raras"');
});
