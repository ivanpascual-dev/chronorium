import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import type { Item } from '../../src/sources/types.ts';
import {
  filterUnseen,
  isSeen,
  loadSeen,
  markSeen,
  pruneSeen,
  SeenLoadError,
  saveSeen,
} from '../../src/state/seen.ts';

const now = new Date('2026-08-08T00:00:00.000Z');

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronorium-seen-test-'));
  dirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function item(overrides: Partial<Item> = {}): Item {
  return {
    title: 'Un título cualquiera',
    url: 'https://example.com/a',
    source: 'Ejemplo',
    summary: 'resumen',
    ...overrides,
  };
}

test('un fichero ausente produce memoria vacía, no un error', () => {
  const dir = makeDir();
  const path = join(dir, 'seen.json');

  const state = loadSeen(path);

  assert.deepEqual(state.entries, []);
});

test('un fichero presente pero con JSON corrupto produce un error, nunca memoria vacía silenciosa', () => {
  const dir = makeDir();
  const path = join(dir, 'seen.json');
  writeFileSync(path, '{ esto no es json', 'utf8');

  assert.throws(() => loadSeen(path), SeenLoadError);
});

test('un fichero presente con forma inválida produce un error', () => {
  const dir = makeDir();
  const path = join(dir, 'seen.json');
  writeFileSync(path, JSON.stringify({ schemaVersion: 1 }), 'utf8');

  assert.throws(() => loadSeen(path), SeenLoadError);
});

test('una ruta relativa se rechaza en vez de resolverse contra el directorio de trabajo', () => {
  assert.throws(() => loadSeen('state/seen.json'), SeenLoadError);
});

test('marcar un elemento añade dos huellas: la de la dirección y la del título normalizado', () => {
  const state = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);
  assert.equal(state.entries.length, 2);
  assert.ok(state.entries.some((e) => e.kind === 'url'));
  assert.ok(state.entries.some((e) => e.kind === 'title'));
});

test('la huella guardada no es el título ni la dirección en claro', () => {
  const state = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);
  for (const entry of state.entries) {
    assert.notEqual(entry.h, item().title);
    assert.notEqual(entry.h, item().url);
  }
});

test('un elemento ya marcado se filtra en una segunda pasada (no vuelve a aparecer)', () => {
  const first = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);

  const nextDayItems = [item(), item({ title: 'Otro distinto', url: 'https://example.com/b' })];
  const result = filterUnseen(first, nextDayItems);

  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, 'Otro distinto');
});

test('isSeen refleja lo mismo que filterUnseen, elemento a elemento', () => {
  const state = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);

  assert.equal(isSeen(state, item()), true);
  assert.equal(isSeen(state, item({ title: 'Nuevo', url: 'https://example.com/nuevo' })), false);
});

test('firstSeen no se reescribe al volver a ver el mismo elemento', () => {
  const day1 = new Date('2026-08-01T00:00:00.000Z');
  const day2 = new Date('2026-08-05T00:00:00.000Z');

  const afterDay1 = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], day1);
  const afterDay2 = markSeen(afterDay1, [item()], day2);

  for (const entry of afterDay2.entries) {
    assert.equal(entry.firstSeen, '2026-08-01');
  }
});

test('la poda por windowDays retira entradas más viejas que la ventana', () => {
  const old = markSeen(
    { schemaVersion: 1, windowDays: 30, entries: [] },
    [item()],
    new Date('2026-06-01T00:00:00.000Z'),
  );

  const pruned = pruneSeen(old, 30, now);

  assert.deepEqual(pruned.entries, []);
});

test('la poda conserva las entradas dentro de la ventana', () => {
  const recent = markSeen(
    { schemaVersion: 1, windowDays: 30, entries: [] },
    [item()],
    new Date('2026-08-01T00:00:00.000Z'),
  );

  const pruned = pruneSeen(recent, 30, now);

  assert.equal(pruned.entries.length, 2);
});

test('la escritura es atómica: el fichero final nunca queda a medias', () => {
  const dir = makeDir();
  const path = join(dir, 'seen.json');
  const state = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);

  saveSeen(path, state);

  assert.ok(existsSync(path));
  const onDisk = JSON.parse(readFileSync(path, 'utf8'));
  assert.equal(onDisk.entries.length, 2);

  const leftovers = readdirSync(dir).filter((name) => name !== 'seen.json');
  assert.deepEqual(leftovers, []);
});

test('guardar y volver a cargar produce el mismo estado', () => {
  const dir = makeDir();
  const path = join(dir, 'seen.json');
  const state = markSeen({ schemaVersion: 1, windowDays: 30, entries: [] }, [item()], now);

  saveSeen(path, state);
  const reloaded = loadSeen(path);

  assert.deepEqual(reloaded, state);
});
