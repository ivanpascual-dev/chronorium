import type { RenderedReport } from '../render/types.ts';
import { emailNotifier } from './email.ts';
import { telegramNotifier } from './telegram.ts';
import type { DeliverContext, DeliveryResult, Notifier, NotifierConfig } from './types.ts';
import { webhookNotifier } from './webhook.ts';

export type NotifierRegistry = ReadonlyMap<string, Notifier>;

const builtinNotifiers: readonly Notifier[] = [emailNotifier, telegramNotifier, webhookNotifier];

export function buildNotifierRegistry(
  notifiers: readonly Notifier[] = builtinNotifiers,
): NotifierRegistry {
  const map = new Map<string, Notifier>();
  for (const notifier of notifiers) {
    map.set(notifier.id, notifier);
  }
  return map;
}

/** Los tres notificadores de fábrica (`email`, `telegram`, `webhook`), seleccionables solo por
 * `id` declarado en la receta, nunca por inspección de nada (mismo patrón que `sources/registry.ts`
 * y `model/providers.ts`, R10). */
export const defaultNotifierRegistry: NotifierRegistry = buildNotifierRegistry();

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

export interface DeliverOptions {
  readonly channels: readonly NotifierConfig[];
  readonly rendered: RenderedReport;
  readonly ctx: DeliverContext;
  readonly registry?: NotifierRegistry;
}

export interface DeliverOutcome {
  readonly results: readonly DeliveryResult[];
  /** `true` si al menos un canal activo tuvo éxito, o si no había ninguno declarado activo: un
   * informe archivado ya es un informe entregado (T12, RF-B04/RF-H04). */
  readonly ok: boolean;
}

/**
 * Única capacidad de "entregar un informe ya renderizado" (R10, RF-F06). Recorre los canales
 * **declarados** en la receta, por su `id`, contra el registro (RF-F03): un canal desconocido es
 * un error de receta, no un salto silencioso. Un canal con `enabled: false` no se intenta. Un canal
 * que falla no detiene los demás (RF-F04): el resultado agregado lleva el detalle por canal, nunca
 * solo un booleano. Un canal no reintenta (el reintento es de `model/retry.ts`, para el modelo).
 */
export async function deliver(options: DeliverOptions): Promise<DeliverOutcome> {
  const registry = options.registry ?? defaultNotifierRegistry;
  const enabledChannels = options.channels.filter((channel) => channel.enabled);
  const results: DeliveryResult[] = [];

  for (const channelCfg of enabledChannels) {
    const notifier = registry.get(channelCfg.id);
    if (!notifier) {
      throw new Error(`canal de entrega desconocido: "${channelCfg.id}"`);
    }

    const start = Date.now();
    try {
      await notifier.send(options.rendered, channelCfg, options.ctx);
      results.push({ id: channelCfg.id, ok: true, durationMs: Date.now() - start });
    } catch (cause) {
      results.push({
        id: channelCfg.id,
        ok: false,
        error: errorMessage(cause),
        durationMs: Date.now() - start,
      });
    }
  }

  return { results, ok: enabledChannels.length === 0 || results.some((result) => result.ok) };
}
