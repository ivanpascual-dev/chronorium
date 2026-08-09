# Fase 3 · Modelo, cadena de proveedores y seguridad

> **Lo que esta fase entrega:** que la llamada al modelo deje de ser un solo intento contra un solo
> proveedor, y que las tres reglas de seguridad que hoy son frases del prompt pasen a ser código.
> Al terminar, un 503 del proveedor principal no es un día sin informe, un 401 no cuesta 77 segundos
> de reintentos inútiles, un enlace que el modelo se invente no llega al lector, y un elemento de
> tercero no puede escribirse fuera del bloque no confiable del prompt.
>
> **La deuda concreta que cierra:** la nota abierta de la bitácora de la fase 1 (los ataques 1, 2 y 3
> sin garantía de código) y la de la fase 2 (RF-E03 sin existir, con un informe ya juzgado por el
> dueño cuyos enlaces no estaban garantizados).

---

## Estado de partida, comprobado en el repositorio hoy

- `src/` tiene 20 ficheros. `model/` solo tiene `client.ts` y `prompt.ts`: **no existen `chain.ts`
  ni `retry.ts`**, que `docs/02-arquitectura.md` ya nombra.
- `client.ts` llama a `generateText` con `Output.object` (ADR-017), **sin tocar `maxRetries`** y con
  `googleModel()` cableado a un único proveedor, que además es el único punto que hoy lee una
  credencial.
- `prompt.ts` interpola `title`, `url`, `source` y `summary` **en crudo** dentro del bloque
  `<elementos-no-confiables>`. Un elemento cuyo título contenga la etiqueta de cierre escribe fuera
  del bloque. Es un agujero real, no teórico, y es de esta fase.
- `recipe/schema.ts` ya produce `derived.urlFields` (la lista de campos de tipo `url`) y nadie la
  consume todavía: se dejó fabricada en la fase 1 **como contrato hacia esta fase**.
- `recipe/validate.ts` valida `model.provider` y `model.id` como texto no vacío, y nada más sobre el
  modelo. Inyecta `hasSecret`, que dice si existe pero nunca lee el valor.
- `rank/dedupe.ts` exporta `normalizeUrl`, que es la normalización que la validación de enlaces tiene
  que reutilizar en vez de escribir otra (R10).
- 133 tests en verde, sin red y sin credenciales. Una sola dependencia de proveedor,
  `@ai-sdk/google`. `zod` sigue instalada y **sin usar por ningún fichero de `src/`**: no es tarea de
  esta fase, pero queda anotado porque la constitución prohíbe dependencias que no ganan su sitio.

## Comprobado hoy fuera del repositorio, contra la documentación vigente

Lo que fija la forma de tres tareas, verificado hoy y no de memoria, como exige la constitución:

- **`generateText` trae `maxRetries: 2` por defecto** y envuelve la llamada en un reintento con
  espera creciente que respeta la cabecera `retry-after`. Construir la política de ADR-009 encima sin
  apagarlo deja **dos capas de reintento con políticas distintas**, y la de dentro reintentaría el
  401 que la de fuera se niega a reintentar.
- **`APICallError` expone `statusCode`, `responseHeaders`, `responseBody` e `isRetryable`**, y su
  `isRetryable` por defecto es `408 | 409 | 429 | >= 500`. Es la clasificación que nuestro código
  necesita, disponible en el propio error, sin adivinar por el texto del mensaje.
- **`@ai-sdk/openai-compatible` existe, versión 3.0.27**, con `zod ^3.25.76 || ^4.1.8` como peer
  (el proyecto tiene 4.4.3, compatible).

---

## Decisiones tomadas con el dueño antes de escribir el plan

Las tres cambiaban el trabajo, así que se preguntaron antes y no a mitad.

1. **Segundo proveedor: `@ai-sdk/openai-compatible` genérico.** El endpoint y el **nombre** de la
   variable de credencial se declaran en la receta; el valor se lee solo del entorno (R3). Con una
   dependencia se cubren DeepSeek, Groq, OpenRouter o un modelo local. El argumento es el de ADR-011
   con Telegram: una cadena con un solo eslabón implementable no demuestra nada, y esta cadena existe
   precisamente porque la del sistema anterior aparentaba cuatro y tenía uno.
