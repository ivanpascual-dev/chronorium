import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  recencyComponent,
  scoreItem,
  sortByScoreDesc,
  topicsComponent,
} from '../../src/rank/score.ts';
import type { Item } from '../../src/sources/types.ts';

const now = new Date('2026-08-08T00:00:00.000Z');
const windowDays = 30;

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: 'Un título neutro',
    url: 'https://example.com/a',
    source: 'Ejemplo',
    summary: 'Un resumen neutro.',
    ...overrides,
  };
}

test('la recencia y los temas se combinan con los pesos de la receta, no con constantes', () => {
  const publishedNow = now.toISOString();
  const withTopic = item({
    title: 'Nueva versión de un modelo de lenguaje',
    summary: 'Sin relación adicional.',
    publishedAt: publishedNow,
  });

  const recency = recencyComponent(publishedNow, now, windowDays);
  const topics = topicsComponent(withTopic, ['modelo de lenguaje']);

  const score = scoreItem(withTopic, {
    now,
    windowDays,
    topics: ['modelo de lenguaje'],
    scoring: { recencyWeight: 3, topicsWeight: 5 },
  });

  assert.equal(score, recency * 3 + topics * 5);
  assert.ok(score > 0);
});

test('la coincidencia de temas mira título y resumen, normalizada en minúsculas y sin acentos', () => {
  const inTitle = item({ title: 'Avances en diseño de agentes', summary: 'Nada relevante aquí.' });
  const inSummary = item({
    title: 'Nada relevante aquí.',
    summary: 'Avances en DISEÑO de agentes.',
  });
  const noMatch = item({ title: 'Otra cosa', summary: 'Sin relación.' });

  assert.equal(topicsComponent(inTitle, ['diseno de agentes']), 1);
  assert.equal(topicsComponent(inSummary, ['diseno de agentes']), 1);
  assert.equal(topicsComponent(noMatch, ['diseno de agentes']), 0);
});

test('varios temas declarados: la coincidencia es la fracción de temas que aparecen', () => {
  const partial = item({
    title: 'Habla de inteligencia artificial',
    summary: 'Pero no del segundo tema.',
  });

  assert.equal(topicsComponent(partial, ['inteligencia artificial', 'biotecnología']), 0.5);
});

test('fecha desconocida ⇒ componente de recencia exactamente 0, nunca la máxima', () => {
  assert.equal(recencyComponent(undefined, now, windowDays), 0);
});

test('un elemento publicado ahora mismo obtiene la recencia máxima', () => {
  assert.equal(recencyComponent(now.toISOString(), now, windowDays), 1);
});

test('un elemento en el borde de la ventana obtiene recencia mínima, no negativa', () => {
  const atEdge = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(recencyComponent(atEdge, now, windowDays), 0);
});

test('el orden por puntuación es estable ante empate', () => {
  const a = item({ title: 'a', url: 'https://example.com/a' });
  const b = item({ title: 'b', url: 'https://example.com/b' });
  const c = item({ title: 'c', url: 'https://example.com/c' });

  const sorted = sortByScoreDesc([a, b, c], () => 1);

  assert.deepEqual(sorted, [a, b, c]);
});

test('el orden por puntuación pone primero al de mayor puntuación', () => {
  const low = item({ title: 'bajo', url: 'https://example.com/low' });
  const high = item({ title: 'alto', url: 'https://example.com/high' });

  const sorted = sortByScoreDesc([low, high], (candidate) => (candidate === high ? 10 : 1));

  assert.deepEqual(sorted, [high, low]);
});
