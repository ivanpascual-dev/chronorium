import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { buildNotifierRegistry, type NotifierRegistry } from '../../src/deliver/registry.ts';
import type { Notifier } from '../../src/deliver/types.ts';
import type { ProviderFactory, ProviderRegistry } from '../../src/model/providers.ts';
import type { FetchLike as SourceFetchLike } from '../../src/sources/types.ts';

const dirs: string[] = [];

export function trackedTmpDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
}

export function cleanupTrackedDirs(): void {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export const RECIPE_YAML = `
language: es
topics:
  - pruebas
model:
  provider: test-provider
  id: test-model
sources:
  - id: fuente
    type: feed
    url: https://example.com/feed.xml
window:
  days: 30
scoring:
  recencyWeight: 1
  topicsWeight: 1
caps:
  maxItems: 50
  perSourceMaxPercent: 100
delivery:
  - id: test-channel
    enabled: true
health:
  windowDays: 30
  runFailureThreshold: 0.5
  sourceFailureThreshold: 0.5
`;

export const SECTIONS_YAML = `
sections:
  - key: pulse
    title: Pulso
    cardinality: one
    condition: always
    fields:
      - { name: text, type: string }
`;

export const PERSONA_MD = '# Persona\n\nDe prueba.\n';

export function makeRecipeDir(overrides: {
  readonly recipeYaml?: string;
  readonly sectionsYaml?: string;
  readonly personaMd?: string;
  readonly name?: string;
}): string {
  const dir = trackedTmpDir(overrides.name ?? 'chronorium-cli-recipe-');
  writeFileSync(join(dir, 'recipe.yaml'), overrides.recipeYaml ?? RECIPE_YAML, 'utf8');
  writeFileSync(join(dir, 'sections.yaml'), overrides.sectionsYaml ?? SECTIONS_YAML, 'utf8');
  writeFileSync(join(dir, 'persona.md'), overrides.personaMd ?? PERSONA_MD, 'utf8');
  return dir;
}

export function makeDataRoot(): string {
  return trackedTmpDir('chronorium-cli-data-');
}

/** `validate`/`doctor` no aceptan un `providerRegistry` inyectado (a propósito: diagnostican
 * proveedores de verdad, RF-D04), así que sus fixtures declaran `provider: google`, no el
 * `test-provider` de `RECIPE_YAML`. Ni `diagnoseChain` ni `readHealth` llaman a la red: la primera
 * solo comprueba si la credencial está presente, la segunda solo lee `runs.ndjson`. */
export function makeGoogleRecipeDir(
  opts: { readonly delivery?: string; readonly health?: string; readonly name?: string } = {},
): { readonly recipeDir: string; readonly recipesRoot: string } {
  const recipesRoot = trackedTmpDir('chronorium-cli-google-recipes-');
  const recipeDir = join(recipesRoot, opts.name ?? 'receta');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(
    join(recipeDir, 'recipe.yaml'),
    `
language: es
topics: [pruebas]
model: { provider: google, id: gemini-test }
sources: []
window: { days: 30 }
scoring: { recencyWeight: 1, topicsWeight: 1 }
caps: { maxItems: 10, perSourceMaxPercent: 100 }
delivery: ${opts.delivery ?? '[]'}
health: ${opts.health ?? '{ windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }'}
`,
    'utf8',
  );
  writeFileSync(
    join(recipeDir, 'sections.yaml'),
    'sections:\n  - key: pulse\n    title: Pulso\n    cardinality: one\n    condition: always\n    fields:\n      - { name: text, type: string }\n',
    'utf8',
  );
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');
  return { recipeDir, recipesRoot };
}

const RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Feed de prueba</title>
    <item>
      <title>Elemento uno</title>
      <link>https://example.com/uno</link>
      <description>Resumen uno.</description>
      <pubDate>Sun, 09 Aug 2026 08:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const EMPTY_RSS_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>Vacío</title></channel></rss>`;

export function fakeSourceFetch(body: string = RSS_FEED, status = 200): SourceFetchLike {
  return async () => ({ ok: status >= 200 && status < 300, status, text: async () => body });
}

export function emptySourceFetch(): SourceFetchLike {
  return fakeSourceFetch(EMPTY_RSS_FEED);
}

export function mockModel(text: string): LanguageModel {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  }) as unknown as LanguageModel;
}

export function fakeProviderRegistry(
  model: LanguageModel,
  apiKeyEnv = 'TEST_MODEL_KEY',
): ProviderRegistry {
  const factory: ProviderFactory = {
    defaultApiKeyEnv: apiKeyEnv,
    create: async () => model,
  };
  return new Map([['test-provider', factory]]);
}

export function fakeNotifierRegistry(behavior: () => Promise<void>): NotifierRegistry {
  const notifier: Notifier = {
    id: 'test-channel',
    requiredSecrets: [],
    send: behavior,
  };
  return buildNotifierRegistry([notifier]);
}

interface CapturedConsole {
  readonly lines: readonly string[];
  restore(): void;
}

/**
 * Captura `console.log/error/warn` en un solo array de líneas, en orden. Usado para comprobar lo
 * que `validate`/`doctor` imprimen (o, sobre todo, lo que nunca deben imprimir: un valor de
 * secreto, A4).
 */
export function captureConsole(): CapturedConsole {
  const lines: string[] = [];
  const original = { log: console.log, error: console.error, warn: console.warn };
  const record =
    () =>
    (...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    };
  console.log = record();
  console.error = record();
  console.warn = record();
  return {
    lines,
    restore() {
      console.log = original.log;
      console.error = original.error;
      console.warn = original.warn;
    },
  };
}
