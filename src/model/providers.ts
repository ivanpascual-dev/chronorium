import { defaultSettingsMiddleware, type LanguageModel, wrapLanguageModel } from 'ai';
import type { ProviderSpec, ReasoningEffort } from '../recipe/types.ts';

export interface ProviderFactory {
  readonly defaultApiKeyEnv: string;
  create(spec: ProviderSpec, apiKey: string): Promise<LanguageModel>;
}

/** Cómo traduce cada proveedor el mismo `reasoningEffort` declarado en la receta a su propia
 * convención (verificado contra ai-sdk.dev): pura, sin red, para poder probarla directamente. */
export function openAiReasoningOptions(reasoningEffort: ReasoningEffort) {
  return { openai: { reasoningEffort } };
}

/** Gemini 3 y posteriores llaman a esto "nivel de pensamiento", no "esfuerzo de razonamiento", pero
 * son los mismos cuatro valores (`minimal | low | medium | high`): un mismo campo de dominio,
 * traducido distinto por proveedor (Gemini 2.5 usa `thinkingBudget` en tokens en su lugar; no
 * aplica a los modelos de la familia Gemini 3 que declara este proyecto). */
export function googleReasoningOptions(reasoningEffort: ReasoningEffort) {
  return { google: { thinkingConfig: { thinkingLevel: reasoningEffort } } };
}

async function createGoogleModel(spec: ProviderSpec, apiKey: string): Promise<LanguageModel> {
  const { createGoogleGenerativeAI } = await import('@ai-sdk/google');
  const model = createGoogleGenerativeAI({ apiKey })(spec.id);

  if (spec.reasoningEffort === undefined) {
    return model;
  }

  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: googleReasoningOptions(spec.reasoningEffort) },
    }),
  });
}

/**
 * Paquete oficial: la Responses API ya traduce `max_tokens`→`max_completion_tokens` y omite
 * `temperature` para modelos de razonamiento por sí sola (verificado contra su código fuente,
 * ver ADR-018). Solo hace falta declarar `reasoningEffort`, y solo se pasa como `providerOptions`
 * en la llamada, nunca al construir el modelo: `defaultSettingsMiddleware` lo fija por defecto sin
 * que `client.ts`/`chain.ts` tengan que conocer detalles de proveedor.
 */
async function createOpenAiModel(spec: ProviderSpec, apiKey: string): Promise<LanguageModel> {
  const { createOpenAI } = await import('@ai-sdk/openai');
  const model = createOpenAI({ apiKey }).responses(spec.id);

  if (spec.reasoningEffort === undefined) {
    return model;
  }

  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: openAiReasoningOptions(spec.reasoningEffort) },
    }),
  });
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
  })(spec.id);
}

export type ProviderRegistry = ReadonlyMap<string, ProviderFactory>;

const builtinProviders: ReadonlyMap<string, ProviderFactory> = new Map([
  ['google', { defaultApiKeyEnv: 'GOOGLE_GENERATIVE_AI_API_KEY', create: createGoogleModel }],
  ['openai', { defaultApiKeyEnv: 'OPENAI_API_KEY', create: createOpenAiModel }],
  [
    'openai-compatible',
    { defaultApiKeyEnv: 'OPENAI_COMPATIBLE_API_KEY', create: createOpenAiCompatibleModel },
  ],
]);

/** Los tres proveedores de fábrica, seleccionables solo por `provider` declarado (D-03, ADR-012).
 * `openai-compatible` se queda como vía genérica declarada para quien prefiera otro proveedor
 * remoto compatible (DeepSeek, Groq, OpenRouter) o un modelo local, sin que el código lo sepa. */
export const defaultProviderRegistry: ProviderRegistry = builtinProviders;
