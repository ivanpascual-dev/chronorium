import assert from 'node:assert/strict';
import { test } from 'node:test';
import { emailNotifier } from '../../src/deliver/email.ts';
import {
  buildNotifierRegistry,
  defaultNotifierRegistry,
  deliver,
} from '../../src/deliver/registry.ts';
import { telegramNotifier } from '../../src/deliver/telegram.ts';
import type { Notifier, NotifierConfig } from '../../src/deliver/types.ts';
import { webhookNotifier } from '../../src/deliver/webhook.ts';
import { makeCtx, makeRendered, neverFetch } from './helpers.ts';

function fakeNotifier(id: string, behavior: () => Promise<void>): Notifier {
  let calls = 0;
  const notifier: Notifier = {
    id,
    requiredSecrets: [],
    async send() {
      calls += 1;
      await behavior();
    },
  };
  Object.defineProperty(notifier, 'calls', { get: () => calls });
  return notifier;
}

test('los tres notificadores de fábrica están registrados por su id', () => {
  assert.equal(defaultNotifierRegistry.get('email'), emailNotifier);
  assert.equal(defaultNotifierRegistry.get('telegram'), telegramNotifier);
  assert.equal(defaultNotifierRegistry.get('webhook'), webhookNotifier);
});

test('RF-F03: deliver() recorre los canales declarados por id contra el registro', async () => {
  const ok = fakeNotifier('ok', async () => {});
  const registry = buildNotifierRegistry([ok]);
  const channels: NotifierConfig[] = [{ id: 'ok', enabled: true }];

  const outcome = await deliver({
    channels,
    rendered: makeRendered(),
    ctx: makeCtx(neverFetch()),
    registry,
  });

  assert.equal(outcome.ok, true);
  assert.deepEqual(
    outcome.results.map((r) => r.id),
    ['ok'],
  );
});

test('un canal desconocido es un error de receta, no un salto silencioso', async () => {
  const registry = buildNotifierRegistry([]);
  const channels: NotifierConfig[] = [{ id: 'inexistente', enabled: true }];

  await assert.rejects(() =>
    deliver({ channels, rendered: makeRendered(), ctx: makeCtx(neverFetch()), registry }),
  );
});

test('un canal con enabled: false no se intenta', async () => {
  let called = false;
  const desactivado = fakeNotifier('desactivado', async () => {
    called = true;
  });
  const registry = buildNotifierRegistry([desactivado]);
  const channels: NotifierConfig[] = [{ id: 'desactivado', enabled: false }];

  const outcome = await deliver({
    channels,
    rendered: makeRendered(),
    ctx: makeCtx(neverFetch()),
    registry,
  });

  assert.equal(called, false);
  assert.deepEqual(outcome.results, []);
  assert.equal(outcome.ok, true, 'sin canales activos, no hay nada que falle');
});

test('RF-F04: si el primero de tres canales lanza, los otros dos se intentan igual, resultado parcial', async () => {
  const primero = fakeNotifier('primero', async () => {
    throw new Error('caído');
  });
  const segundo = fakeNotifier('segundo', async () => {});
  const tercero = fakeNotifier('tercero', async () => {});
  const registry = buildNotifierRegistry([primero, segundo, tercero]);
  const channels: NotifierConfig[] = [
    { id: 'primero', enabled: true },
    { id: 'segundo', enabled: true },
    { id: 'tercero', enabled: true },
  ];

  const outcome = await deliver({
    channels,
    rendered: makeRendered(),
    ctx: makeCtx(neverFetch()),
    registry,
  });

  assert.equal(outcome.ok, true, 'parcial sigue contando como entrega con éxito');
  assert.deepEqual(
    outcome.results.map((r) => ({ id: r.id, ok: r.ok })),
    [
      { id: 'primero', ok: false },
      { id: 'segundo', ok: true },
      { id: 'tercero', ok: true },
    ],
  );
});

test('todos los canales fallando: entrega fallida, con el detalle por canal', async () => {
  const uno = fakeNotifier('uno', async () => {
    throw new Error('caído 1');
  });
  const dos = fakeNotifier('dos', async () => {
    throw new Error('caído 2');
  });
  const registry = buildNotifierRegistry([uno, dos]);
  const channels: NotifierConfig[] = [
    { id: 'uno', enabled: true },
    { id: 'dos', enabled: true },
  ];

  const outcome = await deliver({
    channels,
    rendered: makeRendered(),
    ctx: makeCtx(neverFetch()),
    registry,
  });

  assert.equal(outcome.ok, false);
  assert.ok(outcome.results.every((r) => !r.ok));
  assert.equal(outcome.results[0]?.error, 'caído 1');
});

test('un canal no reintenta: se llama exactamente una vez aunque falle', async () => {
  let calls = 0;
  const notifier = fakeNotifier('una-vez', async () => {
    calls += 1;
    throw new Error('caído');
  });
  const registry = buildNotifierRegistry([notifier]);
  const channels: NotifierConfig[] = [{ id: 'una-vez', enabled: true }];

  await deliver({ channels, rendered: makeRendered(), ctx: makeCtx(neverFetch()), registry });

  assert.equal(calls, 1);
});

test('requiredSecrets de cada notificador de fábrica, lo que validate.ts consultará', () => {
  assert.deepEqual(
    [...emailNotifier.requiredSecrets],
    ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'],
  );
  assert.deepEqual([...telegramNotifier.requiredSecrets], ['TELEGRAM_BOT_TOKEN']);
  assert.deepEqual([...webhookNotifier.requiredSecrets], []);
});
