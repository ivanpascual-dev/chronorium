import assert from 'node:assert/strict';
import { join } from 'node:path';
import { test } from 'node:test';
import { StatePathError, statePaths } from '../../src/state/paths.ts';

// H2/D2: única función que compone las rutas de estado (R10). Comprobadas como cadena, no como
// "algún fichero por ahí": es lo que ata el código a docs/03-modelo-datos.md.
test('la memoria de lo ya visto lleva el nombre de la receta; el registro de ejecuciones no', () => {
  const paths = statePaths('/datos', 'daily');

  assert.equal(paths.seenPath, join('/datos', 'state', 'seen--daily.json'));
  assert.equal(paths.runsPath, join('/datos', 'state', 'runs.ndjson'));
});

test('dos recetas sobre el mismo dataRoot producen rutas de memoria distintas, y el mismo registro', () => {
  const daily = statePaths('/datos', 'daily');
  const weekly = statePaths('/datos', 'weekly');

  assert.notEqual(daily.seenPath, weekly.seenPath);
  assert.equal(daily.runsPath, weekly.runsPath);
});

test('dataRoot debe ser una ruta absoluta (RF-A07)', () => {
  assert.throws(() => statePaths('datos-relativos', 'daily'), StatePathError);
});
