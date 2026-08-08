import type { ReaderRegistry } from '../sources/registry.ts';
import { defaultRegistry } from '../sources/registry.ts';
import type { ValidationIssue } from './types.ts';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function defaultHasSecret(name: string): boolean {
  return Boolean(process.env[name]);
}

export interface ValidateRecipeOptions {
  /** Inyectado para poder probar RF-B03 sin depender de verdad del entorno (R3, R13). */
  readonly hasSecret?: (name: string) => boolean;
  /** Inyectado para poder probar con lectores que no son de fábrica, sin red (R13). */
  readonly registry?: ReaderRegistry;
}

function validateSourceFields(
  raw: Record<string, unknown>,
  type: string,
  path: string,
  label: string,
  issues: ValidationIssue[],
): void {
  if (type === 'feed' || type === 'json-api') {
    if (!isNonEmptyString(raw.url)) {
      issues.push({
        campo: `${path}.url`,
        motivo: `la fuente "${label}" de tipo "${type}" exige "url"`,
      });
    }
  }

  if (type === 'json-api') {
    const mapping = raw.mapping;
    if (!isRecord(mapping) || !isNonEmptyString(mapping.title) || !isNonEmptyString(mapping.url)) {
      issues.push({
        campo: `${path}.mapping`,
        motivo: `la fuente "${label}" de tipo json-api exige "mapping.title" y "mapping.url", declarados, nunca adivinados`,
      });
    }
  }

  if (type === 'repo-search' && !isNonEmptyString(raw.query)) {
    issues.push({
      campo: `${path}.query`,
      motivo: `la fuente "${label}" de tipo repo-search exige "query"`,
    });
  }

  if (type === 'repo-releases' && (!Array.isArray(raw.repos) || raw.repos.length === 0)) {
    issues.push({
      campo: `${path}.repos`,
      motivo: `la fuente "${label}" de tipo repo-releases exige al menos un repositorio en "repos"`,
    });
  }
}

function validateSources(
  raw: unknown,
  issues: ValidationIssue[],
  registry: ReaderRegistry,
  hasSecret: (name: string) => boolean,
): void {
  if (!Array.isArray(raw)) {
    issues.push({ campo: 'sources', motivo: 'debe ser una lista de fuentes' });
    return;
  }

  const seenIds = new Map<string, number>();

  raw.forEach((rawSource, index) => {
    const path = `sources[${index}]`;

    if (!isRecord(rawSource)) {
      issues.push({ campo: path, motivo: 'la fuente debe ser un objeto' });
      return;
    }

    const { id, type } = rawSource;
    const label = isNonEmptyString(id) ? id : `#${index}`;

    if (!isNonEmptyString(id)) {
      issues.push({
        campo: `${path}.id`,
        motivo: 'falta el identificador de la fuente',
      });
    } else {
      const firstIndex = seenIds.get(id);
      if (firstIndex !== undefined) {
        issues.push({
          campo: `${path}.id`,
          motivo: `el identificador "${id}" ya está declarado en sources[${firstIndex}]`,
        });
      } else {
        seenIds.set(id, index);
      }
    }

    if (!isNonEmptyString(type)) {
      issues.push({
        campo: `${path}.type`,
        motivo: `falta el tipo de la fuente "${label}"`,
      });
      return;
    }

    const reader = registry.get(type);
    if (!reader) {
      issues.push({
        campo: `${path}.type`,
        motivo: `tipo de fuente desconocido "${type}" en "${label}"`,
      });
      return;
    }

    for (const secretName of reader.requiredSecrets) {
      if (!hasSecret(secretName)) {
        issues.push({
          campo: path,
          motivo: `la fuente "${label}" de tipo "${type}" exige la credencial "${secretName}", ausente en el entorno`,
        });
      }
    }

    validateSourceFields(rawSource, type, path, label, issues);
  });
}

function validateWindow(raw: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(raw) || typeof raw.days !== 'number' || raw.days <= 0) {
    issues.push({
      campo: 'window.days',
      motivo: 'declara la ventana en días, un número mayor que cero',
    });
  }
}

function validateScoring(raw: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(raw)) {
    issues.push({
      campo: 'scoring',
      motivo: 'falta la declaración de los pesos de puntuación',
    });
    return;
  }
  if (typeof raw.recencyWeight !== 'number') {
    issues.push({
      campo: 'scoring.recencyWeight',
      motivo: 'falta el peso de recencia',
    });
  }
  if (typeof raw.topicsWeight !== 'number') {
    issues.push({
      campo: 'scoring.topicsWeight',
      motivo: 'falta el peso de coincidencia de temas',
    });
  }
}

function validateCaps(raw: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(raw)) {
    issues.push({ campo: 'caps', motivo: 'falta la declaración de topes' });
    return;
  }
  if (typeof raw.maxItems !== 'number' || raw.maxItems <= 0) {
    issues.push({
      campo: 'caps.maxItems',
      motivo: 'declara el tope global de elementos enviados al modelo, un número mayor que cero',
    });
  }
  if (
    typeof raw.perSourceMaxPercent !== 'number' ||
    raw.perSourceMaxPercent <= 0 ||
    raw.perSourceMaxPercent > 100
  ) {
    issues.push({
      campo: 'caps.perSourceMaxPercent',
      motivo: 'declara el tope por fuente en porcentaje del total, entre 0 (exclusivo) y 100',
    });
  }
}

/**
 * Valida los campos de `recipe.yaml`: idioma, temas, proveedor de modelo (fase 1), y fuentes,
 * ventana, pesos de puntuación y topes (fase 2). Devuelve todos los problemas encontrados, no
 * aborta en el primero (RF-A05).
 */
export function validateRecipeFields(
  raw: unknown,
  options: ValidateRecipeOptions = {},
): ValidationIssue[] {
  if (!isRecord(raw)) {
    return [{ campo: 'recipe', motivo: 'recipe.yaml debe declarar un objeto' }];
  }

  const registry = options.registry ?? defaultRegistry;
  const hasSecret = options.hasSecret ?? defaultHasSecret;
  const issues: ValidationIssue[] = [];

  if (!isNonEmptyString(raw.language)) {
    issues.push({ campo: 'language', motivo: 'falta el idioma de salida' });
  }

  if (
    !Array.isArray(raw.topics) ||
    raw.topics.length === 0 ||
    !raw.topics.every(isNonEmptyString)
  ) {
    issues.push({
      campo: 'topics',
      motivo: 'declara al menos un área de interés como texto',
    });
  }

  if (!isRecord(raw.model)) {
    issues.push({
      campo: 'model',
      motivo: 'falta la declaración del proveedor de modelo',
    });
  } else {
    if (!isNonEmptyString(raw.model.provider)) {
      issues.push({
        campo: 'model.provider',
        motivo: 'falta el proveedor de modelo',
      });
    }
    if (!isNonEmptyString(raw.model.id)) {
      issues.push({
        campo: 'model.id',
        motivo: 'falta el identificador de modelo',
      });
    }
  }

  validateSources(raw.sources, issues, registry, hasSecret);
  validateWindow(raw.window, issues);
  validateScoring(raw.scoring, issues);
  validateCaps(raw.caps, issues);

  return issues;
}
