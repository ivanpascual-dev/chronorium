import type { RecipeConfig } from '../recipe/types.ts';
import type { Item } from '../sources/types.ts';
import { applyCaps } from './caps.ts';
import { dedupeItems } from './dedupe.ts';
import { scoreItem, sortByScoreDesc } from './score.ts';
import { isWithinWindow, parsePublishedAt } from './window.ts';

export type ScoredItem = Item & { readonly score: number };

export interface PipelineOptions {
  readonly now: Date;
  readonly recipe: RecipeConfig;
  /**
   * Predicado de memoria, inyectado en vez de leer `state/seen.json` aquí: `rank/` es lógica pura
   * (R13) y no conoce ficheros. Quien orquesta lo construye a partir de `state/seen.ts`.
   */
  readonly isSeen: (item: Item) => boolean;
}

/**
 * El orden es un contrato (`docs/plans/fase-2-recoleccion-y-memoria.md`):
 *
 *   interpretar fechas → deduplicar → filtrar por ventana → filtrar por memoria
 *     → puntuar → tope por fuente → tope global
 *
 * Deduplicar antes que la memoria evita marcar dos veces lo mismo. Filtrar por memoria antes de
 * puntuar evita gastar puntuación en lo que no puede salir. Puntuar antes del tope por fuente es
 * lo que hace que el tope se quede con los mejores de cada fuente, no con los primeros.
 */
function withParsedDate(item: Item, now: Date): Item {
  const publishedAt = parsePublishedAt(item.publishedAt, now);
  if (publishedAt === undefined) {
    const { publishedAt: _discarded, ...rest } = item;
    return rest;
  }
  return { ...item, publishedAt };
}

export function runPipeline(rawItems: readonly Item[], options: PipelineOptions): ScoredItem[] {
  const { now, recipe, isSeen } = options;

  const withDates = rawItems.map((item) => withParsedDate(item, now));

  const deduped = dedupeItems(withDates);

  const withinWindow = deduped.filter((item) =>
    isWithinWindow(item.publishedAt, now, recipe.window.days),
  );

  const unseen = withinWindow.filter((item) => !isSeen(item));

  const scored: ScoredItem[] = unseen.map((item) => ({
    ...item,
    score: scoreItem(item, {
      now,
      windowDays: recipe.window.days,
      topics: recipe.topics,
      scoring: recipe.scoring,
    }),
  }));

  const sorted = sortByScoreDesc(scored, (item) => item.score);

  return applyCaps(sorted, recipe.caps);
}
