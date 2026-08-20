// RF-A09, RF-A10, D-14: la documentación se desincroniza del código en semanas si nada la
// comprueba. Este script compara afirmaciones de la documentación de entrada contra hechos reales
// del código, y falla la construcción si divergen.
//
// Convención que sostiene todo esto: cuando una comprobación necesita saber DÓNDE, dentro de un
// documento en prosa libre, vive la lista que hay que verificar (tipos de lector, identificadores
// de notificador, nombres de proveedor...), el documento lleva un comentario HTML invisible
// `<!-- check-docs:nombre -->` justo antes de esa lista. Es la misma idea que R1 (delimitar
// explícitamente en vez de adivinar): parsear prosa libre con expresiones regulares para adivinar
// "esto es una lista de tipos de fuente" es frágil y produce tantos falsos positivos como
// verdaderos. Un marcador explícito no lo es.
//
// La lógica de comparación (esta sección del fichero) es pura: recibe texto y hechos ya
// extraídos, nunca toca el disco. `tests/docs/check-docs.test.ts` la prueba con cadenas en
// memoria. La extracción de hechos reales y la lectura de ficheros vive en `main()`, al final.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Finding {
  readonly file: string;
  readonly motivo: string;
}

/**
 * El texto entre `<!-- check-docs:marker -->` y `<!-- /check-docs:marker -->`. Ausente el
 * marcador de apertura, devuelve `undefined`: es la señal de "esta comprobación no aplica a este
 * documento", no un fallo. Un marcador de apertura sin su cierre es un error de programación en el
 * propio documento (no en el código que se documenta), y se señala como tal en vez de adivinar un
 * límite implícito: "hasta el siguiente encabezado" se probó primero y arrastraba secciones
 * enteras de prosa no relacionada, produciendo falsos positivos por decenas.
 */
export function textAfterMarker(text: string, marker: string): string | undefined {
  const open = new RegExp(`<!--\\s*check-docs:${marker}\\s*-->`);
  const openMatch = open.exec(text);
  if (openMatch === null) {
    return undefined;
  }
  const rest = text.slice(openMatch.index + openMatch[0].length);
  const close = new RegExp(`<!--\\s*/check-docs:${marker}\\s*-->`);
  const closeMatch = close.exec(rest);
  if (closeMatch === null) {
    throw new Error(
      `check-docs: el marcador "<!-- check-docs:${marker} -->" no tiene su cierre ` +
        `"<!-- /check-docs:${marker} -->"`,
    );
  }
  return rest.slice(0, closeMatch.index);
}

/** Cada `` `token` `` dentro del segmento, tomando solo la primera palabra del contenido (para
 * tolerar backticks tipo `` `run --recipe <n>` `` en una tabla, del que solo interesa `run`). */
function backtickTokens(segment: string): string[] {
  const matches = segment.matchAll(/`([^`]+)`/g);
  const tokens: string[] = [];
  for (const match of matches) {
    const first = (match[1] ?? '').trim().split(/\s+/)[0];
    if (first !== undefined && first.length > 0) {
      tokens.push(first);
    }
  }
  return tokens;
}

/** Los dígitos entre backticks del segmento: `` `0` ``, `` `1` ``... para la tabla de códigos de salida. */
function backtickDigits(segment: string): number[] {
  return backtickTokens(segment)
    .filter((token) => /^\d+$/.test(token))
    .map((token) => Number.parseInt(token, 10));
}

/**
 * Solo los tokens en negrita+código (`` **`token`** ``), no cualquier backtick del segmento. Es
 * el patrón que distingue "esto es el nombre canónico que se está listando" de "esto es un campo
 * mencionado de paso en la descripción" (`` **`feed`**: un canal, con \`url\` obligatorio `` tiene
 * un nombre de tipo y un nombre de campo, y solo el primero debe compararse contra el registro).
 */
function boldBacktickTokens(segment: string): string[] {
  const matches = segment.matchAll(/\*\*`([^`]+)`\*\*/g);
  const tokens: string[] = [];
  for (const match of matches) {
    const first = (match[1] ?? '').trim().split(/\s+/)[0];
    if (first !== undefined && first.length > 0) {
      tokens.push(first);
    }
  }
  return tokens;
}

export function checkNodeVersion(file: string, text: string, actualMajor: string): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(/\bNode(?:\.js)?[ \t]*(?:v|>=)?[ \t]*(\d+)/g)) {
    const claimed = match[1];
    if (claimed !== undefined && claimed !== actualMajor) {
      findings.push({
        file,
        motivo: `menciona Node ${claimed}, pero package.json → engines.node exige ${actualMajor}`,
      });
    }
  }
  return findings;
}

