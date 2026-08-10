import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { cliDoctor } from '../../src/cli/doctor.ts';
import { projectRoot } from '../../src/paths.ts';
import {
  captureConsole,
  cleanupTrackedDirs,
  makeGoogleRecipeDir,
  trackedTmpDir,
} from './helpers.ts';

after(cleanupTrackedDirs);

// `doctor.ts` llama a `readHealth(..., new Date(), ...)`: no acepta un reloj inyectado (lee la
// salud "ahora mismo", RF-G04). Los timestamps de las fixtures se anclan al instante real del test,
// nunca a una fecha fija, para caer siempre dentro de la ventana declarada.
function runRecordLine(recipe: string, result: 'ok' | 'model_failed', offsetMs = 0): string {
  return JSON.stringify({
    ts: new Date(Date.now() - offsetMs).toISOString(),
    recipe,
    result,
    exitCode: result === 'ok' ? 0 : 3,
    durationMs: 1,
  });
}

function writeRuns(dataRoot: string, lines: readonly string[]): void {
  mkdirSync(dataRoot, { recursive: true });
  writeFileSync(join(dataRoot, 'runs.ndjson'), `${lines.join('\n')}\n`, 'utf8');
}

test('sin --recipe ⇒ código 1', async () => {
  const console_ = captureConsole();
  try {
    const code = await cliDoctor([], {});
    assert.equal(code, 1);
  } finally {
    console_.restore();
  }
});

test('receta inexistente ⇒ código 1', async () => {
  const recipesRoot = trackedTmpDir('chronorium-doctor-recipes-vacias-');
  const dataRoot = trackedTmpDir('chronorium-doctor-data-');
  const console_ = captureConsole();
  try {
    const code = await cliDoctor(
      ['--recipe', 'no-existe', '--recipes-root', recipesRoot, '--data-root', dataRoot],
      {},
    );
    assert.equal(code, 1);
  } finally {
    console_.restore();
  }
});

test('sin runs.ndjson todavía (ninguna ejecución registrada) ⇒ código 0', async () => {
  const { recipesRoot } = makeGoogleRecipeDir({ name: 'sin-runs' });
  const dataRoot = trackedTmpDir('chronorium-doctor-data-');

  const console_ = captureConsole();
  try {
    const code = await cliDoctor(
      ['--recipe', 'sin-runs', '--recipes-root', recipesRoot, '--data-root', dataRoot],
      {},
    );
    assert.equal(code, 0);
    assert.ok(console_.lines.some((line) => line.includes('0 de los últimos 30')));
  } finally {
    console_.restore();
  }
});

test('tasa de fallo por debajo del umbral ⇒ código 0', async () => {
  const { recipesRoot } = makeGoogleRecipeDir({
    name: 'sana',
    health: '{ windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }',
  });
  const dataRoot = trackedTmpDir('chronorium-doctor-data-');
  writeRuns(dataRoot, [
    runRecordLine('sana', 'ok'),
    runRecordLine('sana', 'ok'),
    runRecordLine('sana', 'model_failed'),
  ]);

  const console_ = captureConsole();
  try {
    const code = await cliDoctor(
      ['--recipe', 'sana', '--recipes-root', recipesRoot, '--data-root', dataRoot],
      {},
    );
    assert.equal(code, 0);
    assert.ok(console_.lines.some((line) => line.includes('2 de los últimos 30')));
  } finally {
    console_.restore();
  }
});

test('tasa de fallo por encima del umbral ⇒ código 1, y lo dice', async () => {
  const { recipesRoot } = makeGoogleRecipeDir({
    name: 'enferma',
    health: '{ windowDays: 30, runFailureThreshold: 0.2, sourceFailureThreshold: 0.5 }',
  });
  const dataRoot = trackedTmpDir('chronorium-doctor-data-');
  writeRuns(dataRoot, [
    runRecordLine('enferma', 'ok'),
    runRecordLine('enferma', 'model_failed'),
    runRecordLine('enferma', 'model_failed'),
  ]);

  const console_ = captureConsole();
  try {
    const code = await cliDoctor(
      ['--recipe', 'enferma', '--recipes-root', recipesRoot, '--data-root', dataRoot],
      {},
    );
    assert.equal(code, 1);
    assert.ok(console_.lines.some((line) => line.includes('umbral')));
  } finally {
    console_.restore();
  }
});

test('R13/RF-G04: filtra por receta, no mezcla la salud de otra que comparte runs.ndjson', async () => {
  const { recipesRoot } = makeGoogleRecipeDir({
    name: 'propia',
    health: '{ windowDays: 30, runFailureThreshold: 0.5, sourceFailureThreshold: 0.5 }',
  });
  const dataRoot = trackedTmpDir('chronorium-doctor-data-');
  writeRuns(dataRoot, [
    runRecordLine('propia', 'ok'),
    // La otra receta falla todo el tiempo: si "propia" la contara, saldría con 1.
    runRecordLine('otra', 'model_failed'),
    runRecordLine('otra', 'model_failed'),
    runRecordLine('otra', 'model_failed'),
  ]);

  const console_ = captureConsole();
  try {
    const code = await cliDoctor(
      ['--recipe', 'propia', '--recipes-root', recipesRoot, '--data-root', dataRoot],
      {},
    );
    assert.equal(code, 0);
    assert.ok(console_.lines.some((line) => line.includes('1 de los últimos 30')));
  } finally {
    console_.restore();
  }
});

// Proceso hijo de verdad (mismo patrón que run.test.ts).
const mainPath = join(projectRoot, 'src', 'cli', 'main.ts');

function runCli(
  args: readonly string[],
  env: NodeJS.ProcessEnv,
): { status: number | null; stdout: string } {
  const result = spawnSync(process.execPath, [mainPath, ...args], {
    env,
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { status: result.status, stdout: result.stdout };
}

function minimalEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const base: NodeJS.ProcessEnv = {};
  if (process.env.PATH !== undefined) base.PATH = process.env.PATH;
  if (process.env.HOME !== undefined) base.HOME = process.env.HOME;
  return { ...base, ...extra };
}

test('proceso hijo, "doctor": sin historial sale con 0', () => {
  const { recipesRoot } = makeGoogleRecipeDir({ name: 'nueva' });
  const dataRoot = trackedTmpDir('chronorium-doctor-proc-data-');

  const { status, stdout } = runCli(
    ['doctor', '--recipe', 'nueva', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(),
  );

  assert.equal(status, 0);
  assert.ok(stdout.includes('tuvieron informe'));
});

test('proceso hijo, "doctor": tasa de fallo por encima del umbral sale con 1', () => {
  const { recipesRoot } = makeGoogleRecipeDir({
    name: 'proc-enferma',
    health: '{ windowDays: 30, runFailureThreshold: 0.1, sourceFailureThreshold: 0.5 }',
  });
  const dataRoot = trackedTmpDir('chronorium-doctor-proc-data-');
  writeRuns(dataRoot, [
    runRecordLine('proc-enferma', 'model_failed'),
    runRecordLine('proc-enferma', 'model_failed'),
  ]);

  const { status } = runCli(
    ['doctor', '--recipe', 'proc-enferma', '--recipes-root', recipesRoot, '--data-root', dataRoot],
    minimalEnv(),
  );

  assert.equal(status, 1);
});
