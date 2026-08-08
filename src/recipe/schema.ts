import { jsonSchema, type Schema } from 'ai';
import type {
  FieldSpec,
  FieldType,
  SectionCondition,
  SectionSpec,
  ValidationIssue,
} from './types.ts';

const KNOWN_FIELD_TYPES: readonly FieldType[] = ['string', 'url'];
const KNOWN_CARDINALITIES = ['one', 'list'] as const;
const KNOWN_CONDITIONS: readonly SectionCondition[] = ['always', 'non-empty'];

export interface UrlFieldPath {
  readonly sectionKey: string;
  readonly fieldName: string;
}

export interface DerivedSchema {
  readonly sections: readonly SectionSpec[];
  readonly jsonSchema: Record<string, unknown>;
  readonly urlFields: readonly UrlFieldPath[];
}

export type DeriveSectionsResult =
  | { readonly ok: true; readonly value: DerivedSchema }
  | { readonly ok: false; readonly issues: readonly ValidationIssue[] };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function fieldSchema(field: FieldSpec): Record<string, unknown> {
  const schema: Record<string, unknown> = { type: 'string' };
  if (field.description !== undefined) {
    schema.description = field.description;
  }
  return schema;
}

function sectionItemSchema(fields: readonly FieldSpec[]): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const field of fields) {
    properties[field.name] = fieldSchema(field);
  }
  return {
    type: 'object',
    properties,
    required: fields.map((field) => field.name),
    additionalProperties: false,
  };
}

function sectionSchema(section: SectionSpec): Record<string, unknown> {
  const itemSchema = sectionItemSchema(section.fields);
  if (section.cardinality === 'one') {
    return itemSchema;
  }
  return {
    type: 'array',
    minItems: section.min,
    maxItems: section.max,
    items: itemSchema,
  };
}

function parseField(
  raw: unknown,
  path: string,
  sectionLabel: string,
  issues: ValidationIssue[],
): FieldSpec | undefined {
  if (!isRecord(raw)) {
    issues.push({ campo: path, motivo: `campo mal formado en la sección "${sectionLabel}"` });
    return undefined;
  }

  const { name, type, description } = raw;
  let ok = true;

  if (typeof name !== 'string' || name.length === 0) {
    issues.push({
      campo: `${path}.name`,
      motivo: `falta el nombre del campo en la sección "${sectionLabel}"`,
    });
    ok = false;
  }

  if (typeof type !== 'string' || type.length === 0) {
    issues.push({
      campo: `${path}.type`,
      motivo: `falta el tipo del campo en la sección "${sectionLabel}"`,
    });
    ok = false;
  } else if (!KNOWN_FIELD_TYPES.includes(type as FieldType)) {
    issues.push({
      campo: `${path}.type`,
      motivo: `tipo desconocido "${type}" en el campo "${typeof name === 'string' ? name : '?'}" de la sección "${sectionLabel}"`,
    });
    ok = false;
  }

  if (description !== undefined && typeof description !== 'string') {
    issues.push({
      campo: `${path}.description`,
      motivo: `la descripción debe ser texto en la sección "${sectionLabel}"`,
    });
    ok = false;
  }

  if (!ok) {
    return undefined;
  }

  return description === undefined
    ? { name: name as string, type: type as FieldType }
    : { name: name as string, type: type as FieldType, description: description as string };
}

function parseSection(
  raw: unknown,
  index: number,
  issues: ValidationIssue[],
): SectionSpec | undefined {
  const path = `sections[${index}]`;

  if (!isRecord(raw)) {
    issues.push({ campo: path, motivo: 'la sección debe ser un objeto' });
    return undefined;
  }

  const { key, title, cardinality, condition, fields, min, max } = raw;
  const label = typeof key === 'string' && key.length > 0 ? key : `#${index}`;
  let ok = true;

  if (typeof key !== 'string' || key.length === 0) {
    issues.push({ campo: `${path}.key`, motivo: 'falta la clave de la sección' });
    ok = false;
  }

  if (typeof title !== 'string' || title.length === 0) {
    issues.push({ campo: `${path}.title`, motivo: `falta el título de la sección "${label}"` });
    ok = false;
  }

  if (condition !== 'always' && condition !== 'non-empty') {
    issues.push({
      campo: `${path}.condition`,
      motivo: `condición desconocida "${String(condition)}" en la sección "${label}", esperaba ${KNOWN_CONDITIONS.join(' | ')}`,
    });
    ok = false;
  }

  if (!Array.isArray(fields) || fields.length === 0) {
    issues.push({
      campo: `${path}.fields`,
      motivo: `la sección "${label}" no declara ningún campo`,
    });
    ok = false;
  }

  const parsedFields: FieldSpec[] = [];
  if (Array.isArray(fields)) {
    fields.forEach((rawField, fieldIndex) => {
      const field = parseField(rawField, `${path}.fields[${fieldIndex}]`, label, issues);
      if (field !== undefined) {
        parsedFields.push(field);
      } else {
        ok = false;
      }
    });
  }

  if (cardinality !== 'one' && cardinality !== 'list') {
    issues.push({
      campo: `${path}.cardinality`,
      motivo: `cardinalidad desconocida "${String(cardinality)}" en la sección "${label}", esperaba ${KNOWN_CARDINALITIES.join(' | ')}`,
    });
    ok = false;
  }

  if (cardinality === 'list') {
    if (typeof min !== 'number' || typeof max !== 'number') {
      issues.push({
        campo: `${path}.min`,
        motivo: `la sección "${label}" es de cardinalidad "list" y necesita "min" y "max" numéricos`,
      });
      ok = false;
    } else if (max < min) {
      issues.push({
        campo: `${path}.max`,
        motivo: `en la sección "${label}", max (${max}) es menor que min (${min})`,
      });
      ok = false;
    }
  }

  if (!ok) {
    return undefined;
  }

  if (cardinality === 'list') {
    return {
      key: key as string,
      title: title as string,
      condition: condition as SectionCondition,
      fields: parsedFields,
      cardinality: 'list',
      min: min as number,
      max: max as number,
    };
  }

  return {
    key: key as string,
    title: title as string,
    condition: condition as SectionCondition,
    fields: parsedFields,
    cardinality: 'one',
  };
}

