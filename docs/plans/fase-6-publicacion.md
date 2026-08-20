# Fase 6 · Publicación

> **Qué decide esta fase.** Las cinco anteriores construyeron un motor que funciona para su autor.
> Esta decide si funciona **para alguien que no seas tú**, y la prueba no es un test: es un
> desconocido que hace fork, pone una credencial y recibe un informe en cinco minutos.
>
> Por eso el trabajo grande de esta fase no es escribir prosa, es **arreglar el ejemplo**. El
> `recipes/example` de hoy funciona en el sentido de que no falla, pero tres de sus campos están
> puestos con valores que no hacen lo que parecen (medido el 2026-08-10, ver más abajo). Un
> desconocido que lo copie recibiría un informe ordenado solo por recencia y no sabría por qué.

---

## Requisitos que cubre

| Requisito      | Qué exige                                                                                      | Tarea       |
| -------------- | ---------------------------------------------------------------------------------------------- | ----------- |
| **RF-H04**     | Fork + credenciales ⇒ primer informe **sin editar código**. Cronometrado, objetivo 5 min       | T4, T7, T10 |
| **RF-H05**     | El CI ejercita la receta de ejemplo con modelo simulado. Un ejemplo roto rompe la construcción | T1, T2      |
| **RF-B04**     | Las recetas que se distribuyen funcionan sin más credencial que la del modelo                  | T2          |
| **RF-A04**     | Cualquier informe declarado en una receta válida, sin tocar `src/`                             | T2, T6      |
| **RF-D08**     | Puntuar por recencia y por coincidencia con los temas declarados                               | T1, T2      |
| **RF-A09**     | Valores por defecto, variables de entorno y fuentes de la documentación, verificados en CI     | T8, T9      |
| **RF-A10**     | La versión del entorno de ejecución en un único sitio, consumido por documentación y CI        | T8, T9      |
| **RF-H01**     | Licencia, guía de contribución, política de seguridad e integración continua                   | T11         |
| **RF-B01/B02** | El lector se elige por el tipo declarado; cinco tipos de fábrica                               | T6          |
| **RF-F03**     | Entrega por los canales declarados en la receta                                                | T6          |

**Dos tareas de `ops.md` no mapean a ningún `RF-` y entran igual, con su motivo escrito:**

- **`README.es.md`** no lo pide ningún requisito. Es una decisión del dueño tomada al planificar esta
  fase (ver "Decisiones de esta fase", abajo). No se le inventa un requisito: queda como decisión.
- **`/pre-lanzamiento` y `v1.0.0`** son la puerta del ciclo de trabajo, no un requisito de producto.

**Una tarea que `ops.md` no lista y entra**, porque la bitácora del 2026-08-11 la asignó por escrito
a esta fase: arreglar los tres campos de `recipes/example` (T2). Cita literal de esa entrada: _"No se
toca aquí: es material de fase 6, donde el ejemplo es el producto."_

---

## Estado real del repositorio, comprobado antes de planificar

Esto no es lo que `ops.md` supone que hay. Es lo que hay, leído hoy:

| Hecho comprobado                                                                                | Dónde                              |
| ----------------------------------------------------------------------------------------------- | ---------------------------------- |
| **No existe `README.md` en la raíz.** `docs/README.md:3` ya lo referencia como si existiera     | raíz del repositorio               |
| **No existe `scripts/check-docs.ts` ni el script `check:docs`**                                 | `package.json`                     |
| El paso de CI de RF-A09 **ya está escrito, con guarda**: se activa solo cuando el script exista | `.github/workflows/ci.yml:101-109` |
| Los contratos de extensión (lector, notificador, renderizador) **ya están documentados**        | `docs/02-arquitectura.md:103-156`  |
| `docs/arranque.md` sección 7 describe la instancia **como se imaginó**, antes de que existiera  | `docs/arranque.md:97-116`          |
| El repositorio **ya es público** desde el 2026-08-07, con descripción en inglés                 | `gh repo view`                     |
| Última etiqueta publicada: `v0.5.4`                                                             | `git tag`                          |
| `recipes/example` tiene **4 fuentes**; la instancia real tiene **30**                           | `recipes/example/recipe.yaml`      |

### Las tres trampas del ejemplo, medidas

