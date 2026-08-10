import type { DeliverContext, FetchLike } from '../../src/deliver/types.ts';
import type { RenderedReport, Report } from '../../src/render/types.ts';

export function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 2,
    recipe: 'daily',
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    sections: [{ key: 'top', title: 'Lo más relevante', items: [{ title: 'Uno' }] }],
    meta: {
      provider: 'google',
      providerWasFallback: false,
      itemsCollected: 1,
      itemsAnalyzed: 1,
      sourcesOk: 1,
      sourcesFailed: 0,
      linksDropped: 0,
      health: { windowDays: 30, runsOk: 30, runsFailed: 0 },
      degraded: [],
    },
    ...overrides,
  };
}

export function makeRendered(overrides: Partial<RenderedReport> = {}): RenderedReport {
  const report = overrides.report ?? makeReport();
  return {
    report,
    subject: 'daily · 2026-08-09',
    markdown: '## Lo más relevante\n\n**Uno**',
    html: '<!doctype html><html><body><h2>Lo más relevante</h2></body></html>',
    json: JSON.stringify(report),
    ...overrides,
  };
}

export function makeCtx(
  fetchImpl: FetchLike,
  overrides: Partial<DeliverContext> = {},
): DeliverContext {
  return {
    secret: () => undefined,
    fetch: fetchImpl,
    timeoutMs: 2000,
    ...overrides,
  };
}

export function neverFetch(): FetchLike {
  return async () => {
    throw new Error('no debía llamarse a fetch en este test');
  };
}
