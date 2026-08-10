import type { RenderedReport } from '../render/types.ts';

/**
 * Distinto del `FetchLike` de `sources/types.ts` (RF-B08): los lectores solo hacen `GET`, los
 * notificadores de esta capa (telegram, webhook) mandan `POST` con cuerpo. Mínimo deliberado, igual
 * que el de `sources/`: lo justo para doblarlo en un test sin arrastrar tipos del entorno.
 */
export type FetchLike = (
  url: string,
  init: {
    readonly method: string;
    readonly headers: Record<string, string>;
    readonly body: string;
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export interface NotifierConfig {
  readonly id: string;
  readonly enabled: boolean;
  /** Campos propios del canal, misma bolsa abierta que `SourceSpec` y por el mismo motivo. */
  readonly [key: string]: unknown;
}

export interface DeliverContext {
  readonly secret: (name: string) => string | undefined;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
}

export interface Notifier {
  readonly id: string;
  readonly requiredSecrets: readonly string[];
  send(rendered: RenderedReport, cfg: NotifierConfig, ctx: DeliverContext): Promise<void>;
}

export interface DeliveryResult {
  readonly id: string;
  readonly ok: boolean;
  /** Nunca contiene el valor de una credencial, ni completo ni parcial (A4). */
  readonly error?: string;
  readonly durationMs: number;
}