export function deriveSections(raw: unknown): DeriveSectionsResult {
  if (!Array.isArray(raw)) {
    return {
      ok: false,
      issues: [{ campo: 'sections', motivo: 'debe ser una lista de secciones' }],
    };
  }

  if (raw.length === 0) {
    return {
      ok: false,
      issues: [{ campo: 'sections', motivo: 'la receta no declara ninguna sección' }],
    };
  }

  const issues: ValidationIssue[] = [];
  const sections: SectionSpec[] = [];
  const seenKeys = new Map<string, number>();

  raw.forEach((rawSection, index) => {
    const section = parseSection(rawSection, index, issues);
    if (section === undefined) {
      return;
    }

    const firstIndex = seenKeys.get(section.key);
    if (firstIndex !== undefined) {
      issues.push({
        campo: `sections[${index}].key`,
        motivo: `la clave "${section.key}" ya está declarada en sections[${firstIndex}]`,
      });
      return;
    }
    seenKeys.set(section.key, index);
    sections.push(section);
  });

  if (issues.length > 0) {
    return { ok: false, issues };
  }

  const properties: Record<string, unknown> = {};
  const urlFields: UrlFieldPath[] = [];

  for (const section of sections) {
    properties[section.key] = sectionSchema(section);
    for (const field of section.fields) {
      if (field.type === 'url') {
        urlFields.push({ sectionKey: section.key, fieldName: field.name });
      }
    }
  }

  const derivedJsonSchema = {
    type: 'object',
    properties,
    required: sections.map((section) => section.key),
    additionalProperties: false,
  };

  return {
    ok: true,
    value: { sections, jsonSchema: derivedJsonSchema, urlFields },
  };
}

function validateAgainstSections(
  value: unknown,
  sections: readonly SectionSpec[],
): { success: true; value: unknown } | { success: false; error: Error } {
  if (!isRecord(value)) {
    return { success: false, error: new Error('la salida del modelo no es un objeto') };
  }

  const declaredKeys = new Set(sections.map((section) => section.key));
  for (const key of Object.keys(value)) {
    if (!declaredKeys.has(key)) {
      return {
        success: false,
        error: new Error(`la salida del modelo trae una clave no declarada: "${key}"`),
      };
    }
  }

  for (const section of sections) {
    const sectionValue = value[section.key];
    if (sectionValue === undefined) {
      return {
        success: false,
        error: new Error(`falta la sección "${section.key}" en la salida del modelo`),
      };
    }

    const items = section.cardinality === 'one' ? [sectionValue] : sectionValue;
    if (section.cardinality === 'list') {
      if (!Array.isArray(sectionValue)) {
        return {
          success: false,
          error: new Error(`la sección "${section.key}" debería ser una lista`),
        };
      }
      if (sectionValue.length < section.min || sectionValue.length > section.max) {
        return {
          success: false,
          error: new Error(
            `la sección "${section.key}" trae ${sectionValue.length} elementos, fuera de [${section.min}, ${section.max}]`,
          ),
        };
      }
    }

    for (const item of items as unknown[]) {
      if (!isRecord(item)) {
        return {
          success: false,
          error: new Error(`un elemento de la sección "${section.key}" no es un objeto`),
        };
      }
      for (const field of section.fields) {
        if (typeof item[field.name] !== 'string') {
          return {
            success: false,
            error: new Error(
              `falta el campo "${field.name}" en un elemento de la sección "${section.key}"`,
            ),
          };
        }
      }
    }
  }

  return { success: true, value };
}

export function wrapForGeneration<T = unknown>(derived: DerivedSchema): Schema<T> {
  // biome-ignore lint/suspicious/noExplicitAny: el esquema JSON es dinámico, no hay tipo estático que describirle a jsonSchema().
  return jsonSchema<T>(derived.jsonSchema as any, {
    validate: (value) =>
      validateAgainstSections(value, derived.sections) as
        | { success: true; value: T }
        | { success: false; error: Error },
  });
}
