import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateRecipeFields } from '../../src/recipe/validate.ts';
import { buildRegistry } from '../../src/sources/registry.ts';
import type { SourceReader } from '../../src/sources/types.ts';

const validBase = {
  language: 'es',
  topics: ['inteligencia artificial'],
  model: { provider: 'google', id: 'gemini-test' },
  delivery: [],
  health: { windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.5 },
};

function campos(issues: readonly { campo: string }[]): string[] {
  return issues.map((issue) => issue.campo);
}

test('una receta válida con fuentes, ventana, pesos y topes no produce ningún error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'un-canal', type: 'feed', url: 'https://example.com/feed.xml' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 2 },
    caps: { maxItems: 60, perSourceMaxPercent: 40 },
  });

  assert.deepEqual(issues, []);
});

test('un tipo de fuente desconocido produce un error que nombra el tipo y el campo (RF-A05)', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'reddit-oauth' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[0].type'));
  assert.ok(issues.some((issue) => issue.motivo.includes('reddit-oauth')));
});

test('una fuente que exige una credencial ausente se rechaza al validar, sin red (RF-B03)', () => {
  const necesitaCredencial: SourceReader = {
    type: 'con-credencial',
    requiredSecrets: ['UNA_CLAVE_QUE_NO_ESTA'],
    async read() {
      return [];
    },
  };
  const registry = buildRegistry([necesitaCredencial]);

  const issues = validateRecipeFields(
    {
      ...validBase,
      sources: [{ id: 'x', type: 'con-credencial' }],
      window: { days: 30 },
      scoring: { recencyWeight: 1, topicsWeight: 1 },
      caps: { maxItems: 10, perSourceMaxPercent: 50 },
    },
    { registry, secret: () => undefined },
  );

  assert.ok(issues.some((issue) => issue.motivo.includes('UNA_CLAVE_QUE_NO_ESTA')));
});

test('con la credencial presente, la misma fuente no produce error', () => {
  const necesitaCredencial: SourceReader = {
    type: 'con-credencial',
    requiredSecrets: ['UNA_CLAVE_QUE_NO_ESTA'],
    async read() {
      return [];
    },
  };
  const registry = buildRegistry([necesitaCredencial]);

  const issues = validateRecipeFields(
    {
      ...validBase,
      sources: [{ id: 'x', type: 'con-credencial' }],
      window: { days: 30 },
      scoring: { recencyWeight: 1, topicsWeight: 1 },
      caps: { maxItems: 10, perSourceMaxPercent: 50 },
    },
    { registry, secret: () => 'clave-de-prueba' },
  );

  assert.deepEqual(issues, []);
});

test('una fuente "feed" sin url produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'feed' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[0].url'));
});

test('una fuente "json-api" sin mapping produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'json-api', url: 'https://example.com/api' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[0].mapping'));
});

test('una fuente "repo-search" sin query produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'repo-search' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[0].query'));
});

test('una fuente "repo-releases" sin repos produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'repo-releases' }],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[0].repos'));
});

test('dos fuentes con el mismo id producen un error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [
      { id: 'repetido', type: 'archive' },
      { id: 'repetido', type: 'archive' },
    ],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('sources[1].id'));
});

test('window.days ausente o inválido produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [],
    window: { days: 0 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('window.days'));
});

test('un peso de puntuación ausente produce un error que nombra el campo, nunca un valor por defecto silencioso', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('scoring.topicsWeight'));
});

test('caps.maxItems y caps.perSourceMaxPercent ausentes o inválidos producen errores que nombran el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 0, perSourceMaxPercent: 150 },
  });

  assert.ok(campos(issues).includes('caps.maxItems'));
  assert.ok(campos(issues).includes('caps.perSourceMaxPercent'));
});

test('un proveedor de modelo desconocido produce un error que nombra el proveedor', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: { provider: 'proveedor-inventado', id: 'x' },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('model.provider'));
  assert.ok(issues.some((issue) => issue.motivo.includes('proveedor-inventado')));
});

test('un eslabón "openai-compatible" sin baseUrl produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [{ provider: 'openai-compatible', id: 'openai/gpt-oss-20b' }],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('model.fallbacks[0].baseUrl'));
});

test('un eslabón "openai-compatible" con baseUrl no produce error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [
        {
          provider: 'openai-compatible',
          id: 'openai/gpt-oss-20b',
          apiKeyEnv: 'GROQ_API_KEY',
          baseUrl: 'https://api.groq.com/openai/v1',
        },
      ],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.deepEqual(issues, []);
});

test('un eslabón "openai" no exige baseUrl, a diferencia de "openai-compatible"', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [{ provider: 'openai', id: 'gpt-5.6-luna' }],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.deepEqual(issues, []);
});

test('un eslabón "openai" con reasoningEffort válido no produce error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [{ provider: 'openai', id: 'gpt-5.6-luna', reasoningEffort: 'medium' }],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.deepEqual(issues, []);
});

test('"reasoningEffort" fuera del conjunto válido produce un error que nombra el campo', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [{ provider: 'openai', id: 'gpt-5.6-luna', reasoningEffort: 'maximo' }],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('model.fallbacks[0].reasoningEffort'));
});

