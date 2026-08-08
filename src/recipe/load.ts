import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { deriveSections } from './schema.ts';
import type {
  CapsConfig,
  ModelConfig,
  RecipeConfig,
  ScoringConfig,
  SourceSpec,
  ValidationIssue,
  WindowConfig,
} from './types.ts';
import { validateRecipeFields } from './validate.ts';

export class RecipeLoadError extends Error {
  readonly issues?: readonly ValidationIssue[];

  constructor(message: string, issues?: readonly ValidationIssue[]) {
    super(message);
    this.name = 'RecipeLoadError';
    if (issues !== undefined) {
      this.issues = issues;
    }
  }
}

function formatIssues(issues: readonly ValidationIssue[]): string {
  return issues.map((issue) => `${issue.campo}: ${issue.motivo}`).join('\n');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readYamlFile(path: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (cause) {
    throw new RecipeLoadError(`no se pudo leer ${path}: ${(cause as Error).message}`);
  }

  try {
    return parseYaml(raw);
  } catch (cause) {
    throw new RecipeLoadError(`YAML inválido en ${path}: ${(cause as Error).message}`);
  }
}

export function loadRecipe(recipeDir: string): RecipeConfig {
  if (!isAbsolute(recipeDir)) {
    throw new RecipeLoadError(
      `la ruta de la receta debe ser absoluta, y no depender del directorio de trabajo: ${recipeDir}`,
    );
  }

  const recipeRaw = readYamlFile(join(recipeDir, 'recipe.yaml'));
  const sectionsRaw = readYamlFile(join(recipeDir, 'sections.yaml'));

  const personaPath = join(recipeDir, 'persona.md');
  let personaText: string;
  try {
    personaText = readFileSync(personaPath, 'utf8');
  } catch (cause) {
    throw new RecipeLoadError(`no se pudo leer ${personaPath}: ${(cause as Error).message}`);
  }

  const fieldIssues = validateRecipeFields(recipeRaw);
  const rawSectionsList = isRecord(sectionsRaw) ? sectionsRaw.sections : sectionsRaw;
  const sectionsResult = deriveSections(rawSectionsList);

  if (fieldIssues.length > 0 || !sectionsResult.ok) {
    const issues = sectionsResult.ok ? fieldIssues : [...fieldIssues, ...sectionsResult.issues];
    throw new RecipeLoadError(formatIssues(issues), issues);
  }

  const recipe = recipeRaw as {
    language: string;
    topics: readonly string[];
    model: ModelConfig;
    sources: readonly SourceSpec[];
    window: WindowConfig;
    scoring: ScoringConfig;
    caps: CapsConfig;
  };

  return {
    language: recipe.language,
    topics: recipe.topics,
    model: recipe.model,
    persona: { text: personaText },
    sections: sectionsResult.value.sections,
    sources: recipe.sources,
    window: recipe.window,
    scoring: recipe.scoring,
    caps: recipe.caps,
  };
}
