import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ChainConfigurationError,
  diagnoseChain,
  NoProviderSucceededError,
  runChain,
} from '../../src/model/chain.ts';
import type { ProviderFactory, ProviderRegistry } from '../../src/model/providers.ts';
import { RetryError } from '../../src/model/retry.ts';
import type { ModelConfig } from '../../src/recipe/types.ts';

const noopCreate: ProviderFactory['create'] = async () => {
  throw new Error('no se usa en estos tests: diagnoseChain nunca llama a create()');
};

const fakeRegistry: ProviderRegistry = new Map<string, ProviderFactory>([
  ['google', { defaultApiKeyEnv: 'GOOGLE_KEY', create: noopCreate }],
  ['acme', { defaultApiKeyEnv: 'ACME_KEY', create: noopCreate }],
]);

function secretsFrom(
  values: Record<string, string | undefined>,
): (name: string) => string | undefined {
  return (name) => values[name];
}

test('un proveedor sin credencial en el entorno queda fuera de la cadena al validar', () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };
  const diagnosis = diagnoseChain(model, { registry: fakeRegistry, secret: secretsFrom({}) });

  assert.equal(diagnosis.usable.length, 0);
  assert.equal(diagnosis.discarded.length, 1);
  assert.match(diagnosis.discarded[0]?.reason ?? '', /ausente/);
});

test('una credencial marcador de posición documentado se rechaza al validar', () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'tu_api_key_aqui' }),
  });

  assert.equal(diagnosis.usable.length, 0);
  assert.match(diagnosis.discarded[0]?.reason ?? '', /marcador de posición/);
});

test('una credencial vacía o solo espacios se rechaza', () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };

  const vacia = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: '' }),
  });
  const espacios = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: '   ' }),
  });

  assert.equal(vacia.usable.length, 0);
  assert.equal(espacios.usable.length, 0);
});

test('con un proveedor vivo se emite el aviso de punto único de fallo; con dos no', () => {
  const model: ModelConfig = {
    provider: 'google',
    id: 'gemini-x',
    fallbacks: [{ provider: 'acme', id: 'acme-x' }],
  };

  const conUno = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real' }),
  });
  assert.equal(conUno.usable.length, 1);
  assert.ok(conUno.warnings.some((warning) => /punto único de fallo/.test(warning)));

  const conDos = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real', ACME_KEY: 'otra-clave-real' }),
  });
  assert.equal(conDos.usable.length, 2);
  assert.equal(conDos.warnings.length, 0);
});

test('el orden de la cadena es el declarado: principal y luego fallbacks en orden', () => {
  const model: ModelConfig = {
    provider: 'google',
    id: 'gemini-x',
    fallbacks: [{ provider: 'acme', id: 'acme-x' }],
  };

  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real', ACME_KEY: 'otra-clave-real' }),
  });

  assert.deepEqual(
    diagnosis.usable.map((spec) => spec.provider),
    ['google', 'acme'],
  );
});

test('cero proveedores vivos es un error de configuración, distinguible del fallo de modelo', async () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };
  const diagnosis = diagnoseChain(model, { registry: fakeRegistry, secret: secretsFrom({}) });

  await assert.rejects(
    () =>
      runChain(diagnosis, async () => 'nunca se llega aquí', {
        maxAttempts: 1,
        baseDelayMs: 1,
        maxDelayMs: 1,
        sleep: async () => {},
      }),
    ChainConfigurationError,
  );
});

test('discarded nombra el motivo, y ningún mensaje contiene el valor de la credencial', () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };
  const credencialSecreta = 'sk-super-secreto-9f8e7d6c';
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'tu_api_key_aqui' }),
  });

  for (const discard of diagnosis.discarded) {
    assert.ok(!discard.reason.includes(credencialSecreta));
  }

  const conCredencialVacia = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({}),
  });
  for (const discard of conCredencialVacia.discarded) {
    assert.ok(!discard.reason.includes(credencialSecreta));
  }
});

