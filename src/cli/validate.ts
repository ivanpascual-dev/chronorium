import { diagnoseChain } from '../model/chain.ts';
import { resolveRecipeDir, resolveRecipesRoot } from '../paths.ts';
import { loadRecipe, RecipeLoadError } from '../recipe/load.ts';
import { EXIT_CONFIG_ERROR, EXIT_OK, type ExitCode } from './exit-codes.ts';

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
 * `validate --recipe <n>`: carga, valida, y llama a `diagnoseChain` para emitir el aviso de punto
 * único de fallo (RF-D04). Sin red. Dice qué secretos están presentes, nunca su valor ni parte de
 * él.
 */
export async function cliValidate(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<ExitCode> {
  const { flags } = parseFlags(argv);
  const recipeName = flags.recipe;
  if (recipeName === undefined) {
    console.error('validate: falta --recipe <nombre>');
    return EXIT_CONFIG_ERROR;
  }

  const secret = (name: string): string | undefined => env[name];

  let recipeDir: string;
  try {
    const recipesRoot = resolveRecipesRoot({
      ...(flags['recipes-root'] !== undefined ? { cliValue: flags['recipes-root'] } : {}),
      env,
    });
    recipeDir = resolveRecipeDir(recipeName, recipesRoot);
  } catch (cause) {
    console.error(errorMessage(cause));
    return EXIT_CONFIG_ERROR;
  }

  let recipe: ReturnType<typeof loadRecipe>;
  try {
    recipe = loadRecipe(recipeDir, { secret });
  } catch (cause) {
    if (cause instanceof RecipeLoadError) {
      console.error(cause.message);
      return EXIT_CONFIG_ERROR;
    }
    throw cause;
  }

  const diagnosis = diagnoseChain(recipe.model, { secret });
  for (const spec of diagnosis.usable) {
    console.log(`proveedor vivo: ${spec.provider}/${spec.id}`);
  }
  for (const discard of diagnosis.discarded) {
    console.log(
      `proveedor descartado: ${discard.spec.provider}/${discard.spec.id} · ${discard.reason}`,
    );
  }
  for (const warning of diagnosis.warnings) {
    console.warn(`AVISO: ${warning}`);
  }

  console.log(`receta "${recipe.name}" válida.`);
  return EXIT_OK;
}
