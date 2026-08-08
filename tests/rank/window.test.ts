import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isWithinWindow, parsePublishedAt } from '../../src/rank/window.ts';

const now = new Date('2026-08-08T12:00:00.000Z');

test('ISO completo se interpreta y normaliza a ISO', () => {
  const result = parsePublishedAt('2026-08-05T08:00:00Z', now);
  assert.equal(result, new Date('2026-08-05T08:00:00Z').toISOString());
});

test('ISO solo fecha se interpreta', () => {
  const result = parsePublishedAt('2026-08-05', now);
  assert.equal(result, new Date('2026-08-05').toISOString());
});

test('RFC 822 (formato de pubDate de RSS) se interpreta', () => {
  const result = parsePublishedAt('Wed, 05 Aug 2026 08:00:00 GMT', now);
  assert.equal(result, new Date('Wed, 05 Aug 2026 08:00:00 GMT').toISOString());
});

test('una cadena basura produce fecha desconocida', () => {
  assert.equal(parsePublishedAt('no es una fecha', now), undefined);
});

test('una cadena vacía produce fecha desconocida', () => {
  assert.equal(parsePublishedAt('', now), undefined);
});

test('un campo ausente produce fecha desconocida', () => {
  assert.equal(parsePublishedAt(undefined, now), undefined);
});

test('una fecha en el futuro más allá del margen produce fecha desconocida', () => {
  const farFuture = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(parsePublishedAt(farFuture, now), undefined);
});

test('una fecha en el futuro dentro del margen sí se interpreta', () => {
  const nearFuture = new Date(now.getTime() + 60 * 60 * 1000).toISOString();
  assert.equal(parsePublishedAt(nearFuture, now), new Date(nearFuture).toISOString());
});

test('ventana: un elemento reciente está dentro', () => {
  const publishedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinWindow(publishedAt, now, 30), true);
});

test('ventana: un elemento más viejo que la ventana está fuera', () => {
  const publishedAt = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinWindow(publishedAt, now, 30), false);
});

test('ventana: el borde exacto cuenta como dentro', () => {
  const publishedAt = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  assert.equal(isWithinWindow(publishedAt, now, 30), true);
});

test('ventana: un elemento de fecha desconocida no se descarta, solo se queda sin recencia', () => {
  assert.equal(isWithinWindow(undefined, now, 30), true);
});
