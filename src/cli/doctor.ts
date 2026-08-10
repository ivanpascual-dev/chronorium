import { join } from 'node:path';
import { resolveDataRoot, resolveRecipeDir, resolveRecipesRoot } from '../paths.ts';
import { loadRecipe, RecipeLoadError } from '../recipe/load.ts';
import { readHealth } from '../state/runs.ts';

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

interface ParsedFlags {
  readonly flags: Readonly<Record<string, string>>;
}

function parseFlags(argv: readonly string[]): ParsedFlags {
  const flags: Record<string, string> = {};
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === undefined || !arg.startsWith('--')) {
      continue;
    }
    const name = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[name] = next;
      index++;
    }
  }
  return { flags };
}

/**
 * `doctor`: responde "cuántos días de los últimos treinta hubo informe" (RF-G04) leyendo
 * `runs.ndjson`, sin mirar nombres de fichero. Sale con `1` si la tasa de fallo cruza
 * `health.runFailureThreshold`, para que se pueda cablear como alarma.
 */
export async function cliDoctor(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<0 | 1> {
  const { flags } = parseFlags(argv);
  const recipeName = flags.recipe;
  if (recipeName === undefined) {
    console.error('doctor: falta --recipe <nombre>');
    return 1;
  }

  const secret = (name: string): string | undefined => env[name];

  let recipeDir: string;
  let dataRoot: string;
  try {
    const recipesRoot = resolveRecipesRoot({
      ...(flags['recipes-root'] !== undefined ? { cliValue: flags['recipes-root'] } : {}),
      env,
    });
    recipeDir = resolveRecipeDir(recipeName, recipesRoot);
    dataRoot = resolveDataRoot({
      ...(flags['data-root'] !== undefined ? { cliValue: flags['data-root'] } : {}),
      env,
    });
  } catch (cause) {
    console.error(errorMessage(cause));
    return 1;
  }

  let recipe: ReturnType<typeof loadRecipe>;
  try {
    recipe = loadRecipe(recipeDir, { secret });
  } catch (cause) {
    if (cause instanceof RecipeLoadError) {
      console.error(cause.message);
      return 1;
    }
    throw cause;
  }

  const runsPath = join(dataRoot, 'runs.ndjson');
  const health = readHealth(runsPath, recipe.health.windowDays, new Date(), recipe.name);
  const total = health.runsOk + health.runsFailed;

  console.log(
    `${recipe.name}: ${health.runsOk} de los últimos ${health.windowDays} días tuvieron informe.`,
  );

  if (total === 0) {
    return 0;
  }

  const failureRate = health.runsFailed / total;
  if (failureRate > recipe.health.runFailureThreshold) {
    console.error(
      `tasa de fallo (${Math.round(failureRate * 100)}%) por encima del umbral declarado (${Math.round(recipe.health.runFailureThreshold * 100)}%).`,
    );
    return 1;
  }

  return 0;
}
