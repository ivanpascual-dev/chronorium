import { normalizeUrl } from '../rank/dedupe.ts';
import type { DerivedSchema } from '../recipe/schema.ts';
import type { Item } from '../sources/types.ts';

export interface ValidateLinksResult {
  readonly report: unknown;
  readonly linksDropped: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseAbsoluteHttpUrl(value: string): URL | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  return url.protocol === 'http:' || url.protocol === 'https:' ? url : undefined;
}

function resolveField(
  entry: unknown,
  fieldName: string,
  canonicalByNormalized: ReadonlyMap<string, string>,
): { readonly value: unknown; readonly dropped: boolean } {
  if (!isRecord(entry)) {
    return { value: entry, dropped: false };
  }

  const raw = entry[fieldName];
  if (typeof raw !== 'string' || raw.length === 0) {
    return { value: entry, dropped: false };
  }

  const parsed = parseAbsoluteHttpUrl(raw);
  if (!parsed) {
    return { value: { ...entry, [fieldName]: '' }, dropped: true };
  }

  const canonical = canonicalByNormalized.get(normalizeUrl(parsed.toString()));
  if (canonical === undefined) {
    return { value: { ...entry, [fieldName]: '' }, dropped: true };
  }

  return {
    value: canonical === raw ? entry : { ...entry, [fieldName]: canonical },
    dropped: false,
  };
}

/**
 * Único punto que toca un enlace de la salida (ADR-010, RF-E03). Todo campo de tipo `url` que no
 * esté, normalizado, entre `items` se vacía; el que sí está se sustituye por la URL exacta del
 * elemento de entrada, nunca por el texto que devolvió el modelo. Recorre `derived.urlFields`,
 * nunca una clave de sección literal (R12).
 */
export function validateLinks(
  report: unknown,
  derived: DerivedSchema,
  items: readonly Item[],
): ValidateLinksResult {
  if (!isRecord(report)) {
    return { report, linksDropped: 0 };
  }

  const canonicalByNormalized = new Map<string, string>();
  for (const item of items) {
    canonicalByNormalized.set(normalizeUrl(item.url), item.url);
  }

  const result: Record<string, unknown> = { ...report };
  let linksDropped = 0;

  for (const { sectionKey, fieldName } of derived.urlFields) {
    const sectionValue = result[sectionKey];
    if (sectionValue === undefined) {
      continue;
    }

    if (Array.isArray(sectionValue)) {
      result[sectionKey] = sectionValue.map((entry) => {
        const resolved = resolveField(entry, fieldName, canonicalByNormalized);
        if (resolved.dropped) linksDropped += 1;
        return resolved.value;
      });
    } else {
      const resolved = resolveField(sectionValue, fieldName, canonicalByNormalized);
      if (resolved.dropped) linksDropped += 1;
      result[sectionKey] = resolved.value;
    }
  }

  return { report: result, linksDropped };
}
