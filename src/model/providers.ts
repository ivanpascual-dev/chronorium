import type { LanguageModel } from 'ai';
import type { ProviderSpec } from '../recipe/types.ts';

export interface ProviderFactory {
  readonly defaultApiKeyEnv: string;
  create(spec: ProviderSpec, apiKey: string): Promise<LanguageModel>;
}

async function createGoogleModel(spec: ProviderSpec, apiKey: string): Promise<LanguageModel> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
  return createGoogleGenerativeAI({ apiKey })(spec.id);
}

/**
 * La API de OpenAI para sus modelos de razonamiento (o1/o3/gpt-5.x vía `v1/chat/completions`)
 * rechaza `max_tokens` (exige `max_completion_tokens`) y cualquier `temperature` distinta de la
 * suya por defecto. El conector genérico `openai-compatible` no lo sabe, ni le corresponde saberlo
 * por inspección del identificador (D-03): se traduce aquí solo cuando la receta declara
 * `reasoningModel: true` en ese eslabón.
 */
export function reasoningModelBody(
  body: Record<string, unknown>,
  reasoningEffort: ProviderSpec['reasoningEffort'],
): Record<string, unknown> {
  const { max_tokens, temperature: _temperature, ...rest } = body;
  return {
    ...rest,
    ...(max_tokens !== undefined ? { max_completion_tokens: max_tokens } : {}),
    ...(reasoningEffort !== undefined ? { reasoning_effort: reasoningEffort } : {}),
  };
}

async function createOpenAiCompatibleModel(
  spec: ProviderSpec,
  apiKey: string,
): Promise<LanguageModel> {
  if (!spec.baseUrl) {
    throw new Error(
      `el proveedor "openai-compatible" (id "${spec.id}") exige "baseUrl" en la receta`,
    );
  }
  const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible');
  return createOpenAICompatible({
    name: spec.provider,
    apiKey,
    baseURL: spec.baseUrl,
    // Sin esto, el SDK pide `json_object` en vez de `json_schema` con `strict: true`: el modo
    // débil, que exige la palabra "json" en el mensaje y no garantiza el esquema. Es la propiedad
    // que el T0 de la fase 3 verificó (ADR-009); sin activarla aquí, esa verificación no llegaba a
    // la llamada real.
    supportsStructuredOutputs: true,
    ...(spec.reasoningModel === true
      ? {
          transformRequestBody: (body: Record<string, unknown>) =>
            reasoningModelBody(body, spec.reasoningEffort),
        }
      : {}),
  })(spec.id);
}

export type ProviderRegistry = ReadonlyMap<string, ProviderFactory>;

const builtinProviders: ReadonlyMap<string, ProviderFactory> = new Map([
  ['google', { defaultApiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', create: createGoogleModel }],
  [
    'openai-compatible',
    { defaultApiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY', create: createOpenAiCompatibleModel },
  ],
]);

/** Los dos proveedores de fábrica, seleccionables solo por `provider` declarado (D-03, ADR-012). */
export const defaultProviderRegistry: ProviderRegistry = builtinProviders;
