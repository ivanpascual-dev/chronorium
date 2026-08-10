import { isAbsolute, join } from 'node:path';

export class StatePathError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatePathError';
  }
}

export interface StatePaths {
  readonly seenPath: string;
  readonly runsPath: string;
}

/**
 * Única función que compone las rutas de `state/` (R10, H2, ADR-021): `cli/run.ts` y
 * `cli/doctor.ts` la consumen, así que ninguna de las dos vuelve a decidir por su cuenta dónde
 * vive cada fichero. La memoria de lo ya visto es por receta; el registro de ejecuciones es uno
 * solo por instancia (ADR-021).
 */
export function statePaths(dataRoot: string, recipe: string): StatePaths {
  if (!isAbsolute(dataRoot)) {
    throw new StatePathError(
      `dataRoot debe ser una ruta absoluta, y no depender del directorio de trabajo: ${dataRoot}`,
    );
  }
  const stateDir = join(dataRoot, 'state');
  return {
    seenPath: join(stateDir, `seen--${recipe}.json`),
    runsPath: join(stateDir, 'runs.ndjson'),
  };
}
