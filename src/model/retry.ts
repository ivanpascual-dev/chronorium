import { APICallError } from 'ai';
import type { FailureClass } from './types.ts';

function isTimeoutOrAbort(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'AbortError' ||
      error.name === 'TimeoutError' ||
      error.name === 'ResponseAborted')
  );
}

/**
 * Clasifica un fallo del proveedor en recuperable o fatal (ADR-009, RF-D02/RF-D03), a partir de lo
 * que el propio error del SDK ya sabe (`isRetryable`), sin adivinar por el texto del mensaje.
 */
export function classifyError(error: unknown): FailureClass {
  if (APICallError.isInstance(error)) {
    return error.isRetryable ? 'retryable' : 'provider-fatal';
  }
  if (isTimeoutOrAbort(error)) {
    return 'retryable';
  }
  return 'provider-fatal';
}

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  /** Inyectado: la lógica nunca llama a `setTimeout` directamente (R13, tests deterministas). */
  readonly sleep: (ms: number) => Promise<void>;
}

export interface RetryOutcome<T> {
  readonly value: T;
  readonly attempts: number;
}

/** Se agotaron los intentos, o el primero fue fatal. Lleva la cuenta de intentos y la causa. */
export class RetryError extends Error {
  readonly attempts: number;

  constructor(attempts: number, cause: unknown) {
    const causeMessage = cause instanceof Error ? cause.message : String(cause);
    super(`se abandona tras ${attempts} intento(s): ${causeMessage}`, { cause });
    this.name = 'RetryError';
    this.attempts = attempts;
  }
}

/**
 * Reintenta `fn` solo mientras `classifyError` diga que el fallo es recuperable. Un error de
 * cliente que no sea 429 se abandona en el primer intento (RF-D02). La espera entre intentos
 * crece y está acotada por `maxDelayMs` (RF-D03).
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<RetryOutcome<T>> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      const value = await fn();
      return { value, attempts: attempt };
    } catch (error) {
      const isLastAttempt = attempt >= options.maxAttempts;
      if (classifyError(error) !== 'retryable' || isLastAttempt) {
        throw new RetryError(attempt, error);
      }
      const delay = Math.min(options.baseDelayMs * 2 ** (attempt - 1), options.maxDelayMs);
      await options.sleep(delay);
    }
  }

  throw new RetryError(0, new Error('maxAttempts debe ser al menos 1'));
}
