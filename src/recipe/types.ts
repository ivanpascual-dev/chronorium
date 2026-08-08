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

export interface ModelConfig {
  readonly provider: string;
  readonly id: string;
}

export interface RecipeConfig {
  readonly language: string;
  readonly topics: readonly string[];
  readonly persona: Persona;
  readonly model: ModelConfig;
  readonly sections: readonly SectionSpec[];
}

export interface ValidationIssue {
  readonly campo: string;
  readonly motivo: string;
}