export function checkEnvVars(
  file: string,
  text: string,
  knownEnvVars: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const match of text.matchAll(/`([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)`/g)) {
    const name = match[1];
    if (name === undefined || seen.has(name) || knownEnvVars.has(name)) {
      continue;
    }
    seen.add(name);
    findings.push({
      file,
      motivo: `menciona la variable de entorno "${name}", que ningún fichero de src/ lee`,
    });
  }
  return findings;
}

export function checkExitCodes(
  file: string,
  text: string,
  actualCodes: ReadonlySet<number>,
): Finding[] {
  const segment = textAfterMarker(text, 'exit-codes');
  if (segment === undefined) {
    return [];
  }
  const findings: Finding[] = [];
  for (const code of new Set(backtickDigits(segment))) {
    if (!actualCodes.has(code)) {
      findings.push({
        file,
        motivo: `documenta el código de salida "${code}", que no existe en src/cli/exit-codes.ts`,
      });
    }
  }
  return findings;
}

/** D-14: el README promete "cuatro fuentes" en prosa; sin este marcador ese número solo se
 * imprimía por consola, nunca se comparaba con nada. Si `recipes/example` gana o pierde una
 * fuente sin que alguien actualice también la frase del README, esto lo detecta. */
export function checkExampleSourceCount(
  file: string,
  text: string,
  actualCount: number,
): Finding[] {
  const segment = textAfterMarker(text, 'example-source-count');
  if (segment === undefined) {
    return [];
  }
  const findings: Finding[] = [];
  for (const digit of new Set(backtickDigits(segment))) {
    if (digit !== actualCount) {
      findings.push({
        file,
        motivo:
          `dice que el ejemplo tiene ${digit} fuentes, pero recipes/example/recipe.yaml declara ` +
          `${actualCount}`,
      });
    }
  }
  return findings;
}

/** Función común a las listas marcadas: tipos de lector, ids de notificador, nombres de proveedor,
 * comandos del CLI. Cada una es "un conjunto de tokens tras un marcador, que debe ser subconjunto
 * de los valores reales". Con `extractor: 'bold'` (el valor por defecto) solo cuentan los tokens
 * en negrita+código (`` **`x`** ``, el nombre que se está listando); con `'any'`, cualquier
 * backtick del segmento (para tablas donde cada celda es solo el valor, sin negrita). */
export function checkMarkedList(
  file: string,
  text: string,
  marker: string,
  actualValues: ReadonlySet<string>,
  etiqueta: string,
  extractor: 'bold' | 'any' = 'bold',
): Finding[] {
  const segment = textAfterMarker(text, marker);
  if (segment === undefined) {
    return [];
  }
  const tokens = extractor === 'bold' ? boldBacktickTokens(segment) : backtickTokens(segment);
  const findings: Finding[] = [];
  for (const token of new Set(tokens)) {
    if (!actualValues.has(token)) {
      findings.push({
        file,
        motivo: `documenta ${etiqueta} "${token}", que no existe en el código`,
      });
    }
  }
  return findings;
}

const MARKDOWN_LINK = /\[[^\]]*\]\(([^)]+)\)/g;

/** Enlaces relativos rotos: `resolveExists` recibe la ruta ya resuelta (relativa al documento que
 * la enlaza) y dice si el fichero existe. Los enlaces externos (`http`, `https`, `mailto`) y las
 * anclas puras (`#seccion`) no se comprueban: no son rutas de fichero. */
export function checkLinkedFiles(
  file: string,
  text: string,
  resolveExists: (target: string) => boolean,
): Finding[] {
  const findings: Finding[] = [];
  for (const match of text.matchAll(MARKDOWN_LINK)) {
    const target = match[1];
    if (target === undefined) {
      continue;
    }
    const withoutAnchor = target.split('#')[0] ?? '';
    if (withoutAnchor.length === 0) {
      continue; // ancla pura dentro del propio documento
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(withoutAnchor)) {
      continue; // esquema (http:, https:, mailto:...): no es una ruta de fichero local
    }
    if (!resolveExists(withoutAnchor)) {
      findings.push({ file, motivo: `enlaza a "${target}", que no existe` });
    }
  }
  return findings;
}