Las tres están escritas y resueltas en las recetas reales de la instancia privada, con su porqué
dentro del YAML. En el ejemplo público siguen sin resolver:

1. **`topics` escritos como frases.** `src/rank/score.ts` los busca como **subcadena literal** en
   título más resumen, normalizados. `"modelos de lenguaje y agentes de IA"` no aparece jamás en un
   titular, así que el componente de temas puntúa cero y el orden lo decide solo la recencia. Con
   ello, `scoring.topicsWeight: 3` del ejemplo no hace absolutamente nada.
2. **`caps.perSourceMaxPercent: 40` no capa nada.** `src/rank/caps.ts` lo calcula sobre el conjunto
   **ya filtrado** por ventana y memoria, no sobre `maxItems`. Además, con `Math.floor`, un
   porcentaje bajo sobre un día flojo redondea a cero y descarta todo: el número correcto depende
   del número de fuentes, y con cuatro fuentes ningún valor de este campo hace nada útil.
3. **`repo-releases` lee cinco versiones por repositorio y descarta borradores y prelanzamientos.**
   Un repositorio que publica canary constantemente da cero para siempre. `vercel/ai` y
   `biomejs/biome` (los dos del ejemplo) hay que reverificarlos contra la red antes de dejarlos.

---

## Decisiones de esta fase

Ninguna reabre un ADR. Se dejan escritas aquí porque el plan las fija y `@fiel-al-plan` las va a
comparar.

1. **`README.md` en inglés, `README.es.md` en español.** El repositorio ya es público con
   descripción en inglés, y es lo que espera quien llega desde GitHub. `docs/` sigue **entero en
   español** y no se traduce: los dos README enlazan ahí. Coste aceptado: dos ficheros que se pueden
   desincronizar, y por eso T9 los compara entre sí.
2. **La captura sale de ejecutar `recipes/example` de verdad**, con modelo y fuentes reales, no de
   anonimizar un informe de la instancia. El ejemplo ya tiene una `persona.md` genérica, así que un
   informe suyo no contiene ningún dato personal **por construcción**, no por un borrado a mano que
   se puede dejar algo. Y de paso es la demostración de que el ejemplo sirve.
3. **PNG del correo más extracto en markdown.** La imagen enseña el trabajo de maquetación de la
   fase 4, que es la salida que de verdad se lee; el extracto es legible sin cargar la imagen. Riesgo
   asumido y dicho en voz alta: **nada en CI puede comprobar que el PNG siga reflejando el render
   actual**, así que envejece en silencio. Es el único artefacto de esta fase sin puerta.
4. **`recipes/example` se mejora, no se maquilla.** El dueño lo pidió explícitamente al planificar.
   Alcance acotado en T2: las tres trampas más un conjunto de fuentes creíble. No se convierte en una
   copia de la receta diaria de la instancia.
5. **Las guías se escriben para alguien de cualquier ámbito**, decisión del dueño al confirmar el
   plan. Y por eso hay que decir en voz alta lo que esa frase **no** puede significar, porque
   pretenderlo produciría documentación que miente:

   | Documento                        | Para quién                                   | Qué se le supone                                    |
   | -------------------------------- | -------------------------------------------- | --------------------------------------------------- |
   | `README.md` / `README.es.md`     | cualquiera                                   | tener cuenta de GitHub. Nada más                    |
   | `docs/07-escribir-una-receta.md` | **cualquiera, de cualquier ámbito**          | saber editar un fichero de texto. **Cero código**   |
   | `docs/arranque.md` (sección 7)   | cualquiera que quiera su instancia diaria    | lo mismo, más pegar un fichero de configuración     |
   | `docs/08-extender-el-motor.md`   | quien programe en el lenguaje del proyecto   | TypeScript, tests, un editor                        |

   **La cuarta fila es la honesta.** Añadir un lector o un notificador es escribir código que
   implementa un contrato: no existe una redacción que se lo haga entender a alguien que no programa,
   y fingir que sí es peor que decirlo. Esa guía **abre declarando a quién le sirve y a quién no, y
   adónde va el que no** (a la guía de recetas, donde está el 99% de lo que la gente necesita).

   Las tres primeras filas sí son innegociables: quien quiera seguir novedades de biotecnología, de
   derecho o de repostería tiene que poder montar la suya sin abrir `src/` ni entender qué es una
   API. Eso es la premisa entera del proyecto, no una cortesía de redacción.

