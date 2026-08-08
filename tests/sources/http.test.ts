import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchWithTimeout } from '../../src/sources/http.ts';
import { makeCtx, textResponse } from './helpers.ts';

test('manda el identificador de cliente propio en la cabecera User-Agent (RF-B08)', async () => {
  let seenHeaders: Record<string, string> | undefined;
  const fetchImpl = async (_url: string, init: { headers: Record<string, string> }) => {
    seenHeaders = init.headers;
    return textResponse('ok');
  };

  await fetchWithTimeout(
    'https://example.com',
    makeCtx(fetchImpl, { userAgent: 'chronorium/1.0' }),
  );

  assert.equal(seenHeaders?.['User-Agent'], 'chronorium/1.0');
});

test('combina cabeceras extra con el User-Agent, sin perder ninguna', async () => {
  let seenHeaders: Record<string, string> | undefined;
  const fetchImpl = async (_url: string, init: { headers: Record<string, string> }) => {
    seenHeaders = init.headers;
    return textResponse('ok');
  };

  await fetchWithTimeout('https://example.com', makeCtx(fetchImpl), { Accept: 'application/json' });

  assert.equal(seenHeaders?.Accept, 'application/json');
  assert.ok(seenHeaders?.['User-Agent']);
});

test('una fuente que nunca resuelve se corta por el tiempo de espera configurado', async () => {
  const fetchImpl = (_url: string, init: { signal: AbortSignal }) =>
    new Promise<never>((_resolve, reject) => {
      init.signal.addEventListener('abort', () =>
        reject(new Error('abortado por tiempo de espera')),
      );
    });

  await assert.rejects(() =>
    fetchWithTimeout('https://example.com', makeCtx(fetchImpl, { timeoutMs: 20 })),
  );
});
