import assert from 'node:assert/strict';
import { test } from 'node:test';
import { telegramNotifier } from '../../src/deliver/telegram.ts';
import type { FetchLike, NotifierConfig } from '../../src/deliver/types.ts';
import { makeCtx, makeRendered } from './helpers.ts';

const channelCfg: NotifierConfig = { id: 'telegram', enabled: true, chatId: '12345' };
const secret = (name: string): string | undefined =>
  name === 'TELEGRAM_BOT_TOKEN' ? 'token-secreto' : undefined;

function capturingFetch(calls: { url: string; init: unknown }[], status = 200): FetchLike {
  return async (url, init) => {
    calls.push({ url, init });
    return { ok: status >= 200 && status < 300, status, text: async () => '{}' };
  };
}

test('manda un POST con el método, cabeceras y el informe en el cuerpo', async () => {
  const calls: { url: string; init: unknown }[] = [];
  const rendered = makeRendered();

  await telegramNotifier.send(rendered, channelCfg, makeCtx(capturingFetch(calls), { secret }));

  assert.equal(calls.length, 1);
  const call = calls[0] as {
    url: string;
    init: { method: string; headers: Record<string, string>; body: string };
  };
  assert.ok(call.url.includes('token-secreto'));
  assert.equal(call.init.method, 'POST');
  assert.equal(call.init.headers['content-type'], 'application/json');
  const body = JSON.parse(call.init.body) as { chat_id: string; text: string };
  assert.equal(body.chat_id, '12345');
  assert.equal(body.text, rendered.markdown);
});

test('sin TELEGRAM_BOT_TOKEN, falla de forma explícita', async () => {
  const rendered = makeRendered();
  await assert.rejects(() =>
    telegramNotifier.send(
      rendered,
      channelCfg,
      makeCtx(capturingFetch([]), { secret: () => undefined }),
    ),
  );
});

test('sin "chatId" en la configuración del canal, falla de forma explícita', async () => {
  const rendered = makeRendered();
  const cfgSinChatId: NotifierConfig = { id: 'telegram', enabled: true };
  await assert.rejects(() =>
    telegramNotifier.send(rendered, cfgSinChatId, makeCtx(capturingFetch([]), { secret })),
  );
});

test('una respuesta que no es "ok" hace fallar el envío, sin filtrar el token en el error', async () => {
  const rendered = makeRendered();
  await assert.rejects(
    () => telegramNotifier.send(rendered, channelCfg, makeCtx(capturingFetch([], 500), { secret })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('token-secreto'));
      return true;
    },
  );
});