---

## Orden de tareas

Tres tramos, y el orden entre ellos no es negociable: **el ejemplo antes que el README** (la captura
sale de él), **el README antes que `check:docs`** (verifica lo que el README afirma).

---

### Tramo A · El ejemplo, que en esta fase es el producto

#### T1 · Tests primero: la guarda que impide que las trampas vuelvan (R13)

Antes de tocar el YAML. Son afirmaciones sobre el ejemplo, comprobables sin red y sin credenciales,
y viven donde ya vive la puerta del ejemplo: `scripts/check-receta-ejemplo.ts` y su test.

- **Cada `topic` de `recipes/example` casa al menos una vez** contra el corpus de fixtures que el
  propio `check:receta-ejemplo` ya sirve. Es la prueba directa de la trampa 1: un tema escrito como
  frase falla aquí, hoy, antes de que nadie lo copie.
- **El componente de temas decide el orden**: sobre el corpus de fixtures, la lista puntuada con
  `topicsWeight` real no coincide con la lista ordenada solo por recencia. Si coincide, los temas no
  están haciendo nada.
- **`perSourceMaxPercent` recorta de verdad**: con el corpus de fixtures, al menos una fuente ve
  reducida su aportación. Y el borde de `Math.floor`: el valor elegido no puede redondear a cero con
  el tamaño de pool que el ejemplo produce.
- **Ninguna fuente del ejemplo declara `requiredSecrets`** más allá de la credencial del modelo
  (RF-B04), comprobado contra el registro de lectores, no contra una lista escrita a mano.

**Estos tests entran en rojo.** Con el `recipes/example` de hoy, el primero y el tercero fallan. Es
el punto: la fase empieza demostrando el defecto.

#### T2 · Reescribir `recipes/example`

- **`topics`**: términos cortos y literales, los que de verdad aparecen en un titular. `topicsWeight`
  recalculado según cuántos haya (la puntuación es `temas que casan / temas totales`: una lista larga
  diluye).
- **`sources`**: un conjunto creíble, público y sin credenciales (RF-B04), que ejercite **los cuatro
  tipos que salen a la red** (`feed`, `json-api`, `repo-search`, `repo-releases`). **Cada URL se
  verifica contra la red el día que se escribe**, nunca de memoria: es la regla de la constitución
  aplicada a fuentes, y es exactamente el defecto D-14 del sistema anterior (prometía 20 fuentes,
  entregaba 8). El quinto tipo, `archive`, no entra: no tiene nada que leer en una instancia recién
  creada (ADR-019), y se documenta en la guía de recetas (T6) en su lugar.
- **`caps`**: `perSourceMaxPercent` recalculado para el número real de fuentes, con el porqué escrito
  en el YAML, incluido el borde de `Math.floor`.
- **`sections.yaml`**: estructura tomada de la receta diaria real (secciones condicionales, de forma
  que un día flojo produzca un informe corto en vez de uno relleno), **sin ninguno de sus temas ni
  contenidos**. Es la estructura lo que se distribuye, no el dominio.
- **`persona.md`**: se mantiene genérica y se mantiene su aviso de cabecera, que es la lección más
  cara del sistema anterior (un mes de consejos a un director que no existía).
- **Fixtures nuevas** en `tests/fixtures/` para las fuentes nuevas, y `check-receta-ejemplo.ts`
  sirviéndolas.

**Puerta:** T1 en verde, `pnpm run check:receta-ejemplo` en verde, `pnpm test` en verde.

#### T3 · Ejecutar el ejemplo de verdad, y el juicio del dueño

`pnpm cli run --recipe example` con una credencial de modelo real y las fuentes vivas.

- Sale un informe. Se archiva. Los tres formatos se generan.
- **Con el canal de correo activado a mano** (no en el fichero versionado, que sigue con
  `enabled: false` por RF-H04), para tener el PNG del correo real.
- **Juicio del dueño**: ¿este informe, generado desde la receta que se distribuye, es algo que
  enseñarías en la portada? Si la respuesta es no, se vuelve a T2. **Es una puerta, no un trámite**:
  el ejemplo es lo único que un desconocido puede juzgar antes de decidir si hace fork.

---

### Tramo B · La documentación de entrada

