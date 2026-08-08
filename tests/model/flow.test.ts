import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MockLanguageModelV4 } from 'ai/test';
import { generateReport } from '../../src/model/client.ts';
import { composePrompt, type Item } from '../../src/model/prompt.ts';
import { deriveSections } from '../../src/recipe/schema.ts';
import type { RecipeConfig } from '../../src/recipe/types.ts';

const recipe: RecipeConfig = {
  language: 'español',
  topics: ['inteligencia artificial'],
  persona: { text: 'Eres el asistente de alguien que desarrolla en solitario.' },
  model: { provider: 'google', id: 'gemini-test' },
  sections: [
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
  ],
  sources: [],
  window: { days: 30 },
  scoring: { recencyWeight: 1, topicsWeight: 1 },
  caps: { maxItems: 50, perSourceMaxPercent: 40 },
};

const items: Item[] = [
  {
    title: 'Novedad legítima',
    url: 'https://example.com/a',
    source: 'Ejemplo',
    publishedAt: '2026-08-07',
    summary: 'Un resumen normal.',
  },
];

function mockModelReturning(text: string): MockLanguageModelV4 {
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

test('receta → esquema → prompt → doble → salida validada contra el esquema', async () => {
  const derivedResult = deriveSections(recipe.sections);
  assert.equal(derivedResult.ok, true);
  if (!derivedResult.ok) return;

  const prompt = composePrompt(recipe, items);
  assert.ok(prompt.length > 0);

  const validOutput = {
    pulse: { text: 'Resumen del día.' },
    top: [{ title: 'Novedad legítima', link: 'https://example.com/a' }],
  };

  const model = mockModelReturning(JSON.stringify(validOutput));
  const report = await generateReport({ model, prompt, derived: derivedResult.value });

  assert.deepEqual(report, validOutput);
});

test('una salida a la que le falta una sección declarada falla, no se rellena', async () => {
  const derivedResult = deriveSections(recipe.sections);
  assert.equal(derivedResult.ok, true);
  if (!derivedResult.ok) return;

  const prompt = composePrompt(recipe, items);

  const incompleteOutput = {
    pulse: { text: 'Resumen del día.' },
    // falta "top" por completo
  };

  const model = mockModelReturning(JSON.stringify(incompleteOutput));

  await assert.rejects(() => generateReport({ model, prompt, derived: derivedResult.value }));
});
