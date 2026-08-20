# Extender el motor

**Para quién es esta guía:** para quien programe en TypeScript, tenga un editor y sepa escribir un
test. Si lo que quieres es seguir un tema nuevo o cambiar la forma de tu informe, no necesitas
nada de esto: eso se hace enteramente en una receta, sin código, y está en
[docs/07-escribir-una-receta.md](07-escribir-una-receta.md).

Esta guía es para dos casos concretos: tu tema vive en un sitio que ninguno de los cinco tipos de
fuente de fábrica sabe leer, o quieres entregar el informe por un canal que ninguno de los tres
notificadores de fábrica cubre. Los dos casos tienen la misma forma: implementar un contrato
pequeño, registrarlo, y probarlo sin red. Los contratos en sí ya están fijados en
[docs/02-arquitectura.md](02-arquitectura.md#contratos-de-extensión) y no se repiten aquí; esto es el paso a paso de
implementarlos.

## Añadir un lector de fuentes

Un lector implementa `SourceReader` (`src/sources/types.ts`): recibe la `SourceSpec` que alguien
escribió en su `recipe.yaml` y un `ReadContext` con todo lo que necesita para trabajar sin tocar
la red ni el reloj directamente (`fetch`, `now`, `secret`, `timeoutMs`...), y devuelve una lista de
`Item`.

Ejemplo mínimo y completo: un lector para un sitemap de noticias en texto plano, una URL por línea,
sin fecha ni resumen.

```typescript
// src/sources/plain-list.ts
import { fetchWithTimeout } from './http.ts';
import type { Item, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

export const plainListReader: SourceReader = {
  type: 'plain-list',
  requiredSecrets: [],
  async read(source, ctx): Promise<Item[]> {
    if (source.url === undefined) {
      throw new Error(`la fuente "${source.id}" de tipo plain-list no declara "url"`);
    }

    const response = await fetchWithTimeout(source.url, ctx, {});
    if (!response.ok) {
      throw new Error(`${source.url} respondió ${response.status}`);
    }

    const lines = (await response.text())
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((url) =>
      makeItem({ title: url, url, source: source.id, summary: '', publishedAt: undefined }),
    );
  },
};
```

Regístralo en `src/sources/registry.ts`, añadiéndolo a `builtinReaders`:

```typescript
import { plainListReader } from './plain-list.ts';

const builtinReaders: readonly SourceReader[] = [
  feedReader,
  jsonApiReader,
  repoSearchReader,
  repoReleasesReader,
  archiveReader,
  plainListReader, // nuevo
];
```

A partir de aquí, cualquier receta puede usarlo con `type: plain-list`, sin que el motor sepa nada
más sobre él.

Pruébalo sin red, doblando `fetch` (mismo patrón que usan los lectores de fábrica en
`tests/sources/`):

```typescript
// tests/sources/plain-list.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { plainListReader } from '../../src/sources/plain-list.ts';
import type { FetchLike } from '../../src/sources/types.ts';

test('plain-list convierte cada línea no vacía en un elemento', async () => {
  const fakeFetch: FetchLike = async () => ({
    ok: true,
    status: 200,
    text: async () => 'https://example.com/uno\n\nhttps://example.com/dos\n',
  });

  const items = await plainListReader.read(
    { id: 'lista', type: 'plain-list', url: 'https://example.com/lista.txt' },
    {
      now: new Date(),
      fetch: fakeFetch,
      timeoutMs: 1000,
      userAgent: 'test',
      dataRoot: '/tmp',
      secret: () => undefined,
      windowDays: 7,
    },
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.url, 'https://example.com/uno');
});
```

Si tu fuente necesita una credencial propia (más allá de la del modelo), decláralo en
`requiredSecrets`: es lo que permite que `pnpm cli doctor` y la comprobación de RF-B04 sepan que
esa fuente exige algo más, sin tener que leer tu código para averiguarlo.

## Añadir un notificador

Un notificador implementa `Notifier` (`src/deliver/types.ts`): recibe el informe ya renderizado en
los tres formatos (`RenderedReport`), la configuración de ese canal tal como se escribió en la
receta, y un `DeliverContext` con `fetch`, `secret` y `timeoutMs`.

Ejemplo mínimo y completo: un notificador que publica el informe en un canal de Slack vía webhook
entrante.

```typescript
// src/deliver/slack.ts
import type { RenderedReport } from '../render/types.ts';
import type { DeliverContext, Notifier, NotifierConfig } from './types.ts';

export const slackNotifier: Notifier = {
  id: 'slack',
  requiredSecrets: [],
  async send(rendered: RenderedReport, cfg: NotifierConfig, ctx: DeliverContext): Promise<void> {
    const url = typeof cfg.webhookUrl === 'string' ? cfg.webhookUrl : undefined;
    if (url === undefined) {
      throw new Error('el canal "slack" exige "webhookUrl" declarada en la receta');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      const response = await ctx.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: rendered.markdown }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`slack respondió con estado ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};
```

Regístralo en `src/deliver/registry.ts`, añadiéndolo a `builtinNotifiers`:

```typescript
import { slackNotifier } from './slack.ts';

const builtinNotifiers: readonly Notifier[] = [
  emailNotifier,
  telegramNotifier,
  webhookNotifier,
  slackNotifier, // nuevo
];
```

A partir de aquí, cualquier receta puede activarlo con `id: slack` y `webhookUrl: ...` dentro de
`delivery`.

Pruébalo sin red, doblando `fetch` (mismo patrón que `tests/deliver/webhook.test.ts`):

```typescript
// tests/deliver/slack.test.ts
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { slackNotifier } from '../../src/deliver/slack.ts';
import type { DeliverContext, FetchLike } from '../../src/deliver/types.ts';
import type { RenderedReport } from '../../src/render/types.ts';

test('slack envía el markdown del informe al webhookUrl declarado', async () => {
  let capturedBody: string | undefined;
  const fakeFetch: FetchLike = async (_url, init) => {
    capturedBody = init.body;
    return { ok: true, status: 200, text: async () => '' };
  };
  const ctx: DeliverContext = { secret: () => undefined, fetch: fakeFetch, timeoutMs: 1000 };
  const rendered = { markdown: '## Hola' } as RenderedReport;

  await slackNotifier.send(
    rendered,
    { id: 'slack', enabled: true, webhookUrl: 'https://hooks.slack.example/xyz' },
    ctx,
  );

  assert.match(capturedBody ?? '', /Hola/);
});
```

Si tu canal necesita una credencial (un token de bot, una clave de API), decláralo en
`requiredSecrets` y léelo con `ctx.secret(nombre)`, nunca de un fichero ni de un valor por defecto
silencioso (R3): es lo mismo que hace `telegramNotifier` con `TELEGRAM_BOT_TOKEN`.