> **Las cinco reglas de redacción de este tramo.** Aplican a T4, T5, T6 y T7 (no a
> `08-extender-el-motor.md`, que declara otro público). Son reglas, no aspiraciones: T9 comprueba
> mecánicamente la 1 y la 2, y el criterio de terminada comprueba el resto con una persona real.
>
> 1. **Ninguna palabra de jerga sin definir en su primera aparición**, o enlazada al glosario. La
>    lista cerrada de qué cuenta como jerga se fija en T6 y la comprueba `check:docs`.
> 2. **Cada orden de consola va precedida de qué hace y qué se ve al terminar.** Un bloque de
>    comandos sin eso solo sirve a quien ya sabía.
> 3. **Se explica por analogía antes que por definición.** "Una receta es la lista de la compra del
>    informe" antes que "una receta es un directorio con tres ficheros YAML".
> 4. **Ningún ejemplo del ámbito del autor en la primera pasada de un concepto.** Si el primer
>    ejemplo de cada idea es siempre de inteligencia artificial, el lector de otro campo concluye
>    que la herramienta no es para él. **Los ejemplos rotan de ámbito** (biotecnología, derecho,
>    ciclismo, lo que sea), que además es la demostración viva de RF-A04.
> 5. **Se dice lo que va a costar y lo que puede salir mal antes de pedir el primer paso.** Nada de
>    descubrir en el paso 7 que hacía falta una tarjeta de crédito.

#### T4 · `README.md` (inglés)

La estructura, y no más de esto:

1. **La promesa, en tres líneas.** Qué es y qué lo distingue: el motor no sabe de noticias ni de IA,
   todo el dominio vive en una receta. Es la frase que decide si alguien sigue leyendo.
2. **La captura**: PNG del correo real de T3, más un extracto en markdown debajo.
3. **La ruta rápida, cronometrable.** Fork, un secreto, lanzar. Numerada, sin ramas ni condicionales:
   cada "si prefieres..." que se meta aquí es tiempo del reloj de T10. Lo demás va a las guías.
4. **Qué hay que saber antes de fiarse**: las cinco cosas que el proyecto ya sabe que salen mal
   (el punto único de fallo, el aviso que no comunica una condición crónica, el marcador de posición
   guardado como credencial). Es lo que separa este README del de un proyecto que no ha corrido
   nunca en producción.
5. **Enlaces**: guías, `docs/`, licencia, contribución, seguridad.

**Lo que no lleva:** ni tabla de contenidos, ni lista exhaustiva de opciones, ni la arquitectura.
Todo eso ya está en `docs/` y duplicarlo es crear la divergencia que RF-A09 existe para cazar.

#### T5 · `README.es.md`

Traducción, no reescritura. Mismos apartados, mismo orden, mismas órdenes de consola. T9 comprueba
que no se separen.

#### T6 · Las guías, y el glosario que las sostiene

Van a `docs/`, siguiendo su numeración. **No redefinen los contratos**: `docs/02-arquitectura.md`
(líneas 103-156) ya los fija, y repetirlos es divergencia garantizada. Estas guías son el paso a
paso.

**`docs/glosario.md`** · se escribe **primero**, porque es lo que hace posible la regla 1 y lo que
`check:docs` va a comprobar. Una entrada por término, **una frase cada una, sin jerga dentro de la
definición** (un glosario que se explica con más jerga no es un glosario). La lista cerrada, que es
también el contrato que verifica T9:

> receta · fuente · canal (de sindicación) · API · repositorio · fork · secreto · variable de
> entorno · credencial · cron · YAML · Markdown · esquema · modelo · proveedor · token · ventana ·
> puntuación · deduplicar · notificador · archivo (el del proyecto, no el fichero) · instancia

**`docs/07-escribir-una-receta.md`** · la guía grande, la que usa el 99% de la gente, **sin una sola
línea de código**. Su forma:

1. **"Qué es una receta", por analogía**, en un párrafo, antes de nombrar ningún fichero.
2. **Una receta completa de un ámbito que no es el del autor**, entera y comentada, para copiar y
   cambiar. Es lo primero que ve el lector después de la analogía: la gente aprende un formato
   copiando uno que funciona, no leyendo la tabla de sus campos.
3. **Los tres ficheros, uno por uno** (`recipe.yaml`, `sections.yaml`, `persona.md`), cada campo con
   qué hace **de verdad** y qué pasa si lo dejas mal.
