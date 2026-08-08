# Fase 1 · El esquema derivado, y la prueba que decide el proyecto

> **Esta fase no construye producto. Responde una pregunta.**
>
> ¿Produce un modelo contenido de calidad para secciones que solo conoce por un fichero de
> configuración?
>
> Si la respuesta es que no, se aplica el plan de contingencia del ADR-005 y se vuelve a medir. Si
> tampoco, se para. Detectarlo aquí cuesta una tarde; en la fase 6 cuesta el proyecto.

**Estado de partida (comprobado).** `src/` contiene un único fichero y es documentación
(`src/model/CLAUDE.md`): cero código. `ai@7.0.55`, `yaml@2.9`, `zod@4.4` instalados, **ningún paquete
de proveedor de modelo**. Node 24.16. Las guardas de arranque del CI (tipos, construcción) se
desactivan solas en cuanto exista el primer `.ts`: esta fase las pone en marcha de verdad.

---

## Requisitos que cubre

| Requisito | Qué se cumple aquí                                                                         |
| --------- | ------------------------------------------------------------------------------------------ |
| RF-A03    | derivar el JSON Schema de `sections.yaml` en tiempo de ejecución. **El núcleo de la fase** |
| RF-A04    | dos recetas de forma distinta producen su informe sin tocar `src/`. Es el criterio         |
| RF-A05    | la receta se valida entera y se rechaza nombrando el campo concreto                        |
| RF-A06    | un YAML corrupto o ausente termina en error, nunca en valores por defecto silenciosos      |
| RF-A07    | las rutas se resuelven explícitamente, no desde el directorio de trabajo                   |
| RF-A01    | el prompt se compone entero desde la receta                                                |
| RF-A08    | `persona.md` lleva la advertencia sobre perfil real frente a perfil aspiracional           |
| RF-D01    | la salida valida contra el esquema derivado o falla. Sin relleno por defecto               |
| RF-H02    | toda la lógica de esta fase se prueba sin red y sin credenciales                           |
| RF-H03    | el proveedor queda tras una interfaz sustituible por un doble                              |

**Cubiertos de refilón, y por qué no se puede evitar.** RF-E01 (delimitar la entrada no confiable) y
RF-E02 (salida restringida a la estructura). No se puede ejecutar la prueba sin componer un prompt
que contenga los elementos, y R1 no admite componerlo sin delimitador. RF-E02 viene de serie al usar
generación estructurada con el esquema derivado. **La batería de ataques y la validación de enlaces
siguen siendo fase 3**: aquí se monta el bloque del prompt, no se declara segura ninguna defensa.

Las seis tareas de `ops.md` mapean a estos requisitos sin sobrantes.

---

## Orden de tareas

Tests antes de la implementación en T2, T4, T6 y T8. Son lógica pura y R13 lo exige.

### T0 · Que los tests existan y se comprueben

Hoy `pnpm run typecheck` solo mira `src/`, y `scripts/tsconfig.json` no lo ejecuta nadie. Antes de
escribir el primer test hay que cerrar eso, o los tests nacen sin comprobación de tipos.

- `tests/tsconfig.json`, con el mismo patrón que `scripts/tsconfig.json`
- `typecheck` pasa a cubrir los tres proyectos (`src`, `scripts`, `tests`)
- Activar `erasableSyntaxOnly` en `tsconfig.json`. **Motivo concreto:** `node --test` ejecuta los
  `.ts` con el borrado de tipos nativo de Node 24, que no admite `enum`, `namespace` ni propiedades
  de parámetro. Sin esta bandera, el typecheck da verde a código que el runner no puede ejecutar
- Comprobar con un test trivial que `node --test` descubre `tests/**/*.test.ts`

### T1 · Los tipos, que son el contrato (ADR-007)

`src/recipe/types.ts`: `FieldSpec`, `SectionSpec`, `RecipeConfig`, `Persona`. Nada de lógica.
Es lo que las fases 3 y 4 van a consumir, así que se fija aquí y no se toca después.

