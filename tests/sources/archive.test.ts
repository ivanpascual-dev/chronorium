import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectRoot } from '../../src/paths.ts';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { archiveReader } from '../../src/sources/archive.ts';
import { makeCtx, textResponse } from './helpers.ts';

const fixturesDataRoot = join(projectRoot, 'tests', 'fixtures');

const source: SourceSpec = { id: 'destilado', type: 'archive' };

test('lee informes schemaVersion 2, y descarta secciones sin un campo de dirección reconocible', async () => {
  const items = await archiveReader.read(
    { ...source, recipe: 'daily' },
    makeCtx(async () => textResponse(''), { dataRoot: fixturesDataRoot }),
  );

  assert.equal(items.length, 2); // "pulse" no aporta nada, "releases" aporta 2
  assert.ok(items.every((item) => item.source === 'archive/daily'));
  assert.equal(items[0]?.title, 'herramienta-nueva publica la v2.4.0');
  assert.equal(items[0]?.publishedAt, '2026-08-05');
  assert.match(items[0]?.summary ?? '', /configuración declarativa/);
});

test('tolera el formato schemaVersion 1, con sus propios nombres de campo (ADR-013)', async () => {
  const items = await archiveReader.read(
    { ...source, recipe: 'weekly' },
    makeCtx(async () => textResponse(''), { dataRoot: fixturesDataRoot }),
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.source, 'archive/legacy');
  assert.equal(items[0]?.title, 'El sistema anterior publica su boletín semanal número doce');
  assert.equal(items[0]?.publishedAt, '2026-05-20');
});

test('sin "recipe" declarado, lee todos los informes del directorio', async () => {
  const items = await archiveReader.read(
    source,
    makeCtx(async () => textResponse(''), { dataRoot: fixturesDataRoot }),
  );

  assert.equal(items.length, 4); // 2 de daily + 2 de weekly
});

test('un dataRoot sin carpeta archive produce cero elementos, no un error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'chronorium-archive-test-'));

  const items = await archiveReader.read(
    source,
    makeCtx(async () => textResponse(''), { dataRoot: dir }),
  );

  assert.deepEqual(items, []);
});
