import type { ReadContext } from './types.ts';

export interface HttpResponse {
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}

/**
 * Punto único de red de los lectores (R10): identificador de cliente propio en toda petición
 * (RF-B08) y tiempo de espera por fuente, con `AbortController` inyectable vía `ctx.fetch`.
 */
export async function fetchWithTimeout(
  url: string,
  ctx: ReadContext,
  extraHeaders: Record<string, string> = {},
): Promise<HttpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ctx.timeoutMs);

  try {
    return await ctx.fetch(url, {
      headers: { 'User-Agent': ctx.userAgent, ...extraHeaders },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
