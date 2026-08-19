import assert from 'node:assert/strict';
import { test } from 'node:test';
import { APICallError } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { NoProviderSucceededError } from '../../src/model/chain.ts';
import type { ProviderFactory, ProviderRegistry } from '../../src/model/providers.ts';
import type { RetryOptions } from '../../src/model/retry.ts';
import { synthesize } from '../../src/model/synthesize.ts';
import type { RecipeConfig } from '../../src/recipe/types.ts';
import type { Item } from '../../src/sources/types.ts';

const recipe: RecipeConfig = {
  name: 'receta-de-prueba',
  delivery: [],
  health: { windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.5 },
  language: 'español',
  topics: ['inteligencia artificial'],
  persona: { text: 'Eres el asistente de alguien que desarrolla en solitario.' },
  model: {
    provider: 'primary',
    id: 'p-1',
    fallbacks: [{ provider: 'backup', id: 'b-1' }],
  },
  sections: [
    {
      key: 'pulse',
      title: 'Pulso del día',
      cardinality: 'one',
      condition: 'always',
      fields: [
        { name: 'text', type: 'string' },
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
    url: 'https://example.com/a?utm_source=x',
    source: 'Ejemplo',
    publishedAt: '2026-08-07',
    summary: 'Un resumen normal.',
  },
];

const validOutput = {
  pulse: { text: 'Resumen del día.', link: 'https://example.com/a?utm_source=x' },
};
const incompleteOutput = { pulse: { text: 'Resumen del día.' } }; // falta "link"

const secret = (name: string): string | undefined =>
  name === 'PRIMARY_KEY' || name === 'BACKUP_KEY' ? 'clave-de-prueba' : undefined;

const fastRetry: Partial<RetryOptions> = {
  maxAttempts: 3,
  baseDelayMs: 1,
  maxDelayMs: 1,
  sleep: async () => {},
};

type Step = () => Promise<{ readonly content: { readonly type: 'text'; readonly text: string }[] }>;

function textStep(text: string): Step {
  return async () => ({ content: [{ type: 'text', text }] });
}

function failureStep(error: unknown): Step {
  return async () => {
    throw error;
  };
}

function sequenceModel(steps: readonly Step[]): MockLanguageModelV4 {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const step = steps[Math.min(index, steps.length - 1)] as Step;
      index += 1;
      const { content } = await step();
      return {
        content,
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
}

function registryWith(models: Record<string, MockLanguageModelV4>): ProviderRegistry {
  const map = new Map<string, ProviderFactory>();
  for (const [provider, model] of Object.entries(models)) {
    map.set(provider, {
      defaultApiKeyEnv: `${provider.toUpperCase()}_KEY`,
      create: async () => model,
    });
  }
  return map;
}

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: `error ${statusCode}`,
    url: 'https://example.com',
    requestBodyValues: {},
    statusCode,
  });
}

test('el principal responde: providerWasFallback en falso y un solo intento', async () => {
  const registry = registryWith({
    primary: sequenceModel([textStep(JSON.stringify(validOutput))]),
    backup: sequenceModel([failureStep(new Error('no debería llamarse'))]),
  });

  const result = await synthesize({ recipe, items, secret, registry, retry: fastRetry });

  assert.equal(result.providerWasFallback, false);
  assert.equal(result.provider, 'primary');
  assert.deepEqual(result.providersTried, [
    { provider: 'primary', id: 'p-1', outcome: 'ok', attempts: 1 },
  ]);
});

test('el principal devuelve 503 dos veces y luego responde: se reintenta en el mismo proveedor', async () => {
  const registry = registryWith({
    primary: sequenceModel([
      failureStep(apiError(503)),
      failureStep(apiError(503)),
      textStep(JSON.stringify(validOutput)),
    ]),
    backup: sequenceModel([failureStep(new Error('no debería llamarse'))]),
  });

  const result = await synthesize({ recipe, items, secret, registry, retry: fastRetry });

  assert.equal(result.providerWasFallback, false);
  assert.deepEqual(result.providersTried, [
    { provider: 'primary', id: 'p-1', outcome: 'ok', attempts: 3 },
  ]);
});

