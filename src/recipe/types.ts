export type FieldType = 'string' | 'url';

export interface FieldSpec {
  readonly name: string;
  readonly type: FieldType;
  readonly description?: string;
}

export type SectionCondition = 'always' | 'non-empty';

interface SectionSpecBase {
  readonly key: string;
  readonly title: string;
  readonly condition: SectionCondition;
  readonly fields: readonly FieldSpec[];
}

export type SectionSpec =
  | (SectionSpecBase & { readonly cardinality: 'one' })
  | (SectionSpecBase & {
      readonly cardinality: 'list';
      readonly min: number;
      readonly max: number;
    });

export interface Persona {
  readonly text: string;
}

/** Un eslabón de la cadena de proveedores, declarado en la receta. `apiKeyEnv` es el NOMBRE de la
 * variable de entorno, nunca el valor (R3): ausente ⇒ la variable por defecto del proveedor. */
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface ProviderSpec {
  readonly provider: string;
  readonly id: string;
  readonly apiKeyEnv?: string;
  /** Solo `openai-compatible`: el endpoint del proveedor concreto. */
  readonly baseUrl?: string;
  /** Solo `openai-compatible`: este modelo exige la convención de llamada de los modelos de
   * razonamiento (`max_completion_tokens` en vez de `max_tokens`, sin `temperature` propia). No se
   * detecta por el identificador (D-03): quien declara el eslabón lo sabe y lo dice. */
  readonly reasoningModel?: boolean;
  /** Solo si `reasoningModel` es `true`: esfuerzo de razonamiento a pedir. */
  readonly reasoningEffort?: ReasoningEffort;
}

/** `provider` e `id` siguen siendo el principal (fase 1); `fallbacks` es la cadena, en orden. */
export interface ModelConfig extends ProviderSpec {
  readonly fallbacks?: readonly ProviderSpec[];
}

/**
 * Bolsa de campos deliberadamente abierta: cada lector (`src/sources/*.ts`) lee solo los campos
 * que su tipo declara y `validate.ts` comprueba que estén presentes, nombrando el campo si falta
 * (RF-A05). Un tipo unión discriminada obligaría a los cinco lectores a conocerse entre sí.
 */
export interface SourceSpec {
  readonly id: string;
  readonly type: string;
  /** `feed`, `json-api`. */
  readonly url?: string;
  /** `json-api`: dónde está cada campo de `Item` en la respuesta, declarado, nunca adivinado. */
  readonly mapping?: {
    readonly items?: string;
    readonly title: string;
    readonly url: string;
    readonly publishedAt?: string;
    readonly summary?: string;
  };
  /** `repo-search`: cualificadores de la búsqueda, sin `created:` ni `sort` (los añade el lector). */
  readonly query?: string;
  /** `repo-releases`: repositorios `owner/repo` cuyos lanzamientos se leen. */
  readonly repos?: readonly string[];
  /** `archive`: qué receta destilar. Ausente ⇒ todas las que haya en `dataRoot/archive`. */
  readonly recipe?: string;
}

export interface WindowConfig {
  readonly days: number;
}

export interface ScoringConfig {
  readonly recencyWeight: number;
  readonly topicsWeight: number;
}

export interface CapsConfig {
  readonly maxItems: number;
  readonly perSourceMaxPercent: number;
}

export interface RecipeConfig {
  readonly language: string;
  readonly topics: readonly string[];
  readonly persona: Persona;
  readonly model: ModelConfig;
  readonly sections: readonly SectionSpec[];
  readonly sources: readonly SourceSpec[];
  readonly window: WindowConfig;
  readonly scoring: ScoringConfig;
  readonly caps: CapsConfig;
}

export interface ValidationIssue {
  readonly campo: string;
  readonly motivo: string;
}
