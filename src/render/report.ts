import type { RecipeConfig } from '../recipe/types.ts';
import type { DegradedFlag, Report, ReportHealth, ReportMeta, ReportSection } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Solo conserva los campos de texto: la salida del modelo ya está validada contra el esquema
 * derivado (cada campo declarado es `string`) antes de llegar aquí (T7 de la fase 3). */
function toStringItem(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    return {};
  }
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string') {
      out[key] = value;
    }
  }
  return out;
}

export interface BuildReportOptions {
  readonly recipe: RecipeConfig;
  readonly date: string;
  readonly generatedAt: string;
  /** `SynthesisResult.report`, ya validado contra el esquema y con los enlaces ya saneados. */
  readonly modelOutput: unknown;
  readonly provider: string;
  readonly providerWasFallback: boolean;
  readonly linksDropped: number;
  readonly itemsCollected: number;
  readonly itemsAnalyzed: number;
  readonly sourcesOk: number;
  readonly sourcesFailed: number;
  readonly health: ReportHealth;
}

function computeDegraded(options: BuildReportOptions): DegradedFlag[] {
  const flags: DegradedFlag[] = [];

  if (options.providerWasFallback) {
    flags.push('fallback-provider');
  }

  const totalSources = options.sourcesOk + options.sourcesFailed;
  if (
    totalSources > 0 &&
    options.sourcesFailed / totalSources > options.recipe.health.sourceFailureThreshold
  ) {
    flags.push('sources-below-threshold');
  }

  const totalRuns = options.health.runsOk + options.health.runsFailed;
  if (
    totalRuns > 0 &&
    options.health.runsFailed / totalRuns > options.recipe.health.runFailureThreshold
  ) {
    flags.push('runs-below-threshold');
  }

  return flags;
}

/**
 * Única función que convierte la salida del modelo en `Report` (R10). No escapa nada: el `Report`
 * canónico guarda el texto tal cual, cada renderizador lo escapa a su manera (contrato de la fase).
 */
export function buildReport(options: BuildReportOptions): Report {
  const modelRecord = isRecord(options.modelOutput) ? options.modelOutput : {};

  const sections: ReportSection[] = [];
  for (const section of options.recipe.sections) {
    const raw = modelRecord[section.key];
    const rawItems =
      section.cardinality === 'one'
        ? raw === undefined
          ? []
          : [raw]
        : Array.isArray(raw)
          ? raw
          : [];
    const items = rawItems.map(toStringItem);

    if (section.condition === 'non-empty' && items.length === 0) {
      continue;
    }
    sections.push({ key: section.key, title: section.title, items });
  }

  const meta: ReportMeta = {
    provider: options.provider,
    providerWasFallback: options.providerWasFallback,
    itemsCollected: options.itemsCollected,
    itemsAnalyzed: options.itemsAnalyzed,
    sourcesOk: options.sourcesOk,
    sourcesFailed: options.sourcesFailed,
    linksDropped: options.linksDropped,
    health: options.health,
    degraded: computeDegraded(options),
  };

  return {
    schemaVersion: 2,
    recipe: options.recipe.name,
    date: options.date,
    generatedAt: options.generatedAt,
    sections,
    meta,
  };
}

/** `recipe.subject` con `{recipe}` y `{date}` sustituidos si está declarado; si no, un formato que
 * no es prosa (T5), para no meter dominio traducible en el mecanismo. */
export function buildSubject(recipe: RecipeConfig, report: Report): string {
  if (recipe.subject !== undefined) {
    return recipe.subject.replaceAll('{recipe}', report.recipe).replaceAll('{date}', report.date);
  }
  return `${report.recipe} · ${report.date}`;
}
