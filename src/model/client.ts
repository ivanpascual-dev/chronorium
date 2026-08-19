import { generateText, type LanguageModel, Output } from 'ai';
import type { DerivedSchema } from '../recipe/schema.ts';
import { wrapForGeneration } from '../recipe/schema.ts';

const DEFAULT_TEMPERATURE = 0.2;
const DEFAULT_MAX_OUTPUT_TOKENS = 4096;

export interface GenerateReportOptions {
  readonly model: LanguageModel;
  readonly prompt: string;
  readonly derived: DerivedSchema;
  readonly temperature?: number;
  readonly maxOutputTokens?: number;
}

/**
 * Único punto del proyecto que habla con un modelo (R10). La cadena de proveedores, el
 * reintento y el aviso de punto único de fallo son la fase 3 y envuelven a esta función, no la
 * duplican.
 */
export async function generateReport(options: GenerateReportOptions): Promise<unknown> {
  const schema = wrapForGeneration(options.derived);

  const result = await generateText({
    model: options.model,
    prompt: options.prompt,
    output: Output.object({ schema }),
    temperature: options.temperature ?? DEFAULT_TEMPERATURE,
    maxOutputTokens: options.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    // Una sola capa de reintento: la nuestra (src/model/retry.ts, ADR-009). El reintento por
    // defecto del SDK no distingue un 401 permanente de un 503 pasajero, y las dos capas juntas
    // reintentarían el error que la de fuera se niega a reintentar. No lo "arregles" subiendo este
    // número: es deliberado.
    maxRetries: 0,
  });

  // Si el modelo no terminó con "stop" (se quedó sin tokens de salida, un filtro de contenido lo
  // cortó...), el SDK deja `result.output` vacío y el acceso de abajo lanzaría un error genérico
  // sin motivo ("No output generated."). Se intercepta aquí para que el motivo real llegue al
  // registro de ejecuciones (RF-G05, R9): sin esto, "se acabaron los tokens de salida" y "el
  // proveedor rechazó la petición" son indistinguibles en runs.ndjson.
  if (result.finishReason !== 'stop') {
    throw new Error(
      `el modelo terminó con motivo "${result.finishReason}" antes de completar la salida ` +
        `(tokens de salida usados: ${result.usage.outputTokens ?? 'desconocido'})`,
    );
  }

  return result.output;
}
