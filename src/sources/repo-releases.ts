import { fetchWithTimeout } from './http.ts';
import type { Item, ReadContext, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

const GITHUB_API = 'https://api.github.com';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

async function readOneRepo(
  repo: string,
  source: { readonly id: string },
  ctx: ReadContext,
  headers: Record<string, string>,
): Promise<Item[]> {
  const url = `${GITHUB_API}/repos/${repo}/releases?per_page=5`;
  const response = await fetchWithTimeout(url, ctx, headers);
  if (!response.ok) {
    throw new Error(`${url} respondió ${response.status}`);
  }

  const body: unknown = JSON.parse(await response.text());
  if (!Array.isArray(body)) {
    return [];
  }

  return body.flatMap((raw): Item[] => {
    if (typeof raw !== 'object' || raw === null) {
      return [];
    }
    const release = raw as Record<string, unknown>;
    if (release.draft === true || release.prerelease === true) {
      return [];
    }

    const name = asString(release.name) ?? asString(release.tag_name);
    const url = asString(release.html_url);
    if (name === undefined || url === undefined) {
      return [];
    }

    return [
      makeItem({
        title: `${repo}: ${name}`,
        url,
        source: source.id,
        summary: asString(release.body) ?? '',
        publishedAt: asString(release.published_at),
      }),
    ];
  });
}

export const repoReleasesReader: SourceReader = {
  type: 'repo-releases',
  requiredSecrets: [],
  async read(source, ctx) {
    const repos = source.repos ?? [];
    if (repos.length === 0) {
      throw new Error(`la fuente "${source.id}" de tipo repo-releases no declara "repos"`);
    }

    const headers: Record<string, string> = { Accept: 'application/vnd.github+json' };
    const token = ctx.secret('GITHUB_TOKEN');
    if (token !== undefined) {
      headers.Authorization = `Bearer ${token}`;
    }

    const perRepo = await Promise.all(repos.map((repo) => readOneRepo(repo, source, ctx, headers)));
    return perRepo.flat();
  },
};