4. **Las tres trampas medidas, como advertencias con su número**, en el campo al que afectan y no en
   un apéndice al final que nadie lee.
5. **`persona.md` con su aviso**: se interpreta literalmente. Es la lección más cara del sistema
   anterior y va en su propia sección, no en una nota al pie.
6. **Dos recetas que se encadenan**, con la estructura real de la instancia (una diaria y una
   semanal que destila a la diaria vía `archive`) como **esquema**, con marcadores de posición en
   vez de temas, fuentes y perfil reales.
7. **"No me sale lo que quería"**: la lista de síntomas y su causa. Salen siempre las mismas
   noticias, la sección viene vacía, una fuente no aporta nada, el informe llega escueto.

**`docs/08-extender-el-motor.md`** · añadir un lector y añadir un notificador. Los dos son la misma
forma (implementar el contrato, registrarlo, probarlo sin red) y separarlos en dos ficheros de
veinte líneas cada uno no ayuda a nadie. Cada uno con su ejemplo mínimo completo y su test.
**Abre declarando su público** (ver la decisión 5): quien no programe no necesita esta guía, y se le
dice adónde ir en la primera línea en vez de dejarle descubrirlo tres pantallas después.

**Actualizar `docs/README.md`**, que es el índice, con las tres entradas nuevas y **para quién es
cada una**. Hoy ese índice está escrito para quien va a construir el motor; a partir de esta fase
tiene dos públicos y tiene que separarlos.

#### T7 · `docs/arranque.md`, sección 7

Hoy describe la instancia **como se imaginó antes de que existiera**. La bitácora del 2026-08-10 dejó
esa sección sin tocar a propósito, esperando "a lo que la instancia resulte ser de verdad". Ya lo es.

Se reescribe con la forma real, **anonimizada**: el árbol de directorios, la forma de
`briefing.yml` (los dos crones, el `permissions: contents: write` por job y por qué, el pin a
etiqueta y no a rama), **la tabla de secretos con qué pasa sin cada uno**, y la lista de
comprobación de antes de dejar los crones sueltos. Todo eso existe ya, escrito y probado, en el
README de la instancia privada: aquí entra la plantilla, nunca los valores.

**Con las cinco reglas del tramo aplicadas**, que aquí cuestan más que en ningún otro sitio: esta
sección habla de crones, permisos, workflows reutilizables y almacenes de secretos, y hoy está
escrita para quien ya sabe lo que son las cuatro cosas. Cada una necesita su frase de qué es y su
enlace al glosario, y el `briefing.yml` de plantilla necesita **qué hace cada bloque**, no solo el
bloque.

---

### Tramo C · La puerta que impide que todo lo anterior envejezca

Es el punto 5 de la lista de la constitución, y el defecto D-14: _"la documentación se desincroniza
del código en semanas si nada la comprueba"_.

#### T8 · Tests de `check:docs`, primero y sin tocar ficheros reales (R13)

La lógica es pura: **dado un texto y un hecho del código, ¿hay divergencia?** Se prueba con cadenas
en memoria, no leyendo `docs/`. Un test que dependa del contenido real de la documentación se rompe
cada vez que alguien corrija una coma.

Casos: detecta una versión de entorno que no es la de `engines`; detecta un nombre de variable de
entorno que no existe en el código; detecta un código de salida que no está en `exit-codes.ts`;
detecta un tipo de lector que no está en el registro; detecta un enlace a un fichero que no existe;
y **no** salta con la documentación correcta (el caso que evita la puerta que grita siempre).

#### T9 · `scripts/check-docs.ts` y su cableado

El contrato de afirmaciones que verifica, fijado aquí para que `@fiel-al-plan` lo pueda comparar:

