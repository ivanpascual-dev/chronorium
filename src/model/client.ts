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
  });

  return result.output;
}

const GOOGLE_API_KEY_ENV_VAR = 'GOOGLE_GENERATIVE_AI_API_KEY';

/**
 * Construye el modelo de Google para uso real. La credencial se lee solo del entorno (R3): si
 * falta, falla en voz alta aquí, antes de componer ningún prompt.
 */
export async function googleModel(modelId: string): Promise<LanguageModel> {
  if (!process.env[GOOGLE_API_KEY_ENV_VAR]) {
    throw new Error(`falta la variable de entorno ${GOOGLE_API_KEY_ENV_VAR}`);
  }

  const { google } = await import('@ai-sdk/google');
  return google(modelId);
}
