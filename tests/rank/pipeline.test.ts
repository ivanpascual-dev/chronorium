import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runPipeline } from '../../src/rank/pipeline.ts';
import type { RecipeConfig } from '../../src/recipe/types.ts';
import type { Item } from '../../src/sources/types.ts';

const now = new Date('2026-08-08T00:00:00.000Z');

function recipe(overrides: Partial<RecipeConfig> = {}): RecipeConfig {
  return {
    name: 'receta-de-prueba',
    language: 'es',
    topics: ['x'],
    persona: { text: 'persona' },
    model: { provider: 'google', id: 'gemini-test' },
    sections: [],
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 0, topicsWeight: 1 },
    caps: { maxItems: 100, perSourceMaxPercent: 100 },
    delivery: [],
    health: { windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.5 },
    ...overrides,
  };
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: 'Un título neutro',
    url: 'https://example.com/a',
    source: 'gen',
    summary: 'Un resumen neutro.',
    publishedAt: now.toISOString(),
    ...overrides,
  };
}

test('filtra por ventana: un elemento más viejo que la ventana no llega al final', () => {
  const old = item({
    title: 'Viejo',
    url: 'https://example.com/viejo',
    publishedAt: new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const recent = item({ title: 'Reciente', url: 'https://example.com/reciente' });

  const result = runPipeline([old, recent], { now, recipe: recipe(), isSeen: () => false });

  assert.deepEqual(
    result.map((r) => r.title),
    ['Reciente'],
  );
});

test('deduplica antes de puntuar y de aplicar topes', () => {
  const a = item({ title: 'Igual', url: 'https://example.com/igual' });
  const b = item({ title: 'Igual', url: 'https://example.com/igual?utm_source=x' });

  const result = runPipeline([a, b], { now, recipe: recipe(), isSeen: () => false });

  assert.equal(result.length, 1);
});

test('filtra por memoria ANTES del tope global: un elemento ya visto no ocupa la plaza de uno nuevo', () => {
  const seen = item({
    title: 'Ya visto, con tema',
    url: 'https://example.com/ya-visto',
    summary: 'menciona x, que puntúa alto',
  });
  const fresh = item({
    title: 'Nuevo, sin tema',
    url: 'https://example.com/nuevo',
    summary: 'no menciona el tema, puntúa bajo',
  });

  const result = runPipeline([seen, fresh], {
    now,
    recipe: recipe({ caps: { maxItems: 1, perSourceMaxPercent: 100 } }),
    isSeen: (candidate) => candidate.url === seen.url,
  });

  // Si la memoria se aplicara después del tope global, "seen" (mejor puntuado) ganaría la única
  // plaza y luego se descartaría, dejando el resultado vacío en vez de con "fresh".
  assert.deepEqual(
    result.map((r) => r.title),
    ['Nuevo, sin tema'],
  );
});

test('puntúa ANTES del tope por fuente: se queda con el mejor de la fuente, no con el primero', () => {
  const first = item({ title: 'primero, sin tema', url: 'https://example.com/primero' });
  const best = item({
    title: 'segundo, con tema',
    url: 'https://example.com/segundo',
    summary: 'este sí menciona x',
  });
  const third = item({ title: 'tercero, sin tema', url: 'https://example.com/tercero' });

  const result = runPipeline([first, best, third], {
    now,
    recipe: recipe({ caps: { maxItems: 10, perSourceMaxPercent: 34 } }),
    isSeen: () => false,
  });

  assert.deepEqual(
    result.map((r) => r.title),
    ['segundo, con tema'],
  );
});
