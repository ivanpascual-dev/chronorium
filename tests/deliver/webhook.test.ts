import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { FetchLike, NotifierConfig } from '../../src/deliver/types.ts';
import { webhookNotifier } from '../../src/deliver/webhook.ts';
import { makeCtx, makeRendered } from './helpers.ts';

const channelCfg: NotifierConfig = {
  id: 'webhook',
  enabled: true,
  url: 'https://hooks.example.com/x',
};

function capturingFetch(calls: { url: string; init: unknown }[], status = 200): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => '{}' };
  };
}

test('manda un POST crudo, sin credencial, con el informe en el cuerpo', async () => {
  const calls: { url: string; init: unknown }[] = [];
  const rendered = makeRendered();

  await webhookNotifier.send(rendered, channelCfg, makeCtx(capturingFetch(calls)));

  assert.equal(calls.length, 1);
  const call = calls[0] as {
    url: string;
    init: { method: string; headers: Record<string, string>; body: string };
  };
  assert.equal(call.url, 'https://hooks.example.com/x');
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.body, rendered.json);
});

test('sin "url" en la configuración del canal, falla de forma explícita', async () => {
  const rendered = makeRendered();
  const cfgSinUrl: NotifierConfig = { id: 'webhook', enabled: true };
  await assert.rejects(() =>
    webhookNotifier.send(rendered, cfgSinUrl, makeCtx(capturingFetch([]))),
  );
});

test('una respuesta que no es "ok" hace fallar el envío', async () => {
  const rendered = makeRendered();
  await assert.rejects(() =>
    webhookNotifier.send(rendered, channelCfg, makeCtx(capturingFetch([], 503))),
  );
});

test('requiredSecrets está vacío: no exige ninguna credencial', () => {
  assert.deepEqual(webhookNotifier.requiredSecrets, []);
});