2. **La cadena se declara como `model.fallbacks`**, lista opcional. `model` sigue siendo el
   principal. Es extensión, no ruptura: las recetas de las fases 1 y 2 siguen siendo válidas, y
   "principal contra respaldo", que es lo que RF-D07 necesita nombrar, queda explícito en la receta.
3. **Ataque 3 (fuga del prompt): estructura más delimitador blindado, sin detector en producción.**
   La garantía de código son dos: la salida no admite texto libre (ya existe desde la fase 1) y
   ningún elemento puede cerrar el delimitador (se construye aquí). No se añade un comparador de
   fragmentos porque el prompt filtrado son la receta y la persona **del propio usuario**, y el
   informe solo va a ese usuario: el daño no es grave, y un falso positivo sí lo sería, porque
   tumbaría el informe del día. Queda escrito aquí para que no se redescubra la pregunta.

---

## Requisitos que cubre

| Requisito  | Qué se cumple aquí                                                                       |
| ---------- | ---------------------------------------------------------------------------------------- |
| **RF-D02** | error de cliente que no sea 429 ⇒ se abandona ese proveedor de inmediato, sin reintentar |
| **RF-D03** | se reintenta solo ante `5xx`, `429` y fallo de red o tiempo de espera                    |
| **RF-D04** | al validar se cuentan los proveedores vivos y **con uno se avisa**, con dos no           |
| **RF-D05** | una credencial que sea un marcador de posición documentado se rechaza al validar         |
| **RF-D06** | se agota la cadena antes de rendirse, y se anota qué se intentó y por qué se descartó    |
| **RF-E01** | el contenido de fuente va delimitado, y **ningún elemento puede salirse del bloque**     |
| **RF-E02** | la salida sigue restringida a la estructura declarada, sin texto libre                   |
| **RF-E03** | **todo enlace de la salida ausente de la entrada se descarta**, y se cuenta              |
| **RF-E07** | la batería de ataques existe como comando repetible, sin red, y corre en CI              |
| **RF-A05** | la validación de receta se extiende a la cadena de proveedores, nombrando el campo       |
| **RF-F06** | una sola implementación de "producir un informe validado", consumida por todos           |
| **RF-H02** | toda la lógica de esta fase se prueba sin red y sin credenciales                         |
| **RF-H03** | el proveedor sigue tras una interfaz doblable, ahora también la cadena entera            |

**Cubiertos en parte, y hay que decir hasta dónde:**

- **RF-D07.** Aquí se produce el dato (`providerWasFallback` en el resultado de síntesis). Que se vea
  **dentro del informe entregado** es renderizado, es decir, fase 4.
- **RF-E04** (escapado). No entra: no hay ninguna salida con marcado todavía. Por eso el caso 4 de la
  batería se completa en fase 4, ver más abajo.
- **RF-G06** (códigos de salida). Esta fase define las **clases de fallo**; mapearlas a `1`, `2`, `3`
  y `4` es fase 4.
- **RF-G03/RF-D06** en su parte de registro: aquí se produce `providersTried`; escribirlo en
  `state/runs.ndjson` es fase 4.

