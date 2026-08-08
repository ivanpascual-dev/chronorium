import type { SourceSpec } from '../recipe/types.ts';
import type { ReaderRegistry } from './registry.ts';
import type { Item, ReadContext, SourceResult } from './types.ts';

export interface CollectResult {
  readonly items: readonly Item[];
  readonly results: readonly SourceResult[];
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface Outcome {
  readonly items: readonly Item[];
  readonly result: SourceResult;
}

async function collectOne(
  source: SourceSpec,
  registry: ReaderRegistry,
  ctx: ReadContext,
): Promise<Outcome> {
  const start = Date.now();
  const reader = registry.get(source.type);

  if (!reader) {
    return {
      items: [],
      result: {
        id: source.id,
        type: source.type,
        ok: false,
        items: 0,
        error: `tipo de fuente no registrado: "${source.type}"`,
        durationMs: Date.now() - start,
      },
    };
  }

  try {
    const items = await reader.read(source, ctx);
    return {
      items,
      result: {
        id: source.id,
        type: source.type,
        ok: true,
        items: items.length,
        durationMs: Date.now() - start,
      },
    };
  } catch (cause) {
    return {
      items: [],
      result: {
        id: source.id,
        type: source.type,
        ok: false,
        items: 0,
        error: errorMessage(cause),
        durationMs: Date.now() - start,
      },
    };
  }
}

/**
 * Una fuente caída no tumba la ejecución (RF-B05): se registra, y las demás continúan. Con todas
 * caídas, `items` queda vacío pero `results` lo distingue de un éxito silencioso (RF-G01, aunque
 * el código de salida es fase 4).
 */
export async function collect(
  sources: readonly SourceSpec[],
  registry: ReaderRegistry,
  ctx: ReadContext,
): Promise<CollectResult> {
  const outcomes = await Promise.all(sources.map((source) => collectOne(source, registry, ctx)));

  return {
    items: outcomes.flatMap((outcome) => outcome.items),
    results: outcomes.map((outcome) => outcome.result),
  };
}
