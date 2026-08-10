// Compartido por los notificadores que manejan una credencial (`email.ts`, `telegram.ts`), no por
// `webhook.ts`, que no tiene ninguna. No aparece en la lista literal de ficheros del plan de la
// fase 4 (como `http.ts`/`makeItem` en la fase 2): es la garantía de código de ADR-020 (A4) de que
// ningún error propagado por un notificador puede contener el valor de una credencial.

/** Sustituye cualquier ocurrencia literal de un secreto conocido por un marcador, nunca por nada
 * que deje adivinar longitud o contenido parcial (A4: un secreto no se enmascara, se oculta). */
export function redactSecrets(message: string, secrets: readonly (string | undefined)[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret === undefined || secret.length === 0) {
      continue;
    }
    result = result.split(secret).join('[secreto oculto]');
  }
  return result;
}
