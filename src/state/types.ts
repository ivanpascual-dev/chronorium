export type RunResult =
  | 'ok'
  | 'skipped_existing'
  | 'no_items'
  | 'model_failed'
  | 'delivery_failed'
  | 'config_error';

export interface RunRecord {
  readonly ts: string;
  readonly recipe: string;
  readonly result: RunResult;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly provider?: string;
  readonly fallback?: boolean;
  readonly itemsCollected?: number;
  readonly sources?: { readonly ok: number; readonly failed: number };
  /** Solo los proveedores **descartados**, cada uno con su porqué (RF-D06): el que produjo el
   * informe ya está en `provider`. Guardar aquí solo el nombre haría del registro una lista de
   * quién pasó por delante, sin decir de qué se libró uno. */
  readonly providersTried?: readonly {
    readonly provider: string;
    readonly id: string;
    readonly outcome: 'ok' | 'skipped' | 'failed';
    readonly reason?: string;
    readonly attempts: number;
  }[];
  /** El identificador de cada fuente caída, con su causa. `sources: {ok, failed}` cuenta; esto
   * nombra, que es lo que hace falta para ver que siempre es la misma la que se cae. */
  readonly sourcesFailedDetail?: readonly {
    readonly id: string;
    readonly error: string;
  }[];
  /** `error` y `durationMs` solo aparecen en el canal que falló, y son el equivalente de
   * `lastError`/`providersTried` para la entrega: sin ellos, "delivery_failed" es un código sin
   * causa y hay que reproducir el fallo a mano para saber qué pasó. El mensaje ya viene con los
   * secretos tachados desde el propio notificador (`deliver/secrets.ts`). */
  readonly delivery?: readonly {
    readonly id: string;
    readonly ok: boolean;
    readonly error?: string;
    readonly durationMs?: number;
  }[];
  readonly lastError?: string;
}
