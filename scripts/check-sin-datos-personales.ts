// RF-A02: src/ no debe contener nombres de persona, correos, profesiones ni contexto personal.
//
// Los terminos a buscar (tu nombre real, tus proyectos anteriores, tu profesion...) NUNCA viven
// en un fichero del repositorio: son tan sensibles como una credencial, y esto es publico (R3).
// Se leen de la variable de entorno PERSONAL_TERMS, separados por comas. En CI se define como
// secreto del repositorio; en local, se exporta antes de ejecutar el check y no deja rastro.
//
// Sin esa variable definida, el check sigue corriendo y sigue detectando correos (no depende de
// ningun dato personal para eso), simplemente no tiene la lista adicional de terminos.

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC_DIR = 'src';
const EMAIL_PATTERN = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// El identificador de cliente (RF-B08, src/cli/run.ts) lleva la URL del propio repositorio
// público. No es una fuga: esa URL ya es pública, es el "git remote" de este mismo repositorio.
// Colisiona con PERSONAL_TERMS solo porque el usuario de GitHub del dueño contiene su nombre como
// subcadena. Se excluye por su valor exacto antes de comparar, sin tocar PERSONAL_TERMS (que debe
// seguir siendo estricto para los casos reales).
const PUBLIC_EXCEPTIONS = ['https://github.com/ivanpascual-dev/chronorium'];

function loadTerms(): string[] {
  const raw = process.env.PERSONAL_TERMS ?? '';
  return raw
    .split(',')
    .map((term) => term.trim())
    .filter((term) => term.length > 0);
}

function listFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function main(): void {
  const terms = loadTerms();
  const hallazgos: string[] = [];

  for (const file of listFiles(SRC_DIR)) {
    const lines = readFileSync(file, 'utf8').split('\n');

    lines.forEach((line, index) => {
      for (const email of line.match(EMAIL_PATTERN) ?? []) {
        hallazgos.push(`${file}:${index + 1} · correo: ${email}`);
      }
      const lineWithoutExceptions = PUBLIC_EXCEPTIONS.reduce(
        (acc, exception) => acc.split(exception).join(''),
        line,
      );
      for (const term of terms) {
        if (lineWithoutExceptions.toLowerCase().includes(term.toLowerCase())) {
          hallazgos.push(`${file}:${index + 1} · termino prohibido: "${term}"`);
        }
      }
    });
  }

  if (hallazgos.length > 0) {
    console.error('Datos personales encontrados en src/ (RF-A02):\n');
    for (const hallazgo of hallazgos) {
      console.error(`  ${hallazgo}`);
    }
    process.exit(1);
  }

  console.log('src/ sin datos personales (RF-A02).');
}

main();
