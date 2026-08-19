import { deriveSections } from '../recipe/schema.ts';
import type { RecipeConfig } from '../recipe/types.ts';
import type { Item } from '../sources/types.ts';
import { diagnoseChain, runChain } from './chain.ts';
import { generateReport } from './client.ts';
import { validateLinks } from './links.ts';
import { composePrompt } from './prompt.ts';
import { defaultProviderRegistry, type ProviderRegistry } from './providers.ts';
import type { RetryOptions } from './retry.ts';
import type { SynthesisResult } from './types.ts';

const DEFAULT_RETRY: RetryOptions = {
  maxAttempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export interface SynthesizeOptions {
  readonly recipe: RecipeConfig;
  readonly items: readonly Item[];
  /** Inyectado (R3, R13): en producción lee `process.env`, en test nunca lo toca. */
  readonly secret: (name: string) => string | undefined;
  readonly registry?: ProviderRegistry;
  readonly retry?: Partial<RetryOptions>;
}

/**
 * Única capacidad de "producir un informe validado" (R10, RF-F06): valida la cadena, recorre sus
 * proveedores con reintento, valida la salida contra el esquema (dentro de `generateReport`) y
 * sanea los enlaces contra `items`, en ese orden exacto. No existe otro camino a un
 * `SynthesisResult`: quien necesite un informe pasa por aquí.
 */
export async function synthesize(options: SynthesizeOptions): Promise<SynthesisResult> {
  const derivedResult = deriveSections(options.recipe.sections);
  if (!derivedResult.ok) {
    const detail = derivedResult.issues
      .map((issue) => `${issue.campo}: ${issue.motivo}`)
      .join('; ');
    throw new Error(`la receta no deriva un esquema válido: ${detail}`);
  }
  const derived = derivedResult.value;

  const registry = options.registry ?? defaultProviderRegistry;
  const diagnosis = diagnoseChain(options.recipe.model, { secret: options.secret, registry });
  const prompt = composePrompt(options.recipe, options.items);
  const retry: RetryOptions = { ...DEFAULT_RETRY, ...options.retry };

  const outcome = await runChain(
    diagnosis,
    async (spec) => {
      const factory = registry.get(spec.provider);
      if (!factory) {
        throw new Error(`proveedor desconocido "${spec.provider}"`);
      }
      const apiKeyEnv = spec.apiKeyEnv ?? factory.defaultApiKeyEnv;
      const apiKey = options.secret(apiKeyEnv);
      if (apiKey === undefined) {
        throw new Error(`falta la credencial "${apiKeyEnv}"`);
      }
      const model = await factory.create(spec, apiKey);
      const { maxOutputTokens } = options.recipe.model;
      return generateReport({
        model,
        prompt,
        derived,
        ...(maxOutputTokens !== undefined ? { maxOutputTokens } : {}),
      });
    },
    retry,
  );

  const { report, linksDropped } = validateLinks(outcome.value, derived, options.items);

  return {
    report,
    provider: outcome.provider.provider,
    providerWasFallback: outcome.wasFallback,
    providersTried: outcome.providersTried,
    linksDropped,
  };
}
