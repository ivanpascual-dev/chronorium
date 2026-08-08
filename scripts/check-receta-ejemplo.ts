// RF-H05: la receta de ejemplo se ejercita en CI con un proveedor de modelo simulado, para que
// una receta de ejemplo rota rompa la construcción. Sin red, sin credenciales.
//
// No conoce ninguna clave de sección de recipes/example (R12): genera una salida simulada
// recorriendo las secciones que la propia receta declare, sean cuales sean.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MockLanguageModelV4 } from 'ai/test';
import { generateReport } from '../src/model/client.ts';
import { composePrompt, type Item } from '../src/model/prompt.ts';
import { projectRoot, resolveRecipeDir } from '../src/paths.ts';
import { loadRecipe } from '../src/recipe/load.ts';
import { deriveSections } from '../src/recipe/schema.ts';
import type { FieldSpec, SectionSpec } from '../src/recipe/types.ts';

function mockItem(fields: readonly FieldSpec[], items: readonly Item[]): Record<string, string> {
  const value: Record<string, string> = {};
  for (const field of fields) {
    value[field.name] = field.type === 'url' ? items[0].url : `texto de prueba: ${field.name}`;
  }
  return value;
}

function mockReport(
  sections: readonly SectionSpec[],
  items: readonly Item[],
): Record<string, unknown> {
  const report: Record<string, unknown> = {};
  for (const section of sections) {
    if (section.cardinality === 'one') {
      report[section.key] = mockItem(section.fields, items);
    } else {
      const count = Math.max(section.min, 1);
      report[section.key] = Array.from({ length: count }, () => mockItem(section.fields, items));
    }
  }
  return report;
}

function mockModel(text: string): MockLanguageModelV4 {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: undefined },
      usage: {
        inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
        outputTokens: { total: 20, text: 20, reasoning: undefined },
      },
      warnings: [],
    }),
  });
}

async function main(): Promise<void> {
  const recipe = loadRecipe(resolveRecipeDir('example'));

  const derivedResult = deriveSections(recipe.sections);
  if (!derivedResult.ok) {
    const detail = derivedResult.issues
      .map((issue) => `${issue.campo}: ${issue.motivo}`)
      .join('; ');
    throw new Error(`recipes/example no deriva un esquema válido: ${detail}`);
  }

  const itemsPath = join(projectRoot, 'tests', 'fixtures', 'items', 'ai.json');
  const items = JSON.parse(readFileSync(itemsPath, 'utf8')) as Item[];

  const prompt = composePrompt(recipe, items);
  const mockOutput = mockReport(derivedResult.value.sections, items);
  const model = mockModel(JSON.stringify(mockOutput));

  const report = await generateReport({ model, prompt, derived: derivedResult.value });

  if (typeof report !== 'object' || report === null) {
    throw new Error('recipes/example no produjo un informe válido con el modelo simulado');
  }

  console.log('recipes/example produce un informe válido con un modelo simulado (RF-H05).');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