| Afirmación de la documentación                                    | Contra qué se comprueba                        |
| ----------------------------------------------------------------- | ---------------------------------------------- |
| versión del entorno de ejecución                                  | `package.json` → `engines.node` (RF-A10)       |
| nombres de variables de entorno (`CHRONORIUM_*`, credenciales)    | los que `src/` lee de verdad                   |
| los cinco códigos de salida y su significado                      | `src/cli/exit-codes.ts`                        |
| los comandos del CLI (`run`, `validate`, `doctor`) y sus banderas | `src/cli/main.ts`, `src/cli/run.ts`            |
| los tipos de lector nombrados                                     | `src/sources/registry.ts`                      |
| los identificadores de notificador nombrados                      | `src/deliver/registry.ts`                      |
| los nombres de proveedor nombrados                                | `src/model/providers.ts`                       |
| **cuántas fuentes promete el ejemplo**                            | `recipes/example/recipe.yaml`, contadas (D-14) |
| cada ruta de fichero enlazada desde la documentación              | que el fichero exista                          |
| `README.md` y `README.es.md` no divergen                          | mismos apartados, mismas órdenes de consola    |
| **cada palabra de la lista de jerga (T6) que aparezca**           | tiene entrada en `docs/glosario.md`            |
| **cada guía declara su público en su primer párrafo**             | los cuatro documentos de la decisión 5         |

Ámbito: `README.md`, `README.es.md`, `docs/**.md`, `CONTRIBUTING.md`, `SECURITY.md`. **No** entra
`docs/bitacora.md`, y es deliberado: es un diario fechado, sus afirmaciones eran ciertas el día que
se escribieron y "corregirlas" sería falsificar el registro.

Las dos filas nuevas son la parte mecanizable de la decisión 5, y **solo esa parte**. Comprueban que
el término esté definido en algún sitio, nunca que la definición sea buena ni que el texto se
entienda: eso no lo puede comprobar un script y no se va a fingir que sí. Lo comprueba el punto 10
del criterio de terminada, con una persona.

**Ámbito de las dos filas nuevas:** `README*`, `docs/07-*`, `docs/glosario.md` y `docs/arranque.md`.
**No** aplican a `docs/08-extender-el-motor.md` ni al resto de `docs/`, que declaran otro público
(decisión 5): exigir ahí un glosario para "contrato" o "registro" sería la puerta que grita siempre
y acabaría desactivada.

Se añade `check:docs` a `package.json`. **El paso de CI no se toca**: su guarda
(`.github/workflows/ci.yml:105`) se activa sola en cuanto el script exista.

**Puerta:** `pnpm run check:docs` en verde sobre la documentación real. Si saca hallazgos, se
corrigen los documentos, **no se relaja el script**.

---

### Tramo D · La prueba del desconocido, y publicar

#### T10 · Cronometrar la ruta en una cuenta limpia (RF-H04)

No es una lectura del README, es hacerlo: cuenta de GitHub distinta, fork, secreto, lanzar, recibir.
**Con cronómetro.** Objetivo declarado: cinco minutos.

Es uno de los tres criterios que deciden si la versión ha salido bien
(`docs/01-especificacion.md`, sección final). Si pasa de cinco minutos, el resultado no es "se
acepta": es una vuelta a T4 recortando la ruta rápida, con el número real anotado en la bitácora.

#### T11 · `/pre-lanzamiento` y `v1.0.0`

La skill `pre-lanzamiento` valida contra el entorno real y da veredicto. Solo después, la etiqueta.

---

## Ficheros que se tocan

**Nuevos**

```text
README.md                          T4
README.es.md                       T5
docs/glosario.md                   T6       (se escribe antes que las guías)
docs/07-escribir-una-receta.md     T6
docs/08-extender-el-motor.md       T6
docs/assets/informe-ejemplo.png    T3, T4   (el PNG del correo)
docs/informe-ejemplo.md            T3, T4   (el informe completo, para quien no cargue la imagen)
scripts/check-docs.ts              T9
tests/docs/check-docs.test.ts      T8
tests/fixtures/…                   T2       (las fuentes nuevas del ejemplo)
```

**Modificados**

```text
recipes/example/recipe.yaml        T2
recipes/example/sections.yaml      T2
recipes/example/persona.md         T2   (retoque, mantiene el aviso de cabecera)
scripts/check-receta-ejemplo.ts    T1, T2
tests/…/check-receta-ejemplo       T1
docs/README.md                     T6   (índice, tres entradas nuevas y para quién es cada una)
docs/arranque.md                   T7   (sección 7)
package.json                       T9   (script check:docs)
docs/ops.md                        cierre
docs/bitacora.md                   cierre
```

**Que no se tocan, y es deliberado**

