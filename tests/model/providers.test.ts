import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reasoningModelBody } from '../../src/model/providers.ts';

test('reasoningModelBody traduce max_tokens a max_completion_tokens', () => {
  const body = reasoningModelBody({ max_tokens: 4096, model: 'gpt-5.6-luna' }, undefined);

  assert.equal(body.max_completion_tokens, 4096);
  assert.equal('max_tokens' in body, false);
});

test('reasoningModelBody quita temperature sin sustituirla por nada', () => {
  const body = reasoningModelBody({ temperature: 0.2, model: 'gpt-5.6-luna' }, undefined);

  assert.equal('temperature' in body, false);
});

test('reasoningModelBody añade reasoning_effort solo si se declaró', () => {
  const conEsfuerzo = reasoningModelBody({ model: 'gpt-5.6-luna' }, 'medium');
  const sinEsfuerzo = reasoningModelBody({ model: 'gpt-5.6-luna' }, undefined);

  assert.equal(conEsfuerzo.reasoning_effort, 'medium');
  assert.equal('reasoning_effort' in sinEsfuerzo, false);
});

test('reasoningModelBody deja intactos los demás campos del cuerpo', () => {
  const body = reasoningModelBody(
    { model: 'gpt-5.6-luna', messages: [{ role: 'user', content: 'hola' }] },
    undefined,
  );

  assert.equal(body.model, 'gpt-5.6-luna');
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hola' }]);
});
