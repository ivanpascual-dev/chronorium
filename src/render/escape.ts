// Único punto del proyecto que escapa (R10). El `Report` canónico guarda el texto tal cual; cada
// formato lo escapa a su manera, aquí y solo aquí (contrato de la fase 4, T5).

const HTML_ENTITIES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

// El & se trata aparte, y antes que los demás: solo se escapa cuando no es ya parte de una entidad
// reconocida. Es lo que hace idempotente `escapeHtml` (escapar dos veces no duplica secuencias):
// sin esta guarda, escapar un "&lt;" ya escapado produciría "&amp;lt;".
const UNESCAPED_AMPERSAND = /&(?!(?:amp|lt|gt|quot|#39);)/g;
const OTHER_HTML_CHARS = /[<>"']/g;

export function escapeHtml(input: string): string {
  return input
    .replace(UNESCAPED_AMPERSAND, '&amp;')
    .replace(OTHER_HTML_CHARS, (char) => HTML_ENTITIES[char] as string);
}

// Neutraliza lo que rompe la estructura del documento o fabrica un enlace: `[`, `]`, `<`, `>`,
// `` ` ``, y `|` (que parte una tabla). La guarda `(?<!\\)` es la misma idea que la del `&` de
// arriba: no volver a anteponer una barra a un carácter que ya lleva una.
const MARKDOWN_CHARS = /(?<!\\)([[\]<>`|])/g;

export function escapeMarkdown(input: string): string {
  return input.replace(MARKDOWN_CHARS, '\\$1');
}
