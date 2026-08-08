import type { SourceSpec } from '../recipe/types.ts';

export interface Item {
  readonly title: string;
  readonly url: string;
  readonly source: string;
  /** Ausente cuando la fuente no la trae o no se pudo interpretar (RF-B07). */
  readonly publishedAt?: string;
  readonly summary: string;
}

/** Mínimo deliberado: lo justo para doblarlo en un test sin arrastrar tipos del entorno. */
export type FetchLike = (
  url: string,
  init: {
    readonly headers: Record<string, string>;
    readonly signal: AbortSignal;
  },
) => Promise<{
  readonly ok: boolean;
  readonly status: number;
  text(): Promise<string>;
}>;

export interface ReadContext {
  readonly now: Date; // inyectada: ventana y recencia deterministas en test
  readonly fetch: FetchLike; // inyectado: los tests y el CI sirven ficheros guardados
  readonly timeoutMs: number;
  readonly userAgent: string; // RF-B08
  readonly dataRoot: string; // de dónde lee `archive`, resuelto explícitamente (RF-A07)
  readonly secret: (name: string) => string | undefined; // R3: solo del entorno
  /** Ventana de la receta (`recipe.window.days`), la que `repo-search` acota en su consulta (RF-B09). */
  readonly windowDays: number;
}

export interface SourceReader {
  readonly type: string;
  readonly requiredSecrets: readonly string[];
  read(source: SourceSpec, ctx: ReadContext): Promise<readonly Item[]>;
}

export interface SourceResult {
  readonly id: string;
  readonly type: string;
  readonly ok: boolean;
  readonly items: number;
  readonly error?: string;
  readonly durationMs: number;
}

export interface ItemFields {
  readonly title: string;
  readonly url: string;
  readonly source: string;
  readonly summary: string;
  /** Explícito en vez de opcional: deja que los lectores pasen el resultado de un parseo que
   * puede no encontrar fecha, sin pelearse con `exactOptionalPropertyTypes` en cada sitio. */
  readonly publishedAt: string | undefined;
}

/** Único punto que construye un `Item` (R10): omite `publishedAt` en vez de dejarlo en `undefined`. */
export function makeItem(fields: ItemFields): Item {
  const { publishedAt, ...rest } = fields;
  return publishedAt === undefined ? rest : { ...rest, publishedAt };
}
