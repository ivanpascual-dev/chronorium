// Compartido por `markdown.ts` y `email.ts` (R10): cómo descomponer genéricamente un elemento sin
// conocer sus campos concretos, y la línea de estado. No es un renderizador en sí (no produce el
// documento final de ningún formato), así que vive aparte de `report.ts` para no crear un ciclo de
// imports entre `report.ts` (que compondría `RenderedReport` con los tres renderizadores) y los
// propios renderizadores (que necesitan esta descomposición). Ver bitácora de esta fase.

import type { SectionSpec } from '../recipe/types.ts';
import type { Report } from './types.ts';

/** Una línea de texto ya lista para renderizar: con `label` si la receta lo declaró, sin él si no. */
export interface StructuredLine {
  readonly label?: string;
  readonly value: string;
}

export interface StructuredItem {
  /** El primer campo declarado de la sección: el rótulo del elemento (T5, regla 1). */
  readonly label: string;
  /** El primer campo de tipo `url`, si lo hay: el enlace del rótulo (regla 2). */
  readonly labelUrl?: string;
  /** Los campos de tipo `url` siguientes al primero, como enlaces sueltos (regla 2). */
  readonly extraUrls: readonly string[];
  /** Los demás campos, en el orden declarado, ya sin los vacíos (reglas 3 y 4). */
  readonly lines: readonly StructuredLine[];
}

/**
 * Recorre `section.fields` sin conocer ninguna clave de sección (R12): el primer campo es siempre
 * el rótulo, cualquier campo de tipo `url` entre el resto se convierte en enlace y no en línea de
 * texto, y un campo vacío (el caso del enlace que `validateLinks` descartó) no se imprime.
 */
export function structureItem(section: SectionSpec, item: Record<string, string>): StructuredItem {
  const [firstField, ...restFields] = section.fields;
  const label = firstField !== undefined ? (item[firstField.name] ?? '') : '';

  const urlValues: string[] = [];
  const lines: StructuredLine[] = [];

  for (const field of restFields) {
    const value = item[field.name];
    if (value === undefined || value === '') {
      continue;
    }
    if (field.type === 'url') {
      urlValues.push(value);
      continue;
    }
    lines.push(field.label === undefined ? { value } : { label: field.label, value });
  }

  const base: StructuredItem = { label, extraUrls: urlValues.slice(1), lines };
  return urlValues.length > 0 ? { ...base, labelUrl: urlValues[0] as string } : base;
}

/**
 * Metadato técnico, sin prosa traducible (T5): el idioma del informe lo declara la receta, y esta
 * línea tiene la misma forma en cualquier idioma. Solo aparece cuando hay algo degradado que contar.
 */
export function buildStatusLine(report: Report): string | undefined {
  if (report.meta.degraded.length === 0) {
    return undefined;
  }

  const { health, sourcesOk, sourcesFailed, provider, providerWasFallback } = report.meta;
  const totalSources = sourcesOk + sourcesFailed;
  const providerPart = providerWasFallback ? `${provider} (fallback)` : provider;

  return (
    `⚠ chronorium · runs ${health.runsOk}/${health.windowDays} · ` +
    `sources ${sourcesOk}/${totalSources} · provider ${providerPart}`
  );
}
