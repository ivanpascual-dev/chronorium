import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { projectRoot } from '../../src/paths.ts';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { jsonApiReader } from '../../src/sources/json-api.ts';
import { makeCtx, textResponse } from './helpers.ts';

const fixturePath = join(projectRoot, 'tests', 'fixtures', 'http', 'json-api.json');
const fixtureBody = readFileSync(fixturePath, 'utf8');

const source: SourceSpec = {
  id: 'devblog',
  type: 'json-api',
  url: 'https://example-devblog.test/api/noticias',
  mapping: {
    items: 'results',
    title: 'headline',
    url: 'permalink',
    publishedAt: 'published_at',
    summary: 'body',
  },
};

test('el mapeo declarado en la receta ubica cada campo, sin adivinar la forma', async () => {
  const items = await jsonApiReader.read(
    source,
    makeCtx(async () => textResponse(fixtureBody)),
  );

  assert.equal(items.length, 3);
  assert.equal(items[0]?.title, 'Se publica la especificación final de un formato de datos');
  assert.equal(items[0]?.url, 'https://example-devblog.test/noticias/formato-final');
  assert.equal(items[0]?.publishedAt, '2026-08-05T09:00:00Z');
  assert.equal(items[0]?.source, 'devblog');
});

test('un elemento sin el campo de fecha mapeado produce publishedAt ausente, no inventado', async () => {
  const items = await jsonApiReader.read(
    source,
    makeCtx(async () => textResponse(fixtureBody)),
  );

  const sinFecha = items.find((item) => item.title.includes('sin fecha de publicación'));
  assert.ok(sinFecha);
  assert.equal(sinFecha?.publishedAt, undefined);
});

test('sin mapping declarado, la fuente falla al leer en vez de adivinar la forma', async () => {
  const sinMapping: SourceSpec = { id: 'devblog', type: 'json-api', url: source.url };
  await assert.rejects(() =>
    jsonApiReader.read(
      sinMapping,
      makeCtx(async () => textResponse(fixtureBody)),
    ),
  );
});

test('si la ruta de items no encuentra una lista, la fuente falla en vez de devolver cero en silencio', async () => {
  const mapping = source.mapping as NonNullable<SourceSpec['mapping']>;
  const malMapeada: SourceSpec = { ...source, mapping: { ...mapping, items: 'no.existe' } };
  await assert.rejects(() =>
    jsonApiReader.read(
      malMapeada,
      makeCtx(async () => textResponse(fixtureBody)),
    ),
  );
});
