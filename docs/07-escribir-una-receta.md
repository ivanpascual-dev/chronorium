# Escribir tu propia receta

**Para quién es esta guía:** para cualquiera que quiera un informe periódico sobre su propio tema,
sin escribir ni una línea de código. Si sabes editar un fichero de texto, esto te sirve. Los
términos técnicos que aparecen abajo (**receta**, **fuente**, **canal**...) están enlazados a
[el glosario](glosario.md) la primera vez que salen; si te pierdes en uno, ve allí.

---

## Qué es una receta

Piensa en Chronorium como una cocina que siempre prepara el mismo tipo de plato (un informe, con
secciones, ordenado, con opinión) pero que no sabe cocinar nada por sí sola: necesita que le des
la lista de la compra. Esa lista de la compra es la **receta**: qué ingredientes usar (de qué
sitios saca información), qué te interesa de verdad (tus temas), y cómo quieres que quede el plato
(qué secciones tiene el informe y con qué tono se escribe).

Una receta es, en la práctica, una carpeta con tres ficheros: `recipe.yaml` (los ingredientes),
`sections.yaml` (la forma del plato) y `persona.md` (a quién se lo estás sirviendo). Cambia esa
carpeta y cambias de qué habla tu informe entero, sin tocar nada más.

## El atajo: que tu IA te la monte

Si prefieres no leer el resto de esta guía a mano: copia esta página entera (todo `docs/07-escribir-una-receta.md`) y pégala junto con el bloque de abajo a la IA que uses (Claude, ChatGPT, la que sea). Te va a hacer un puñado de preguntas y te va a devolver los tres ficheros listos para copiar en `recipes/<tu-nombre>/`.

```text
Quiero que me ayudes a escribir una receta para Chronorium, un motor de informes periódicos. Te he
pegado junto a este mensaje la guía completa "Escribir tu propia receta": son las reglas exactas de
los tres ficheros que tienes que producir (recipe.yaml, sections.yaml, persona.md), incluidas dos
trampas medidas que rompen recetas si no se respetan (la de "topics" como subcadena literal, y la de
"caps.perSourceMaxPercent"). No inventes ningún campo, tipo de fuente o canal de entrega que no
aparezca en esa guía.

Antes de escribir nada, pregúntame, una cosa cada vez:

1. Sobre qué tema quiero el informe, y qué palabras cortas y literales esperaría ver en un titular
   real sobre ese tema (para "topics"; recházame cualquier frase larga que se me ocurra proponer).
2. Qué fuentes sigo hoy para enterarme de eso: canales RSS/Atom, APIs concretas, o repositorios de
   GitHub que me interesan.
3. Con qué frecuencia se mueve mi tema (para "window.days") y cuántos elementos quiero como máximo
   por informe (para "caps.maxItems").
4. Cómo quiero recibirlo: solo archivado, por correo, por Telegram, o por un webhook propio.
5. Qué secciones quiero en el informe (nombre y qué va en cada una) y en qué idioma se escribe.
6. Mi situación real hoy, para persona.md: a qué me dedico, qué decisión tomo con este informe, y
   qué tono quiero. Adviérteme si lo que te describo suena aspiracional en vez de real: es la
   trampa más cara que ha medido este proyecto.

Con mis respuestas, escribe los tres ficheros completos, comentados, listos para copiar en
recipes/<mi-receta>/. Al final, dime en una lista corta qué voy a tener que verificar yo a mano
(nombres de fuentes reales que existan, credenciales que necesito), porque tú no puedes comprobarlo.
Recuérdame también que estos tres ficheros son solo la receta: para que se ejecute sola cada mañana
todavía me falta crear mi repositorio de instancia y configurar briefing.yml y mis secretos, y que
eso está explicado en docs/arranque.md, no en esta guía.
```

## Una receta completa, para copiar y cambiar

