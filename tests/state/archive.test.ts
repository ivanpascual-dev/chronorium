import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { Report } from '../../src/render/types.ts';
import { archiveReader } from '../../src/sources/archive.ts';
import {
  ArchiveExistsError,
  archiveExists,
  archivePaths,
  writeArchive,
} from '../../src/state/archive.ts';

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronorium-archive-test-'));
  dirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function report(overrides: Partial<Report> = {}): Report {
  return {
    schemaVersion: 2,
    recipe: 'daily',
    date: '2026-08-09',
    generatedAt: '2026-08-09T08:00:00.000Z',
    sections: [
      {
        key: 'top',
        title: 'Lo más relevante',
        items: [{ title: 'Uno', link: 'https://real.example/uno' }],
      },
    ],
    meta: {
      provider: 'google',
      providerWasFallback: false,
      itemsCollected: 1,
      itemsAnalyzed: 1,
      sourcesOk: 1,
      sourcesFailed: 0,
      linksDropped: 0,
      health: { windowDays: 30, runsOk: 30, runsFailed: 0 },
      degraded: [],
    },
    ...overrides,
  };
}

test('escribir un informe deja los dos ficheros, .json y .md, con el nombre exacto', () => {
  const dataRoot = makeDir();
  const paths = writeArchive(dataRoot, report(), '# Lo más relevante\n');

  assert.ok(paths.jsonPath.endsWith('archive/2026-08-09--daily.json'));
  assert.ok(paths.mdPath.endsWith('archive/2026-08-09--daily.md'));
  assert.equal(JSON.parse(readFileSync(paths.jsonPath, 'utf8')).recipe, 'daily');
  assert.equal(readFileSync(paths.mdPath, 'utf8'), '# Lo más relevante\n');
});

test('RF-C04: escribir sobre una fecha y receta que ya existen no sobrescribe y lo dice', () => {
  const dataRoot = makeDir();
  writeArchive(dataRoot, report(), '# Original\n');
  const original = readFileSync(archivePaths(dataRoot, '2026-08-09', 'daily').jsonPath, 'utf8');

  assert.throws(
    () => writeArchive(dataRoot, report({ generatedAt: '2026-08-09T09:00:00.000Z' }), '# Nuevo\n'),
    ArchiveExistsError,
  );

  const afterAttempt = readFileSync(archivePaths(dataRoot, '2026-08-09', 'daily').jsonPath, 'utf8');
  assert.equal(afterAttempt, original, 'el contenido anterior sigue byte a byte igual');
});

test('dos recetas distintas el mismo día conviven', () => {
  const dataRoot = makeDir();
  writeArchive(dataRoot, report({ recipe: 'daily' }), '# Daily\n');
  writeArchive(dataRoot, report({ recipe: 'weekly' }), '# Weekly\n');

  assert.ok(archiveExists(dataRoot, '2026-08-09', 'daily'));
  assert.ok(archiveExists(dataRoot, '2026-08-09', 'weekly'));
});

test('archiveExists distingue lo que ya está archivado de lo que no', () => {
  const dataRoot = makeDir();
  assert.equal(archiveExists(dataRoot, '2026-08-09', 'daily'), false);
  writeArchive(dataRoot, report(), '# x\n');
  assert.equal(archiveExists(dataRoot, '2026-08-09', 'daily'), true);
});

test('el .json escrito, releído por src/sources/archive.ts, produce elementos', async () => {
  const dataRoot = makeDir();
  writeArchive(dataRoot, report(), '# x\n');

  const items = await archiveReader.read(
    { id: 'destilado', type: 'archive' },
    {
      now: new Date('2026-08-09T12:00:00.000Z'),
      fetch: async () => {
        throw new Error('archive no debe usar fetch');
      },
      timeoutMs: 1000,
      userAgent: 'test/1.0',
      dataRoot,
      windowDays: 7,
      secret: () => undefined,
    },
  );

  assert.equal(items.length, 1);
  assert.equal(items[0]?.title, 'Uno');
  assert.equal(items[0]?.url, 'https://real.example/uno');
});