test('runChain: el principal responde y no hay caída', async () => {
  const model: ModelConfig = { provider: 'google', id: 'gemini-x' };
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real' }),
  });

  const outcome = await runChain(diagnosis, async () => 'informe', {
    maxAttempts: 3,
    baseDelayMs: 1,
    maxDelayMs: 1,
    sleep: async () => {},
  });

  assert.equal(outcome.value, 'informe');
  assert.equal(outcome.wasFallback, false);
  assert.deepEqual(outcome.providersTried, [
    { provider: 'google', id: 'gemini-x', outcome: 'ok', attempts: 1 },
  ]);
});

test('runChain: todos los proveedores fallan produce NoProviderSucceededError', async () => {
  const model: ModelConfig = {
    provider: 'google',
    id: 'gemini-x',
    fallbacks: [{ provider: 'acme', id: 'acme-x' }],
  };
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real', ACME_KEY: 'otra-clave-real' }),
  });

  await assert.rejects(
    () =>
      runChain(
        diagnosis,
        async () => {
          throw new Error('fallo de verdad');
        },
        { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
      ),
    (error: unknown) => {
      assert.ok(error instanceof NoProviderSucceededError);
      assert.equal(error.providersTried.length, 2);
      assert.ok(error.providersTried.every((attempt) => attempt.outcome === 'failed'));
      return true;
    },
  );
});

test('runChain: el 401 en el principal pasa al respaldo sin reintentar, y providersTried lo dice', async () => {
  const model: ModelConfig = {
    provider: 'google',
    id: 'gemini-x',
    fallbacks: [{ provider: 'acme', id: 'acme-x' }],
  };
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real', ACME_KEY: 'otra-clave-real' }),
  });

  let calls = 0;
  const outcome = await runChain(
    diagnosis,
    async (spec) => {
      calls += 1;
      if (spec.provider === 'google') {
        const { APICallError } = await import('ai');
        throw new APICallError({
          message: '401',
          url: 'https://example.com',
          requestBodyValues: {},
          statusCode: 401,
        });
      }
      return 'informe del respaldo';
    },
    { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
  );

  assert.equal(outcome.value, 'informe del respaldo');
  assert.equal(outcome.wasFallback, true);
  assert.equal(calls, 2);
  assert.deepEqual(outcome.providersTried, [
    { provider: 'google', id: 'gemini-x', outcome: 'failed', reason: '401', attempts: 1 },
    { provider: 'acme', id: 'acme-x', outcome: 'ok', attempts: 1 },
  ]);
});

test('runChain: un 503 en el principal se reintenta en el mismo proveedor, no salta al siguiente', async () => {
  const model: ModelConfig = {
    provider: 'google',
    id: 'gemini-x',
    fallbacks: [{ provider: 'acme', id: 'acme-x' }],
  };
  const diagnosis = diagnoseChain(model, {
    registry: fakeRegistry,
    secret: secretsFrom({ GOOGLE_KEY: 'clave-real', ACME_KEY: 'otra-clave-real' }),
  });

  let googleCalls = 0;
  const outcome = await runChain(
    diagnosis,
    async (spec) => {
      if (spec.provider === 'google') {
        googleCalls += 1;
        if (googleCalls < 3) {
          const { APICallError } = await import('ai');
          throw new APICallError({
            message: '503',
            url: 'https://example.com',
            requestBodyValues: {},
            statusCode: 503,
          });
        }
        return 'informe del principal';
      }
      throw new Error('no debería llegar al respaldo');
    },
    { maxAttempts: 5, baseDelayMs: 1, maxDelayMs: 1, sleep: async () => {} },
  );

  assert.equal(outcome.value, 'informe del principal');
  assert.equal(outcome.wasFallback, false);
  assert.equal(googleCalls, 3);
});

test('RetryError expone los intentos incluso cuando queda envuelto en providersTried', () => {
  const error = new RetryError(3, new Error('x'));
  assert.equal(error.attempts, 3);
});
