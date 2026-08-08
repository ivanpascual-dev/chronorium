import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { SourceSpec } from '../../src/recipe/types.ts';
import { buildRegistry, defaultRegistry } from '../../src/sources/registry.ts';
import { makeCtx, textResponse } from './helpers.ts';

test('los cinco tipos de fábrica están registrados (RF-B02)', () => {
  assert.deepEqual(
    [...defaultRegistry.keys()].sort(),
    ['archive', 'feed', 'json-api', 'repo-releases', 'repo-search'].sort(),
  );
});

test('una fuente declarada "feed" cuya URL contiene reddit.com se lee con el lector feed, nunca inspeccionando la URL', async () => {
  const reader = defaultRegistry.get('feed');
  assert.ok(reader, 'debe existir un lector registrado bajo la clave "feed"');

  const rssBody =
    '<?xml version="1.0"?><rss version="2.0"><channel><item>' +
    '<title>Hilo popular</title><link>https://www.reddit.com/r/programming/comments/1</link>' +
    '</item></channel></rss>';

  const requestedUrls: string[] = [];
  const fetchImpl = async (url: string) => {
    requestedUrls.push(url);
    return textResponse(rssBody);
  };

  const source: SourceSpec = {
    id: 'reddit-declarado-como-feed',
    type: 'feed',
    url: 'https://www.reddit.com/r/programming/.rss',
  };

  const items = await reader?.read(source, makeCtx(fetchImpl));

  assert.deepEqual(requestedUrls, ['https://www.reddit.com/r/programming/.rss']);
  assert.equal(items?.length, 1);
  assert.equal(items?.[0]?.title, 'Hilo popular');
});

test('un tipo no registrado no tiene lector: el registro no adivina', () => {
  assert.equal(defaultRegistry.get('rss-atom-generico'), undefined);
});

test('buildRegistry permite construir un registro reducido, para tests que no quieren los cinco lectores', () => {
  const feedOnly = defaultRegistry.get('feed');
  assert.ok(feedOnly);
  const reduced = buildRegistry([feedOnly]);

  assert.deepEqual([...reduced.keys()], ['feed']);
});