Las siete tareas de `ops.md` mapean a estos requisitos sin excepción. La sexta ("delimitación de la
entrada no confiable en el prompt") está **construida desde la fase 1**, así que aquí no se rehace:
se blinda, que es lo que le falta, y se le pone el test que la convierte en garantía.

---

## Orden de tareas

Tests antes de la implementación en T2, T4, T6, T8 y T10. Es lógica pura y R13 lo exige.

### T0 · Verificar y auditar antes de instalar nada

Mismo mecanismo que abrió las fases 1 y 2, y que en las dos cambió una decisión ya escrita:

- `@dependency-audit` sobre **`@ai-sdk/openai-compatible` antes de instalarla**. Se instala con pnpm
  y **sin fijar major** (política de versiones). Motivo de que gane su sitio: sin ella la cadena de
  proveedores no tiene un segundo eslabón implementable, y esa es la funcionalidad que habría
  salvado 6 de los 11 días perdidos.
- Verificar contra la documentación de ese día que la **salida estructurada** (`Output.object` sobre
  un esquema dinámico) funciona en ese proveedor. Es el riesgo real de la opción elegida: si no
  aguanta, se para y se cambia a un proveedor concreto, dejándolo escrito, no se improvisa.
- Fijar el identificador de modelo del segundo proveedor **contra su documentación de ese día**, no
  de memoria. Un identificador retirado convierte el primer arranque de un desconocido en un error
  críptico.

Si algo de esto no se sostiene, se para y se replanifica. No se construye sobre un supuesto.

### T1 · Los tipos, que son el contrato (ADR-007)

`src/recipe/types.ts` y `src/model/types.ts`. Nada de lógica: es lo que la fase 4 va a consumir.

```ts
/** Un eslabón de la cadena, declarado en la receta. `apiKeyEnv` es el NOMBRE, nunca el valor (R3). */
export interface ProviderSpec {
  readonly provider: string; // 'google' | 'openai-compatible' | el que registre un tercero
  readonly id: string;
  readonly apiKeyEnv?: string; // ausente ⇒ la variable por defecto del proveedor
  readonly baseUrl?: string; // solo 'openai-compatible'
}

/** `model` sigue siendo el principal; `fallbacks` es la cadena, en orden. */
export interface ModelConfig extends ProviderSpec {
  readonly fallbacks?: readonly ProviderSpec[];
}

export type FailureClass = "retryable" | "provider-fatal";

/** Por qué un proveedor no produjo el informe. Es lo que fase 4 escribe en `runs.ndjson`. */
export interface ProviderAttempt {
  readonly provider: string;
  readonly id: string;
  readonly outcome: "ok" | "skipped" | "failed";
  readonly reason?: string; // nunca contiene el valor de una credencial (A4)
  readonly attempts: number;
}

export interface SynthesisResult {
  readonly report: unknown; // validado contra el esquema derivado y con los enlaces ya saneados
  readonly provider: string;
  readonly providerWasFallback: boolean; // RF-D07, lo renderiza fase 4
  readonly providersTried: readonly ProviderAttempt[]; // RF-D06
  readonly linksDropped: number; // RF-E03, va a `meta` (03-modelo-datos.md)
}

/** Diagnóstico de la validación, sin red. Lo consumen `validate` y `doctor` (fase 4). */
export interface ChainDiagnosis {
  readonly usable: readonly ProviderSpec[];
  readonly discarded: readonly {
    readonly spec: ProviderSpec;
    readonly reason: string;
  }[];
  readonly warnings: readonly string[]; // el aviso de punto único de fallo vive aquí
}
```

**`ModelConfig` se extiende, no se rompe:** los dos campos que fijó la fase 1 (`provider`, `id`)
siguen igual y las dos recetas actuales siguen validando sin tocarlas.

### T2 · Tests de clasificación y reintento · **rojo primero**

`tests/model/retry.test.ts`. Sin red, con errores construidos a mano:

- `500`, `502`, `503` ⇒ recuperable, se reintenta
- `429` ⇒ recuperable, **aunque sea un error de cliente**. Es la única excepción de RF-D02
- `401`, `403`, `404`, `400` ⇒ **fatal para ese proveedor, cero reintentos.** El caso medido: 77
  segundos diarios reintentando contra un 401 permanente
- fallo de red y tiempo de espera agotado ⇒ recuperable
- error sin `statusCode` que no sea de red ⇒ fatal. Ante la duda no se reintenta: reintentar lo
  desconocido es lo que hacía el sistema anterior
- la espera crece entre intentos y **está acotada**, con el reloj inyectado para que el test no
  duerma de verdad
- se agotan los intentos ⇒ el error que sale es el último, con la cuenta de intentos

### T3 · `src/model/retry.ts`

Implementación hasta poner T2 en verde. `sleep` y `now` inyectados, nunca `setTimeout` directo
dentro de la lógica.

### T4 · Tests de la cadena · **rojo primero**

`tests/model/chain.test.ts`, todo con `secret` inyectado, sin tocar `process.env`:

- proveedor sin credencial en el entorno ⇒ **fuera de la cadena al validar**, no tras cinco intentos
- credencial que es un marcador de posición documentado ⇒ **rechazada al validar** (RF-D05)
- credencial vacía o solo espacios ⇒ rechazada
- **con un proveedor vivo se emite el aviso de punto único de fallo; con dos no se emite** (RF-D04,
  es el criterio literal de la especificación)
- **cero proveedores vivos ⇒ error de configuración**, distinguible del fallo de modelo
- el orden de la cadena es el declarado: principal y luego `fallbacks` en orden
- `discarded` nombra el motivo de cada descarte, y **ningún mensaje contiene el valor de la
  credencial**, ni entero ni parcial (A4). Test explícito, porque el sistema anterior enmascaraba
  mostrando ocho caracteres, que es filtrar ocho caracteres

El conjunto de marcadores de posición se declara en un solo sitio y **se documenta** en
`docs/05-seguridad-legal.md`, para que el `check:docs` de la fase 6 pueda comprobar que el texto que
el README le dice al desconocido que escriba es exactamente el que el código rechaza. La regla de
detección es **coincidencia exacta contra ese conjunto** (sin distinguir mayúsculas, sin espacios
alrededor) más vacío o solo espacios. Nada de heurísticas de longitud o de prefijo: un falso positivo
aquí es un día sin informe.

### T5 · `src/model/providers.ts` y `src/model/chain.ts`

- `providers.ts`: registro de nombre de proveedor a `{ defaultApiKeyEnv, create(spec) }`. Mismo
  patrón que `sources/registry.ts`: **se elige por el nombre declarado en la receta**, jamás
  inspeccionando la URL o el identificador del modelo (D-03 y ADR-012, la regla es general). Dos
  entradas de fábrica: `google` y `openai-compatible`.
- `chain.ts`: `diagnoseChain(model, { secret })` para T4, y el recorrido de la cadena para T10.
  `client.ts` deja de exportar `googleModel`: su trabajo pasa al registro, para que no queden dos
  sitios que construyan un modelo (R10).

### T6 · Tests de validación de enlaces · **rojo primero**

`tests/model/links.test.ts`. Es el caso didáctico del proyecto (ADR-010) y el que más tests merece:

- URL inventada que no está en la entrada ⇒ **el campo llega vacío y `linksDropped` vale 1**
- URL de aspecto legítimo pero ajena (el ataque 6) ⇒ se descarta igual
- URL presente en la entrada con parámetros de seguimiento añadidos o fragmento ⇒ **se acepta y se
  sustituye por la URL exacta del elemento de entrada.** Comparar normalizado y devolver el
  canónico, no el texto del modelo
- valor que no parsea como URL absoluta `http`/`https` ⇒ se descarta, sin pasar por la normalización
  tolerante de `normalizeUrl`
- campos `url` en una sección de cardinalidad `one` y en una de cardinalidad `list`, y **más de un
  campo `url` en la misma sección**
- una sección sin ningún campo `url` no se toca
- **el recorrido usa `derived.urlFields`, nunca una clave de sección literal** (R12). Test con una
  receta cuyas secciones se llamen de cualquier otra forma
- entrada vacía ⇒ todos los enlaces se descartan, y no explota

Reutiliza `normalizeUrl` de `rank/dedupe.ts`. Si hiciera falta otra normalización, se cambia la
existente y se comparte, no se escribe una segunda (R10).

### T7 · `src/model/links.ts`

`validateLinks(report, derived, items) => { report, linksDropped }`. Puro, sin red, sin estado.

### T8 · Tests del prompt blindado · **rojo primero**

`tests/model/prompt.test.ts` gana los casos que hoy no existen:

- **un elemento cuyo título contiene `</elementos-no-confiables>` no cierra el bloque.** Se comprueba
  sobre el prompt compuesto: el número de aperturas y de cierres del delimitador es exactamente uno
  de cada, y el texto inyectado sigue dentro
- lo mismo en `summary`, en `url` y en `source`, porque los cuatro campos vienen de terceros
- la etiqueta de apertura, con y sin atributos, también se neutraliza
- el marcado del título (`marcado-en-titulo.xml`) llega como texto, nunca interpretado
- el orden de los cinco bloques del prompt no cambia (contrato de `src/model/CLAUDE.md`)

**Se descartó el delimitador con valor aleatorio por ejecución.** Neutralizar la etiqueta cubre el
mismo agujero, es determinista en los tests y no obliga a inyectar un generador más. Si algún día no
bastara, el cambio es local a `prompt.ts`.

### T9 · `src/model/prompt.ts` blindado

Una función de neutralización aplicada a los cuatro campos de cada elemento, en el único punto que
los renderiza. Nada de "y por favor no hagas X" en el prompt: el prompt no crece en esta tarea.

### T10 · Tests de la síntesis completa · **rojo primero**

`tests/model/synthesize.test.ts`, con `MockLanguageModelV4` y proveedores dobles:

- el principal responde ⇒ `providerWasFallback: false` y un solo intento
- el principal devuelve `503` dos veces y luego responde ⇒ se reintenta **en el mismo proveedor** y
  no se salta al siguiente
- el principal devuelve `401` ⇒ **se pasa al siguiente sin reintentar**, y `providersTried` lo dice
- el respaldo produce el informe ⇒ `providerWasFallback: true` (RF-D07)
- **todos los proveedores fallan ⇒ fallo de clase "ningún proveedor pudo generar el informe"**, que
  fase 4 mapeará al código de salida `3`. Nunca un informe a medias
- la salida que no valida contra el esquema **no se rellena por defecto** y no se reintenta contra el
  mismo proveedor sin más: se cuenta como fallo de ese proveedor. Es la señal que dejó escrita la
  bitácora de la fase 1, donde dos intentos idénticos dieron el mismo desbordamiento de cardinalidad
- el informe devuelto **ya tiene los enlaces saneados**: no hay forma de obtener un informe de esta
  capa sin pasar por T7

### T11 · `src/model/synthesize.ts` y `client.ts`

- `synthesize()` es **la única capacidad de "producir un informe validado"** (R10, RF-F06): cadena,
  reintento, llamada, validación de esquema y validación de enlaces, en ese orden. La batería, la
  prueba con red y el `cli/run.ts` de la fase 4 la consumen; ninguno rehace el orden.
- `client.ts` pasa `maxRetries: 0`. **Una sola capa de reintento, la nuestra**, que es la que
  ADR-009 describe y la que los tests de T2 prueban. Va comentado en el código con el porqué, porque
  es un valor que alguien querrá "arreglar" dentro de seis meses.

### T12 · La receta, su validación y las dos recetas de prueba

- `src/recipe/validate.ts` valida `model.fallbacks`: cada eslabón con `provider` e `id`, proveedor
  registrado, `baseUrl` obligatorio para `openai-compatible`, y sin repetir dos veces el mismo
  proveedor con el mismo modelo. Misma forma de error que fijó la fase 1 (`campo` + `motivo`), sin
  abortar en el primero.
- `ValidateRecipeOptions` sustituye `hasSecret` por **`secret(name)`**, del que la presencia se
  deriva. La validación de marcadores de posición necesita el valor, y dos formas de preguntar por lo
  mismo es la clase de duplicidad que este proyecto persigue. Es una ruptura pequeña y deliberada de
  un contrato de la fase 2, con un solo consumidor (sus tests), y se declara aquí en voz alta.
- `recipes/example/recipe.yaml` **no declara `fallbacks`**: una receta de fábrica funciona con la
  credencial del modelo y nada más (RF-B04, RF-H04). Lo que sí gana es un comentario que enseña
  cómo declararlo, porque el desconocido tiene que saber que existe.
- La receta biotech de `tests/fixtures/` **sí declara una cadena de dos**, por el mismo motivo por el
  que sus secciones son distintas: si las dos recetas se parecen, no prueban nada.

### T13 · La batería de ataques, cableada como comando

`tests/security/bateria.test.ts` más `pnpm run bateria`, y un paso en `.github/workflows/ci.yml`.

**El comando no es una segunda implementación:** son tests de verdad, que `pnpm test` también corre,
y el comando es el runner filtrado sobre esa carpeta. Cada caso lleva en su nombre el número de la
tabla de `docs/05-seguridad-legal.md`, para que un fallo se lea contra el documento.

| #       | Estado en esta fase                                                                         |
| ------- | ------------------------------------------------------------------------------------------- |
| 1, 2, 3 | completos: el texto hostil viaja dentro del bloque delimitado y no puede salirse de él      |
| 4       | **parcial, y se dice**: llega como texto inerte. El escapado es fase 4, con el renderizador |
| 5, 6    | completos: campo vacío y `linksDropped` correcto                                            |
| 7       | completo salvo el número del código de salida, que es fase 4                                |
| 8       | completo: 5.000 elementos generados en el test, topes aplicados, el prompt no crece         |
| 9, 10   | completos: marcador de posición rechazado, aviso con un solo proveedor vivo                 |
| **11**  | **nuevo**: un elemento no puede cerrar el delimitador del prompt                            |

**Qué prueba de verdad la batería, dicho sin adornos.** Con un modelo simulado no se demuestra que un
modelo resista una inyección: se demuestra que **la defensa está puesta**. Los casos 1, 2 y 3 afirman
que el texto hostil está delimitado, marcado como no confiable y encerrado sin salida; los casos 5, 6
y 7 sí afirman comportamiento de verdad, porque ahí la garantía es del código y no del modelo. La
conducta del modelo real ante la inyección se mira en T14 y la juzga el dueño.

El caso 11 se añade a la tabla de `docs/05-seguridad-legal.md`. RF-E07 dice "como mínimo", así que
ampliar la batería no contradice el requisito.

### T14 · La prueba con red real · `pnpm run probe:fase3`

`scripts/probe-fase3.ts`, que **consume** `synthesize()` sin reimplementar nada (R10, es la trampa
repetida de las fases 1 y 2). Tres partes, cada una con su condición:

1. **Diagnóstico de la cadena, siempre**: qué proveedores hay declarados, cuáles están vivos, y si
   sale el aviso de punto único de fallo. No necesita ninguna credencial válida para ejecutarse.
2. **Informe real**, si hay al menos una credencial: recolección real de `recipes/example` más
   síntesis, imprimiendo `linksDropped` y el proveedor usado. Con dos credenciales, además se fuerza
   el fallo del principal (identificador de modelo inexistente) para **ver la caída al respaldo de
   verdad**, no solo contra un doble.
3. **Inyección contra el modelo real**, si hay credencial: se cuela `inyeccion-en-titulo.xml` entre
   los elementos y se guarda la salida para que el dueño la lea. Es lo único que dice algo sobre la
   conducta del modelo, y no lo decide un test.

Si no hay credencial, **no se simula nada**: se deja listo y se dice el comando exacto.

### T15 · El juicio del dueño, y la bitácora

Leer la salida de T14 y decir tres cosas: si la caída al respaldo funciona de verdad, si el informe
sigue teniendo la calidad que aprobó en la fase 2 ahora que los enlaces pasan por el filtro, y si la
inyección real deja algún rastro en el texto. Entrada en `docs/bitacora.md` con lo que se desvió.

---

## Contratos que fija esta fase

Seis. Que una fase posterior tenga que romper uno sería la señal de que este corte está mal.

1. **`ProviderSpec` y `model.fallbacks`** en la receta, con `apiKeyEnv` como nombre de variable y
   nunca como valor.
2. **`SynthesisResult`**, que la fase 4 vuelca en `meta` del archivo (`provider`,
   `providerWasFallback`, `linksDropped`) y en `runs.ndjson` (`providersTried`). Los cuatro campos ya
   están fijados por `docs/03-modelo-datos.md`: esta fase los produce, no los inventa.
3. **Las clases de fallo**, que la fase 4 mapea a los códigos de salida `1` y `3`.
4. **`validateLinks` como único punto que toca un enlace de la salida.** Ningún renderizador de la
   fase 4 vuelve a mirar una URL.
5. **`synthesize()` como única capacidad de producir un informe**, con su orden interno. El
   `cli/run.ts` de la fase 4 la llama, no la reordena.
6. **La batería como comando**, con la numeración de casos alineada con `docs/05-seguridad-legal.md`.

**Señal de que el corte está bien:** `docs/03-modelo-datos.md` no cambia en toda la fase, igual que
en la fase 2. Los campos de `meta` estaban escritos antes; aquí se rellenan.

## Ficheros que se tocan

```text
docs/02-arquitectura.md            model/ gana links.ts y synthesize.ts en el listado de estructura
docs/05-seguridad-legal.md         caso 11 de la batería, y el conjunto de marcadores de posición
package.json                       @ai-sdk/openai-compatible, bateria, probe:fase3
.github/workflows/ci.yml           paso de la batería de ataques
src/model/types.ts                 nuevo
src/model/providers.ts             nuevo
src/model/chain.ts                 nuevo
src/model/retry.ts                 nuevo
src/model/links.ts                 nuevo
src/model/synthesize.ts            nuevo
src/model/client.ts                maxRetries: 0; googleModel se va al registro
src/model/prompt.ts                neutralización del delimitador en los cuatro campos
src/model/CLAUDE.md                los ficheros nuevos y la decisión de la capa de reintento única
src/recipe/types.ts                ProviderSpec, ModelConfig.fallbacks
src/recipe/validate.ts             la cadena; hasSecret pasa a secret
recipes/example/recipe.yaml        comentario que enseña a declarar fallbacks (sin declararlos)
tests/fixtures/recipes/biotech/    cadena de dos proveedores
tests/model/{retry,chain,links,synthesize}.test.ts   nuevos
tests/model/prompt.test.ts         casos del delimitador
tests/recipe/validate.test.ts      cadena y marcadores de posición
tests/security/bateria.test.ts     nuevo
scripts/probe-fase3.ts             nuevo
docs/bitacora.md                   entrada al cerrar
docs/ops.md                        casillas de la fase 3
```

---

## Las doce trampas de esta fase

Cada una es un defecto medido del sistema anterior o una regla de la constitución. Si aparece en el
código construido, la fase está mal hecha aunque los tests estén verdes.

| #   | La trampa                                                             | Por qué es grave                                                                 |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| 1   | Dejar el reintento del SDK activo bajo el nuestro                     | Dos políticas distintas, y la de dentro reintenta el 401 que la de fuera rechaza |
| 2   | Reintentar un error de cliente que no sea 429                         | ADR-009. Costaba 77 segundos diarios contra un error permanente                  |
| 3   | Registrar el valor de una credencial, aunque sea enmascarado          | A4. Enmascarar mostrando ocho caracteres es filtrar ocho caracteres              |
| 4   | Validar enlaces comprobando solo el dominio, o pidiéndoselo al prompt | ADR-010. La regla número 6 de un prompt es una petición, no una garantía         |
| 5   | Rellenar un enlace descartado con otra URL de la entrada              | Prohibición explícita: nada de valores por defecto silenciosos. Se vacía         |
| 6   | Que la lista de proveedores viva en `src/` y no en la receta          | Es dominio. La regla que lo explica casi todo                                    |
| 7   | Una clave de sección literal en `links.ts` o en la batería            | R12. `links.ts` recorre `derived.urlFields`, nunca nombres                       |
| 8   | Que la batería sea un documento y no un comando que falla             | RF-E07. Un ritual que se salta cuando hay prisa no es una puerta                 |
| 9   | Un test que necesite red o credenciales                               | R13 y RF-H02. Lo real vive en el probe, nunca en `pnpm test`                     |
| 10  | Que el probe o la batería hagan su propia llamada al modelo           | R10. Trampa repetida de las fases 1 y 2, tercera vez que se escribe              |
| 11  | Que el aviso de punto único de fallo solo vaya al log                 | R9 y RF-D04. El estado tiene que poder viajar dentro del informe (fase 4)        |
| 12  | La raya larga, o `npm install`                                        | Prohibiciones de la constitución                                                 |

---

## Lo que NO entra, aunque esté cerca

- **El escapado de contenido (RF-E04) y el caso 4 completo de la batería.** No hay ninguna salida con
  marcado hasta que existan los renderizadores. Fase 4
- **Que el respaldo se vea dentro del informe entregado (RF-D07 en su mitad visible).** Aquí se
  produce el dato; renderizarlo es fase 4
- **Los códigos de salida `1`, `2`, `3` y `4`.** Aquí se definen las clases de fallo. Fase 4
- **`state/runs.ndjson`, `meta.health` y el estado agregado (RF-G02, RF-G05).** Fase 4
- **Los comandos del CLI** (`run`, `validate`, `doctor`). La prueba de esta fase es un script. Fase 4
- **Reintentar realimentando al modelo el motivo del rechazo de validación.** La bitácora de la fase 1
  lo dejó como señal, no como tarea. Se mide primero con datos reales de esta fase; si el
  desbordamiento de cardinalidad reaparece, entra con su ADR
- **Más de un modelo por informe** (barato para filtrar, bueno para escribir). Está en
  `06-extensibilidad.md` con su disparador
- **Medir coste o tokens por ejecución.** No hay problema de coste todavía
- **Caché de prompt.** Misma razón
- **Sacar `zod` del `package.json`.** Sigue sin usarse en `src/`; se anota, no se toca aquí

---

## Dónde para quien construye

De **T0 a T13** se construye entero, sin red y sin credenciales. Ahí se para:

- la parte 1 de T14 (diagnóstico de la cadena) **se ejecuta siempre**, no necesita credencial válida
- las partes 2 y 3 solo si hay credencial. La caída al respaldo de verdad necesita **dos**
- sin credencial no se simula nada: se deja listo y se dice el comando exacto

T15 no lo firma nadie más que el dueño.

---

## Criterio de terminada

1. `pnpm run typecheck`, `pnpm run lint` y `pnpm test` en verde, y los tests pasan **con todas las
   variables de credencial sin definir y sin red**
2. Un `401` no se reintenta nunca y un `503` sí, con sus tests, y **existe una sola capa de
   reintento** (`maxRetries: 0` en la llamada al SDK, comentado con el porqué)
3. Con un proveedor vivo el diagnóstico emite el aviso de punto único de fallo; con dos no lo emite
4. Una credencial que sea un marcador de posición documentado se rechaza al validar, y **ningún
   mensaje de error contiene ningún fragmento del valor**
5. Un enlace ausente de la entrada llega vacío al informe y `linksDropped` lo cuenta, con test para
   inventado, sustituido y con parámetros de seguimiento
6. Un elemento cuyo título contiene la etiqueta de cierre del delimitador **no escribe fuera del
   bloque no confiable**, con su test sobre el prompt compuesto
7. `synthesize()` es el único camino a un informe, y no existe ninguna forma de obtener uno sin pasar
   por la validación de esquema y la de enlaces
8. `pnpm run bateria` corre los once casos sin red, está en CI, y cada caso se lee contra la tabla de
   `docs/05-seguridad-legal.md`. El caso 4 declara explícitamente su mitad de fase 4
9. `pnpm run check:receta-ejemplo` y `pnpm run check:sin-datos-personales` siguen en verde
10. `pnpm run probe:fase3` ejecuta el diagnóstico de la cadena de verdad, y **el dueño ha leído la
    salida y ha dicho si sirve**, incluida la caída al respaldo y la inyección contra el modelo real
11. `docs/02-arquitectura.md` y `docs/05-seguridad-legal.md` reflejan lo construido (ficheros nuevos,
    caso 11, marcadores de posición). Una divergencia aquí es exactamente el defecto D-14
12. Entrada en `docs/bitacora.md` con lo que se desvió y el veredicto

**Después de la confirmación del dueño**, y solo entonces: `@fiel-al-plan` y `/verifier`. `verifier`
llamará a `@guardarrailes` de forma obligatoria: esta fase toca el prompt, la validación de la salida,
la validación de enlaces y la cadena de proveedores, que son sus cuatro disparadores a la vez.