### T2 · Tests de la construcción del esquema · **rojo primero**

`tests/recipe/schema.test.ts`. Los cuatro casos que nombra `ops.md`, más los que ya se ven venir:

- `sections.yaml` válido produce un esquema con las claves declaradas, `required` completo y
  `additionalProperties: false`
- `cardinality: one` produce objeto; `cardinality: list` con `min`/`max` produce array con
  `minItems`/`maxItems`
- campo sin `name` o sin `type` → error que **nombra la sección y el campo**
- cardinalidad inválida (`max` menor que `min`, `cardinality` desconocida) → error que la nombra
- tipo desconocido (`type: datetime`) → error que nombra el tipo y dónde aparece
- tipo `url` → produce `string` en el esquema **y** queda en la lista de rutas a validar contra la
  entrada. Aquí solo se produce esa lista; quien la consume es la fase 3 (RF-E03)
- `condition: non-empty` sobrevive al `SectionSpec`. Lo consume la fase 4 (RF-F05)
- dos secciones con la misma `key` → error
- cero secciones → error

### T3 · `src/recipe/schema.ts`

Implementación hasta poner T2 en verde. La envoltura para generación estructurada
(`jsonSchema()` del SDK, ADR-005) vive aquí, con función de validación propia.

### T4 · Tests de carga y validación · **rojo primero**

`tests/recipe/load.test.ts`:

- YAML sintácticamente corrupto → error. Nunca continuar (RF-A06)
- fichero ausente → error que nombra la ruta
- **el mismo test ejecutado con otro directorio de trabajo carga la misma receta** (RF-A07)
- campo obligatorio ausente en `recipe.yaml` → error que nombra el campo (RF-A05)
- la validación devuelve **todos** los errores, no aborta en el primero

### T5 · `src/recipe/load.ts`, `src/recipe/validate.ts`, `src/paths.ts`

**Alcance acotado a propósito:** valida las secciones y los campos de `recipe.yaml` que esta fase
usa (persona, idioma, temas, modelo). Fuentes, entrega y credenciales requeridas se validan en el
mismo punto de entrada, pero las añaden las fases 2 y 3. El contrato que se fija hoy es la **forma
del error** (`campo` + `motivo`), no la lista de campos.

### T6 · Tests del prompt y `src/model/prompt.ts`

Orden de bloques según `src/model/CLAUDE.md`: identidad y destinatario, áreas de interés, idioma,
**delimitador de entrada no confiable con los elementos dentro**, instrucciones de salida.
El esquema no se describe en prosa.

Test sin red: un elemento cuyo título dice "ignora las instrucciones anteriores" y otro con
`<script>` acaban **dentro** del delimitador, nunca fuera. Es una prueba de composición. La prueba
de que la defensa aguanta es la batería de la fase 3.

### T7 · `src/model/client.ts`

Una sola función de llamada, sobre `generateObject`, tras una interfaz que acepta un doble (RF-H03).
**Sin cadena y sin reintento: eso es la fase 3**, y extenderá este fichero. R10 no admite una segunda
implementación de la llamada, que es exactamente lo que el sistema anterior tenía por triplicado.

Temperatura baja y tope de tokens de salida desde el primer día.

Antes de escribir nada: `@dependency-audit` sobre `@ai-sdk/google`, y se instala **con pnpm, sin
pin** (política de versiones de la constitución). El identificador del modelo se verifica contra la
documentación de Google de ese día, nunca de memoria. La credencial se lee solo del entorno (R3) y
la prueba falla en voz alta si no está.

### T8 · Test del flujo con modelo simulado

Receta → esquema → prompt → doble → salida validada. Y el caso que importa: una respuesta a la que
le falta una sección **falla**, no se rellena (RF-D01). Sin red, sin credenciales.

### T9 · Las dos recetas y los elementos fijos

