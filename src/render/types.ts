import type { SectionSpec } from '../recipe/types.ts';

export interface ReportSection {
  readonly key: string;
  readonly title: string;
  /** Cardinalidad `one` ⇒ exactamente un elemento. La forma es la misma para no bifurcar. */
  readonly items: readonly Record<string, string>[];
}

export interface ReportHealth {
  readonly windowDays: number;
  readonly runsOk: number;
  readonly runsFailed: number;
}

export interface ReportMeta {
  readonly provider: string;
  readonly providerWasFallback: boolean;
  readonly itemsCollected: number;
  readonly itemsAnalyzed: number;
  readonly sourcesOk: number;
  readonly sourcesFailed: number;
  readonly linksDropped: number;
  readonly health: ReportHealth;
  /** Condiciones degradadas de esta ejecución (RF-G02, RF-G05), en tokens, no en prosa. */
  readonly degraded: readonly DegradedFlag[];
}

export type DegradedFlag = 'fallback-provider' | 'sources-below-threshold' | 'runs-below-threshold';

export interface Report {
  readonly schemaVersion: 2;
  readonly recipe: string;
  readonly date: string; // YYYY-MM-DD
  readonly generatedAt: string; // ISO 8601
  readonly sections: readonly ReportSection[];
  readonly meta: ReportMeta;
}

export type RenderFormat = 'json' | 'markdown' | 'email';

export interface Renderer {
  readonly format: RenderFormat;
  /** Recibe la declaración de secciones. No conoce ninguna clave concreta (R12). */
  render(report: Report, sections: readonly SectionSpec[]): string;
}

/** Lo que recibe un notificador: el mismo informe en las tres formas, ya renderizado una sola vez. */
export interface RenderedReport {
  readonly report: Report;
  readonly subject: string;
  readonly markdown: string;
  readonly html: string;
  readonly json: string;
}
