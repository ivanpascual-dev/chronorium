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
  readonly providersTried?: readonly string[];
  readonly delivery?: readonly { readonly id: string; readonly ok: boolean }[];
  readonly lastError?: string;
}