Las dos tienen que diferenciarse **en la forma**, no solo en el texto. Si se parecen, la prueba no
prueba nada.

#### Receta A · `recipes/example/` · la que se distribuye

Dominio: novedades de inteligencia artificial y de herramientas de desarrollo. Es una versión
genérica de la receta diaria descrita en el cerebro del producto, §5.1.

| `key`        | Cardinalidad          | `condition` | Campos                                                        |
| ------------ | --------------------- | ----------- | ------------------------------------------------------------- |
| `pulse`      | `one`                 | `always`    | `text`                                                        |
| `top`        | `list`, min 2, máx 5  | `always`    | `title`, `verdict` (la opinión), `why`, `link` (tipo `url`)   |
| `applicable` | `list`, min 0, máx 3  | `non-empty` | `title`, `action`, `link` (tipo `url`)                        |

Idioma: español. Tono, desde el cerebro §9: directo, con opinión propia, orientado a la acción,
tuteo, español neutro. Distingue el ruido del movimiento real y lo dice sin rodeos.

`persona.md` describe a **una persona genérica**: alguien que desarrolla en solitario, en fase de
conseguir sus primeros clientes, que aplica con sus manos esta semana en vez de decidir estrategia
de empresa. **Sin nombres propios, sin correos, sin proyectos concretos, sin la agencia de nadie.**
La receta real y personal vive en el repositorio privado de la instancia (ADR-002), nunca aquí.

Y lleva el bloque de advertencia de RF-A08, que es un requisito y no un adorno: avisa de que ese
texto se interpreta **literalmente** para decidir qué se recomienda, y pide la situación real y
actual en lugar de la aspiracional. Existe porque el usuario cero describió su perfil como lo que su
negocio aspira a ser y se comió un mes de recomendaciones dirigidas a alguien que no existe.

#### Receta B · `tests/fixtures/recipes/biotech/` · la forma contraria

El dominio lo eligió el propio dueño en el cerebro §7, cuando dijo que a un biotecnólogo un
repositorio de código no le sirve de nada. Es el contraejemplo natural del proyecto.

| `key`      | Cardinalidad         | `condition` | Campos                                                     |
| ---------- | -------------------- | ----------- | ---------------------------------------------------------- |
| `digest`   | `list`, min 3, máx 6 | `always`    | `finding`, `method`, `relevance`, `source` (tipo `url`)    |
| `watchout` | `list`, min 0, máx 2 | `non-empty` | `claim`, `caveat`                                          |

Diferencias deliberadas respecto a A, y cada una prueba algo:

- **dos secciones en vez de tres**, y **ninguna de cardinalidad `one`** · el esquema no puede dar
  por supuesta la forma de A
- **`min` mayor que cero** en la sección principal · A no lo tiene, así que el mínimo solo se
  ejercita aquí
- **una sección sin ningún campo `url`** · la lista de rutas a validar puede quedar vacía, y eso no
  puede romper nada
- **cuatro campos en una sección** · más de los que tiene ninguna de A
- **idioma inglés** y persona de investigadora académica · el prompt se compone entero desde la
  receta o esto sale en español

> Vive como fixture, no en `recipes/`, porque una receta distribuida es una promesa que RF-H05 y
> RF-B04 hacen cumplir al CI, y hoy no existen ni fuentes ni entrega para cumplirla. Promocionarla
> en la fase 6 es un `git mv`; retirar una receta ya publicada rompe a quien hizo fork.

#### Los elementos fijos

`tests/fixtures/items/ai.json` y `tests/fixtures/items/biotech.json`. Unos 15 elementos cada uno,
escritos a mano, con la forma mínima que el prompt necesita: `title`, `url`, `source`,
`publishedAt`, `summary`. La recolección de verdad es la fase 2.

Los dos conjuntos deben tener **la misma forma y un tamaño parecido**. Si A trae 15 elementos ricos
y B trae 6 pobres, la comparación de calidad mide el fixture y no el mecanismo.

