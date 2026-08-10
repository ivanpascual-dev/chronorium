import { createHash } from 'node:crypto';
import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { normalizeTitle, normalizeUrl } from '../rank/dedupe.ts';
import type { Item } from '../sources/types.ts';

const DAY_MS = 24 * 60 * 60 * 1000;

export type SeenKind = 'url' | 'title';

export interface SeenEntry {
  readonly h: string;
  readonly firstSeen: string;
  readonly kind: SeenKind;
}

export interface SeenState {
  readonly schemaVersion: 1;
  readonly windowDays: number;
  readonly entries: readonly SeenEntry[];
}

export class SeenLoadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SeenLoadError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isValidEntry(value: unknown): value is SeenEntry {
  return (
    isRecord(value) &&
    typeof value.h === 'string' &&
    typeof value.firstSeen === 'string' &&
    (value.kind === 'url' || value.kind === 'title')
  );
}

function isValidState(value: unknown): value is SeenState {
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.windowDays === 'number' &&
    Array.isArray(value.entries) &&
    value.entries.every(isValidEntry)
  );
}

/** Huella, no texto: `state/seen.json` no debe exponer qué se leyó. */
function hash(normalized: string): string {
  return createHash('sha256').update(normalized).digest('hex');
}

function hashUrl(url: string): string {
  return hash(normalizeUrl(url));
}

function hashTitle(title: string): string {
  return hash(normalizeTitle(title));
}

/** Compartida con `cli/run.ts` (R10): la fecha del informe (`YYYY-MM-DD`) es el mismo cálculo que
 * el que marca `firstSeen` aquí. */
export function dayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Fichero ausente ⇒ memoria vacía, no error: es el primer arranque de un desconocido. Fichero
 * presente pero ilegible o corrupto ⇒ error (RF-A06): la distinción es deliberada.
 */
export function loadSeen(path: string): SeenState {
  if (!isAbsolute(path)) {
    throw new SeenLoadError(
      `la ruta de state/seen.json debe ser absoluta, y no depender del directorio de trabajo: ${path}`,
    );
  }

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: 1, windowDays: 0, entries: [] };
    }
    throw new SeenLoadError(`no se pudo leer ${path}: ${(cause as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    throw new SeenLoadError(`JSON inválido en ${path}: ${(cause as Error).message}`);
  }

  if (!isValidState(parsed)) {
    throw new SeenLoadError(`estructura inválida en ${path}`);
  }

  return parsed;
}

/** Escritura atómica (temporal más renombrado): una ejecución interrumpida no deja el estado a medias. */
export function saveSeen(path: string, state: SeenState): void {
  if (!isAbsolute(path)) {
    throw new SeenLoadError(
      `la ruta de state/seen.json debe ser absoluta, y no depender del directorio de trabajo: ${path}`,
    );
  }

  const tmpPath = `${path}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf8');
  renameSync(tmpPath, path);
}

/** Poda por `windowDays` en cada ejecución (RF-C02): sin poda, este fichero es el que acaba pesando. */
export function pruneSeen(state: SeenState, windowDays: number, now: Date): SeenState {
  const cutoff = now.getTime() - windowDays * DAY_MS;
  const entries = state.entries.filter((entry) => new Date(entry.firstSeen).getTime() >= cutoff);
  return { schemaVersion: 1, windowDays, entries };
}

export function isSeen(state: SeenState, item: Item): boolean {
  const hashes = new Set(state.entries.map((entry) => entry.h));
  return hashes.has(hashUrl(item.url)) || hashes.has(hashTitle(item.title));
}

export function filterUnseen<T extends Item>(state: SeenState, items: readonly T[]): T[] {
  return items.filter((item) => !isSeen(state, item));
}

/**
 * Marca lo que salió en el informe, no lo que se recogió (RF-C01): quien llama a esto, cuando ya
 * hay informe, decide qué marcar. `firstSeen` no se reescribe para una huella que ya existía.
 */
export function markSeen(state: SeenState, items: readonly Item[], now: Date): SeenState {
  const today = dayStamp(now);
  const byHash = new Map(state.entries.map((entry) => [entry.h, entry] as const));

  for (const item of items) {
    const candidates: readonly [SeenKind, string][] = [
      ['url', hashUrl(item.url)],
      ['title', hashTitle(item.title)],
    ];
    for (const [kind, h] of candidates) {
      if (!byHash.has(h)) {
        byHash.set(h, { h, firstSeen: today, kind });
      }
    }
  }

  return { ...state, entries: [...byHash.values()] };
}