`src/` **entero**. Si esta fase necesita cambiar una línea de `src/`, algo está mal: es una fase de
documentación y de configuración de dominio. La única excepción admisible es un hallazgo de T3 (el
informe real del ejemplo sale roto por un defecto del motor), y en ese caso se para, se anota y se
decide, no se parchea de paso.

---

## Contratos que esta fase fija

1. **`pnpm run check:docs` existe** y el paso guardado de CI se activa. A partir de aquí, cualquier
   fase futura que cambie un código de salida, una variable de entorno o un tipo de lector **rompe
   la construcción** si no actualiza la documentación. Es el contrato más valioso de la fase.
2. **La lista de afirmaciones verificadas** (tabla de T9). Ampliarla es barato; quitar una fila
   exige explicar por qué esa afirmación dejó de importar.
3. **`README.md` es el canónico y está en inglés.** `README.es.md` es traducción y se mantiene en
   paridad estructural, comprobada.
4. **`recipes/example` es el ejemplo de referencia** y su forma (secciones, cardinalidades) es
   material de portada. El código sigue sin conocer ninguna de sus claves (R12): eso no cambia.
5. **`docs/arranque.md` sección 7 pasa de especulación a plantilla verificada.**
6. **Cada documento declara su público** (decisión 5), y `docs/glosario.md` es la lista cerrada de
   jerga. Una fase futura que introduzca un concepto nuevo en la documentación de entrada tiene que
   añadirlo al glosario o `check:docs` la para.

Ninguno de estos seis obliga a una fase futura a romper nada. El corte está bien.

---

## Lo que NO entra en esta fase

| Fuera                                                | Por qué                                                                                       |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Publicar en el registro de paquetes                  | ADR-015. El camino de uso es el fork, no `install`                                            |
| Traducir `docs/` al inglés                           | Diez ficheros que se desincronizarían a la primera sesión. Los README enlazan y ya            |
| Sitio propio en un subdominio                        | Futuro con disparador propio (`06-extensibilidad.md`)                                         |
| Validar el correo en Outlook                         | Deuda de la fase 4. No bloquea publicar, y exige un cliente que no hay aquí                   |
| Ajustar los umbrales de `meta.degraded`              | Deuda de la fase 4, pendiente de ver un informe real degradado                                |
| Arreglar el pin de la receta semanal en la instancia | **Otro repositorio.** Ver el aviso de abajo: es urgente, y no es de esta fase                 |
| El radar de crecimiento medido de verdad             | Futuro con disparador (`ops.md`, sección FUTURO)                                              |
| Reescribir `CONTRIBUTING.md` o `SECURITY.md`         | Existen y cumplen RF-H01. Solo se tocan si `check:docs` saca un hallazgo concreto sobre ellos |
| Cualquier cambio en `src/`                           | Ver arriba                                                                                    |

---

## Criterio de terminada

Concreto y comprobable. La fase no se cierra hasta que las diez estén:

1. `pnpm test`, `pnpm run typecheck`, `pnpm run lint` y `pnpm run build` en verde.
2. `pnpm run bateria` y `pnpm run check:sin-datos-personales` en verde.
3. `pnpm run check:receta-ejemplo` en verde, **incluidas las guardas nuevas de T1** (cada tema del
   ejemplo casa, el orden por temas difiere del orden por recencia, el tope por fuente recorta).
4. `pnpm run check:docs` existe, corre en CI y **está en verde sobre la documentación real**.
5. Existen `README.md` y `README.es.md`, con la captura de un informe **generado por
   `recipes/example`**, no anonimizado a mano.
6. Existen `docs/glosario.md`, `docs/07-escribir-una-receta.md` y `docs/08-extender-el-motor.md`,
   enlazados desde `docs/README.md`, y ninguno redefine un contrato que `02-arquitectura.md` ya fija.
7. `docs/arranque.md` sección 7 describe la instancia real, sin ningún dato personal.
8. **El dueño ha ejecutado la ruta del desconocido en una cuenta limpia, con cronómetro, y el número
   está anotado en la bitácora**, sea cual sea.