Esta es una receta real y funcional, de un ámbito distinto al que usa el ejemplo del repositorio:
seguimiento de novedades regulatorias y legales. Cópiala en `recipes/<tu-nombre>/recipe.yaml` y
cambia lo que no te sirva.

```yaml
language: es

# Los TEMAS son términos cortos y literales: el motor busca cada uno como texto exacto dentro del
# título y el resumen de cada noticia. Una frase larga no aparece nunca así en un titular real y no
# puntúa nada (ver la Trampa 1 más abajo).
topics:
  - GDPR
  - antitrust
  - reglamento
  - sentencia
  - IA Act

# El MODELO que redacta el informe. "google" con este id es la opción gratuita más sencilla para
# empezar; ver la sección "El fichero recipe.yaml" para las demás opciones.
model:
  provider: google
  id: gemini-3.6-flash

# Las FUENTES: de dónde sale la información cruda, antes de que el modelo la toque.
sources:
  - id: eu-comision
    type: feed
    url: https://ec.europa.eu/commission/presscorner/api/rss?type=IP

  - id: novedades-legales
    type: json-api
    url: https://dev.to/api/articles?tag=law&per_page=15
    mapping:
      title: title
      url: url
      publishedAt: published_at
      summary: description

# La VENTANA: cuántos días hacia atrás cuenta como "reciente".
window:
  days: 7

# La PUNTUACIÓN: cuánto pesa lo reciente frente a lo que casa con tus temas.
scoring:
  recencyWeight: 2
  topicsWeight: 3

# Los TOPES: cuántos elementos como máximo entran en el informe, y cuánto puede aportar una sola
# fuente para que no lo copen (ver la Trampa 2 más abajo).
caps:
  maxItems: 40
  perSourceMaxPercent: 30

subject: "Radar legal · {date}"

# La ENTREGA: por dónde recibes el informe además de guardado en el archivo. Con todo en "false"
# (el valor de fábrica), el informe se sigue generando y archivando, solo que no se envía a
# ningún sitio hasta que actives uno.
delivery:
  - id: email
    enabled: false
    to: tu-correo@example.com
    from: radar-legal@example.com

health:
  windowDays: 30
  runFailureThreshold: 0.2
  sourceFailureThreshold: 0.5
```

Junto a este `recipe.yaml` necesitas un `sections.yaml` (la forma del informe) y un `persona.md`
(a quién se dirige). Los dos se explican con detalle más abajo; para empezar, puedes copiar los de
`recipes/example/` tal cual y solo cambiar los textos.

## El fichero `recipe.yaml`

Esto es lo que trae y qué pasa si lo dejas mal.

- **`language`**: el idioma en el que el modelo escribe el informe. Un código corto (`es`, `en`).
  Si lo dejas mal escrito, el modelo suele seguir entendiendo la intención, pero no está
  garantizado: es una instrucción al modelo, no una regla que el código imponga.

- **`topics`**: tus áreas de interés, como términos **cortos y literales**.

  > **Trampa medida 1.** El motor busca cada tema como subcadena exacta dentro del título y el
  > resumen de cada noticia, en minúsculas y sin acentos. Un tema escrito como frase
  > (`"novedades sobre regulación de la inteligencia artificial"`) casi nunca aparece así, tal
  > cual, en un titular real, así que no suma nunca y ese tema no hace nada. Escribe lo que de
  > verdad esperarías leer en un titular: `"IA Act"`, no `"la nueva ley europea de IA"`.

- **`model`**: qué inteligencia artificial redacta el informe.
  - `provider` e `id`: el nombre del proveedor
    <!-- check-docs:provider-names -->
    (`google`, `openai`, o `openai-compatible` para un
    proveedor compatible o un modelo local)
    <!-- /check-docs:provider-names -->
    y el identificador de ese modelo concreto.
  - `apiKeyEnv` (opcional): el nombre de la variable de entorno donde guardas la credencial, si no
    usas el nombre por defecto del proveedor.
  - `fallbacks` (opcional, muy recomendable): una lista de proveedores de respaldo, en orden. Sin
    ninguno, tienes un solo eslabón: si ese proveedor falla, no hay informe ese día. Es
    exactamente el fallo que costó seis días de informes al proyecto anterior (ver el README).
  - `maxOutputTokens` (opcional): el tope de longitud de la respuesta del modelo. Solo hace falta
    tocarlo si tu receta genera informes largos (muchas secciones, o una receta que destila varias
    semanas) y el informe te llega cortado a mitad de frase.

