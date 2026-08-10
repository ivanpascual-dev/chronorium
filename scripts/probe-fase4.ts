// La prueba con red real de la fase 4 (T15 del plan). Consume `runOnce()` tal cual (R10): no
// reimplementa la carga de la receta, la recolección, la síntesis, el renderizado, el archivo ni
// la entrega.
//
// Tres partes, cada una con su condición:
//   1. Ejecución completa contra un directorio de datos temporal, con el modelo real: siempre que
//      haya al menos una credencial de modelo. Verifica el camino largo hasta el archivo escrito,
//      sin depender del correo.
//   2. Informe real entregado por Gmail: si además hay credenciales SMTP. Se activa el canal de
//      correo en una COPIA temporal de recipes/example (nunca se toca el fichero committeado), con
//      `to`/`from` igual a `SMTP_USER`: el operador se manda el informe a sí mismo.
//   3. Segunda ejecución el mismo día, mismo directorio de datos: no debe sobrescribir el archivo
//      y debe salir con 0 (`skipped_existing`).
//
// Sin ninguna credencial de modelo, no se simula nada: se deja listo y se dice el comando exacto.

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { realDeliverFetch, realSourceFetch, runOnce } from '../src/cli/run.ts';
import { resolveRecipeDir } from '../src/paths.ts';

const GOOGLE_KEY = 'GOOGLE_GENERATIVE_AI_API_KEY';
const OPENAI_KEY = 'OPENAI_API_KEY';
const SMTP_VARS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD'] as const;

const secret = (name: string): string | undefined => process.env[name];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Copia `recipes/example` a un directorio temporal, con el canal `email` activado y apuntando al
 * propio `SMTP_USER` (el operador se manda el informe a sí mismo). Nunca toca el fichero
 * committeado (D2, ADR-002: la receta de ejemplo es la que ejercita el CI).
 */
function makeRecipeDirConCorreoActivo(smtpUser: string): string {
  const originalDir = resolveRecipeDir('example');
  const tmpDir = mkdtempSync(join(tmpdir(), 'chronorium-probe-fase4-receta-'));

  const recipeRaw = parseYaml(readFileSync(join(originalDir, 'recipe.yaml'), 'utf8'));
  if (!isRecord(recipeRaw) || !Array.isArray(recipeRaw.delivery)) {
    throw new Error('recipes/example/recipe.yaml no declara "delivery" como lista');
  }
  recipeRaw.delivery = recipeRaw.delivery.map((channel) =>
    isRecord(channel) && channel.id === 'email'
      ? { ...channel, enabled: true, to: smtpUser, from: smtpUser }
      : channel,
  );

  writeFileSync(join(tmpDir, 'recipe.yaml'), stringifyYaml(recipeRaw), 'utf8');
  writeFileSync(
    join(tmpDir, 'sections.yaml'),
    readFileSync(join(originalDir, 'sections.yaml'), 'utf8'),
    'utf8',
  );
  writeFileSync(
    join(tmpDir, 'persona.md'),
    readFileSync(join(originalDir, 'persona.md'), 'utf8'),
    'utf8',
  );

  return tmpDir;
}

