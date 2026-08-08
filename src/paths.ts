import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, anclada a la ubicación de este fichero, nunca al directorio de trabajo. */
export const projectRoot: string = resolve(here, '..');

export function resolveRecipeDir(name: string): string {
  return resolve(projectRoot, 'recipes', name);
}
