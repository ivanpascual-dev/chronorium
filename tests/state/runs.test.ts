import assert from 'node:assert/strict';
import { appendFileSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { appendRun, RunsPathError, readHealth } from '../../src/state/runs.ts';
import type { RunRecord } from '../../src/state/types.ts';

const dirs: string[] = [];

function makeDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'chronorium-runs-test-'));
  dirs.push(dir);
  return dir;
}

after(() => {
  for (const dir of dirs) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function runsPath(dataRoot: string): string {
  return join(dataRoot, 'runs.ndjson');
}

function record(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    ts: '2026-08-09T08:00:00.000Z',
    recipe: 'daily',
    result: 'ok',
    exitCode: 0,
    durationMs: 1000,
    ...overrides,
  };
}

test('tres ejecuciones dejan tres líneas, y la primera sigue intacta', () => {
  const path = runsPath(makeDir());
  appendRun(path, record({ ts: '2026-08-01T08:00:00.000Z' }));
  appendRun(path, record({ ts: '2026-08-02T08:00:00.000Z' }));
  appendRun(path, record({ ts: '2026-08-03T08:00:00.000Z' }));

  const lines = readFileSync(path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 3);
  assert.equal(JSON.parse(lines[0] ?? '').ts, '2026-08-01T08:00:00.000Z');
});

test('una ejecución fallida también deja su línea', () => {
  const path = runsPath(makeDir());
  appendRun(path, record({ result: 'model_failed', exitCode: 3, lastError: '503' }));

  const lines = readFileSync(path, 'utf8').trim().split('\n');
  assert.equal(lines.length, 1);
  assert.equal(JSON.parse(lines[0] ?? '').result, 'model_failed');
});

test('readHealth cuenta ejecuciones dentro de la ventana, con líneas fuera que no cuentan', () => {
  const path = runsPath(makeDir());
  const now = new Date('2026-08-09T12:00:00.000Z');

  // Ventana de 30 días: corte en 2026-07-10T12:00Z. 19 días sanos, todos dentro de la ventana y
  // sin pasarse de "now" (2026-07-22 a 2026-08-09, 19 fechas).
  const okDays = [
    '2026-07-22',
    '2026-07-23',
    '2026-07-24',
    '2026-07-25',
    '2026-07-26',
    '2026-07-27',
    '2026-07-28',
    '2026-07-29',
    '2026-07-30',
    '2026-07-31',
    '2026-08-01',
    '2026-08-02',
    '2026-08-03',
    '2026-08-04',
    '2026-08-05',
    '2026-08-06',
    '2026-08-07',
    '2026-08-08',
    '2026-08-09',
  ];
  for (const day of okDays) {
    appendRun(path, record({ ts: `${day}T08:00:00.000Z` }));
  }

  // Once ejecuciones fallidas más, todavía dentro de la ventana (después del corte).
  const failedDays = [
    '2026-07-11',
    '2026-07-12',
    '2026-07-13',
    '2026-07-14',
    '2026-07-15',
    '2026-07-16',
    '2026-07-17',
    '2026-07-18',
    '2026-07-19',
    '2026-07-20',
    '2026-07-21',
  ];
  for (const day of failedDays) {
    appendRun(path, record({ ts: `${day}T08:00:00.000Z`, result: 'no_items', exitCode: 2 }));
  }

  // Fuera de la ventana de 30 días: no debe contar.
  appendRun(path, record({ ts: '2026-06-01T08:00:00.000Z' }));

  const health = readHealth(path, 30, now);
  assert.equal(health.runsOk, 19);
  assert.equal(health.runsFailed, 11);
  assert.equal(health.windowDays, 30);
});

test('un skipped_existing cuenta como sano, no como día perdido', () => {
  const path = runsPath(makeDir());
  const now = new Date('2026-08-09T12:00:00.000Z');
  appendRun(path, record({ ts: '2026-08-09T08:00:00.000Z', result: 'skipped_existing' }));

  const health = readHealth(path, 30, now);
  assert.equal(health.runsOk, 1);
  assert.equal(health.runsFailed, 0);
});

test('readHealth filtra por receta cuando se declara: dos recetas comparten el fichero', () => {
  const path = runsPath(makeDir());
  const now = new Date('2026-08-09T12:00:00.000Z');
  appendRun(path, record({ ts: '2026-08-09T08:00:00.000Z', recipe: 'daily', result: 'ok' }));
  appendRun(
    path,
    record({ ts: '2026-08-09T09:00:00.000Z', recipe: 'weekly', result: 'model_failed' }),
  );

  const dailyHealth = readHealth(path, 30, now, 'daily');
  assert.equal(dailyHealth.runsOk, 1);
  assert.equal(dailyHealth.runsFailed, 0);
});

test('un runs.ndjson con una línea corrupta no tumba la lectura: se ignora y se sigue', () => {
  const path = runsPath(makeDir());
  const now = new Date('2026-08-09T12:00:00.000Z');
  appendRun(path, record({ ts: '2026-08-09T08:00:00.000Z' }));

  appendFileSync(path, '{ esto no es json válido\n');
  appendRun(path, record({ ts: '2026-08-09T09:00:00.000Z' }));

  const health = readHealth(path, 30, now);
  assert.equal(health.runsOk, 2);
});

test('readHealth sin fichero devuelve salud vacía, no un error', () => {
  const dataRoot = makeDir();
  const health = readHealth(runsPath(dataRoot), 30, new Date('2026-08-09T12:00:00.000Z'));
  assert.deepEqual(health, { windowDays: 30, runsOk: 0, runsFailed: 0 });
});

test('appendRun y readHealth exigen una ruta absoluta (RF-A07)', () => {
  assert.throws(() => appendRun('runs.ndjson', record()), RunsPathError);
  assert.throws(() => readHealth('runs.ndjson', 30, new Date()), RunsPathError);
});
