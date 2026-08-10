import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import type { ReportHealth } from '../render/types.ts';
import type { RunRecord, RunResult } from './types.ts';

export class RunsPathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RunsPathError';
  }
}

function requireAbsolute(path: string): void {
  if (!isAbsolute(path)) {
    throw new RunsPathError(
      `la ruta de state/runs.ndjson debe ser absoluta, y no depender del directorio de trabajo: ${path}`,
    );
  }
}

/** Se añade, nunca se reescribe: una línea corta, `appendFileSync` basta (no hace falta `fsync` de
 * directorio, RF-C06 lo garantiza el workflow de la fase 5, no hay dos escritores aquí). */
export function appendRun(path: string, record: RunRecord): void {
  requireAbsolute(path);
  appendFileSync(path, `${JSON.stringify(record)}\n`, 'utf8');
}

const OK_RESULTS: ReadonlySet<RunResult> = new Set(['ok', 'skipped_existing']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

interface ParsedLine {
  readonly ts: string;
  readonly recipe: string;
  readonly result: RunResult;
}

function parseLine(line: string): ParsedLine | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return undefined;
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.ts !== 'string' ||
    typeof parsed.recipe !== 'string' ||
    typeof parsed.result !== 'string'
  ) {
    return undefined;
  }
  return { ts: parsed.ts, recipe: parsed.recipe, result: parsed.result as RunResult };
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Cuenta ejecuciones dentro de `windowDays` (RF-G04), sin mirar nombres de fichero: es la única
 * implementación (R10), la consumen el orquestador (para meterla en el informe, RF-G05) y `doctor`
 * (para responder por consola). Filtro opcional por receta: dos recetas comparten el mismo fichero,
 * y la salud que viaja dentro de un informe es la de SU receta, no la mezcla de todas.
 *
 * Una línea corrupta se ignora y la lectura sigue: un histórico con un renglón roto no puede dejar
 * ciego al sistema.
 */
export function readHealth(
  path: string,
  windowDays: number,
  now: Date,
  recipe?: string,
): ReportHealth {
  requireAbsolute(path);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
      return { windowDays, runsOk: 0, runsFailed: 0 };
    }
    throw cause;
  }

  const cutoff = now.getTime() - windowDays * DAY_MS;
  let runsOk = 0;
  let runsFailed = 0;

  for (const line of raw.split('\n')) {
    if (line.trim().length === 0) {
      continue;
    }
    const record = parseLine(line);
    if (record === undefined) {
      continue;
    }
    if (recipe !== undefined && record.recipe !== recipe) {
      continue;
    }

    const ts = new Date(record.ts).getTime();
    if (Number.isNaN(ts) || ts < cutoff || ts > now.getTime()) {
      continue;
    }

    if (OK_RESULTS.has(record.result)) {
      runsOk += 1;
    } else {
      runsFailed += 1;
    }
  }

  return { windowDays, runsOk, runsFailed };
}
