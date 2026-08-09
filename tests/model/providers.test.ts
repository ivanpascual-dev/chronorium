import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  defaultProviderRegistry,
  googleReasoningOptions,
  openAiReasoningOptions,
} from '../../src/model/providers.ts';

test('los tres proveedores de fábrica están registrados, elegidos solo por nombre (D-03, ADR-012)', () => {
  assert.equal(
    defaultProviderRegistry.get('google')?.defaultApiKeyEnv,
    'GOOGLE_GENERATIVE_AI_API_KEY',
  );
  assert.equal(defaultProviderRegistry.get('openai')?.defaultApiKeyEnv, 'OPENAI_API_KEY');
  assert.equal(
    defaultProviderRegistry.get('openai-compatible')?.defaultApiKeyEnv,
    'OPENAI_COMPATIBLE_API_KEY',
  );
});

test('un proveedor no declarado no está en el registro', () => {
  assert.equal(defaultProviderRegistry.get('acme'), undefined);
});

test('openAiReasoningOptions traduce el mismo campo de dominio a la convención de OpenAI', () => {
  assert.deepEqual(openAiReasoningOptions('medium'), { openai: { reasoningEffort: 'medium' } });
});

test('googleReasoningOptions traduce el mismo campo de dominio a thinkingConfig de Gemini', () => {
  assert.deepEqual(googleReasoningOptions('high'), {
    google: { thinkingConfig: { thinkingLevel: 'high' } },
  });
});
