import type { RunResult } from '../state/types.ts';

/**
 * Los cinco códigos de salida de `docs/02-arquitectura.md`, en un solo sitio (R10): a partir de
 * esta fase son API pública, la fase 5 los lee desde el workflow.
 */
export const EXIT_OK = 0;
export const EXIT_CONFIG_ERROR = 1;
export const EXIT_NO_ITEMS = 2;
export const EXIT_MODEL_FAILED = 3;
export const EXIT_DELIVERY_FAILED = 4;

export type ExitCode =
  | typeof EXIT_OK
  | typeof EXIT_CONFIG_ERROR
  | typeof EXIT_NO_ITEMS
  | typeof EXIT_MODEL_FAILED
  | typeof EXIT_DELIVERY_FAILED;

/** `skipped_existing` sale con `0`: el workflow relanzado sobre un día ya sano no es un fallo (R6
 * habla de fallos, y este no lo es), y no debe generar una alarma falsa cada vez que se reintenta. */
export function exitCodeFor(result: RunResult): ExitCode {
  switch (result) {
    case 'ok':
    case 'skipped_existing':
      return EXIT_OK;
    case 'config_error':
      return EXIT_CONFIG_ERROR;
    case 'no_items':
      return EXIT_NO_ITEMS;
    case 'model_failed':
      return EXIT_MODEL_FAILED;
    case 'delivery_failed':
      return EXIT_DELIVERY_FAILED;
  }
}
