import { basename, isAbsolute } from 'node:path';
import type { DeliverOutcome } from '../deliver/registry.ts';
import { deliver, type NotifierRegistry } from '../deliver/registry.ts';
import type { FetchLike as DeliverFetchLike } from '../deliver/types.ts';
import { NoProviderSucceededError } from '../model/chain.ts';
import type { ProviderRegistry } from '../model/providers.ts';
import type { RetryOptions } from '../model/retry.ts';
import { synthesize } from '../model/synthesize.ts';
import { resolveDataRoot, resolveRecipeDir, resolveRecipesRoot } from '../paths.ts';
import { runPipeline } from '../rank/pipeline.ts';
import { loadRecipe } from '../recipe/load.ts';
import type { RecipeConfig } from '../recipe/types.ts';
import { emailRenderer } from '../render/email.ts';
import { jsonRenderer } from '../render/json.ts';
import { markdownRenderer } from '../render/markdown.ts';
import { buildReport, buildSubject } from '../render/report.ts';
import type { RenderedReport, Report } from '../render/types.ts';
import { collect } from '../sources/collect.ts';
import { defaultRegistry, type ReaderRegistry } from '../sources/registry.ts';
import type { Item, FetchLike as SourceFetchLike } from '../sources/types.ts';
import { archiveExists, writeArchive } from '../state/archive.ts';
import { statePaths } from '../state/paths.ts';
import { appendRun, readHealth } from '../state/runs.ts';
import {
  dayStamp,
  isSeen,
  loadSeen,
  markSeen,
  pruneSeen,
  type SeenState,
  saveSeen,
} from '../state/seen.ts';
import type { RunRecord, RunResult } from '../state/types.ts';
import { type ExitCode, exitCodeFor } from './exit-codes.ts';

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Omite las claves cuyo valor es `undefined` en vez de asignarlas (`exactOptionalPropertyTypes`),
 * igual que `makeItem` en `sources/types.ts` (R10). */
function withDefined<T>(base: object, extra: Readonly<Record<string, unknown>>): T {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out as T;
}

export interface RunOnceOptions {
  readonly recipeDir: string;
  readonly dataRoot: string;
  readonly dryRun: boolean;
  readonly now: Date;
  readonly secret: (name: string) => string | undefined;
  readonly sourceFetch: SourceFetchLike;
  readonly deliverFetch: DeliverFetchLike;
  readonly userAgent: string;
  readonly timeoutMs?: number;
  readonly sourceRegistry?: ReaderRegistry;
  readonly providerRegistry?: ProviderRegistry;
  readonly notifierRegistry?: NotifierRegistry;
  readonly retry?: Partial<RetryOptions>;
}

export interface RunOnceResult {
  readonly exitCode: ExitCode;
  readonly result: RunResult;
  readonly report?: Report;
  readonly rendered?: RenderedReport;
  readonly deliverOutcome?: DeliverOutcome;
}

/** El primer campo declarado de cada elemento del informe que coincide con la URL exacta de un
 * `Item` recogido: es "lo que salió en el informe", no "lo que se recogió" (RF-C01). */
function collectPublishedUrls(report: Report): ReadonlySet<string> {
  const urls = new Set<string>();
  for (const section of report.sections) {
    for (const item of section.items) {
      for (const value of Object.values(item)) {
        urls.add(value);
      }
    }
  }
  return urls;
}

/**
 * Única orquestación (R10, RF-F06). Orden fijado por el plan: cargar receta y validar, comprobar
 * el archivo de hoy, recolectar, puntuar, sintetizar, construir y renderizar el informe, archivar,
 * marcar lo visto, entregar, y anotar la ejecución **siempre**, también en los caminos de fallo
 * (D-07). `--dry-run` no escribe nada: ni archivo, ni `seen.json`, ni `runs.ndjson`, ni entrega.
 */
