import type { ScoringConfig } from '../recipe/types.ts';
import type { Item } from '../sources/types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ScoreOptions {
  readonly now: Date;
  readonly windowDays: number;
  readonly topics: readonly string[];
  readonly scoring: ScoringConfig;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;

function normalize(text: string): string {
  return text.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

/**
 * Fecha desconocida ⇒ 0 exacto, nunca la máxima (RF-B07, defecto medido: el elemento peor
 * formado del sistema anterior sacaba la puntuación máxima y reaparecía todos los días).
 */
export function recencyComponent(
  publishedAt: string | undefined,
  now: Date,
  windowDays: number,
): number {
  if (publishedAt === undefined) {
    return 0;
  }

  const ageMs = now.getTime() - new Date(publishedAt).getTime();
  const ageDays = ageMs / DAY_MS;
  return Math.min(1, Math.max(0, 1 - ageDays / windowDays));
}

/** Fracción de los temas de la receta que aparecen en el título o el resumen, normalizados. */
export function topicsComponent(item: Item, topics: readonly string[]): number {
  if (topics.length === 0) {
    return 0;
  }

  const haystack = normalize(`${item.title} ${item.summary}`);
  const matches = topics.filter((topic) => haystack.includes(normalize(topic))).length;
  return matches / topics.length;
}

export function scoreItem(item: Item, options: ScoreOptions): number {
  const recency = recencyComponent(item.publishedAt, options.now, options.windowDays);
  const topics = topicsComponent(item, options.topics);
  return recency * options.scoring.recencyWeight + topics * options.scoring.topicsWeight;
}

/** `Array.prototype.sort` es estable desde ES2019: los empates conservan el orden de entrada. */
export function sortByScoreDesc<T>(items: readonly T[], scoreOf: (item: T) => number): T[] {
  return [...items].sort((a, b) => scoreOf(b) - scoreOf(a));
}