async function main(): Promise<void> {
  const hasGoogle = Boolean(process.env[GOOGLE_KEY]);
  const hasOpenAi = Boolean(process.env[OPENAI_KEY]);
  const hasSmtp = SMTP_VARS.every((name) => Boolean(process.env[name]));

  if (!hasGoogle && !hasOpenAi) {
    console.log('Ninguna credencial de modelo está definida. Para completar esta prueba:');
    console.log('');
    console.log(`  ${GOOGLE_KEY}=... pnpm run probe:fase4`);
    console.log(
      `  ${GOOGLE_KEY}=... SMTP_HOST=smtp.gmail.com SMTP_PORT=465 SMTP_USER=tu@gmail.com \\`,
    );
    console.log(
      '  SMTP_PASSWORD=contraseña-de-aplicación pnpm run probe:fase4   # además envía correo real',
    );
    return;
  }

  console.log('=== Parte 1: ejecución completa contra un directorio de datos temporal ===');
  console.log('');

  const dataRoot = mkdtempSync(join(tmpdir(), 'chronorium-probe-fase4-datos-'));
  const recipeDir = resolveRecipeDir('example');
  const now = new Date();

  try {
    const result1 = await runOnce({
      recipeDir,
      dataRoot,
      dryRun: false,
      now,
      secret,
      sourceFetch: realSourceFetch,
      deliverFetch: realDeliverFetch,
      userAgent: 'chronorium-probe-fase4/1.0',
    });

    console.log(`Resultado: ${result1.result} (código ${result1.exitCode})`);
    if (result1.exitCode !== 0) {
      throw new Error(`la parte 1 falló con las credenciales de modelo puestas: ${result1.result}`);
    }
    console.log(`Archivo escrito en: ${join(dataRoot, 'archive')}`);
    console.log('');

    if (!hasSmtp) {
      console.log('Sin credenciales SMTP completas (SMTP_HOST, SMTP_PORT, SMTP_USER,');
      console.log('SMTP_PASSWORD): las partes 2 (entrega real por Gmail) y 3 (segunda ejecución,');
      console.log('no sobrescribe) quedan pendientes. Para completarlas, exporta también los');
      console.log('cuatro secretos SMTP (docs/05-seguridad-legal.md) y repite el comando.');
      return;
    }

    console.log('=== Parte 2: informe real entregado por correo ===');
    console.log('');
    const smtpUser = process.env.SMTP_USER as string;
    const recipeConCorreoDir = makeRecipeDirConCorreoActivo(smtpUser);

    try {
      const dataRootParte2 = mkdtempSync(join(tmpdir(), 'chronorium-probe-fase4-correo-'));
      try {
        const result2 = await runOnce({
          recipeDir: recipeConCorreoDir,
          dataRoot: dataRootParte2,
          dryRun: false,
          now,
          secret,
          sourceFetch: realSourceFetch,
          deliverFetch: realDeliverFetch,
          userAgent: 'chronorium-probe-fase4/1.0',
        });

        console.log(`Resultado: ${result2.result} (código ${result2.exitCode})`);
        if (result2.exitCode !== 0) {
          for (const canal of result2.deliverOutcome?.results ?? []) {
            if (!canal.ok) {
              console.error(`  canal "${canal.id}": ${canal.error ?? 'sin detalle'}`);
            }
          }
          throw new Error(`la parte 2 no entregó correctamente: ${result2.result}`);
        }
        console.log(`Correo enviado a ${smtpUser}. Ábrelo y comprueba que se lee bien (T16).`);
        console.log('');

        console.log('=== Parte 3: segunda ejecución el mismo día, no sobrescribe ===');
        console.log('');
        // El nombre de receta que usa el archivo es el `basename` del directorio (`report.recipe`,
        // `src/state/archive.ts`), no "example": `recipeConCorreoDir` es una copia temporal con
        // nombre generado, no el original.
        const nombreArchivo = `${now.toISOString().slice(0, 10)}--${basename(recipeConCorreoDir)}.json`;
        const before = readFileSync(join(dataRootParte2, 'archive', nombreArchivo), 'utf8');
        const result3 = await runOnce({
          recipeDir: recipeConCorreoDir,
          dataRoot: dataRootParte2,
          dryRun: false,
          now,
          secret,
          sourceFetch: realSourceFetch,
          deliverFetch: realDeliverFetch,
          userAgent: 'chronorium-probe-fase4/1.0',
        });
        const after = readFileSync(join(dataRootParte2, 'archive', nombreArchivo), 'utf8');

        console.log(`Resultado: ${result3.result} (código ${result3.exitCode})`);
        if (result3.result !== 'skipped_existing' || result3.exitCode !== 0) {
          throw new Error(
            `la segunda ejecución debía salir "skipped_existing" con código 0, salió: ${result3.result}/${result3.exitCode}`,
          );
        }
        if (before !== after) {
          throw new Error(
            'el archivo cambió entre la primera y la segunda ejecución (RF-C04 roto)',
          );
        }
        console.log('El informe no se sobrescribió, byte a byte igual.');
      } finally {
        rmSync(dataRootParte2, { recursive: true, force: true });
      }
    } finally {
      rmSync(recipeConCorreoDir, { recursive: true, force: true });
    }
  } finally {
    rmSync(dataRoot, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
