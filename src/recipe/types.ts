export type FieldType = 'string' | 'url';

export interface FieldSpec {
  readonly name: string;
  readonly type: FieldType;
  readonly description?: string;
  /** Etiqueta humana para el renderizado (T5). Sin ella, el campo se renderiza sin prefijo, nunca
   * con el nombre técnico del campo. */
  readonly label?: string;
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
  /** Con `provider: 'openai'` o `'google'`: cuánto debe razonar el modelo antes de responder. Es un
   * campo de dominio único, y cada proveedor lo traduce a su propia convención en `providers.ts`
   * (`reasoningEffort` en OpenAI, `thinkingConfig.thinkingLevel` en Gemini 3+, ADR-018): quien
   * escribe la receta no necesita saber cuál. */
  readonly reasoningEffort?: ReasoningEffort;
}

/** `provider` e `id` siguen siendo el principal (fase 1); `fallbacks` es la cadena, en orden. */
export interface ModelConfig extends ProviderSpec {
  readonly fallbacks?: readonly ProviderSpec[];
  /** Tope de tokens de salida de la llamada, común a todos los eslabones de la cadena (no varía
   * por proveedor, como sí hace `reasoningEffort`). Depende del tamaño de esta receta en concreto
   * (cuántos elementos entran, cuántas secciones hay que rellenar): una semanal que destila varias
   * diarias necesita más margen que una diaria. Ausente ⇒ el valor por defecto de `client.ts`. */
  readonly maxOutputTokens?: number;
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

export interface DeliveryChannel {
  readonly id: string;
  readonly enabled: boolean;
  /** Campos propios del canal, misma bolsa abierta que `SourceSpec` y por el mismo motivo. */
  readonly [key: string]: unknown;
}

export interface HealthConfig {
  readonly windowDays: number;
  /** RF-G05: proporción de ejecuciones fallidas en la ventana a partir de la cual se marca. */
  readonly runFailureThreshold: number;
  /** RF-G02: proporción de fuentes fallidas de ESTA ejecución a partir de la cual se marca. */
  readonly sourceFailureThreshold: number;
}

export interface RecipeConfig {
  /** Derivado del directorio de la receta, lo necesita el archivo (T7). */
  readonly name: string;
  readonly language: string;
  readonly topics: readonly string[];
  readonly persona: Persona;
  readonly model: ModelConfig;
  readonly sections: readonly SectionSpec[];
  readonly sources: readonly SourceSpec[];
  readonly window: WindowConfig;
  readonly scoring: ScoringConfig;
  readonly caps: CapsConfig;
  readonly delivery: readonly DeliveryChannel[];
  readonly health: HealthConfig;
  /** Plantilla opcional, con `{recipe}` y `{date}`. Sin ella, `subject` sale de un formato no prosa. */
  readonly subject?: string;
}

export interface ValidationIssue {
  readonly campo: string;
  readonly motivo: string;
}
