import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Item, SourceReader } from './types.ts';
import { makeItem } from './types.ts';

// Los tres formatos de sección/elemento que este proyecto o su predecesor pueden haber escrito
// (ADR-013): esquema 2 (`title`/`link`), esquema 1 (`titulo`/`enlace`), y `text` (secciones sin
// enlace propio, como "pulso del día", que no producen elemento porque falta la url).
const TITLE_FIELDS = ['title', 'titulo', 'text'];
const URL_FIELDS = ['link', 'url', 'enlace'];
const SUMMARY_FIELDS = ['summary', 'resumen', 'change', 'impact', 'description'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) {
      return value;
    }
  }
  return undefined;
}

/** Un elemento sin un campo de dirección reconocible se descarta: no hay `url` que satisfacer. */
function extractItem(raw: unknown, source: string, publishedAt: string | undefined): Item[] {
  if (!isRecord(raw)) {
    return [];
  }
  const title = firstString(raw, TITLE_FIELDS);
  const url = firstString(raw, URL_FIELDS);
  if (title === undefined || url === undefined) {
    return [];
  }

  const summary = SUMMARY_FIELDS.map((key) => raw[key])
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join('. ');

  return [makeItem({ title, url, source, summary, publishedAt })];
}

function extractSchemaV2(report: Record<string, unknown>): Item[] {
  const recipeName = typeof report.recipe === 'string' ? report.recipe : 'archive';
  const date = typeof report.date === 'string' ? report.date : undefined;
  const sections = Array.isArray(report.sections) ? report.sections : [];

  return sections.flatMap((section): Item[] => {
    if (!isRecord(section) || !Array.isArray(section.items)) {
      return [];
    }
    return section.items.flatMap((item) => extractItem(item, `archive/${recipeName}`, date));
  });
}

/** Formato previo a junio de 2026, con nombres de campo distintos (ADR-013). */
function extractSchemaV1(report: Record<string, unknown>): Item[] {
  const date = typeof report.fecha === 'string' ? report.fecha : undefined;
  const secciones = Array.isArray(report.secciones) ? report.secciones : [];

  return secciones.flatMap((seccion): Item[] => {
    if (!isRecord(seccion) || !Array.isArray(seccion.elementos)) {
      return [];
    }
    return seccion.elementos.flatMap((elemento) => extractItem(elemento, 'archive/legacy', date));
  });
}

export const archiveReader: SourceReader = {
  type: 'archive',
  requiredSecrets: [],
  async read(source, ctx) {
    const archiveDir = join(ctx.dataRoot, 'archive');

    let fileNames: string[];
    try {
      fileNames = readdirSync(archiveDir).filter((name) => name.endsWith('.json'));
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw cause;
    }

    const wantedRecipe = source.recipe;

    return fileNames.flatMap((fileName): Item[] => {
      if (wantedRecipe !== undefined && !fileName.endsWith(`--${wantedRecipe}.json`)) {
        return [];
      }

      const raw: unknown = JSON.parse(readFileSync(join(archiveDir, fileName), 'utf8'));
      if (!isRecord(raw)) {
        return [];
      }
      if (raw.schemaVersion === 2) {
        return extractSchemaV2(raw);
      }
      if (raw.schemaVersion === 1) {
        return extractSchemaV1(raw);
      }
      return [];
    });
  },
};
