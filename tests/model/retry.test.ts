import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APICallError } from 'ai';
import { classifyError, RetryError, withRetry } from '../../src/model/retry.ts';

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: `error ${statusCode}`,
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
  });
}

function networkError(): APICallError {
  return new APICallError({
    message: 'Cannot connect to API',
    url: 'https://example.com',
    requestBodyValues: {},
    isRetryable: true,
  });
}

function timeoutError(): Error {
  const error = new Error('The operation was aborted');
  error.name = 'TimeoutError';
  return error;
}

test('500, 502 y 503 se clasifican como recuperables', () => {
  assert.equal(classifyError(apiError(500)), 'retryable');
  assert.equal(classifyError(apiError(502)), 'retryable');
  assert.equal(classifyError(apiError(503)), 'retryable');
});

test('429 se clasifica como recuperable, aunque sea un error de cliente', () => {
  assert.equal(classifyError(apiError(429)), 'retryable');
});

test('401, 403, 404 y 400 se clasifican como fatales para ese proveedor', () => {
  assert.equal(classifyError(apiError(401)), 'provider-fatal');
  assert.equal(classifyError(apiError(403)), 'provider-fatal');
  assert.equal(classifyError(apiError(404)), 'provider-fatal');
  assert.equal(classifyError(apiError(400)), 'provider-fatal');
});

test('un fallo de red se clasifica como recuperable', () => {
  assert.equal(classifyError(networkError()), 'retryable');
});

test('un tiempo de espera agotado se clasifica como recuperable', () => {
  assert.equal(classifyError(timeoutError()), 'retryable');
});

test('un error sin statusCode que no sea de red se clasifica como fatal', () => {
  assert.equal(classifyError(new Error('algo inesperado')), 'provider-fatal');
});

test('un 401 no se reintenta nunca: un solo intento', async () => {
  let calls = 0;
  const sleeps: number[] = [];

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw apiError(401);
        },
        {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 1000,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    RetryError,
  );

  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test('un 503 se reintenta hasta agotar los intentos, con espera creciente y acotada', async () => {
  let calls = 0;
  const sleeps: number[] = [];

  await assert.rejects(
    () =>
      withRetry(
        async () => {
          calls += 1;
          throw apiError(503);
        },
        {
          maxAttempts: 4,
          baseDelayMs: 100,
          maxDelayMs: 250,
          sleep: async (ms) => {
            sleeps.push(ms);
          },
        },
      ),
    (error: unknown) => {
      assert.ok(error instanceof RetryError);
      assert.equal(error.attempts, 4);
      return true;
    },
  );

  assert.equal(calls, 4);
  assert.deepEqual(sleeps, [100, 200, 250]);
});

test('el intento que responde bien detiene la cadena de reintentos', async () => {
  let calls = 0;

  const outcome = await withRetry(
    async () => {
      calls += 1;
      if (calls < 3) {
        throw apiError(503);
      }
      return 'ok';
    },
    {
      maxAttempts: 5,
      baseDelayMs: 10,
      maxDelayMs: 100,
      sleep: async () => {},
    },
  );

  assert.equal(outcome.value, 'ok');
  assert.equal(outcome.attempts, 3);
});
