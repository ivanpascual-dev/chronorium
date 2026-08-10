import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Raíz del repositorio, anclada a la ubicación de este fichero, nunca al directorio de trabajo. */
export const projectRoot: string = resolve(here, '..');

export class PathResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PathResolutionError';
  }
}

function requireAbsoluteOverride(value: string, label: string): string {
  if (!isAbsolute(value)) {
    throw new PathResolutionError(
      `${label} debe ser una ruta absoluta, y no depender del directorio de trabajo: ${value}`,
    );
  }
  return value;
}

export interface ResolvePathOptions {
  readonly cliValue?: string;
  readonly env?: NodeJS.ProcessEnv;
}

/** Precedencia explícita (RF-A07): `--recipes-root` › `CHRONORIUM_RECIPES_ROOT` › `projectRoot/recipes`.
 * Sin esto, la instancia privada (cuyas recetas viven en otro repositorio, ADR-002) no puede
 * ejecutar la herramienta. */
export function resolveRecipesRoot(options: ResolvePathOptions = {}): string {
  const env = options.env ?? process.env;
  if (options.cliValue !== undefined) {
    return requireAbsoluteOverride(options.cliValue, '--recipes-root');
  }
  if (env.CHRONORIUM_RECIPES_ROOT !== undefined) {
    return requireAbsoluteOverride(env.CHRONORIUM_RECIPES_ROOT, 'CHRONORIUM_RECIPES_ROOT');
  }
  return resolve(projectRoot, 'recipes');
}

/** Precedencia explícita (RF-A07): `--data-root` › `CHRONORIUM_DATA_ROOT` › `projectRoot/data`. */
export function resolveDataRoot(options: ResolvePathOptions = {}): string {
  const env = options.env ?? process.env;
  if (options.cliValue !== undefined) {
    return requireAbsoluteOverride(options.cliValue, '--data-root');
  }
  if (env.CHRONORIUM_DATA_ROOT !== undefined) {
    return requireAbsoluteOverride(env.CHRONORIUM_DATA_ROOT, 'CHRONORIUM_DATA_ROOT');
  }
  return resolve(projectRoot, 'data');
}

export function resolveRecipeDir(name: string, recipesRoot: string = resolveRecipesRoot()): string {
  return resolve(recipesRoot, name);
}
