import type { RenderedReport } from '../render/types.ts';
import type { DeliverContext, Notifier, NotifierConfig } from './types.ts';

/** Sin credencial: la URL es dominio del operador y va en la receta (D3). Demuestra que el
 * contrato `Notifier` funciona también sin ningún secreto de por medio. */
export const webhookNotifier: Notifier = {
  id: 'webhook',
  requiredSecrets: [],
  async send(rendered: RenderedReport, cfg: NotifierConfig, ctx: DeliverContext): Promise<void> {
    const url = typeof cfg.url === 'string' ? cfg.url : undefined;
    if (url === undefined) {
      throw new Error('el canal "webhook" exige "url" declarada en la receta');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      const response = await ctx.fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: rendered.json,
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`webhook respondió con estado ${response.status}`);
      }
    } finally {
      clearTimeout(timeout);
    }
  },
};