### T10 · La prueba · `pnpm run probe:fase1`

`scripts/probe-fase1.ts`, que **consume** `src/model/client.ts` sin reimplementar nada. Tres
ejecuciones:

| Run | Receta | Elementos | Para qué                                 |
| --- | ------ | --------- | ---------------------------------------- |
| A   | A      | A         | la forma A sobre su dominio              |
| B   | B      | B         | la forma B sobre su dominio              |
| C   | B      | A         | **control**: separa la forma del dominio |

Sin C, una caída de calidad en B no se puede atribuir: no sabrías si falló porque la sección es
genérica o porque el dominio es otro. Son tres llamadas, cuestan céntimos, y son la diferencia entre
medir y opinar.

Salidas a `tmp/` (ya ignorado), en JSON y en texto legible.

### T11 · El juicio del dueño

Leer las tres salidas sección a sección y decir si sirve. No es automático y no lo puede firmar
nadie más.

---

## Contratos que fija esta fase

Cinco. Que alguna fase posterior tenga que romper uno sería la señal de que este corte está mal.

1. `SectionSpec` y `FieldSpec` · los consumen el renderizado (fase 4) y el modelo (fase 3)
2. **El JSON Schema derivado y su envoltura** · el mecanismo central (ADR-005)
3. **La lista de rutas de campos `url`** · la produce el esquema, la consume la validación de
   enlaces de la fase 3 (RF-E03). Es el enganche entre las dos fases
4. `src/model/client.ts` como **punto de entrada único** al modelo · la fase 3 lo envuelve con cadena
   y reintento, no lo duplica
5. La resolución explícita de rutas y la forma del error de validación (`campo` + `motivo`)

## Ficheros que se tocan

```text
tsconfig.json                      erasableSyntaxOnly
package.json                       typecheck ampliado, probe:fase1, @ai-sdk/google
tests/tsconfig.json                nuevo
src/paths.ts                       nuevo
src/recipe/types.ts                nuevo
src/recipe/schema.ts               nuevo
src/recipe/load.ts                 nuevo
src/recipe/validate.ts             nuevo
src/model/prompt.ts                nuevo
src/model/client.ts                nuevo
scripts/probe-fase1.ts             nuevo
recipes/example/                   recipe.yaml (mínimo), sections.yaml, persona.md
tests/recipe/*.test.ts             nuevos
tests/model/*.test.ts              nuevos
tests/fixtures/recipes/biotech/    nuevo
tests/fixtures/items/*.json        nuevos
docs/bitacora.md                   entrada al cerrar
```

---

## Las once trampas de esta fase

Cada una es un defecto medido del sistema anterior o una regla de la constitución. Si cualquiera
aparece en el código construido, la fase está mal hecha aunque los tests estén verdes.

| #   | La trampa                                                                | Por qué es grave                                                                          |
| --- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| 1   | `if (section.key === 'pulse')` en cualquier fichero                      | R12. Es la premisa del proyecto. El sistema anterior lo tenía en cuatro sitios (D-02)     |
| 2   | Rellenar un campo ausente de la respuesta del modelo con un valor por defecto | RF-D01 y prohibición explícita. Era `normalizeBriefing`, campo por campo                  |
| 3   | Describir el esquema en prosa dentro del prompt                          | Es literalmente D-02. El esquema va como esquema estructurado, no como JSON de ejemplo    |
| 4   | Que `scripts/probe-fase1.ts` haga su propia llamada al modelo            | R10. El sistema anterior tenía tres implementaciones de la llamada                        |
| 5   | Usar Zod para el esquema derivado                                        | ADR-005: JSON Schema en memoria más `jsonSchema()`. Zod es solo para lo estático          |
| 6   | `npm install`                                                            | Solo pnpm, y `@ai-sdk/google` sin fijar major                                             |
| 7   | Fijar un identificador de modelo de memoria                              | Un identificador retirado convierte el primer arranque de un desconocido en un error críptico. Verificar contra la documentación de Google de ese día |
| 8   | Meter datos personales en `recipes/example/`                             | Es el repositorio público. La receta real vive en la instancia privada (ADR-002)          |
| 9   | Un test que necesite red o credenciales                                  | R13 y RF-H02. Si un test necesita red, el test está mal                                   |
| 10  | Resolver una ruta desde el directorio de trabajo                         | RF-A07, defecto D-12                                                                      |
| 11  | La raya larga en cualquier texto, código, comentario o commit            | Prohibición de la constitución                                                            |