- **`sources`**: de dónde sale la información. Cada fuente tiene un `id` (el nombre que tú le das,
  aparece en los enlaces del informe) y un `type`. Hay cinco tipos, y el `type` es lo único que
  decide cómo se lee, nunca la URL:
  <!-- check-docs:reader-types -->
  - **`feed`**: un canal de sindicación. Solo necesita `url`.
  - **`json-api`**: una API que devuelve JSON. Necesita `url` y un `mapping` que le diga en qué
    campo de la respuesta está cada dato (`title`, `url`, `publishedAt`, `summary`, y opcionalmente
    `items` si la lista viene envuelta en un objeto en vez de en la raíz).
  - **`repo-search`**: repositorios de GitHub que coinciden con una búsqueda. Necesita `query`, con
    los mismos cualificadores que usarías en la búsqueda de GitHub (por ejemplo
    `topic:llm-agents language:typescript`), sin `created:` ni `sort`: esos los añade el motor.
  - **`repo-releases`**: los últimos lanzamientos de una lista de repositorios. Necesita `repos`,
    una lista de `propietario/repositorio`.
  - **`archive`**: no sale a internet, lee informes que tú mismo ya generaste. Se explica entera
    en "Dos recetas que se encadenan", más abajo.
  <!-- /check-docs:reader-types -->

  Ninguna de estas cinco exige una credencial propia (más allá de la del modelo). Si algún día
  añades una fuente que sí la necesite, tu receta deja de cumplir la promesa de "solo la
  credencial del modelo" (ver el README).

- **`window.days`**: cuántos días hacia atrás cuenta como reciente. Súbelo si tu tema se mueve
  despacio (una fuente que publica una vez a la semana necesita una ventana de más de siete días
  para no quedarse vacía casi siempre).

- **`scoring`**: `recencyWeight` y `topicsWeight` son los pesos con que se suman la recencia y el
  acierto de temas para decidir el orden. La puntuación por temas es *(temas que aparecen / temas
  totales)*: con una lista larga de temas, cada acierto vale poco, así que si tienes muchos temas,
  sube `topicsWeight` para compensar.

- **`caps.maxItems`**: cuántos elementos como máximo entran en el informe, en total.

- **`caps.perSourceMaxPercent`**: cuánto puede aportar, como máximo, una sola fuente.

  > **Trampa medida 2, la que más confunde.** Este porcentaje no se calcula sobre `maxItems`. Se
  > calcula sobre el conjunto de elementos que sobrevivió a la ventana y a la memoria de lo ya
  > visto, **antes** de aplicar `maxItems`, y con redondeo hacia abajo. Si ese conjunto es pequeño
  > (pocas fuentes, o un día flojo), un porcentaje que suena generoso puede no recortar nada, o uno
  > que suena estricto puede redondear a cero y descartar la fuente entera. No hay un número
  > universal correcto: depende de cuántos elementos suele traer tu receta antes del recorte. Si
  > una fuente te está copando el informe, baja este número poco a poco y comprueba qué pasa,
  > en vez de adivinar.

- **`subject`** (opcional): el asunto del correo. Dos sustituciones disponibles y solo dos:
  `{recipe}` (el nombre de la carpeta de tu receta) y `{date}` (la fecha, año-mes-día). Todo lo
  demás es texto literal tal cual lo escribas. Sin esta línea, el asunto sale con un formato
  neutro que no es prosa en ningún idioma en particular.

