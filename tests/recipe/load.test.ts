import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { loadRecipe, RecipeLoadError } from '../../src/recipe/load.ts';

const VALID_RECIPE_YAML = `
language: es
topics:
  - inteligencia artificial
model:
  provider: google
  id: gemini-test
sources:
  - id: canal-de-prueba
    type: feed
    url: https://example.com/feed.xml
window:
  days: 30
scoring:
  recencyWeight: 1
  topicsWeight: 1
caps:
  maxItems: 60
  perSourceMaxPercent: 40
delivery: []
health:
  windowDays: 30
  runFailureThreshold: 0.2
  sourceFailureThreshold: 0.5
`;

const VALID_SECTIONS_YAML = `
sections:
  - key: pulse
    title: "Pulso del día"
    cardinality: one
    condition: always
    fields:
      - { name: text, type: string }
`;

const VALID_PERSONA = '# Persona\n\nDesarrollador en solitario.\n';

const dirs: string[] = [];

function makeRecipeDir(files: Record<string, string | undefined>): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronorium-load-test-'));
  dirs.push(dir);
  for (const [name, content] of Object.entries(files)) {
    if (content !== undefined) {
      writeFileSync(join(dir, name), content, 'utf8');
    }
  }
  return dir;
}

after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('una receta válida carga con sus campos, persona y secciones', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': VALID_RECIPE_YAML,
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
  });

  const recipe = loadRecipe(dir);

  assert.equal(recipe.language, 'es');
  assert.deepEqual(recipe.topics, ['inteligencia artificial']);
  assert.deepEqual(recipe.model, { provider: 'google', id: 'gemini-test' });
  assert.equal(recipe.persona.text, VALID_PERSONA);
  assert.equal(recipe.sections.length, 1);
  assert.equal(recipe.sections[0]?.key, 'pulse');
  assert.equal(recipe.name, dir.split('/').pop());
  assert.deepEqual(recipe.delivery, []);
  assert.deepEqual(recipe.health, {
    windowDays: 30,
    runFailureThreshold: 0.2,
    sourceFailureThreshold: 0.5,
  });
});

test('YAML sintácticamente corrupto en recipe.yaml termina en error, nunca en valores por defecto', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': 'language: [es\n', // corchete sin cerrar
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
  });

  assert.throws(() => loadRecipe(dir), RecipeLoadError);
});

test('un fichero ausente produce un error que nombra la ruta', () => {
  const dir = makeRecipeDir({
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
    // recipe.yaml deliberadamente ausente
  });

  assert.throws(
    () => loadRecipe(dir),
    (error: unknown) => {
      assert.ok(error instanceof RecipeLoadError);
      assert.match(error.message, /recipe\.yaml/);
      return true;
    },
  );
});

test('el mismo test ejecutado con otro directorio de trabajo carga la misma receta', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': VALID_RECIPE_YAML,
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
  });

  const before = loadRecipe(dir);

  const originalCwd = process.cwd();
  process.chdir(tmpdir());
  let after_: ReturnType<typeof loadRecipe>;
  try {
    after_ = loadRecipe(dir);
  } finally {
    process.chdir(originalCwd);
  }

  assert.deepEqual(after_, before);
});

test('una ruta de receta relativa se rechaza en vez de resolverse contra el directorio de trabajo', () => {
  assert.throws(() => loadRecipe('recipes/example'), RecipeLoadError);
});

test('un campo obligatorio ausente en recipe.yaml produce un error que nombra el campo', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': 'language: es\n',
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
  });

  assert.throws(
    () => loadRecipe(dir),
    (error: unknown) => {
      assert.ok(error instanceof RecipeLoadError);
      assert.match(error.message, /topics/);
      assert.match(error.message, /model/);
      return true;
    },
  );
});

test('la validación devuelve todos los errores de recipe.yaml, no aborta en el primero', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': '{}\n',
    'sections.yaml': VALID_SECTIONS_YAML,
    'persona.md': VALID_PERSONA,
  });

  assert.throws(
    () => loadRecipe(dir),
    (error: unknown) => {
      assert.ok(error instanceof RecipeLoadError);
      assert.ok(error.issues !== undefined);
      const campos = error.issues?.map((issue) => issue.campo) ?? [];
      assert.ok(campos.includes('language'));
      assert.ok(campos.includes('topics'));
      assert.ok(campos.includes('model'));
      return true;
    },
  );
});

test('los errores de recipe.yaml y de sections.yaml se devuelven juntos', () => {
  const dir = makeRecipeDir({
    'recipe.yaml': '{}\n',
    'sections.yaml': 'sections: []\n',
    'persona.md': VALID_PERSONA,
  });

  assert.throws(
    () => loadRecipe(dir),
    (error: unknown) => {
      assert.ok(error instanceof RecipeLoadError);
      const campos = error.issues?.map((issue) => issue.campo) ?? [];
      assert.ok(campos.includes('language'));
      assert.ok(campos.includes('sections'));
      return true;
    },
  );
});
