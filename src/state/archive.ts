import { closeSync, existsSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import type { Report } from '../render/types.ts';

export class ArchivePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchivePathError';
  }
}

/** RF-C04, y es una prohibición de la constitución: nunca se sobrescribe un informe archivado. */
export class ArchiveExistsError extends Error {
  constructor(path: string) {
    super(`ya existe un informe archivado en ${path}: se conserva, no se sobrescribe (RF-C04)`);
    this.name = 'ArchiveExistsError';
  }
}

export interface ArchivePaths {
  readonly jsonPath: string;
  readonly mdPath: string;
}

function requireAbsolute(dataRoot: string): void {
  if (!isAbsolute(dataRoot)) {
    throw new ArchivePathError(
      `dataRoot debe ser una ruta absoluta, y no depender del directorio de trabajo: ${dataRoot}`,
    );
  }
}

export function archivePaths(dataRoot: string, date: string, recipe: string): ArchivePaths {
  requireAbsolute(dataRoot);
  const archiveDir = join(dataRoot, 'archive');
  return {
    jsonPath: join(archiveDir, `${date}--${recipe}.json`),
    mdPath: join(archiveDir, `${date}--${recipe}.md`),
  };
}

/** Comprobación previa, para el camino rápido del orquestador (T11): "el informe de hoy ya existe
 * ⇒ código 0, sin llamar al modelo". No sustituye la garantía de `writeArchive`, que es la bandera
 * del sistema de ficheros, no esta comprobación (contrato #6 de la fase). */
export function archiveExists(dataRoot: string, date: string, recipe: string): boolean {
  return existsSync(archivePaths(dataRoot, date, recipe).jsonPath);
}

function writeExclusive(path: string, content: string): void {
  let fd: number;
  try {
    fd = openSync(path, 'wx');
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ArchiveExistsError(path);
    }
    throw cause;
  }
  try {
    writeSync(fd, content, null, 'utf8');
  } finally {
    closeSync(fd);
  }
}

/**
 * Escribe `.json` y `.md` con la bandera `wx` (falla si existe), no con "comprobar y luego
 * escribir": entre la comprobación y la escritura cabe otra ejecución (RF-C04). Crea el directorio
 * de archivo si falta.
 */
export function writeArchive(dataRoot: string, report: Report, markdown: string): ArchivePaths {
  const paths = archivePaths(dataRoot, report.date, report.recipe);
  mkdirSync(join(dataRoot, 'archive'), { recursive: true });

  writeExclusive(paths.jsonPath, JSON.stringify(report, null, 2));
  writeExclusive(paths.mdPath, markdown);

  return paths;
}
