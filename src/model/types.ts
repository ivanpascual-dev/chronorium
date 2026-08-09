import type { ProviderSpec } from '../recipe/types.ts';

export type { ProviderSpec };

export type FailureClass = 'retryable' | 'provider-fatal';

/** Por qué un proveedor no produjo el informe (RF-D06), lo que fase 4 escribe en `runs.ndjson`. */
export interface ProviderAttempt {
  readonly provider: string;
  readonly id: string;
  readonly outcome: 'ok' | 'skipped' | 'failed';
  /** Nunca contiene el valor de una credencial, ni completo ni parcial (A4). */
  readonly reason?: string;
  readonly attempts: number;
}

export interface SynthesisResult {
  /** Ya validado contra el esquema derivado y con los enlaces ya saneados (T7, T10). */
  readonly report: unknown;
  readonly provider: string;
  /** RF-D07: si lo generó un proveedor de respaldo, se ve en el informe, no solo en el registro. */
  readonly providerWasFallback: boolean;
  readonly providersTried: readonly ProviderAttempt[];
  /** RF-E03: enlaces de la salida ausentes del conjunto de entrada, descartados. */
  readonly linksDropped: number;
}

export interface ChainDiscard {
  readonly spec: ProviderSpec;
  readonly reason: string;
}

/** Diagnóstico de la validación, sin red. Lo consumen `validate` y `doctor` (fase 4). */
export interface ChainDiagnosis {
  readonly usable: readonly ProviderSpec[];
  readonly discarded: readonly ChainDiscard[];
  /** El aviso de punto único de fallo vive aquí (R9). */
  readonly warnings: readonly string[];
}
