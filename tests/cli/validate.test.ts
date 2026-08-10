import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, test } from 'node:test';
import { EXIT_CONFIG_ERROR, EXIT_OK } from '../../src/cli/exit-codes.ts';
import { cliValidate } from '../../src/cli/validate.ts';
import { projectRoot } from '../../src/paths.ts';
import {
  captureConsole,
  cleanupTrackedDirs,
  makeGoogleRecipeDir,
  trackedTmpDir,
} from './helpers.ts';

after(cleanupTrackedDirs);

test('sin --recipe ⇒ código 1, sin tocar el disco', async () => {
  const console_ = captureConsole();
  try {
    const code = await cliValidate([], {});
    assert.equal(code, EXIT_CONFIG_ERROR);
  } finally {
    console_.restore();
  }
});

test('receta inexistente ⇒ código 1', async () => {
  const recipesRoot = trackedTmpDir('chronorium-validate-recipes-vacias-');
  const console_ = captureConsole();
  try {
    const code = await cliValidate(['--recipe', 'no-existe', '--recipes-root', recipesRoot], {});
    assert.equal(code, EXIT_CONFIG_ERROR);
  } finally {
    console_.restore();
  }
});

test('receta que no valida (canal de entrega desconocido) ⇒ código 1', async () => {
  const { recipesRoot } = makeGoogleRecipeDir({
    delivery: '[{ id: canal-inventado, enabled: true }]',
  });

  const console_ = captureConsole();
  try {
    const code = await cliValidate(['--recipe', 'receta', '--recipes-root', recipesRoot], {});
    assert.equal(code, EXIT_CONFIG_ERROR);
  } finally {
    console_.restore();
  }
});

test('receta válida sin credencial de modelo ⇒ código 0, y avisa del proveedor descartado', async () => {
  const { recipesRoot } = makeGoogleRecipeDir();

  const console_ = captureConsole();
  try {
    const code = await cliValidate(['--recipe', 'receta', '--recipes-root', recipesRoot], {});
    assert.equal(code, EXIT_OK);
    assert.ok(
      console_.lines.some((line) => line.includes('proveedor descartado')),
      'debe listar el proveedor sin credencial como descartado',
    );
    assert.ok(console_.lines.some((line) => line.includes('receta') && line.includes('válida')));
  } finally {
    console_.restore();
  }
});

test('A4: el valor del secreto nunca aparece en la salida, ni presente ni descartado', async () => {
  const { recipesRoot } = makeGoogleRecipeDir();
  const secretoReal = 'sk-valor-secreto-de-verdad';

  const console_ = captureConsole();
  try {
    const code = await cliValidate(['--recipe', 'receta', '--recipes-root', recipesRoot], {
      GOOGLE_GENERATIVE_AI_API_KEY: secretoReal,
    });
    assert.equal(code, EXIT_OK);
    for (const line of console_.lines) {
      assert.ok(!line.includes(secretoReal), `la salida no debe contener el secreto: "${line}"`);
    }
  } finally {
    console_.restore();
  }
});

test('un solo proveedor con credencial utilizable ⇒ avisa del punto único de fallo (RF-D04)', async () => {
  const { recipesRoot } = makeGoogleRecipeDir();

  const console_ = captureConsole();
  try {
    await cliValidate(['--recipe', 'receta', '--recipes-root', recipesRoot], {
      GOOGLE_GENERATIVE_AI_API_KEY: 'clave-de-prueba',
    });
    assert.ok(
      console_.lines.some((line) => line.includes('punto único de fallo')),
      'debe avisar en voz alta de la cadena con un solo eslabón vivo',
    );
  } finally {
    console_.restore();
  }
});

// Proceso hijo de verdad (mismo patrón que run.test.ts): el valor de retorno de `cliValidate` no
// es un código de salida real hasta que pasa por `main.ts`.
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

test('proceso hijo, "validate": receta inválida sale con 1', () => {
  const recipesRoot = trackedTmpDir('chronorium-validate-proc-recipes-');
  const recipeDir = join(recipesRoot, 'rota');
  mkdirSync(recipeDir, { recursive: true });
  writeFileSync(join(recipeDir, 'recipe.yaml'), 'language: es\n', 'utf8');
  writeFileSync(join(recipeDir, 'sections.yaml'), 'sections: []\n', 'utf8');
  writeFileSync(join(recipeDir, 'persona.md'), '# x\n', 'utf8');

  const { status } = runCli(
    ['validate', '--recipe', 'rota', '--recipes-root', recipesRoot],
    minimalEnv(),
  );

  assert.equal(status, 1);
});

test('proceso hijo, "validate": receta válida sale con 0', () => {
  const { recipesRoot } = makeGoogleRecipeDir({ name: 'valida' });

  const { status, stdout } = runCli(
    ['validate', '--recipe', 'valida', '--recipes-root', recipesRoot],
    minimalEnv(),
  );

  assert.equal(status, 0);
  assert.ok(stdout.includes('válida'));
});