test('"maxOutputTokens" declarado como entero positivo no produce error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: { provider: 'google', id: 'gemini-test', maxOutputTokens: 8192 },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.deepEqual(issues, []);
});

test('"maxOutputTokens" no numérico o no positivo produce un error que nombra el campo', () => {
  for (const maxOutputTokens of [0, -1, 1.5, 'mucho']) {
    const issues = validateRecipeFields({
      ...validBase,
      model: { provider: 'google', id: 'gemini-test', maxOutputTokens },
      sources: [],
      window: { days: 30 },
      scoring: { recencyWeight: 1, topicsWeight: 1 },
      caps: { maxItems: 10, perSourceMaxPercent: 50 },
    });

    assert.ok(campos(issues).includes('model.maxOutputTokens'), `falló para ${maxOutputTokens}`);
  }
});

test('un eslabón que repite el proveedor principal produce un error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [{ provider: 'google', id: 'gemini-test' }],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('model.fallbacks[0]'));
});

test('dos eslabones de respaldo repetidos entre sí producen un error', () => {
  const issues = validateRecipeFields({
    ...validBase,
    model: {
      provider: 'google',
      id: 'gemini-test',
      fallbacks: [
        { provider: 'openai-compatible', id: 'm', baseUrl: 'https://a.example/v1' },
        { provider: 'openai-compatible', id: 'm', baseUrl: 'https://a.example/v1' },
      ],
    },
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
  });

  assert.ok(campos(issues).includes('model.fallbacks[1]'));
});

test('todos los errores se devuelven juntos, no se aborta en el primero', () => {
  const issues = validateRecipeFields({
    ...validBase,
    sources: [{ id: 'x', type: 'repo-search' }],
    window: { days: 0 },
    scoring: {},
    caps: {},
  });

  const encontrados = campos(issues);
  assert.ok(encontrados.includes('sources[0].query'));
  assert.ok(encontrados.includes('window.days'));
  assert.ok(encontrados.includes('scoring.recencyWeight'));
  assert.ok(encontrados.includes('caps.maxItems'));
});

function fullRecipe(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    ...validBase,
    sources: [],
    window: { days: 30 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 10, perSourceMaxPercent: 50 },
    ...overrides,
  };
}

test('delivery: cero canales activos es válido (RF-B04, RF-H04)', () => {
  assert.deepEqual(validateRecipeFields(fullRecipe({ delivery: [] })), []);
});

test('delivery: un canal desconocido produce un error que lo nombra', () => {
  const issues = validateRecipeFields(fullRecipe({ delivery: [{ id: 'fax', enabled: false }] }));
  assert.ok(issues.some((issue) => issue.motivo.includes('fax')));
});

test('delivery: el canal "email" exige "to" y "from"', () => {
  const issues = validateRecipeFields(fullRecipe({ delivery: [{ id: 'email', enabled: false }] }));
  assert.ok(campos(issues).includes('delivery[0].to'));
  assert.ok(campos(issues).includes('delivery[0].from'));
});

test('delivery: un canal activo cuya credencial falta en el entorno hace fallar la validación, nombrando la variable', () => {
  const issues = validateRecipeFields(
    fullRecipe({
      delivery: [{ id: 'telegram', enabled: true, chatId: '123' }],
    }),
    { secret: () => undefined },
  );
  assert.ok(issues.some((issue) => issue.motivo.includes('TELEGRAM_BOT_TOKEN')));
});

test('delivery: con la credencial presente, el mismo canal activo no produce error', () => {
  const issues = validateRecipeFields(
    fullRecipe({
      delivery: [{ id: 'telegram', enabled: true, chatId: '123' }],
    }),
    { secret: (name) => (name === 'TELEGRAM_BOT_TOKEN' ? 'token' : undefined) },
  );
  assert.deepEqual(issues, []);
});

test('delivery: dos canales con el mismo id producen un error', () => {
  const issues = validateRecipeFields(
    fullRecipe({
      delivery: [
        { id: 'webhook', enabled: false, url: 'https://x.example' },
        { id: 'webhook', enabled: false, url: 'https://y.example' },
      ],
    }),
  );
  assert.ok(campos(issues).includes('delivery[1].id'));
});

test('health: umbrales fuera de [0, 1] o windowDays no positivo producen error', () => {
  const issues = validateRecipeFields(
    fullRecipe({
      health: { windowDays: 0, runFailureThreshold: 2, sourceFailureThreshold: -1 },
    }),
  );
  assert.ok(campos(issues).includes('health.windowDays'));
  assert.ok(campos(issues).includes('health.runFailureThreshold'));
  assert.ok(campos(issues).includes('health.sourceFailureThreshold'));
});

test('subject: si se declara, debe ser texto no vacío', () => {
  const issues = validateRecipeFields(fullRecipe({ subject: '' }));
  assert.ok(campos(issues).includes('subject'));
});

test('subject: ausente es válido (plantilla opcional)', () => {
  assert.deepEqual(validateRecipeFields(fullRecipe()), []);
});