- **`delivery`**: por dónde se entrega el informe, además de quedar archivado (un informe
  archivado ya es un informe entregado: no necesitas activar ningún canal para empezar). Hay tres
  de fábrica:
  <!-- check-docs:notifier-ids -->
  - **`email`**: `to`, `from`, y cuatro variables de entorno (`SMTP_HOST`, `SMTP_PORT`,
    `SMTP_USER`, `SMTP_PASSWORD`). Con Gmail, `SMTP_PASSWORD` es una contraseña de aplicación, no
    la contraseña de tu cuenta.
  - **`telegram`**: `chatId`, y la variable de entorno `TELEGRAM_BOT_TOKEN`.
  - **`webhook`**: `url` (recibe el informe entero como JSON, por `POST`). Sin credencial.
  <!-- /check-docs:notifier-ids -->

  Cada canal tiene su propio `enabled`: puedes tener varios activos a la vez. El paso a paso para
  conseguir la contraseña de aplicación de Gmail y el token del bot de Telegram (con las URL
  concretas) está en `docs/arranque.md`, sección "Los secretos": no se repite aquí porque esa guía
  es la que ya vive del lado operativo, no del lado de la receta.

- **`health`**: los umbrales que deciden cuándo el informe avisa de una racha de fallos, en vez de
  solo contarte que hoy salió bien o mal. `windowDays` es cuántos días mira hacia atrás;
  `runFailureThreshold` y `sourceFailureThreshold` son la proporción de fallos, entre 0 y 1, a
  partir de la cual se marca. No hace falta tocarlos para empezar.

## El fichero `sections.yaml`

Aquí defines la forma del informe: qué secciones tiene y qué campos rellena el modelo en cada una.
El motor no conoce ninguno de estos nombres: los inventas tú, y son justo lo que hace que dos
recetas produzcan informes completamente distintos con el mismo motor.

Cada sección tiene:

- **`key`**: un identificador corto, sin espacios. Es interno, no aparece en el informe.
- **`title`**: el título que sí aparece en el informe.
- **`cardinality`**: `one` (una entrada única, como un resumen del día) o `list` (una lista de
  entradas). Con `list`, añade `min` y `max`.
- **`condition`**: `always` (la sección sale siempre, aunque quede vacía) o `non-empty` (la
  sección **desaparece entera** si no hay nada que poner en ella ese día). Es lo que evita que un
  día flojo produzca un informe relleno de paja: mejor un informe corto que uno inflado.
- **`fields`**: los datos que el modelo tiene que rellenar en cada entrada. Cada campo tiene un
  `name`, un `type` (`string` para texto, `url` para un enlace) y, opcionalmente, `label` (cómo se
  etiqueta al mostrarlo) y `description` (la instrucción que el modelo lee para saber qué escribir
  ahí: cuanto más concreta, mejor sale).

Un campo de tipo `url` nunca lo inventa el modelo con libertad: el motor comprueba, después de
generar el informe, que cada enlace que sale estuviera de verdad entre los elementos recolectados,
y descarta silenciosamente el que no. No es una instrucción que se le pide al modelo con la
esperanza de que la cumpla: es una comprobación que el código hace siempre, pase lo que pase.

## El fichero `persona.md`

Es un fichero de texto libre (Markdown, sin estructura fija) donde describes a quién se dirige el
informe: su situación, qué le interesa de verdad, y el tono con el que quieres que se le hable.

> **Interprétalo literalmente: describe tu situación real y actual, nunca la que te gustaría
> tener.** Es la lección más cara que dejó el sistema anterior a este proyecto: describir a un
> director de empresa que no existía hizo que, durante un mes entero, el informe diera consejos de
> estrategia a alguien que en realidad estaba escribiendo código en solitario. Si te describes
> como quien querrías ser en vez de quien eres hoy, vas a recibir consejos dirigidos a una persona
> que no existe. Cambia `persona.md` en cuanto tu situación cambie de verdad, no antes.