function headings(text: string): string[] {
  return [...text.matchAll(/^##\s+(.+)$/gm)].map((match) => (match[1] ?? '').trim());
}

function bashBlocks(text: string): string[] {
  return [...text.matchAll(/```bash\n([\s\S]*?)```/g)].map((match) => (match[1] ?? '').trim());
}

/** README.md es el canónico; README.es.md es traducción, con paridad de apartados y de órdenes de
 * consola, nunca de prosa (T9, contrato 3 de la fase 6). */
export function checkReadmeParity(en: string, es: string): Finding[] {
  const findings: Finding[] = [];
  const enHeadings = headings(en);
  const esHeadings = headings(es);
  if (enHeadings.length !== esHeadings.length) {
    findings.push({
      file: 'README.es.md',
      motivo: `tiene ${esHeadings.length} apartados "## ", README.md tiene ${enHeadings.length}`,
    });
  }

  const enCommands = bashBlocks(en);
  const esCommands = bashBlocks(es);
  if (enCommands.length !== esCommands.length) {
    findings.push({
      file: 'README.es.md',
      motivo: `tiene ${esCommands.length} bloques de consola, README.md tiene ${enCommands.length}`,
    });
    return findings;
  }
  enCommands.forEach((command, index) => {
    if (command !== esCommands[index]) {
      findings.push({
        file: 'README.es.md',
        motivo: `el bloque de consola #${index + 1} difiere del de README.md, debe ser idéntico`,
      });
    }
  });
  return findings;
}

/** La lista cerrada de jerga fijada en T6 (docs/plans/fase-6-publicacion.md): si una futura fase
 * quita una entrada del glosario que sigue en esta lista, esto lo detecta. */
export const JARGON_TERMS: readonly string[] = [
  'receta',
  'fuente',
  'canal',
  'API',
  'repositorio',
  'fork',
  'secreto',
  'variable de entorno',
  'credencial',
  'cron',
  'YAML',
  'Markdown',
  'esquema',
  'modelo',
  'proveedor',
  'token',
  'ventana',
  'puntuación',
  'deduplicar',
  'notificador',
  'archivo',
  'instancia',
];

function normalizeTerm(term: string): string {
  return term.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export function checkGlossaryCoverage(
  glossaryText: string,
  jargonTerms: readonly string[],
): Finding[] {
  const entries = new Set(
    [...glossaryText.matchAll(/^-\s+\*\*([^*(]+)/gm)].map((match) => normalizeTerm(match[1] ?? '')),
  );
  const findings: Finding[] = [];
  for (const term of jargonTerms) {
    if (!entries.has(normalizeTerm(term))) {
      findings.push({
        file: 'docs/glosario.md',
        motivo: `el término de jerga "${term}" no tiene entrada en el glosario`,
      });
    }
  }
  return findings;
}

const AUDIENCE_PATTERN = /Para quién|Who this is for/i;

/** Decisión 5 de la fase 6: cada guía de entrada declara su público. Comprueba que la frase esté
 * en algún lugar del documento, no exactamente en el primer párrafo: exigir la posición exacta es
 * más frágil que el valor que aporta. Nunca comprueba que la explicación sea buena (eso es el
 * punto 10 del criterio de terminada, con una persona real). */
export function checkAudienceDeclared(file: string, text: string): Finding[] {
  if (!AUDIENCE_PATTERN.test(text)) {
    return [{ file, motivo: 'no declara en ningún sitio a quién sirve (decisión 5, fase 6)' }];
  }
  return [];
}

// ---------------------------------------------------------------------------------------------
// Orquestación: extrae hechos reales del código y de la receta de ejemplo, lee los documentos del
// ámbito, y aplica las funciones de arriba. Nada de esto se prueba en `tests/docs/`: lo prueba
// `pnpm run check:docs` contra la documentación real (la puerta de T9), y la lógica de comparación
// ya está probada sin tocar el disco.

function listMarkdownFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => join(entry.parentPath, entry.name));
}

/**
 * Cualquier identificador con forma de MAYÚSCULAS_CON_GUION_BAJO que aparece en `src/`: cubre los
 * nombres de variable de entorno reales (`'SMTP_HOST'`, siempre entre comillas como argumento de
 * `ctx.secret(...)`) y también constantes exportadas que la documentación cita por su nombre
 * (`PLACEHOLDER_CREDENTIALS`, sin comillas, un identificador de código). Distinguir "es una env
 * var" de "es una constante" exigiría parsear el AST; para lo que hace falta aquí (¿este nombre
 * existe de verdad en el código, o es un despiste?) basta con que exista en alguna forma.
 */
function extractCapsIdentifiers(srcDir: string): Set<string> {
  const names = new Set<string>();
  const files = readdirSync(srcDir, { recursive: true, withFileTypes: true }).filter(
    (entry) => entry.isFile() && entry.name.endsWith('.ts'),
  );
  for (const file of files) {
    const content = readFileSync(join(file.parentPath, file.name), 'utf8');
    for (const match of content.matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g)) {
      const name = match[1];
      if (name !== undefined) {
        names.add(name);
      }
    }
  }
  return names;
}

function extractCliCommands(mainTsContent: string): Set<string> {
  return new Set([...mainTsContent.matchAll(/case '(\w+)':/g)].map((match) => match[1] ?? ''));
}

async function main(): Promise<void> {
  const { projectRoot, resolveRecipeDir } = await import('../src/paths.ts');
  const { EXIT_OK, EXIT_CONFIG_ERROR, EXIT_NO_ITEMS, EXIT_MODEL_FAILED, EXIT_DELIVERY_FAILED } =
    await import('../src/cli/exit-codes.ts');
  const { defaultRegistry } = await import('../src/sources/registry.ts');
  const { defaultNotifierRegistry } = await import('../src/deliver/registry.ts');
  const { defaultProviderRegistry } = await import('../src/model/providers.ts');
  const { parse: parseYaml } = await import('yaml');

  const engineNode = (
    JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8')) as {
      engines: { node: string };
    }
  ).engines.node;
  const engineMajor = /(\d+)/.exec(engineNode)?.[1] ?? engineNode;

  const envVars = extractCapsIdentifiers(join(projectRoot, 'src'));
  const exitCodes = new Set([
    EXIT_OK,
    EXIT_CONFIG_ERROR,
    EXIT_NO_ITEMS,
    EXIT_MODEL_FAILED,
    EXIT_DELIVERY_FAILED,
  ]);
  const readerTypes = new Set(defaultRegistry.keys());
  const notifierIds = new Set(defaultNotifierRegistry.keys());
  const providerNames = new Set(defaultProviderRegistry.keys());
  const cliCommands = extractCliCommands(
    readFileSync(join(projectRoot, 'src', 'cli', 'main.ts'), 'utf8'),
  );

  const exampleRecipe = parseYaml(
    readFileSync(join(resolveRecipeDir('example'), 'recipe.yaml'), 'utf8'),
  ) as { sources?: readonly unknown[] };
  const exampleSourceCount = exampleRecipe.sources?.length ?? 0;

  const scopeFiles = [
    join(projectRoot, 'README.md'),
    join(projectRoot, 'README.es.md'),
    join(projectRoot, 'CONTRIBUTING.md'),
    join(projectRoot, 'SECURITY.md'),
    ...listMarkdownFiles(join(projectRoot, 'docs')).filter(
      (path) => relative(projectRoot, path) !== join('docs', 'bitacora.md'),
    ),
  ];

  const audienceScope = new Set(
    ['README.md', 'README.es.md', 'docs/07-escribir-una-receta.md', 'docs/arranque.md'].map((p) =>
      join(projectRoot, p),
    ),
  );

  const findings: Finding[] = [];

  for (const absPath of scopeFiles) {
    const relPath = relative(projectRoot, absPath);
    const text = readFileSync(absPath, 'utf8');
    const docDir = dirname(absPath);

    findings.push(...checkNodeVersion(relPath, text, engineMajor));
    findings.push(...checkEnvVars(relPath, text, envVars));
    findings.push(...checkExitCodes(relPath, text, exitCodes));
    findings.push(
      ...checkMarkedList(relPath, text, 'reader-types', readerTypes, 'el tipo de lector'),
    );
    findings.push(
      ...checkMarkedList(
        relPath,
        text,
        'notifier-ids',
        notifierIds,
        'el identificador de notificador',
      ),
    );
    findings.push(
      ...checkMarkedList(relPath, text, 'provider-names', providerNames, 'el nombre de proveedor'),
    );
    findings.push(
      ...checkMarkedList(relPath, text, 'cli-commands', cliCommands, 'el comando del CLI', 'any'),
    );
    findings.push(...checkLinkedFiles(relPath, text, (target) => existsSync(join(docDir, target))));
    findings.push(...checkExampleSourceCount(relPath, text, exampleSourceCount));
    if (audienceScope.has(absPath)) {
      findings.push(...checkAudienceDeclared(relPath, text));
    }
  }

  findings.push(
    ...checkReadmeParity(
      readFileSync(join(projectRoot, 'README.md'), 'utf8'),
      readFileSync(join(projectRoot, 'README.es.md'), 'utf8'),
    ),
  );

  findings.push(
    ...checkGlossaryCoverage(
      readFileSync(join(projectRoot, 'docs', 'glosario.md'), 'utf8'),
      JARGON_TERMS,
    ),
  );

  console.log(`check:docs · recipes/example/recipe.yaml declara ${exampleSourceCount} fuentes.`);

  if (findings.length > 0) {
    console.error(`check:docs encontró ${findings.length} divergencia(s):\n`);
    for (const finding of findings) {
      console.error(`  ${finding.file}: ${finding.motivo}`);
    }
    process.exit(1);
  }

  console.log('check:docs: la documentación no contradice al código.');
}

// Solo se ejecuta cuando el fichero se lanza directamente (`tsx scripts/check-docs.ts`), nunca
// como efecto colateral de importar sus funciones puras desde `tests/docs/check-docs.test.ts`.
if (process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
