import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  PathResolutionError,
  projectRoot,
  resolveDataRoot,
  resolveRecipeDir,
  resolveRecipesRoot,
} from '../src/paths.ts';

test('resolveRecipesRoot: --recipes-root gana a la variable de entorno y al valor por defecto', () => {
  assert.equal(
    resolveRecipesRoot({ cliValue: '/a/b', env: { CHRONORIUM_RECIPES_ROOT: '/c/d' } }),
    '/a/b',
  );
});

test('resolveRecipesRoot: la variable de entorno gana al valor por defecto', () => {
  assert.equal(resolveRecipesRoot({ env: { CHRONORIUM_RECIPES_ROOT: '/c/d' } }), '/c/d');
});

test('resolveRecipesRoot: sin nada declarado, cae en projectRoot/recipes', () => {
  assert.equal(resolveRecipesRoot({ env: {} }), `${projectRoot}/recipes`);
});

test('resolveDataRoot sigue la misma precedencia que resolveRecipesRoot', () => {
  assert.equal(resolveDataRoot({ cliValue: '/datos' }), '/datos');
  assert.equal(resolveDataRoot({ env: { CHRONORIUM_DATA_ROOT: '/otros-datos' } }), '/otros-datos');
  assert.equal(resolveDataRoot({ env: {} }), `${projectRoot}/data`);
});

test('una ruta relativa en --recipes-root o --data-root se rechaza, no se resuelve contra el cwd', () => {
  assert.throws(() => resolveRecipesRoot({ cliValue: 'recetas-relativas' }), PathResolutionError);
  assert.throws(() => resolveDataRoot({ cliValue: 'datos-relativos' }), PathResolutionError);
});

test('resolveRecipeDir sigue funcionando con solo el nombre (compatibilidad)', () => {
  assert.equal(
    resolveRecipeDir('example', `${projectRoot}/recipes`),
    `${projectRoot}/recipes/example`,
  );
});
