import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { collect } from '../../src/sources/collect.ts';
import { buildRegistry } from '../../src/sources/registry.ts';
import type { Item, SourceReader } from '../../src/sources/types.ts';
import { makeCtx, textResponse } from './helpers.ts';

function ok(type: string, items: readonly Item[]): SourceReader {
  return {
    type,
    requiredSecrets: [],
    async read() {
      return items;
    },
  };
}

function failing(type: string, message: string): SourceReader {
  return {
    type,
    requiredSecrets: [],
    async read() {
      throw new Error(message);
    },
  };
}

/**
 * Simula un lector que se corta por el tiempo de espera (RF-B05), como hacen los lectores reales
 * vía `fetchWithTimeout` y `ctx.timeoutMs`. No usa un doble que "nunca resuelve" de verdad: eso
 * colgaría el test para siempre si `collect()` no lo aislara correctamente.
 */
function timingOut(type: string): SourceReader {
  return {
    type,
    requiredSecrets: [],
    read: (_source, ctx) =>
      new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error('tiempo de espera agotado')), ctx.timeoutMs);
      }),
  };
}

function item(title: string): Item {
  return { title, url: `https://example.com/${title}`, source: 'x', summary: 'r' };
}

test('una fuente que responde 500 se registra como fallida, las demás continúan', async () => {
  const registry = buildRegistry([ok('bueno', [item('a')]), failing('malo', 'HTTP 500')]);
  const sources: SourceSpec[] = [
    { id: 'fuente-buena', type: 'bueno' },
    { id: 'fuente-mala', type: 'malo' },
  ];

  const { items, results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse('')),
  );

  assert.equal(items.length, 1);
  assert.equal(results.find((r) => r.id === 'fuente-mala')?.ok, false);
  assert.match(results.find((r) => r.id === 'fuente-mala')?.error ?? '', /HTTP 500/);
  assert.equal(results.find((r) => r.id === 'fuente-buena')?.ok, true);
});

test('una fuente que responde 429 (límite de tasa) se registra como fallida, las demás continúan', async () => {
  const registry = buildRegistry([ok('bueno', [item('a')]), failing('limitada', 'HTTP 429')]);
  const sources: SourceSpec[] = [
    { id: 'fuente-buena', type: 'bueno' },
    { id: 'fuente-limitada', type: 'limitada' },
  ];

  const { items, results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse('')),
  );

  assert.equal(items.length, 1);
  assert.equal(results.find((r) => r.id === 'fuente-limitada')?.ok, false);
  assert.match(results.find((r) => r.id === 'fuente-limitada')?.error ?? '', /HTTP 429/);
  assert.equal(results.find((r) => r.id === 'fuente-buena')?.ok, true);
});

test('una fuente que agota su tiempo de espera se registra como fallida, sin bloquear a las demás', async () => {
  const registry = buildRegistry([ok('bueno', [item('a')]), timingOut('lento')]);
  const sources: SourceSpec[] = [
    { id: 'fuente-buena', type: 'bueno' },
    { id: 'fuente-lenta', type: 'lento' },
  ];

  const { items, results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse(''), { timeoutMs: 10 }),
  );

  assert.equal(items.length, 1);
  assert.equal(results.find((r) => r.id === 'fuente-lenta')?.ok, false);
  assert.equal(results.find((r) => r.id === 'fuente-buena')?.ok, true);
});

test('un tipo de fuente no registrado se refleja como fallo por fuente, sin tumbar la recolección', async () => {
  const registry = buildRegistry([ok('bueno', [item('a')])]);
  const sources: SourceSpec[] = [{ id: 'fuente-desconocida', type: 'no-existe' }];

  const { items, results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse('')),
  );

  assert.deepEqual(items, []);
  assert.equal(results[0]?.ok, false);
  assert.match(results[0]?.error ?? '', /no-existe/);
});

test('con todas las fuentes caídas, el resultado es cero elementos pero distinguible del éxito', async () => {
  const registry = buildRegistry([failing('malo', 'boom')]);
  const sources: SourceSpec[] = [
    { id: 'a', type: 'malo' },
    { id: 'b', type: 'malo' },
  ];

  const { items, results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse('')),
  );

  assert.deepEqual(items, []);
  assert.ok(results.every((r) => r.ok === false));
  assert.equal(results.length, 2);
});

test('produce un SourceResult por fuente, con el número de elementos que aportó', async () => {
  const registry = buildRegistry([ok('bueno', [item('a'), item('b')])]);
  const sources: SourceSpec[] = [{ id: 'fuente-buena', type: 'bueno' }];

  const { results } = await collect(
    sources,
    registry,
    makeCtx(async () => textResponse('')),
  );

  assert.equal(results[0]?.id, 'fuente-buena');
  assert.equal(results[0]?.type, 'bueno');
  assert.equal(results[0]?.items, 2);
  assert.equal(typeof results[0]?.durationMs, 'number');
});