## Dos recetas que se encadenan

Puedes tener más de una receta, y una puede alimentarse del archivo de otra con la fuente de tipo
`archive`. El caso real más habitual es una **diaria** que sale a internet, y una **semanal** que
no sale a ningún sitio: solo relee lo que la diaria ya archivó durante la semana y lo destila.

Esto es un esquema, con marcadores de posición en vez de temas, fuentes o persona reales: cópialo
y sustituye cada `[...]` por lo tuyo.

`recipes/diaria/recipe.yaml` (sale a internet cada día):

```yaml
language: es
topics: [tu-tema-1, tu-tema-2]
model:
  provider: google
  id: gemini-3.6-flash
sources:
  - id: fuente-1
    type: feed
    url: https://ejemplo.org/feed
window:
  days: 2
scoring: { recencyWeight: 2, topicsWeight: 3 }
caps: { maxItems: 40, perSourceMaxPercent: 25 }
delivery:
  - id: email
    enabled: true
    to: tu-correo@example.com
    from: [tu-remitente]
```

`recipes/semanal/recipe.yaml` (no sale a internet, solo relee el archivo):

```yaml
language: es
topics: [tu-tema-1, tu-tema-2] # los mismos que la diaria: lo que destilas ya venía filtrado por ellos
model:
  provider: google
  id: gemini-3.6-flash
sources:
  - id: destilado-de-la-semana
    type: archive
    recipe: diaria # el nombre de la carpeta de la receta que quieres destilar
window:
  days: 7
scoring: { recencyWeight: 1, topicsWeight: 4 }
caps: { maxItems: 40, perSourceMaxPercent: 100 }
delivery:
  - id: email
    enabled: true
    to: tu-correo@example.com
    from: [tu-remitente]
```

La receta semanal no necesita `requiredSecrets` de ningún proveedor de fuentes: `archive` lee del
disco, no de la red. Y sus `sections.yaml` y `persona.md` pueden (y suelen) ser completamente
distintos a los de la diaria: es la misma prueba de que el motor no sabe nada del dominio, ahora
aplicada a que tampoco sabe nada de la forma del informe.

## No me sale lo que quería

- **Salen siempre las mismas noticias.** Revisa `topics`: si son frases en vez de términos cortos,
  no están puntuando nada (Trampa 1) y el orden lo decide solo la recencia, que tiende a repetir
  las fuentes que publican más a menudo.

- **Una sección siempre viene vacía.** Si es `condition: non-empty`, está haciendo justo lo que
  tiene que hacer cuando no hay nada que poner ahí ese día. Si crees que sí debería tener
  contenido, el problema suele estar en la fuente: revisa si de verdad está publicando algo
  relacionado con tus `topics`, o si su `window.days` es más corta que su ritmo de publicación.

- **Una fuente no aporta nada al informe**, aunque sí trae elementos. Revisa `caps.perSourceMaxPercent`
  (Trampa 2): con pocas fuentes o un día flojo, puede estar redondeando a cero para esa fuente en
  concreto.

- **El informe llega escueto**, con casi todas las secciones vacías. Puede ser un día flojo de
  verdad (persona.md pide, con razón, no rellenar para aparentar), o que `window.days` sea
  demasiado corta para el ritmo real de tus fuentes. Sube la ventana un poco y compara.

## Y ahora, ¿dónde va esto?

Esta guía solo cubre la receta: los tres ficheros que acabas de escribir deciden **de qué habla**
tu informe. Para que se genere solo cada mañana te falta un paso más, distinto y mecánico: crear tu
repositorio de instancia, pegar tus ficheros en `recipes/<tu-nombre>/` dentro de él, y configurar
`briefing.yml` (cuándo se ejecuta) y los secretos (con qué credenciales). Ese paso está en
`docs/arranque.md`, con el fichero comentado bloque a bloque y el paso a paso de cada credencial.
