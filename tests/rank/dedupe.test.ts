import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dedupeItems, normalizeTitle, normalizeUrl } from '../../src/rank/dedupe.ts';
import type { Item } from '../../src/sources/types.ts';

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: 'Un título cualquiera',
    url: 'https://example.com/a',
    source: 'Ejemplo',
    summary: 'Un resumen.',
    ...overrides,
  };
}

test('la misma dirección exacta colapsa', () => {
  const a = item({ title: 'Primero', url: 'https://example.com/articulo' });
  const b = item({ title: 'Segundo', url: 'https://example.com/articulo' });

  const result = dedupeItems([a, b]);
  assert.equal(result.length, 1);
});

test('la misma dirección con fragmento y con parámetros de seguimiento conocidos colapsa', () => {
  const a = item({ url: 'https://example.com/articulo' });
  const b = item({ url: 'https://example.com/articulo?utm_source=x&utm_medium=y#seccion' });

  const result = dedupeItems([a, b]);
  assert.equal(result.length, 1);
});

test('mismo título normalizado desde dos fuentes distintas colapsa', () => {
  const a = item({
    title: 'Gemini 3.6 Flash alcanza disponibilidad general',
    url: 'https://fuente-uno.example.com/a',
    source: 'Fuente uno',
  });
  const b = item({
    title: '¡Gemini 3.6 Flash Alcanza Disponibilidad General!',
    url: 'https://fuente-dos.example.com/b',
    source: 'Fuente dos',
  });

  const result = dedupeItems([a, b]);
  assert.equal(result.length, 1);
});

test('títulos parecidos pero no iguales no colapsan', () => {
  const a = item({
    title: 'Gemini 3.6 Flash alcanza disponibilidad general',
    url: 'https://a.example.com',
  });
  const b = item({
    title: 'Gemini 3.6 Pro alcanza disponibilidad general',
    url: 'https://b.example.com',
  });

  const result = dedupeItems([a, b]);
  assert.equal(result.length, 2);
});

test('ante duplicado se conserva el de mayor puntuación', () => {
  const low = { ...item({ url: 'https://example.com/articulo' }), score: 1 };
  const high = { ...item({ url: 'https://example.com/articulo' }), score: 9 };

  const result = dedupeItems([low, high]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.score, 9);
});

test('con empate de puntuación se conserva el primero, de forma determinista', () => {
  const first = { ...item({ title: 'Primero', url: 'https://example.com/articulo' }), score: 5 };
  const second = { ...item({ title: 'Segundo', url: 'https://example.com/articulo' }), score: 5 };

  const result = dedupeItems([first, second]);
  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, 'Primero');
});

test('sin puntuación, colapsar conserva igualmente el primero visto', () => {
  const first = item({ title: 'Primero', url: 'https://example.com/articulo' });
  const second = item({ title: 'Segundo', url: 'https://example.com/articulo' });

  const result = dedupeItems([first, second]);
  assert.equal(result[0]?.title, 'Primero');
});

test('normalizeUrl ignora fragmento, parámetros de seguimiento y barra final', () => {
  assert.equal(
    normalizeUrl('https://Example.com/articulo/?utm_source=x#seccion'),
    normalizeUrl('https://example.com/articulo'),
  );
});

test('normalizeUrl conserva parámetros que no son de seguimiento', () => {
  assert.notEqual(
    normalizeUrl('https://example.com/articulo?id=1'),
    normalizeUrl('https://example.com/articulo?id=2'),
  );
});

test('normalizeTitle ignora mayúsculas, acentos y puntuación', () => {
  assert.equal(
    normalizeTitle('¡Gemini 3.6 Flash Alcanza Disponibilidad General!'),
    normalizeTitle('gemini 3.6 flash alcanza disponibilidad general'),
  );
});