---

## Lo que NO entra, aunque esté cerca

- **Recolección de fuentes.** Los elementos son ficheros escritos a mano. Fase 2
- **Puntuación, deduplicación, ventana temporal, memoria de lo ya visto.** Fase 2
- **Cadena de proveedores, reintento, aviso de punto único de fallo, rechazo de marcadores de
  posición.** Fase 3. `client.ts` habla con un proveedor y punto
- **La validación de enlaces contra la entrada.** Esta fase produce la lista de campos `url`; quien
  la usa es la fase 3. Es la línea más fácil de cruzar sin darse cuenta
- **La batería de ataques.** Fase 3
- **Renderizadores, escapado, entrega, archivo, estado, registro de ejecuciones.** Fase 4
- **Los comandos del CLI** (`run`, `validate`, `doctor`). La prueba es un script, no un comando
- **`check:receta-ejemplo` y `check:docs` en CI.** No hay pipeline que ejercitar todavía. Las guardas
  del workflow los siguen saltando solas
- **`recipe.yaml` completo.** Solo los campos que esta fase usa

---

## Dónde para quien construye

De **T0 a T9** se construye entero y sin red. Ahí se para y se comprueba
`GOOGLE_GENERATIVE_AI_API_KEY`:

- **si está**, se ejecuta T10 y se le entregan al dueño las tres salidas legibles
- **si no está**, no se inventa nada y no se simula la prueba: se deja todo listo y se le dice al
  dueño la línea exacta que tiene que exportar y el comando exacto que tiene que lanzar

T11 no lo firma nadie más que el dueño. Un agente diciendo "la calidad parece buena" no es el
criterio de salida de esta fase: el criterio es que él lo lea.

---

## Criterio de terminada

1. `pnpm run typecheck`, `pnpm run lint` y `pnpm test` en verde, y **los tests corren sin red y sin
   credenciales** (RF-H02). Comprobable: pasan con la variable de la credencial sin definir
2. Los tests del esquema cubren los cuatro casos de `ops.md` (válido, campos que faltan, cardinalidad
   inválida, tipos desconocidos) más los añadidos en T2
3. `pnpm run check:sin-datos-personales` en verde sobre el `src/` nuevo (RF-A02)
4. Las tres ejecuciones de T10 producen salida que **valida contra su esquema derivado**, y entre la
   A y la B **no se ha editado ningún fichero de `src/`**. Esto es RF-A04 y se verifica con
   `git diff --stat src/` entre las dos ejecuciones
5. **El dueño ha leído las tres salidas y ha dicho si la calidad sirve.** Sin esto la fase no está
   terminada aunque todo lo demás esté verde
6. Entrada en `docs/bitacora.md` con el veredicto de calidad y lo que se desvió

**Puerta de salida.** Si el punto 5 dice que no: instrucciones por sección dentro de `sections.yaml`
(contingencia del ADR-005) y se vuelve a medir con las mismas tres ejecuciones. Si tampoco, se para y
se replantea. No se sigue a la fase 2 con esta pregunta sin responder.

**Después de la confirmación del dueño**, y solo entonces: `@fiel-al-plan` y `/verifier`. `verifier`
llamará a `@guardarrailes` porque esta fase toca el prompt y la validación de la salida.
