import { fetchWithTimeout } from './http.ts';
import type { Item, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

const GITHUB_API = 'https://api.github.com';
const DAY_MS = 24 * 60 * 60 * 1000;

function windowStartDate(now: Date, windowDays: number): string {
  const start = new Date(now.getTime() - windowDays * DAY_MS);
  return start.toISOString().slice(0, 10);
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * `repo-search`: acota la consulta a la ventana de la receta y ordena por estrellas dentro de esa
 * ventana (RF-B09). La API de búsqueda de repositorios no ofrece ninguna ordenación por
 * crecimiento; el cualificador `created:` es lo que la aproxima, comprobado contra la
 * documentación de GitHub (ver `docs/plans/fase-2-recoleccion-y-memoria.md`, T0).
 */
export const repoSearchReader: SourceReader = {
  type: 'repo-search',
  requiredSecrets: [],
  async read(source, ctx) {
    if (source.query === undefined) {
      throw new Error(`la fuente "${source.id}" de tipo repo-search no declara "query"`);
    }

    const since = windowStartDate(ctx.now, ctx.windowDays);
    const q = `${source.query} created:>=${since}`;
    const url = `${GITHUB_API}/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc`;

    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    const token = ctx.secret('GITHUB_TOKEN');
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }

    const response = await fetchWithTimeout(url, ctx, headers);
    if (!response.ok) {
      throw new Error(`${url} respondió ${response.status}`);
    }

    const body = JSON.parse(await response.text()) as { items?: unknown[] };
    const items = Array.isArray(body.items) ? body.items : [];

    return items.flatMap((raw): Item[] => {
      if (typeof raw !== 'object' || raw === null) {
        return [];
      }
      const repo = raw as Record<string, unknown>;
      const title = asString(repo.full_name);
      const url = asString(repo.html_url);
      if (title === undefined || url === undefined) {
        return [];
      }

      return [
        makeItem({
          title,
          url,
          source: source.id,
          summary: asString(repo.description) ?? '',
          publishedAt: asString(repo.created_at),
        }),
      ];
    });
  },
};
