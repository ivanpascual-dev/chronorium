import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateReport } from '../src/model/client.ts';
import { composePrompt, type Item } from '../src/model/prompt.ts';
import { defaultProviderRegistry } from '../src/model/providers.ts';
import { projectRoot, resolveRecipeDir } from '../src/paths.ts';
import { loadRecipe } from '../src/recipe/load.ts';
import { deriveSections } from '../src/recipe/schema.ts';
import type { RecipeConfig, SectionSpec } from '../src/recipe/types.ts';

interface Run {
  readonly name: string;
  readonly description: string;
  readonly recipeDir: string;
  readonly itemsFile: string;
}

const runs: Run[] = [
  {
    name: 'A',
    description: 'la forma A sobre su dominio',
    recipeDir: resolveRecipeDir('example'),
    itemsFile: 'ai.json',
  },
  {
    name: 'B',
    description: 'la forma B sobre su dominio',
    recipeDir: join(projectRoot, 'tests', 'fixtures', 'recipes', 'biotech'),
    itemsFile: 'biotech.json',
  },
  {
    name: 'C',
    description: 'control: la forma B sobre el dominio de A',
    recipeDir: join(projectRoot, 'tests', 'fixtures', 'recipes', 'biotech'),
    itemsFile: 'ai.json',
  },
];

function readItems(fileName: string): Item[] {
  const path = join(projectRoot, 'tests', 'fixtures', 'items', fileName);
  return JSON.parse(readFileSync(path, 'utf8')) as Item[];
}

function renderReadable(
  recipe: RecipeConfig,
  sections: readonly SectionSpec[],
  report: Record<string, unknown>,
): string {
  const lines: string[] = [`# Receta en ${recipe.language}`, ''];

  for (const section of sections) {
    lines.push(`## ${section.title}`);
    const value = report[section.key];

    if (section.cardinality === 'one') {
      lines.push(JSON.stringify(value, null, 2));
    } else {
      const items = Array.isArray(value) ? value : [];
      if (items.length === 0) {
        lines.push('(sección vacía)');
      } else {
        for (const item of items) {
          lines.push(JSON.stringify(item, null, 2));
        }
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function runOne(run: Run, outDir: string): Promise<void> {
  const recipe = loadRecipe(run.recipeDir);
  const items = readItems(run.itemsFile);

  const derivedResult = deriveSections(recipe.sections);
  if (!derivedResult.ok) {
    const detail = derivedResult.issues
      .map((issue) => `${issue.campo}: ${issue.motivo}`)
      .join('; ');
    throw new Error(`la receta de la ejecución ${run.name} no deriva un esquema válido: ${detail}`);
  }

  const prompt = composePrompt(recipe, items);
  const googleProvider = defaultProviderRegistry.get('google');
  if (!googleProvider) {
    throw new Error('el registro de proveedores no tiene "google" (¿fase 3 rompió el registro?)');
  }
  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!apiKey) {
    throw new Error('falta la variable de entorno GOOGLE_GENERATIVE_AI_API_KEY');
  }
  const model = await googleProvider.create(recipe.model, apiKey);
  const report = await generateReport({ model, prompt, derived: derivedResult.value });

  const jsonPath = join(outDir, `probe-fase1-${run.name}.json`);
  const txtPath = join(outDir, `probe-fase1-${run.name}.txt`);

  writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  writeFileSync(
    txtPath,
    renderReadable(recipe, derivedResult.value.sections, report as Record<string, unknown>),
    'utf8',
  );

  console.log(`Run ${run.name} (${run.description}): ${jsonPath}`);
}

async function main(): Promise<void> {
  const outDir = join(projectRoot, 'tmp');
  mkdirSync(outDir, { recursive: true });

  for (const run of runs) {
    await runOne(run, outDir);
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