export async function runOnce(options: RunOnceOptions): Promise<RunOnceResult> {
  if (!isAbsolute(options.dataRoot)) {
    throw new Error(
      `dataRoot debe ser una ruta absoluta, y no depender del directorio de trabajo: ${options.dataRoot}`,
    );
  }

  const start = Date.now();
  const recipeName = basename(options.recipeDir);
  const date = dayStamp(options.now);
  const { seenPath, runsPath } = statePaths(options.dataRoot, recipeName);
  const timeoutMs = options.timeoutMs ?? 10_000;

  function finish(
    result: RunResult,
    runExtra: Readonly<Record<string, unknown>> = {},
    resultExtra: Readonly<Record<string, unknown>> = {},
  ): RunOnceResult {
    if (!options.dryRun) {
      const record = withDefined<RunRecord>(
        {
          ts: options.now.toISOString(),
          recipe: recipeName,
          result,
          exitCode: exitCodeFor(result),
          durationMs: Date.now() - start,
        },
        runExtra,
      );
      appendRun(runsPath, record);
    }
    return withDefined<RunOnceResult>({ exitCode: exitCodeFor(result), result }, resultExtra);
  }

  let recipe: RecipeConfig;
  try {
    recipe = loadRecipe(options.recipeDir, {
      secret: options.secret,
      ...(options.sourceRegistry !== undefined ? { registry: options.sourceRegistry } : {}),
      ...(options.providerRegistry !== undefined
        ? { providerRegistry: options.providerRegistry }
        : {}),
      ...(options.notifierRegistry !== undefined
        ? { notifierRegistry: options.notifierRegistry }
        : {}),
    });
  } catch (cause) {
    return finish('config_error', { lastError: errorMessage(cause) });
  }

  if (!options.dryRun && archiveExists(options.dataRoot, date, recipe.name)) {
    return finish('skipped_existing');
  }

  const seenState: SeenState = options.dryRun
    ? { schemaVersion: 1, windowDays: recipe.window.days, entries: [] }
    : loadSeen(seenPath);

  const { items: collected, results: sourceResults } = await collect(
    recipe.sources,
    options.sourceRegistry ?? defaultRegistry,
    {
      now: options.now,
      fetch: options.sourceFetch,
      timeoutMs,
      userAgent: options.userAgent,
      dataRoot: options.dataRoot,
      windowDays: recipe.window.days,
      secret: options.secret,
    },
  );

  const sourcesOk = sourceResults.filter((result) => result.ok).length;
  const sourcesFailed = sourceResults.length - sourcesOk;

  if (collected.length === 0) {
    return finish('no_items', {
      itemsCollected: 0,
      sources: { ok: sourcesOk, failed: sourcesFailed },
    });
  }

  const ranked = runPipeline(collected, {
    now: options.now,
    recipe,
    isSeen: (item: Item) => isSeen(seenState, item),
  });

  let synthesis: Awaited<ReturnType<typeof synthesize>>;
  try {
    synthesis = await synthesize({
      recipe,
      items: ranked,
      secret: options.secret,
      ...(options.providerRegistry !== undefined ? { registry: options.providerRegistry } : {}),
      ...(options.retry !== undefined ? { retry: options.retry } : {}),
    });
  } catch (cause) {
    // Tanto "ningún eslabón tiene credencial utilizable" (ChainConfigurationError) como "la cadena
    // entera se intentó y falló" (NoProviderSucceededError) son "ningún proveedor de modelo pudo
    // generar el informe" (docs/02-arquitectura.md, código 3): la distinción entre las dos es de
    // diagnóstico interno (`providersTried`), no de código de salida.
    const providersTried =
      cause instanceof NoProviderSucceededError
        ? cause.providersTried.map((attempt) => attempt.provider)
        : undefined;
    return finish('model_failed', {
      itemsCollected: collected.length,
      sources: { ok: sourcesOk, failed: sourcesFailed },
      providersTried,
      lastError: errorMessage(cause),
    });
  }

  const health = readHealth(runsPath, recipe.health.windowDays, options.now, recipe.name);

  const report = buildReport({
    recipe,
    date,
    generatedAt: options.now.toISOString(),
    modelOutput: synthesis.report,
    provider: synthesis.provider,
    providerWasFallback: synthesis.providerWasFallback,
    linksDropped: synthesis.linksDropped,
    itemsCollected: collected.length,
    itemsAnalyzed: ranked.length,
    sourcesOk,
    sourcesFailed,
    health,
  });

  const rendered: RenderedReport = {
    report,
    subject: buildSubject(recipe, report),
    markdown: markdownRenderer.render(report, recipe.sections),
    html: emailRenderer.render(report, recipe.sections),
    json: jsonRenderer.render(report, recipe.sections),
  };

  if (options.dryRun) {
    return { exitCode: exitCodeFor('ok'), result: 'ok', report, rendered };
  }

  writeArchive(options.dataRoot, report, rendered.markdown);

  const publishedUrls = collectPublishedUrls(report);
  const publishedItems = ranked.filter((item) => publishedUrls.has(item.url));
  const markedSeen = markSeen(seenState, publishedItems, options.now);
  saveSeen(seenPath, pruneSeen(markedSeen, recipe.window.days, options.now));

  const deliverOutcome = await deliver({
    channels: recipe.delivery,
    rendered,
    ctx: { secret: options.secret, fetch: options.deliverFetch, timeoutMs },
    ...(options.notifierRegistry !== undefined ? { registry: options.notifierRegistry } : {}),
  });

  // El canal que falló se lleva su causa y su duración al registro. Quedarse solo con `{id, ok}`
  // deja "delivery_failed" sin explicación en el único sitio que sobrevive a la ejecución, y obliga
  // a reproducir el fallo a mano para leer un mensaje que ya se tenía. Un canal que fue bien no
  // arrastra nada: la línea del registro no es un log.
  const deliverySummary = deliverOutcome.results.map((result) =>
    result.ok
      ? { id: result.id, ok: true }
      : withDefined<{ id: string; ok: boolean; error?: string; durationMs?: number }>(
          { id: result.id, ok: false },
          { error: result.error, durationMs: result.durationMs },
        ),
  );

  return finish(
    deliverOutcome.ok ? 'ok' : 'delivery_failed',
    {
      provider: synthesis.provider,
      fallback: synthesis.providerWasFallback,
      itemsCollected: collected.length,
      sources: { ok: sourcesOk, failed: sourcesFailed },
      delivery: deliverySummary,
    },
    { report, rendered, deliverOutcome },
  );
}

