import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  type MailMessage,
  type MailTransport,
  makeEmailNotifier,
  type SmtpConfig,
} from '../../src/deliver/email.ts';
import type { NotifierConfig } from '../../src/deliver/types.ts';
import { makeCtx, makeRendered, neverFetch } from './helpers.ts';

const smtpSecrets = (name: string): string | undefined =>
  ({
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_USER: 'yo@gmail.com',
    SMTP_PASSWORD: 'contraseña-de-aplicacion-secreta',
  })[name];

const channelCfg: NotifierConfig = {
  id: 'email',
  enabled: true,
  to: 'destino@example.com',
  from: 'chronorium@example.com',
};

function fakeTransportFactory(sent: MailMessage[]): () => MailTransport {
  return () => ({
    async sendMail(message: MailMessage) {
      sent.push(message);
      return { messageId: 'test' };
    },
  });
}

test('compone un mensaje con subject, cuerpo de texto (markdown) y cuerpo html, sin adjuntos', async () => {
  const sent: MailMessage[] = [];
  const notifier = makeEmailNotifier(fakeTransportFactory(sent));
  const rendered = makeRendered();

  await notifier.send(rendered, channelCfg, makeCtx(neverFetch(), { secret: smtpSecrets }));

  assert.equal(sent.length, 1);
  assert.equal(sent[0]?.subject, rendered.subject);
  assert.equal(sent[0]?.text, rendered.markdown);
  assert.equal(sent[0]?.html, rendered.html);
  assert.equal(sent[0]?.to, 'destino@example.com');
  assert.equal(sent[0]?.from, 'chronorium@example.com');
  assert.ok(!('attachments' in (sent[0] as object)));
});

test('nunca deja la contraseña en el mensaje de error que propaga', async () => {
  const failingTransportFactory = () => ({
    async sendMail(): Promise<unknown> {
      throw new Error(
        'auth failed for user=yo@gmail.com pass=contraseña-de-aplicacion-secreta: EAUTH',
      );
    },
  });
  const notifier = makeEmailNotifier(failingTransportFactory);
  const rendered = makeRendered();

  await assert.rejects(
    () => notifier.send(rendered, channelCfg, makeCtx(neverFetch(), { secret: smtpSecrets })),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.ok(!error.message.includes('contraseña-de-aplicacion-secreta'));
      assert.ok(!error.message.includes('yo@gmail.com'));
      return true;
    },
  );
});

test('sanea \\r\\n en subject y from antes de pasarlos al transporte (ADR-020)', async () => {
  const sent: MailMessage[] = [];
  const notifier = makeEmailNotifier(fakeTransportFactory(sent));
  const rendered = makeRendered({ subject: 'Asunto\r\nBcc: atacante@evil.example' });

  await notifier.send(rendered, channelCfg, makeCtx(neverFetch(), { secret: smtpSecrets }));

  assert.ok(!sent[0]?.subject.includes('\r'));
  assert.ok(!sent[0]?.subject.includes('\n'));
});

test('sin las cuatro credenciales SMTP, falla de forma explícita', async () => {
  const notifier = makeEmailNotifier(fakeTransportFactory([]));
  const rendered = makeRendered();

  await assert.rejects(() =>
    notifier.send(rendered, channelCfg, makeCtx(neverFetch(), { secret: () => undefined })),
  );
});

test('declara los tiempos de espera de conexión: un puerto cerrado falla rápido, no en dos minutos', async () => {
  let visto: SmtpConfig | undefined;
  const notifier = makeEmailNotifier((config) => {
    visto = config;
    return { async sendMail() {} };
  });

  await notifier.send(
    makeRendered(),
    channelCfg,
    makeCtx(neverFetch(), { secret: smtpSecrets, timeoutMs: 7_000 }),
  );

  assert.equal(visto?.connectionTimeout, 7_000);
  assert.equal(visto?.greetingTimeout, 7_000);
});

test('un SMTP_PORT que no es un puerto se rechaza por nombre, en vez de conectar al 0', async () => {
  const notifier = makeEmailNotifier(fakeTransportFactory([]));
  const secretosConPuertoRoto = (name: string): string | undefined =>
    name === 'SMTP_PORT' ? '465 ' + '\n(el que copié)' : smtpSecrets(name);

  await assert.rejects(
    () =>
      notifier.send(
        makeRendered(),
        channelCfg,
        makeCtx(neverFetch(), { secret: secretosConPuertoRoto }),
      ),
    /SMTP_PORT/,
  );
});

test('sin "to" o "from" en la configuración del canal, falla de forma explícita', async () => {
  const notifier = makeEmailNotifier(fakeTransportFactory([]));
  const rendered = makeRendered();
  const cfgSinTo: NotifierConfig = { id: 'email', enabled: true, from: 'a@b.com' };

  await assert.rejects(() =>
    notifier.send(rendered, cfgSinTo, makeCtx(neverFetch(), { secret: smtpSecrets })),
  );
});