test('el principal devuelve 401: se pasa al siguiente sin reintentar, y providersTried lo dice', async () => {
  const registry = registryWith({
    primary: sequenceModel([failureStep(apiError(401))]),
    backup: sequenceModel([textStep(JSON.stringify(validOutput))]),
  });

  const result = await synthesize({ recipe, items, secret, registry, retry: fastRetry });

  assert.equal(result.providerWasFallback, true);
  assert.equal(result.provider, 'backup');
  assert.deepEqual(result.providersTried, [
    { provider: 'primary', id: 'p-1', outcome: 'failed', reason: 'error 401', attempts: 1 },
    { provider: 'backup', id: 'b-1', outcome: 'ok', attempts: 1 },
  ]);
});

test('el respaldo produce el informe: providerWasFallback en verdadero', async () => {
  const registry = registryWith({
    primary: sequenceModel([failureStep(apiError(500))]),
    backup: sequenceModel([textStep(JSON.stringify(validOutput))]),
  });

  const result = await synthesize({
    recipe,
    items,
    secret,
    registry,
    retry: { ...fastRetry, maxAttempts: 1 },
  });

  assert.equal(result.providerWasFallback, true);
});

test('todos los proveedores fallan: fallo de clase "ningún proveedor pudo generar el informe"', async () => {
  const registry = registryWith({
    primary: sequenceModel([failureStep(apiError(500))]),
    backup: sequenceModel([failureStep(apiError(500))]),
  });

  await assert.rejects(
    () => synthesize({ recipe, items, secret, registry, retry: { ...fastRetry, maxAttempts: 1 } }),
    NoProviderSucceededError,
  );
});

test('una salida que no valida contra el esquema no se rellena y cuenta como fallo de ese proveedor', async () => {
  const registry = registryWith({
    primary: sequenceModel([textStep(JSON.stringify(incompleteOutput))]),
    backup: sequenceModel([textStep(JSON.stringify(validOutput))]),
  });

  const result = await synthesize({
    recipe,
    items,
    secret,
    registry,
    retry: { ...fastRetry, maxAttempts: 3 },
  });

  assert.equal(result.providerWasFallback, true);
  const primaryAttempt = result.providersTried.find((attempt) => attempt.provider === 'primary');
  assert.equal(primaryAttempt?.outcome, 'failed');
  assert.equal(primaryAttempt?.attempts, 1);
});

test('"model.maxOutputTokens" de la receta llega tal cual a la llamada al modelo', async () => {
  const seen: (number | undefined)[] = [];
  const capturing = new MockLanguageModelV4({
    doGenerate: async (params) => {
      seen.push(params.maxOutputTokens);
      return {
        content: [{ type: 'text', text: JSON.stringify(validOutput) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  const registry = registryWith({ primary: capturing });

  await synthesize({
    recipe: { ...recipe, model: { ...recipe.model, maxOutputTokens: 8192 } },
    items,
    secret,
    registry,
    retry: fastRetry,
  });

  assert.deepEqual(seen, [8192]);
});

test('sin "model.maxOutputTokens" en la receta, la llamada no fuerza ningún valor propio', async () => {
  const seen: (number | undefined)[] = [];
  const capturing = new MockLanguageModelV4({
    doGenerate: async (params) => {
      seen.push(params.maxOutputTokens);
      return {
        content: [{ type: 'text', text: JSON.stringify(validOutput) }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
          outputTokens: { total: 20, text: 20, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  const registry = registryWith({ primary: capturing });

  await synthesize({ recipe, items, secret, registry, retry: fastRetry });

  assert.deepEqual(seen, [4096]);
});

test('el informe devuelto ya tiene los enlaces saneados', async () => {
  const registry = registryWith({
    primary: sequenceModel([
      textStep(
        JSON.stringify({
          pulse: { text: 'Resumen del día.', link: 'https://inventada.example/x' },
        }),
      ),
    ]),
    backup: sequenceModel([failureStep(new Error('no debería llamarse'))]),
  });

  const result = await synthesize({ recipe, items, secret, registry, retry: fastRetry });

  assert.equal(result.linksDropped, 1);
  assert.equal((result.report as { pulse: { link: string } }).pulse.link, '');
});
