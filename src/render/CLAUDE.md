# Capa de renderizado

> Se carga junto al `/CLAUDE.md` de la raíz, que sigue aplicando entero. Aquí solo va lo específico
> de esta carpeta.
>
> Fuente de verdad de la estructura y de los contratos: `docs/02-arquitectura.md`.
> Seguridad de esta capa: `docs/05-seguridad-legal.md`.

## Qué vive aquí

```text
src/render/
  types.ts      Report, ReportSection, ReportMeta, RenderedReport, el contrato Renderer
  escape.ts     escapeHtml y escapeMarkdown: el único sitio del proyecto que escapa (R10)
  report.ts     buildReport() (única función que produce un Report) y buildSubject()
  item.ts       structureItem() y buildStatusLine(), compartidos por markdown.ts y email.ts
  json.ts       Renderer de formato "json"
  markdown.ts   Renderer de formato "markdown"
  email.ts      Renderer de formato "email" (HTML autocontenido)
```

## La regla de esta capa

**Ningún fichero de aquí conoce el nombre de una sección concreta (R12).** Si estás a punto de
escribir `if (section.key === 'pulse')` o algo equivalente, para: acabas de romper la premisa entera
del proyecto. Un renderizador recibe `report.sections` (ya resuelto por `buildReport`) y la
declaración `SectionSpec[]` de la receta, y recorre ambos genéricamente por `key`, nunca por un
literal. El test que lo comprueba usa claves `alfa`/`beta`/`gamma` a propósito: si un renderizador
solo funciona con los nombres de `recipes/example`, está mal.

## El escapado ocurre aquí, nunca antes

`buildReport()` guarda el texto tal cual, exactamente como llegó del modelo. **Escapar en
`buildReport` produciría un JSON con `&amp;lt;` dentro**, que es el bug clásico de esta clase de
sistemas (contrato #8 de la fase 4). Cada formato escapa a su manera, en su propio renderizador:

- `json.ts` no escapa nada: `JSON.stringify` ya produce sintaxis válida por sí sola.
- `markdown.ts` usa `escapeMarkdown` (neutraliza `[ ] < > \` |`, con barra invertida, que es cómo
  CommonMark interpreta un carácter como literal en vez de como sintaxis).
- `email.ts` usa `escapeHtml` (entidades: `&amp; &lt; &gt; &quot; &#39;`).

Las dos funciones de `escape.ts` son idempotentes a propósito (escapar dos veces no duplica
secuencias): protege contra el día en que alguien, por error, escape un valor que ya venía escapado.

## Cómo se renderiza un elemento sin conocer sus campos

Es lo que hace posible R12 para el contenido, no solo para las secciones. `item.ts` fija la única
regla, compartida por `markdown.ts` y `email.ts`:

1. El primer campo declarado de la sección es el rótulo del elemento.
2. Los campos de tipo `url` no se imprimen como texto: son el enlace del rótulo (el primero) o
   enlaces sueltos al final (los siguientes).
3. Los demás campos, en el orden declarado, como líneas: con `label` en la receta, prefijadas por
   esa etiqueta; sin ella, sin prefijo.
4. Un campo vacío (el enlace que `validateLinks`, fase 3, descartó) no se imprime: ni un hueco, ni
   un `[texto]()` roto.

**El aspecto también se decide por posición, nunca por nombre.** `email.ts` da a cada línea un tono
(limpia, cálida, fría) según su **índice** en `fields`: la primera va sin fondo, y las siguientes
alternan naranja y azul. Así una sección de tres campos de texto sale con el resumen plano, la
opinión sobre naranja y lo accionable sobre azul sin que el renderizador sepa que existen esos
conceptos. Si alguna vez te tienta mirar `field.name` o `field.label` para decidir un color, es el
mismo error que R12 con otra cara.

`item.ts` no aparece en la lista original de ficheros del plan de la fase 4: existe para que
`report.ts` no tenga que importar `markdown.ts`/`email.ts` (que a su vez necesitan esta
descomposición), lo que crearía un ciclo de imports. Ver `docs/bitacora.md`.

## El contrato `Renderer`

```ts
interface Renderer {
  readonly format: 'json' | 'markdown' | 'email';
  render(report: Report, sections: readonly SectionSpec[]): string;
}
```

Añadir un cuarto formato es un fichero nuevo que implementa esto, y una línea donde se compone
`RenderedReport`. No toca ninguno de los tres existentes.

## Antes de tocar nada aquí

- Si cambias el escapado o el recorrido de secciones, lanza `@guardarrailes`: los casos 4 y 5 de la
  batería de ataques (`docs/05-seguridad-legal.md`) viven en esta capa.
- Antes de añadir un campo a `ReportMeta` o `Report`, comprueba que `docs/03-modelo-datos.md` lo
  refleja: es el formato que se archiva, y el archivo lo relee `src/sources/archive.ts` (fase 2).
