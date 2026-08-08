import type { FetchLike, ReadContext } from '../../src/sources/types.ts';

export function makeCtx(fetchImpl: FetchLike, overrides: Partial<ReadContext> = {}): ReadContext {
  return {
    now: new Date('2026-08-08T00:00:00.000Z'),
    fetch: fetchImpl,
    timeoutMs: 2000,
    userAgent: 'chronorium-test/1.0 (+https://example.com)',
    dataRoot: '/tmp/chronorium-test-no-usado',
    windowDays: 30,
    secret: () => undefined,
    ...overrides,
  };
}

export function jsonResponse(
  body: unknown,
  status = 200,
): {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
} {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(body) };
}

export function textResponse(
  body: string,
  status = 200,
): {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
} {
  return { ok: status >= 200 && status < 300, status, text: async () => body };
}
