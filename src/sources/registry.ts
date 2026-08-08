import { archiveReader } from './archive.ts';
import { feedReader } from './feed.ts';
import { jsonApiReader } from './json-api.ts';
import { repoReleasesReader } from './repo-releases.ts';
import { repoSearchReader } from './repo-search.ts';
import type { SourceReader } from './types.ts';

export type ReaderRegistry = ReadonlyMap<string, SourceReader>;

const builtinReaders: readonly SourceReader[] = [
  feedReader,
  jsonApiReader,
  repoSearchReader,
  repoReleasesReader,
  archiveReader,
];

export function buildRegistry(readers: readonly SourceReader[] = builtinReaders): ReaderRegistry {
  const map = new Map<string, SourceReader>();
  for (const reader of readers) {
    map.set(reader.type, reader);
  }
  return map;
}

/** Los cinco lectores de fábrica (RF-B02), seleccionables solo por `type` declarado (RF-B01). */
export const defaultRegistry: ReaderRegistry = buildRegistry();