/** El adaptador de `fetch` real para cada contrato (sources/deliver). Exportado para que
 * `scripts/probe-fase4.ts` lo reutilice (R10): no hay una segunda implementación de "cómo se ve
 * `fetch` de verdad" para cada uno. */
export const realSourceFetch: SourceFetchLike = async (url, init) => {
  const response = await fetch(url, { headers: init.headers, signal: init.signal });
  return { ok: response.ok, status: response.status, text: () => response.text() };
};

export const realDeliverFetch: DeliverFetchLike = async (url, init) => {
  const response = await fetch(url, {
    method: init.method,
    headers: init.headers,
    body: init.body,
    signal: init.signal,
  });
  return { ok: response.ok, status: response.status, text: () => response.text() };
};

interface ParsedFlags {
  readonly flags: Readonly<Record<string, string>>;
  readonly booleans: ReadonlySet<string>;
}

function parseFlags(argv: readonly string[]): ParsedFlags {
  const flags: Record<string, string> = {};
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith('--')) {
      continue;
    }
    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      index++;
    } else {
      booleans.add(name);
    }
  }
  return { flags, booleans };
}

/**
 * `run --recipe <n> [--dry-run] [--data-root <ruta>] [--recipes-root <ruta>]`: resuelve las rutas
 * por precedencia explícita (RF-A07), llama a `runOnce` con `fetch` real, e imprime el resultado.
 */
export async function cliRun(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExitCode> {
  const { flags, booleans } = parseFlags(argv);
  const recipeName = flags.recipe;
  if (recipeName === undefined) {
    console.error('run: falta --recipe <nombre>');
    return exitCodeFor('config_error');
  }

  let recipeDir: string;
  let dataRoot: string;
  try {
    const recipesRoot = resolveRecipesRoot({
      ...(flags['recipes-root'] !== undefined ? { cliValue: flags['recipes-root'] } : {}),
      env,
    });
    recipeDir = resolveRecipeDir(recipeName, recipesRoot);
    dataRoot = resolveDataRoot({
      ...(flags['data-root'] !== undefined ? { cliValue: flags['data-root'] } : {}),
      env,
    });
  } catch (cause) {
    console.error(errorMessage(cause));
    return exitCodeFor('config_error');
  }

  const result = await runOnce({
    recipeDir,
    dataRoot,
    dryRun: booleans.has('dry-run'),
    now: new Date(),
    secret: (name) => env[name],
    sourceFetch: realSourceFetch,
    deliverFetch: realDeliverFetch,
    userAgent: 'chronorium/1.0 (+https://github.com/ivanpascual-dev/chronorium)',
  });

  if (result.rendered !== undefined && result.result === 'ok' && booleans.has('dry-run')) {
    console.log(result.rendered.json);
  }

  if (result.result === 'skipped_existing') {
    console.log(
      `chronorium run: el informe de hoy ya existe para "${recipeName}", nada que hacer.`,
    );
  } else if (result.exitCode !== 0) {
    console.error(`chronorium run: ${result.result} (código ${result.exitCode})`);
    // Un fallo de entrega sin la causa delante obliga a un viaje de vuelta: reproducir el envío a
    // mano solo para leer un mensaje que el proceso ya tenía en la mano. El mensaje llega con los
    // secretos tachados desde el notificador, y la duración importa tanto como el texto (un canal
    // que tarda justo el tiempo de espera del transporte no está siendo rechazado, no llega).
    for (const channel of result.deliverOutcome?.results ?? []) {
      if (!channel.ok) {
        console.error(
          `  canal "${channel.id}" falló tras ${channel.durationMs} ms: ${channel.error ?? 'sin causa registrada'}`,
        );
      }
    }
  } else {
    console.log(`chronorium run: ${result.result} (código ${result.exitCode})`);
  }

  return result.exitCode;
}
