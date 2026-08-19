import { defaultNotifierRegistry, type NotifierRegistry } from '../deliver/registry.ts';
import { defaultProviderRegistry, type ProviderRegistry } from '../model/providers.ts';
import type { ReaderRegistry } from '../sources/registry.ts';
import { defaultRegistry } from '../sources/registry.ts';
import type { ProviderSpec, ReasoningEffort, ValidationIssue } from './types.ts';

const REASONING_EFFORT_VALUES: readonly ReasoningEffort[] = ['minimal', 'low', 'medium', 'high'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function defaultSecret(name: string): string | undefined {
  return process.env[name];
}

export interface ValidateRecipeOptions {
  /** Inyectado para poder probar sin depender de verdad del entorno (R3, R13). La presencia de una
   * credencial se deriva de esto, nunca de una segunda pregunta aparte. */
  readonly secret?: (name: string) => string | undefined;
  /** Inyectado para poder probar con lectores que no son de fábrica, sin red (R13). */
  readonly registry?: ReaderRegistry;
  /** Inyectado para poder probar con proveedores de modelo que no son de fábrica, sin red (R13). */
  readonly providerRegistry?: ProviderRegistry;
  /** Inyectado para poder probar con notificadores que no son de fábrica, sin red (R13). */
  readonly notifierRegistry?: NotifierRegistry;
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
  secret: (name: string) => string | undefined,
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
      if (secret(secretName) === undefined) {
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

/** Campos propios de cada canal de fábrica: bolsa abierta (`DeliveryChannel`), mismo motivo que
 * `SourceSpec` (cada lector/notificador conoce solo sus propios campos, `validate.ts` es el único
 * sitio que sabe qué exige cada `id`). */
const KNOWN_CHANNEL_FIELDS: Readonly<Record<string, readonly string[]>> = {
  email: ['to', 'from'],
  telegram: ['chatId'],
  webhook: ['url'],
};

/**
 * Un canal desconocido es un error de receta (RF-F03). Un canal activo cuyos `requiredSecrets` no
 * están en el entorno hace fallar la validación, con el nombre de la variable (misma regla que
 * RF-B03 aplica a las fuentes). Cero canales activos es válido (RF-B04, RF-H04): un informe
 * archivado ya es un informe entregado.
 */
function validateDelivery(
  raw: unknown,
  issues: ValidationIssue[],
  registry: NotifierRegistry,
  secret: (name: string) => string | undefined,
): void {
  if (!Array.isArray(raw)) {
    issues.push({
      campo: 'delivery',
      motivo: 'debe ser una lista de canales de entrega (puede ser una lista vacía)',
    });
    return;
  }

  const seenIds = new Map<string, number>();

  raw.forEach((rawChannel, index) => {
    const path = `delivery[${index}]`;

    if (!isRecord(rawChannel)) {
      issues.push({ campo: path, motivo: 'el canal debe ser un objeto' });
      return;
    }

    const { id, enabled } = rawChannel;
    const label = isNonEmptyString(id) ? id : `#${index}`;

    if (!isNonEmptyString(id)) {
      issues.push({ campo: `${path}.id`, motivo: 'falta el identificador del canal' });
    } else {
      const firstIndex = seenIds.get(id);
      if (firstIndex !== undefined) {
        issues.push({
          campo: `${path}.id`,
          motivo: `el identificador "${id}" ya está declarado en delivery[${firstIndex}]`,
        });
      } else {
        seenIds.set(id, index);
      }
    }

    if (typeof enabled !== 'boolean') {
      issues.push({
        campo: `${path}.enabled`,
        motivo: `el canal "${label}" debe declarar "enabled" (true o false)`,
      });
    }

    if (!isNonEmptyString(id)) {
      return;
    }

    const notifier = registry.get(id);
    if (!notifier) {
      issues.push({ campo: `${path}.id`, motivo: `canal de entrega desconocido "${id}"` });
      return;
    }

    for (const field of KNOWN_CHANNEL_FIELDS[id] ?? []) {
      if (!isNonEmptyString(rawChannel[field])) {
        issues.push({
          campo: `${path}.${field}`,
          motivo: `el canal "${id}" exige "${field}"`,
        });
      }
    }

    if (enabled === true) {
      for (const secretName of notifier.requiredSecrets) {
        if (secret(secretName) === undefined) {
          issues.push({
            campo: path,
            motivo: `el canal "${id}" está activo y exige la credencial "${secretName}", ausente en el entorno`,
          });
        }
      }
    }
  });
}

function validateHealth(raw: unknown, issues: ValidationIssue[]): void {
  if (!isRecord(raw)) {
    issues.push({ campo: 'health', motivo: 'falta la declaración de los umbrales de salud' });
    return;
  }

  if (typeof raw.windowDays !== 'number' || raw.windowDays <= 0) {
    issues.push({
      campo: 'health.windowDays',
      motivo: 'declara la ventana de salud en días, un número mayor que cero',
    });
  }

  if (
    typeof raw.runFailureThreshold !== 'number' ||
    raw.runFailureThreshold < 0 ||
    raw.runFailureThreshold > 1
  ) {
    issues.push({
      campo: 'health.runFailureThreshold',
      motivo: 'declara la proporción de ejecuciones fallidas que activa el aviso, entre 0 y 1',
    });
  }

  if (
    typeof raw.sourceFailureThreshold !== 'number' ||
    raw.sourceFailureThreshold < 0 ||
    raw.sourceFailureThreshold > 1
  ) {
    issues.push({
      campo: 'health.sourceFailureThreshold',
      motivo:
        'declara la proporción de fuentes fallidas de esta ejecución que activa el aviso, entre 0 y 1',
    });
  }
}

function validateSubject(raw: unknown, issues: ValidationIssue[]): void {
  if (raw !== undefined && (typeof raw !== 'string' || raw.length === 0)) {
    issues.push({ campo: 'subject', motivo: 'si se declara, "subject" debe ser texto no vacío' });
  }
}

function validateProviderSpec(
  raw: unknown,
  path: string,
  providerRegistry: ProviderRegistry,
  issues: ValidationIssue[],
): ProviderSpec | undefined {
  if (!isRecord(raw)) {
    issues.push({ campo: path, motivo: 'el eslabón de la cadena debe ser un objeto' });
    return undefined;
  }

  const { provider, id, apiKeyEnv, baseUrl, reasoningEffort } = raw;
  let ok = true;

  if (!isNonEmptyString(provider)) {
    issues.push({ campo: `${path}.provider`, motivo: 'falta el proveedor de modelo' });
    ok = false;
  } else if (!providerRegistry.has(provider)) {
    issues.push({
      campo: `${path}.provider`,
      motivo: `proveedor de modelo desconocido "${provider}"`,
    });
    ok = false;
  }

  if (!isNonEmptyString(id)) {
    issues.push({ campo: `${path}.id`, motivo: 'falta el identificador de modelo' });
    ok = false;
  }

  if (apiKeyEnv !== undefined && !isNonEmptyString(apiKeyEnv)) {
    issues.push({
      campo: `${path}.apiKeyEnv`,
      motivo: 'si se declara, "apiKeyEnv" debe ser el nombre de una variable de entorno, en texto',
    });
    ok = false;
  }

  if (provider === 'openai-compatible' && !isNonEmptyString(baseUrl)) {
    issues.push({
      campo: `${path}.baseUrl`,
      motivo: 'el proveedor "openai-compatible" exige "baseUrl"',
    });
    ok = false;
  } else if (baseUrl !== undefined && !isNonEmptyString(baseUrl)) {
    issues.push({ campo: `${path}.baseUrl`, motivo: 'si se declara, "baseUrl" debe ser texto' });
    ok = false;
  }

  if (
    reasoningEffort !== undefined &&
    !REASONING_EFFORT_VALUES.includes(reasoningEffort as ReasoningEffort)
  ) {
    issues.push({
      campo: `${path}.reasoningEffort`,
      motivo: `si se declara, "reasoningEffort" debe ser uno de: ${REASONING_EFFORT_VALUES.join(', ')}`,
    });
    ok = false;
  }

  if (!ok) {
    return undefined;
  }

  const spec: { -readonly [K in keyof ProviderSpec]: ProviderSpec[K] } = {
    provider: provider as string,
    id: id as string,
  };
  if (apiKeyEnv !== undefined) spec.apiKeyEnv = apiKeyEnv as string;
  if (baseUrl !== undefined) spec.baseUrl = baseUrl as string;
  if (reasoningEffort !== undefined) spec.reasoningEffort = reasoningEffort as ReasoningEffort;
  return spec;
}

/**
 * Valida `model` (el principal) y `model.fallbacks` (la cadena, opcional): cada eslabón exige
 * `provider` registrado e `id`, `openai-compatible` exige además `baseUrl`, y ningún eslabón puede
 * repetir el mismo proveedor con el mismo modelo, ni siquiera contra el principal (RF-A05).
 */
function validateModel(
  raw: unknown,
  issues: ValidationIssue[],
  providerRegistry: ProviderRegistry,
): void {
  if (!isRecord(raw)) {
    issues.push({ campo: 'model', motivo: 'falta la declaración del proveedor de modelo' });
    return;
  }

  const principal = validateProviderSpec(raw, 'model', providerRegistry, issues);

  if (
    raw.maxOutputTokens !== undefined &&
    (typeof raw.maxOutputTokens !== 'number' ||
      !Number.isInteger(raw.maxOutputTokens) ||
      raw.maxOutputTokens <= 0)
  ) {
    issues.push({
      campo: 'model.maxOutputTokens',
      motivo: 'si se declara, "maxOutputTokens" debe ser un entero mayor que cero',
    });
  }

  if (raw.fallbacks === undefined) {
    return;
  }
  if (!Array.isArray(raw.fallbacks)) {
    issues.push({
      campo: 'model.fallbacks',
      motivo: 'si se declara, debe ser una lista de eslabones',
    });
    return;
  }

  const seen = new Map<string, number>();
  if (principal) {
    seen.set(`${principal.provider}::${principal.id}`, -1);
  }

  raw.fallbacks.forEach((rawFallback, index) => {
    const path = `model.fallbacks[${index}]`;
    const spec = validateProviderSpec(rawFallback, path, providerRegistry, issues);
    if (!spec) {
      return;
    }

    const key = `${spec.provider}::${spec.id}`;
    const firstIndex = seen.get(key);
    if (firstIndex !== undefined) {
      issues.push({
        campo: path,
        motivo:
          firstIndex === -1
            ? `el eslabón "${spec.provider}/${spec.id}" repite el proveedor principal`
            : `el eslabón "${spec.provider}/${spec.id}" ya está declarado en model.fallbacks[${firstIndex}]`,
      });
      return;
    }
    seen.set(key, index);
  });
}

/**
 * Valida los campos de `recipe.yaml`: idioma, temas, cadena de proveedores de modelo (fase 1 y 3),
 * y fuentes, ventana, pesos de puntuación y topes (fase 2). Devuelve todos los problemas
 * encontrados, no aborta en el primero (RF-A05).
 */
export function validateRecipeFields(
  raw: unknown,
  options: ValidateRecipeOptions = {},
): ValidationIssue[] {
  if (!isRecord(raw)) {
    return [{ campo: 'recipe', motivo: 'recipe.yaml debe declarar un objeto' }];
  }

  const registry = options.registry ?? defaultRegistry;
  const providerRegistry = options.providerRegistry ?? defaultProviderRegistry;
  const notifierRegistry = options.notifierRegistry ?? defaultNotifierRegistry;
  const secret = options.secret ?? defaultSecret;
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

  validateModel(raw.model, issues, providerRegistry);
  validateSources(raw.sources, issues, registry, secret);
  validateWindow(raw.window, issues);
  validateScoring(raw.scoring, issues);
  validateCaps(raw.caps, issues);
  validateDelivery(raw.delivery, issues, notifierRegistry, secret);
  validateHealth(raw.health, issues);
  validateSubject(raw.subject, issues);

  return issues;
}
