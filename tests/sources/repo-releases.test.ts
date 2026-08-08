import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectRoot } from '../../src/paths.ts';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { repoReleasesReader } from '../../src/sources/repo-releases.ts';
import { makeCtx, textResponse } from './helpers.ts';

const fixturePath = join(projectRoot, 'tests', 'fixtures', 'http', 'repo-releases.json');
const fixtureBody = readFileSync(fixturePath, 'utf8');

const source: SourceSpec = {
  id: 'lanzamientos',
  type: 'repo-releases',
  repos: ['ejemplo-org/herramienta-nueva'],
};

test('lee los lanzamientos de cada repositorio declarado, sin borradores ni candidatos', async () => {
  const items = await repoReleasesReader.read(
    source,
    makeCtx(async () => textResponse(fixtureBody)),
  );

  assert.equal(items.length, 2);
  assert.ok(items.every((item) => !item.title.includes('rc1')));
});

test('el título nombra el repositorio y el resumen es el cuerpo del lanzamiento', async () => {
  const items = await repoReleasesReader.read(
    source,
    makeCtx(async () => textResponse(fixtureBody)),
  );

  assert.equal(items[0]?.title, 'ejemplo-org/herramienta-nueva: v2.4.0');
  assert.match(items[0]?.summary ?? '', /configuración declarativa/);
});

test('varios repositorios se combinan en un único conjunto de elementos', async () => {
  const dosRepos: SourceSpec = {
    id: 'lanzamientos',
    type: 'repo-releases',
    repos: ['ejemplo-org/herramienta-nueva', 'otra-org/proyecto-joven'],
  };

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return textResponse(fixtureBody);
  };

  const items = await repoReleasesReader.read(dosRepos, makeCtx(fetchImpl));

  assert.equal(calls, 2);
  assert.equal(items.length, 4);
});

test('una fuente sin repos declarados falla al leer', async () => {
  await assert.rejects(() =>
    repoReleasesReader.read(
      { id: 'x', type: 'repo-releases' },
      makeCtx(async () => textResponse(fixtureBody)),
    ),
  );
});
