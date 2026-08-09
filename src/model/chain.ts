import type { ModelConfig, ProviderSpec } from '../recipe/types.ts';
import { defaultProviderRegistry, type ProviderRegistry } from './providers.ts';
import type { RetryOptions } from './retry.ts';
import { RetryError, withRetry } from './retry.ts';
import type { ChainDiagnosis, ChainDiscard, ProviderAttempt } from './types.ts';

/**
 * Coincidencia exacta contra este conjunto (sin distinguir mayúsculas, sin espacios alrededor),
 * más vacío o solo espacios (RF-D05). Documentado en `docs/05-seguridad-legal.md`: es el texto que
 * la documentación le dice al desconocido que escriba, y el que este código rechaza.
 */
export const PLACEHOLDER_CREDENTIALS: ReadonlySet<string> = new Set([
  'tu_api_key_aqui',
  'your_api_key_here',
  'changeme',
  'replace_with_your_key',
  'xxxxxxxx',
]);

function isPlaceholderCredential(value: string): boolean {
  return PLACEHOLDER_CREDENTIALS.has(value.trim().toLowerCase());
}

export interface DiagnoseChainOptions {
  readonly secret: (name: string) => string | undefined;
  readonly registry?: ProviderRegistry;
}

/**
 * Valida la cadena declarada en la receta, sin red (ADR-009): descarta lo que no tiene credencial
 * utilizable, cuenta los eslabones vivos y avisa si es uno solo (RF-D04). `model` es el principal;
 * `model.fallbacks` sigue en orden.
 */
export function diagnoseChain(model: ModelConfig, options: DiagnoseChainOptions): ChainDiagnosis {
  const registry = options.registry ?? defaultProviderRegistry;
  const specs: readonly ProviderSpec[] = [model, ...(model.fallbacks ?? [])];

  const usable: ProviderSpec[] = [];
  const discarded: ChainDiscard[] = [];

  for (const spec of specs) {
    const factory = registry.get(spec.provider);
    if (!factory) {
      discarded.push({ spec, reason: `proveedor desconocido "${spec.provider}"` });
      continue;
    }

    const apiKeyEnv = spec.apiKeyEnv ?? factory.defaultApiKeyEnv;
    const value = options.secret(apiKeyEnv);

    if (value === undefined || value.trim().length === 0) {
      discarded.push({
        spec,
        reason: `credencial ausente: la variable "${apiKeyEnv}" no está en el entorno`,
      });
      continue;
    }

    if (isPlaceholderCredential(value)) {
      discarded.push({
        spec,
        reason: `la variable "${apiKeyEnv}" contiene un marcador de posición documentado, no una credencial real`,
      });
      continue;
    }

    usable.push(spec);
  }

  const warnings: string[] = [];
  const only = usable.length === 1 ? usable[0] : undefined;
  if (only) {
    warnings.push(
      `un solo proveedor de modelo vivo (${only.provider}/${only.id}): es un punto único de fallo`,
    );
  }

  return { usable, discarded, warnings };
}

export interface ChainRunOutcome<T> {
  readonly value: T;
  readonly provider: ProviderSpec;
  readonly wasFallback: boolean;
  readonly providersTried: readonly ProviderAttempt[];
}

/** La cadena no tiene ningún proveedor con credencial utilizable: fallo de configuración (código 1). */
export class ChainConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ChainConfigurationError';
  }
}

/** Se agotó la cadena entera sin producir un informe: fallo de modelo (código 3). */
export class NoProviderSucceededError extends Error {
  readonly providersTried: readonly ProviderAttempt[];

  constructor(providersTried: readonly ProviderAttempt[]) {
    super('ningún proveedor de la cadena pudo generar el informe');
    this.name = 'NoProviderSucceededError';
    this.providersTried = providersTried;
  }
}

function describeFailure(error: unknown): string {
  if (error instanceof RetryError) {
    return error.cause instanceof Error ? error.cause.message : String(error.cause);
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Recorre `diagnosis.usable` en orden, reintentando cada uno con `retry` (RF-D03) y abandonándolo
 * de inmediato ante un error de cliente que no sea 429 (RF-D02). Se detiene en el primer éxito; si
 * la cadena entera falla, lanza `NoProviderSucceededError` con lo que se intentó y por qué se
 * descartó cada uno (RF-D06), incluidos los proveedores que ni se intentaron (`outcome: 'skipped'`).
 */
export async function runChain<T>(
  diagnosis: ChainDiagnosis,
  attempt: (spec: ProviderSpec) => Promise<T>,
  retry: RetryOptions,
): Promise<ChainRunOutcome<T>> {
  if (diagnosis.usable.length === 0) {
    throw new ChainConfigurationError(
      'ningún proveedor de la cadena tiene una credencial utilizable',
    );
  }

  const providersTried: ProviderAttempt[] = diagnosis.discarded.map((discard) => ({
    provider: discard.spec.provider,
    id: discard.spec.id,
    outcome: 'skipped',
    reason: discard.reason,
    attempts: 0,
  }));

  for (const [index, spec] of diagnosis.usable.entries()) {
    try {
      const { value, attempts } = await withRetry(() => attempt(spec), retry);
      providersTried.push({ provider: spec.provider, id: spec.id, outcome: 'ok', attempts });
      return { value, provider: spec, wasFallback: index > 0, providersTried };
    } catch (error) {
      const attempts = error instanceof RetryError ? error.attempts : 1;
      providersTried.push({
        provider: spec.provider,
        id: spec.id,
        outcome: 'failed',
        reason: describeFailure(error),
        attempts,
      });
    }
  }

  throw new NoProviderSucceededError(providersTried);
}