9. **El dueño ha leído el informe de ejemplo y lo daría por bueno en la portada.**
10. **La prueba del lector de otro ámbito.** Una persona que no programa lee `README.es.md` y
    `docs/07-escribir-una-receta.md` y consigue **escribir la receta de su propio campo** (no
    ejecutarla: escribirla), diciendo en voz alta dónde se atasca. Cada atasco es un arreglo en la
    guía, no una explicación a esa persona.

    **Es la prueba de la decisión 5, y sin ella esa decisión es una intención.** Si no hay ninguna
    persona disponible, la alternativa **no** es darla por buena: es que el dueño lea las dos guías
    en voz alta buscando cada frase que solo se entiende sabiendo ya la respuesta, y lo anote en la
    bitácora como lo que es, una comprobación más floja. Quién hace esta prueba se decide al llegar
    a T10, no ahora.

Las tres últimas no las puede dar por buenas ningún agente. Son la fase.

---

## Riesgos, dichos en voz alta

1. **El PNG envejece sin que nada avise.** Es el único artefacto sin puerta (decisión 3). Mitigación
   parcial: `docs/informe-ejemplo.md` guarda el informe completo en texto, que sí se puede comparar.
2. **Las fuentes del ejemplo pueden morir después de verificarlas.** El CI sirve fixtures, así que
   una fuente muerta **no rompe la construcción**: la descubre el primer desconocido que haga fork.
   No se resuelve en esta fase (haría falta un CI con red, que ninguna regla del proyecto quiere).
   Se acota eligiendo fuentes estables y anotando la fecha de verificación en el YAML.
3. **`README.es.md` se desincroniza.** T9 comprueba paridad estructural y órdenes de consola, no
   sentido. Una traducción que miente en prosa pasa la puerta.
4. **`check:docs` que grita demasiado.** Una puerta que salta con falsos positivos se acaba
   desactivando, que es peor que no tenerla. Por eso T8 incluye explícitamente el caso "documentación
   correcta, no salta", y por eso la bitácora queda fuera del ámbito.
5. **T2 puede crecer sola.** "Mejorar el ejemplo" no tiene fondo. El alcance es: las tres trampas más
   un conjunto de fuentes creíble que ejercite los cuatro tipos de red. Cualquier cosa más allá de
   eso se anota y se decide, no se hace de paso.
6. **"Entendible para cualquiera" es el riesgo mayor de esta fase, porque no tiene medida.** Quien
   escribe la guía conoce el sistema, y el que conoce el sistema **no puede leer su propio texto
   como alguien que no lo conoce**: es el mismo defecto que hizo que `arranque.md` sección 7
   describiera durante nueve días una instancia que no existía, y nadie lo notó leyéndolo. Las cinco
   reglas del tramo B y las dos filas nuevas de `check:docs` reducen el margen, pero **la única
   comprobación de verdad es el punto 10**, y depende de conseguir a esa persona. Sin ella, la fase
   se puede cerrar creyendo que cumple la decisión 5 sin cumplirla.
7. **La decisión 5 puede inflar T6 sin límite.** Explicar por analogía y rotar ámbitos en los
   ejemplos cuesta páginas, y una guía de cuarenta pantallas no la lee nadie, con lo que el remedio
   mata al enfermo. Tope: `07-escribir-una-receta.md` tiene que poder leerse de una sentada. Si no
   cabe, lo que sobra sale a un documento de consulta, no se escribe más pequeño.

---

## Aviso fuera de alcance, pero con fecha

**Comprobado**, leyendo el repositorio de la instancia y el historial del público:

- `chronorium-ivan/.github/workflows/briefing.yml` fija el job `diaria` a `@v0.5.4` y el job
  `semanal` a **`@v0.5.3`**.
- `recipes/weekly/recipe.yaml` declara `model.maxOutputTokens: 8192`.
- En `v0.5.3`, `src/model/synthesize.ts` **no lee ese campo** (se añadió en `v0.5.4`, ADR-022) y
  `recipe/validate.ts` **no rechaza campos desconocidos**.

**Inferido de ahí:** el `8192` de la semanal se ignora en silencio y la llamada sale con el valor por
defecto de `v0.5.3`, que son 4096 tokens. Es exactamente la condición que tumbó la semanal del
2026-08-17.

**Sin verificar:** que el lunes 2026-08-24 vuelva a fallar. Depende de cuánto ocupe la salida esa
semana, y la propia bitácora deja la hipótesis del incidente sin confirmar al 100%.

**Es un cambio de un carácter** en un fichero de otro repositorio, y no forma parte de esta fase.

---

_Escrito antes de construir nada. `ejecutar-fase` lo toma tal cual; los desvíos van a la bitácora._
