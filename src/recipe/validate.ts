import type { ValidationIssue } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Valida los campos de `recipe.yaml` que esta fase usa: idioma, temas y proveedor de modelo.
 * Fuentes, entrega y credenciales requeridas los añaden las fases 2 y 3 (mismo punto de entrada).
 */
export function validateRecipeFields(raw: unknown): ValidationIssue[] {
  if (!isRecord(raw)) {
    return [{ campo: 'recipe', motivo: 'recipe.yaml debe declarar un objeto' }];
  }

  const issues: ValidationIssue[] = [];

  if (!isNonEmptyString(raw.language)) {
    issues.push({ campo: 'language', motivo: 'falta el idioma de salida' });
  }

  if (
    !Array.isArray(raw.topics) ||
    raw.topics.length === 0 ||
    !raw.topics.every(isNonEmptyString)
  ) {
    issues.push({ campo: 'topics', motivo: 'declara al menos un área de interés como texto' });
  }

  if (!isRecord(raw.model)) {
    issues.push({ campo: 'model', motivo: 'falta la declaración del proveedor de modelo' });
  } else {
    if (!isNonEmptyString(raw.model.provider)) {
      issues.push({ campo: 'model.provider', motivo: 'falta el proveedor de modelo' });
    }
    if (!isNonEmptyString(raw.model.id)) {
      issues.push({ campo: 'model.id', motivo: 'falta el identificador de modelo' });
    }
  }

  return issues;
}
