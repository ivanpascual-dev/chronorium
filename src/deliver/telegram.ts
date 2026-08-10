import type { RenderedReport } from '../render/types.ts';
import { redactSecrets } from './secrets.ts';
import type { DeliverContext, Notifier, NotifierConfig } from './types.ts';

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Notificador de ejemplo, desactivado por defecto (ADR-011): demuestra que el contrato `Notifier`
 * funciona con una credencial de bot, forma distinta de la de correo (aplicación) y de webhook
 * (ninguna). */
export const telegramNotifier: Notifier = {
  id: 'telegram',
  requiredSecrets: ['TELEGRAM_BOT_TOKEN'],
  async send(rendered: RenderedReport, cfg: NotifierConfig, ctx: DeliverContext): Promise<void> {
    const token = ctx.secret('TELEGRAM_BOT_TOKEN');
    if (token === undefined) {
      throw new Error('falta la credencial "TELEGRAM_BOT_TOKEN"');
    }
    const chatId = typeof cfg.chatId === 'string' ? cfg.chatId : undefined;
    if (chatId === undefined) {
      throw new Error('el canal "telegram" exige "chatId" declarado en la receta');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ctx.timeoutMs);
    try {
      const response = await ctx.fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: rendered.markdown }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`telegram respondió con estado ${response.status}`);
      }
    } catch (cause) {
      // El token viaja en la URL: cualquier error de red que la incluya (p. ej. de un `fetch` real)
      // no debe propagar la credencial (A4).
      throw new Error(redactSecrets(errorMessage(cause), [token]));
    } finally {
      clearTimeout(timeout);
    }
  },
};
