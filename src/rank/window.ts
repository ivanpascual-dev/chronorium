const DAY_MS = 24 * 60 * 60 * 1000;

/** Cuánto se tolera que una fecha caiga en el futuro antes de tratarla como desconocida (RF-B07). */
const FUTURE_MARGIN_MS = DAY_MS;

/**
 * Interpreta la fecha de publicación cruda de un elemento (ISO, RFC 822, o cualquier formato que
 * `Date` sepa parsear). Cadena vacía, campo ausente, texto sin sentido, o una fecha en el futuro
 * más allá del margen de tolerancia, producen "desconocida" (`undefined`), nunca la hora actual
 * (RF-B07): eso es lo que hacía que el elemento peor formado ganara siempre en el sistema anterior.
 */
export function parsePublishedAt(raw: string | undefined, now: Date): string | undefined {
  if (raw === undefined || raw.trim().length === 0) {
    return undefined;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  if (parsed.getTime() - now.getTime() > FUTURE_MARGIN_MS) {
    return undefined;
  }

  return parsed.toISOString();
}

/**
 * Un elemento de fecha desconocida nunca se descarta por ventana: si se descartara, un canal que
 * no fecha nada quedaría invisible entero, que es peor que dejarlo entrar sin puntuación de
 * recencia (ver `rank/score.ts`).
 */
export function isWithinWindow(
  publishedAt: string | undefined,
  now: Date,
  windowDays: number,
): boolean {
  if (publishedAt === undefined) {
    return true;
  }

  const ageMs = now.getTime() - new Date(publishedAt).getTime();
  return ageMs <= windowDays * DAY_MS;
}
