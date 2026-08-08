import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyCaps } from '../../src/rank/caps.ts';
import type { Item } from '../../src/sources/types.ts';

function item(source: string, title: string): Item & { readonly source: string } {
  return { title, url: `https://example.com/${title}`, source, summary: 'resumen' };
}

test('tope por fuente: el caso medido, una fuente generalista aportando el 39% se recorta', () => {
  // 6 de una misma fuente + 1 de cada una de otras cuatro = 10 en total, como el 26/67 medido.
  const items = [
    item('generalista', '1'),
    item('generalista', '2'),
    item('generalista', '3'),
    item('generalista', '4'),
    item('generalista', '5'),
    item('generalista', '6'),
    item('b', '1'),
    item('c', '1'),
    item('d', '1'),
    item('e', '1'),
  ];

  const result = applyCaps(items, { maxItems: 100, perSourceMaxPercent: 20 });

  const fromGeneralista = result.filter((candidate) => candidate.source === 'generalista');
  assert.equal(fromGeneralista.length, 2); // floor(10 * 0.20)
  assert.equal(result.length, 6); // 2 + 1 + 1 + 1 + 1
});

test('tope global: limita el total enviado al modelo aunque el tope por fuente lo permita', () => {
  const items = [item('a', '1'), item('b', '1'), item('c', '1'), item('d', '1'), item('e', '1')];

  const result = applyCaps(items, { maxItems: 3, perSourceMaxPercent: 100 });

  assert.equal(result.length, 3);
});

test('una fuente que devuelve 5000 elementos no engorda la llamada', () => {
  const items = Array.from({ length: 5000 }, (_, index) => item('masiva', String(index)));

  const result = applyCaps(items, { maxItems: 20, perSourceMaxPercent: 50 });

  assert.equal(result.length, 20);
});

test('el tope por fuente conserva el orden relativo de entrada (se asume ya puntuado y ordenado)', () => {
  const items = [item('a', 'mejor'), item('a', 'segundo'), item('b', 'unico')];

  const result = applyCaps(items, { maxItems: 100, perSourceMaxPercent: 34 });

  assert.deepEqual(
    result.map((candidate) => candidate.title),
    ['mejor', 'unico'],
  );
});
