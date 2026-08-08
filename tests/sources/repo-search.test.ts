import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectRoot } from '../../src/paths.ts';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { repoSearchReader } from '../../src/sources/repo-search.ts';
import { makeCtx, textResponse } from './helpers.ts';

const fixturePath = join(projectRoot, 'tests', 'fixtures', 'http', 'repo-search.json');
const fixtureBody = readFileSync(fixturePath, 'utf8');

const source: SourceSpec = {
  id: 'radar-cli',
  type: 'repo-search',
  query: 'topic:cli language:typescript',
};

test('RF-B09: la petición construida acota por created: derivado de la ventana de la receta', async () => {
  let requestedUrl: string | undefined;
  const fetchImpl = async (url: string) => {
    requestedUrl = url;
    return textResponse(fixtureBody);
  };

  await repoSearchReader.read(
    source,
    makeCtx(fetchImpl, { windowDays: 7, now: new Date('2026-08-08T00:00:00Z') }),
  );

  assert.ok(requestedUrl);
  const decoded = decodeURIComponent(requestedUrl as string);
  assert.match(decoded, /created:>=2026-08-01/);
});

test('nunca ordena por total acumulado sin acotar: siempre pide sort=stars junto al created:', async () => {
  let requestedUrl: string | undefined;
  const fetchImpl = async (url: string) => {
    requestedUrl = url;
    return textResponse(fixtureBody);
  };

  await repoSearchReader.read(source, makeCtx(fetchImpl));

  assert.match(requestedUrl ?? '', /sort=stars/);
  assert.match(decodeURIComponent(requestedUrl ?? ''), /created:>=/);
});

test('produce un elemento por repositorio de la respuesta', async () => {
  const items = await repoSearchReader.read(
    source,
    makeCtx(async () => textResponse(fixtureBody)),
  );

  assert.equal(items.length, 2);
  assert.equal(items[0]?.title, 'ejemplo-org/herramienta-nueva');
  assert.equal(items[0]?.url, 'https://github.com/ejemplo-org/herramienta-nueva');
  assert.equal(items[0]?.publishedAt, '2026-08-01T10:00:00Z');
});

test('sin token en el entorno, no manda cabecera Authorization', async () => {
  let seenHeaders: Record<string, string> | undefined;
  const fetchImpl = async (_url: string, init: { headers: Record<string, string> }) => {
    seenHeaders = init.headers;
    return textResponse(fixtureBody);
  };

  await repoSearchReader.read(source, makeCtx(fetchImpl, { secret: () => undefined }));

  assert.equal(seenHeaders?.Authorization, undefined);
});

test('con GITHUB_TOKEN presente en el entorno, lo manda como Bearer', async () => {
  let seenHeaders: Record<string, string> | undefined;
  const fetchImpl = async (_url: string, init: { headers: Record<string, string> }) => {
    seenHeaders = init.headers;
    return textResponse(fixtureBody);
  };

  await repoSearchReader.read(
    source,
    makeCtx(fetchImpl, {
      secret: (name) => (name === 'GITHUB_TOKEN' ? 'token-de-prueba' : undefined),
    }),
  );

  assert.equal(seenHeaders?.Authorization, 'Bearer token-de-prueba');
});

test('una fuente sin query declarada falla al leer', async () => {
  await assert.rejects(() =>
    repoSearchReader.read(
      { id: 'x', type: 'repo-search' },
      makeCtx(async () => textResponse(fixtureBody)),
    ),
  );
});
