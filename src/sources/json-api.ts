import { fetchWithTimeout } from './http.ts';
import type { Item, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

function getPath(value: unknown, path: string | undefined): unknown {
  if (path === undefined || path.length === 0) {
    return value;
  }
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || typeof acc !== 'object') {
      return undefined;
    }
    return (acc as Record<string, unknown>)[key];
  }, value);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export const jsonApiReader: SourceReader = {
  type: 'json-api',
  requiredSecrets: [],
  async read(source, ctx) {
    if (source.url === undefined) {
      throw new Error(`la fuente "${source.id}" de tipo json-api no declara "url"`);
    }
    if (source.mapping === undefined) {
      throw new Error(`la fuente "${source.id}" de tipo json-api no declara "mapping"`);
    }
    const mapping = source.mapping;

    const response = await fetchWithTimeout(source.url, ctx);
    if (!response.ok) {
      throw new Error(`${source.url} respondió ${response.status}`);
    }

    const body: unknown = JSON.parse(await response.text());
    const rawList = getPath(body, mapping.items);
    if (!Array.isArray(rawList)) {
      throw new Error(
        `la fuente "${source.id}" no encontró una lista en "${mapping.items ?? '(raíz)'}"`,
      );
    }

    return rawList.flatMap((entry): Item[] => {
      const title = asString(getPath(entry, mapping.title));
      const url = asString(getPath(entry, mapping.url));
      if (title === undefined || url === undefined) {
        return [];
      }

      return [
        makeItem({
          title,
          url,
          source: source.id,
          summary: asString(getPath(entry, mapping.summary)) ?? '',
          publishedAt: asString(getPath(entry, mapping.publishedAt)),
        }),
      ];
    });
  },
};
