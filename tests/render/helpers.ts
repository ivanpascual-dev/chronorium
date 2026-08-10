import type { RecipeConfig } from '../../src/recipe/types.ts';

export function makeRecipe(overrides: Partial<RecipeConfig> = {}): RecipeConfig {
  return {
    name: 'receta-de-prueba',
    language: 'es',
    topics: ['pruebas'],
    persona: { text: 'Persona de prueba.' },
    model: { provider: 'google', id: 'gemini-test' },
    sections: [],
    sources: [],
    window: { days: 7 },
    scoring: { recencyWeight: 1, topicsWeight: 1 },
    caps: { maxItems: 50, perSourceMaxPercent: 100 },
    delivery: [],
    health: { windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.5 },
    ...overrides,
  };
}
