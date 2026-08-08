import type { CapsConfig } from '../recipe/types.ts';
import type { Item } from '../sources/types.ts';

/**
 * Asume que `items` ya viene puntuado y ordenado de mejor a peor (`score.ts`). El tope por fuente
 * se aplica primero, en porcentaje del total de esta etapa (RF-B06: el caso medido fue una fuente
 * generalista aportando el 39% de 67 elementos); el tope global se aplica después, y como el
 * resultado del primero conserva el orden por puntuación, el `slice` final se queda con los
 * mejores de conjunto, no con los primeros de cada fuente (RF-D08).
 */
export function applyCaps<T extends Item & { readonly source: string }>(
  sortedByScoreDesc: readonly T[],
  caps: CapsConfig,
): T[] {
  const perSourceLimit = Math.floor(sortedByScoreDesc.length * (caps.perSourceMaxPercent / 100));
  const countBySource = new Map<string, number>();
  const afterSourceCap: T[] = [];

  for (const item of sortedByScoreDesc) {
    const count = countBySource.get(item.source) ?? 0;
    if (count >= perSourceLimit) {
      continue;
    }
    countBySource.set(item.source, count + 1);
    afterSourceCap.push(item);
  }

  return afterSourceCap.slice(0, caps.maxItems);
}
