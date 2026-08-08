import type { Item } from '../sources/types.ts';

const TRACKING_PARAMS = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'ref',
  'fbclid',
  'gclid',
]);

/** Fragmento fuera, parámetros de seguimiento fuera, host en minúsculas, sin barra final. */
export function normalizeUrl(rawUrl: string): string {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return rawUrl.trim().toLowerCase();
  }

  const params = new URLSearchParams(url.search);
  for (const key of [...params.keys()]) {
    if (TRACKING_PARAMS.has(key.toLowerCase())) {
      params.delete(key);
    }
  }
  params.sort();

  const query = params.toString();
  const path = url.pathname.replace(/\/+$/, '') || '/';
  return `${url.protocol}//${url.hostname.toLowerCase()}${path}${query ? `?${query}` : ''}`;
}

const COMBINING_MARKS = /[\u0300-\u036f]/g;
const NON_ALPHANUMERIC = /[^\p{L}\p{N}\s]/gu;
const EXTRA_WHITESPACE = /\s+/g;

/** Minúsculas, sin acentos ni puntuación, espacios colapsados: la huella que atrapa la misma noticia en dos sitios. */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(NON_ALPHANUMERIC, ' ')
    .trim()
    .replace(EXTRA_WHITESPACE, ' ');
}

/**
 * Deduplica por dirección exacta (normalizada) y por título normalizado (RF-C03). Ante duplicado
 * se conserva el de mayor `score`; con empate o sin `score`, el primero visto, de forma
 * determinista.
 */
export function dedupeItems<T extends Item & { readonly score?: number }>(
  items: readonly T[],
): T[] {
  const indexByUrl = new Map<string, number>();
  const indexByTitle = new Map<string, number>();
  const result: T[] = [];

  for (const item of items) {
    const urlKey = normalizeUrl(item.url);
    const titleKey = normalizeTitle(item.title);
    const existingIndex = indexByUrl.get(urlKey) ?? indexByTitle.get(titleKey);

    if (existingIndex === undefined) {
      const index = result.length;
      result.push(item);
      indexByUrl.set(urlKey, index);
      indexByTitle.set(titleKey, index);
      continue;
    }

    const existing = result[existingIndex] as T;
    if ((item.score ?? 0) > (existing.score ?? 0)) {
      result[existingIndex] = item;
    }
    indexByUrl.set(urlKey, existingIndex);
    indexByTitle.set(titleKey, existingIndex);
  }

  return result;
}
