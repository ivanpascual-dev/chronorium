# Fase 2 · Recolección y memoria

> **Lo que esta fase entrega:** que el conjunto de elementos que llega al modelo deje de estar escrito
> a mano. Hoy son dos ficheros JSON de quince entradas cada uno; al terminar salen de fuentes reales,
> declaradas en la receta, deduplicadas, puntuadas, acotadas y sin repetir lo de ayer.
>
> **La pregunta que esta fase responde de paso**, y que la bitácora de la fase 1 dejó abierta: con
> texto real de las fuentes, ¿hay más profundidad que exprimir de la que daban los fixtures escritos
> a mano? El techo de detalle de la fase 1 era el techo de la fixture. Aquí se sabe.

**Estado de partida (comprobado en el repositorio, hoy).** `src/` tiene seis ficheros: `paths.ts`,
`recipe/{types,schema,load,validate}.ts` y `model/{prompt,client}.ts`. **Cero código** en `sources/`,
`rank/`, `state/`, `render/`, `deliver/` y `cli/`: no existen esas carpetas. 28 tests en verde, sin
red y sin credenciales. Node 24.16. Cuatro dependencias directas (`ai`, `@ai-sdk/google`, `yaml`,
`zod`), y **`zod` no lo usa todavía ningún fichero de `src/`**. `recipes/example/recipe.yaml` declara
tres campos (`language`, `topics`, `model`): ni fuentes, ni ventana, ni pesos. `Item` vive dentro de
`src/model/prompt.ts` y lo importan cuatro ficheros.

**Comprobado fuera del repositorio, hoy, contra la documentación de GitHub** (no de memoria, como
exige la constitución antes de fijar nada de un proveedor externo):

- El `sort` de la búsqueda de repositorios acepta `stars`, `forks`, `help-wanted-issues` y `updated`.
  **No existe ninguna ordenación por crecimiento ni por estrellas recientes.**
- Los cualificadores de fecha (`created:`, `pushed:`) sí admiten comparadores y rangos ISO 8601.
- Límite de la API de búsqueda: 30 peticiones por minuto autenticado, 10 sin autenticar.

Esos tres hechos son los que deciden la forma del lector `repo-search` (ver T13 y RF-B09).

---

## Requisitos que cubre

| Requisito  | Qué se cumple aquí                                                                      |
| ---------- | --------------------------------------------------------------------------------------- |
| **RF-B01** | el lector se elige por el `type` declarado, jamás inspeccionando la URL (causa de D-03) |
| **RF-B02** | los cinco tipos: `feed`, `json-api`, `repo-search`, `repo-releases`, `archive`          |
| **RF-B03** | una fuente que exige credencial ausente hace fallar la validación de la receta, sin red |
| **RF-B04** | `recipes/example/` recolecta sin más credencial que la del modelo                       |
| **RF-B05** | fuente caída: se registra, las demás continúan, resultado por fuente                    |
| **RF-B06** | tope de aportación de una sola fuente, en porcentaje configurable                       |
| **RF-B07** | sin fecha válida ⇒ fecha desconocida y **cero** puntuación de recencia                  |
| **RF-B08** | identificador de cliente propio, sin suplantar navegador ni llevar datos personales     |
| **RF-B09** | **requisito nuevo**, ver T0: la consulta de repositorios se acota a la ventana          |
| **RF-C01** | memoria persistente de lo ya mostrado, y exclusión en las siguientes ejecuciones        |
| **RF-C02** | ventana de retención configurable, con poda en cada ejecución                           |
| **RF-C03** | deduplicación por dirección y por título normalizado                                    |
| **RF-C05** | el lector `archive` tolera informes con marca de versión anterior                       |
| **RF-D08** | puntuación por recencia y por temas, con los pesos de la receta, y tope global          |
| **RF-A05** | la validación de receta se extiende a fuentes y puntuación, nombrando el campo          |
| **RF-A06** | un fichero de estado ilegible es un error, nunca un valor por defecto silencioso        |
| **RF-A07** | el lector `archive` y la memoria resuelven su ruta explícitamente                       |
| **RF-H02** | toda la lógica de esta fase se prueba sin red y sin credenciales                        |

**Cubiertos en parte, y hay que decir hasta dónde.** `RF-G01`: aquí "cero elementos" pasa a ser un
resultado distinguible del éxito, pero **el código de salida `2` es fase 4**. `RF-G03`: el resultado
por fuente se produce aquí; escribirlo en `state/runs.ndjson` es fase 4. La amenaza A5 del modelo de
amenazas (agotamiento de cuota) queda cubierta por los topes, pero **el ataque 8 de la batería es
fase 3**: aquí se guarda el fichero, no se declara aprobada ninguna defensa.

Las seis tareas de `ops.md` mapean a estos requisitos con una excepción, que es la primera tarea del
plan.

---

## Orden de tareas

Tests antes de la implementación en T3, T5, T7, T9, T11 y T14. Es lógica pura y R13 lo exige.

### T0 · El requisito que faltaba · **antes de escribir código**

La tarea "corrección del radar de repositorios" de `ops.md` **no mapeaba a ningún requisito**. Es un
defecto medido del sistema anterior que nunca llegó a `01-especificacion.md`, y sin requisito no hay
nada que comprobar. Se decidió con el dueño, con la documentación de GitHub delante.

La tarea eran dos cosas, y solo una necesita requisito nuevo:

- **"excluir lo mostrado en los últimos 30 días"** ya es RF-C01 y RF-C02. Si el filtro de memoria
  corre sobre lo que devuelven todos los lectores, los repositorios lo heredan gratis. Escribirlo
  aparte para repositorios sería una segunda implementación de lo mismo (R10). **No se hace.**
- **"ordenar por crecimiento en la ventana, no por total acumulado"** no se le puede pedir a la API.
  Se aproxima acotando la consulta por fecha de creación, que es lo que sí ofrece.

Se añade a `docs/01-especificacion.md`, sección B:

> **RF-B09** (por evento) · **CUANDO** se lea una fuente de búsqueda de repositorios, el sistema
> **deberá** acotar la consulta a la ventana temporal declarada en la receta, y **nunca** ordenar por
> total acumulado sin acotarla.
>
> _Por qué:_ la API no ofrece ninguna ordenación por crecimiento. Pedir el total acumulado sin acotar
> devuelve los mismos repositorios grandes todos los días, y un radar que repite deja de ser un radar.
> _Criterio:_ la petición construida contiene el cualificador de fecha derivado de la ventana.
> Verificable con un doble de `fetch`, sin red.

**Coste asumido y escrito aquí para que no se redescubra:** un repositorio de hace tres años que
despega esta semana no aparece. El crecimiento medido de verdad (guardar las estrellas por ejecución
y ordenar por el incremento) exigiría un cuarto fichero de estado que `03-modelo-datos.md` no
contempla, una línea base que la primera ejecución no tiene, y una petición por repositorio contra un
límite de 10 por minuto sin autenticar. Se descarta hoy y **entra en `06-extensibilidad.md` con su
disparador**: que el radar acotado por creación se quede corto de forma visible durante varias
semanas.

### T1 · Los tipos, que son el contrato (ADR-007)

`src/sources/types.ts`. Nada de lógica. Es lo que las fases 3 y 4 van a consumir.

```ts
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
```

**`Item` se mueve aquí desde `src/model/prompt.ts`**, que pasa a importarlo. Es un contrato de la
fase 1 que esta fase toca, así que se dice en voz alta: `publishedAt` pasa a ser opcional, porque
RF-B07 exige que exista el caso "fecha desconocida" y en la fase 1 no existía. `prompt.ts` renderiza
esa ausencia de forma explícita (`publishedAt: desconocida`), nunca inventando una fecha. Es una
extensión, no una ruptura: la forma de los cuatro campos restantes no cambia y los cuatro
consumidores actuales siguen compilando.

`src/recipe/types.ts` gana `SourceSpec`, `WindowConfig`, `ScoringConfig` y `CapsConfig`. Los tipos
de la fase 1 no se tocan.

### T2 · Los ficheros guardados · antes que los tests que los usan

`tests/fixtures/feeds/`, y son parte de la especificación, no atrezo
(`docs/02-arquitectura.md`, final). **Los casos reales que rompieron el sistema anterior:**

| Fichero                   | Qué reproduce                                           |
| ------------------------- | ------------------------------------------------------- |
| `rss-valido.xml`          | RSS 2.0 bien formado, la línea base                     |
| `atom-valido.xml`         | Atom, con `published` y `updated` en vez de `pubDate`   |
| `sin-fecha.xml`           | elementos sin ninguna fecha                             |
| `fecha-invalida.xml`      | `pubDate` con texto que no es una fecha                 |
| `vacio.xml`               | canal bien formado con cero elementos                   |
| `roto.xml`                | XML mal cerrado                                         |
| `inyeccion-en-titulo.xml` | título que ordena ignorar las instrucciones previas     |
| `marcado-en-titulo.xml`   | título con etiqueta de script y de imagen con manejador |

Más `tests/fixtures/http/` con respuestas guardadas de `json-api`, `repo-search` y `repo-releases`, y
`tests/fixtures/archive/` con **dos informes: uno `schemaVersion: 2` y uno `schemaVersion: 1`**, que
es lo que hace comprobable RF-C05.

**La fuente caída no es un fichero**: es un doble de `fetch` que devuelve 500, otro que devuelve 429
y otro que nunca resuelve. Y la fuente desbordada se genera en el propio test: un fichero de 5.000
elementos en el repositorio es peor que el test que lo produce.

### T3 · Tests de fechas y ventana · **rojo primero**

`tests/rank/window.test.ts`. Es donde vive el defecto D-04, así que se prueba antes que nada:

- ISO completo, ISO solo fecha, y RFC 822 (el formato que usa RSS)
- cadena basura, cadena vacía, campo ausente ⇒ **fecha desconocida**
- **fecha en el futuro más allá de un margen ⇒ desconocida.** Mismo agujero que la fecha inválida
  por el otro lado: si no, el elemento peor formado vuelve a ganar
- ventana: dentro, fuera, y el borde exacto
- **un elemento de fecha desconocida no se descarta por ventana**, solo se queda sin recencia. Si se
  descartara, un canal que no fecha nada quedaría invisible entero, que es peor que puntuarlo bajo.
  Es una decisión, va con su test y con este motivo escrito

### T4 · `src/rank/window.ts`

Implementación hasta poner T3 en verde. `now` llega por parámetro, nunca de `Date.now()` dentro.

### T5 · Tests de puntuación · **rojo primero**

`tests/rank/score.test.ts`:

- recencia y coincidencia de temas combinadas con **los pesos de la receta**, no con constantes
- coincidencia de temas sobre título y resumen, normalizada (minúsculas, sin acentos)
- **fecha desconocida ⇒ componente de recencia exactamente 0, nunca la máxima.** Es el defecto
  medido: en el sistema anterior el artículo peor formado sacaba la puntuación máxima y reaparecía
  todos los días
- **peso ausente en la receta ⇒ error de validación que nombra el campo**, jamás un valor por
  defecto silencioso (prohibición explícita de la constitución)
- orden estable ante empate, para que los tests no sean intermitentes

### T6 · `src/rank/score.ts`

### T7 · Tests de deduplicación · **rojo primero**

`tests/rank/dedupe.test.ts`, RF-C03:

- misma dirección exacta
- misma dirección con fragmento y con parámetros de seguimiento conocidos ⇒ se normaliza y colapsa
- **mismo título normalizado desde dos fuentes distintas** ⇒ colapsa. Es lo que atrapa la misma
  noticia publicada en dos sitios, y el motivo de que `seen.json` guarde dos huellas
- títulos parecidos pero no iguales ⇒ **no** colapsan. No hay similitud difusa en la primera versión
- ante duplicado se conserva el de mayor puntuación, y con empate el primero. Determinista

### T8 · `src/rank/dedupe.ts`

### T9 · Tests de topes y del orden del pipeline · **rojo primero**

- **tope por fuente en porcentaje del total** (RF-B06). El caso medido: una fuente generalista aportó
  26 de 67 elementos, el 39%
- **tope global de elementos enviados al modelo** (RF-D08 y amenaza A5)
- una fuente que devuelve 5.000 elementos no engorda la llamada
- **el orden de operaciones es un contrato y se prueba como tal:**

```text
recoger → interpretar fechas → deduplicar → filtrar por ventana → filtrar por memoria
        → puntuar → tope por fuente → tope global
```

Cada posición tiene su motivo, y el motivo es lo que el test protege: deduplicar **antes** de la
memoria, o se marcaría dos veces lo mismo. Filtrar por memoria **antes** de puntuar, para no gastar
puntuación en lo que no puede salir. Tope por fuente **después** de puntuar, o te quedas con los
primeros de esa fuente en vez de con los mejores.

### T10 · `src/rank/caps.ts` y `src/rank/pipeline.ts`

### T11 · Tests de la memoria · **rojo primero**

`tests/state/seen.test.ts`. El formato está fijado en `docs/03-modelo-datos.md` y **no se amplía por
comodidad**:

- fichero ausente ⇒ memoria vacía, **no error**: es el primer arranque de un desconocido
- fichero presente pero ilegible o corrupto ⇒ **error** (RF-A06). La distinción entre este caso y el
  anterior es deliberada y se prueba
- poda por `windowDays` en cada ejecución (RF-C02)
- dos huellas por elemento, dirección y título normalizado
- **se guarda la huella, no el texto**: el fichero no crece y no expone qué se leyó
- `firstSeen` no se reescribe al volver a ver algo
- escritura atómica (temporal más renombrado): una ejecución interrumpida no deja el estado a medias.
  Uno de los once días perdidos del sistema anterior fue un proceso cortado a mitad

### T12 · `src/state/seen.ts`

Expone cargar, podar, filtrar y marcar. **Marcar es lo que sale en el informe, no lo que se recogió**
(RF-C01 dice "incluidos en informes anteriores"). Quien llama a marcar, cuando ya hay informe, es la
fase 4. Aquí se construye y se prueba entero contra un directorio temporal.

### T13 · El registro y los cinco lectores

`@dependency-audit` sobre **`fast-xml-parser` antes de instalarla**, como en la fase 1 con
`@ai-sdk/google`. Se instala con pnpm y **sin fijar major** (política de versiones). Motivo de que
gane su sitio: Node 24.16 no trae ningún parser de XML (comprobado sobre `builtinModules`), y
parsear a mano XML hostil y malformado es donde nacen los fallos que no se ven hasta las ocho de la
mañana.

`src/sources/registry.ts`, con sus tests:

- selección **por el `type` declarado** (RF-B01). Test explícito y nominal: **una fuente declarada
  `feed` cuya URL contiene `reddit.com` se lee con el lector `feed`**. Esa inspección de URL fue la
  causa raíz de que 2 de 8 fuentes de fábrica nacieran rotas y fallaran 41 ejecuciones seguidas
  (ADR-012, D-03)
- `type` desconocido ⇒ error de validación de receta que nombra el campo (RF-A05)
- `requiredSecrets` no presentes ⇒ **rechazo al validar**, sin red (RF-B03)
- identificador de cliente propio en toda petición, comprobado sobre el doble de `fetch` (RF-B08)
- tiempo de espera por fuente, con su test sobre un `fetch` que no resuelve

Los cinco lectores, cada uno contra ficheros guardados:

| Lector          | Nota                                                                          |
| --------------- | ----------------------------------------------------------------------------- |
| `feed`          | RSS 2.0 y Atom con `fast-xml-parser`                                          |
| `json-api`      | **el mapeo de campos se declara en la receta**, nunca se adivina de la forma  |
| `repo-search`   | acota por `created:` desde la ventana (RF-B09) y ordena por estrellas dentro  |
| `repo-releases` | lanzamientos por repositorio: lo publica quien hace la herramienta            |
| `archive`       | lee `dataRoot/archive/*.json`, tolera `schemaVersion` 1 y 2 (RF-C05, ADR-013) |

`repo-search` y `repo-releases` declaran `requiredSecrets: []` (RF-B04) y **usan el token del entorno
solo si está**, para subir de 10 a 30 peticiones por minuto. Su ausencia no rompe la receta.

### T14 · Orquestación de la recolección · tests primero

`src/sources/collect.ts`, RF-B05:

- fuente que devuelve 500, 429, que no resuelve, o cuyo XML está roto ⇒ **se registra, las demás
  continúan**, y el resultado por fuente lo refleja
- todas las fuentes caídas ⇒ cero elementos, resultado distinguible del éxito (RF-G01; el código de
  salida es fase 4)
- produce el `SourceResult[]` que la fase 4 necesita para `runs.ndjson` y para `meta`

### T15 · La receta, su validación y el CI

- `recipes/example/recipe.yaml` gana `sources`, `window`, `scoring` y `caps`, con **fuentes públicas
  reales y sin credenciales** (RF-B04). Sin datos personales, que es repositorio público (ADR-002)
- `src/recipe/validate.ts` se extiende con la **misma forma de error** que fijó la fase 1
  (`campo` + `motivo`) y sigue devolviendo todos los problemas, no abortando en el primero
- la receta biotech de `tests/fixtures/` gana fuentes **de forma distinta** a las de la de ejemplo,
  por el mismo motivo por el que sus secciones son distintas: si se parecen, no prueban nada
- `scripts/check-receta-ejemplo.ts` pasa a ejercitar **la recolección además de la síntesis**, con el
  `fetch` servido desde los ficheros guardados. Sigue sin nombrar ninguna sección (R12) y sigue sin
  red ni credenciales, que es lo que permite que viva en CI

### T16 · La prueba con red real · `pnpm run probe:fase2`

`scripts/probe-fase2.ts`, que **consume** `collect.ts`, el pipeline de `rank/` y `client.ts` sin
reimplementar nada (R10, y es la trampa #4 de la fase 1 repetida).

1. Recolección real de las fuentes de `recipes/example/`. **No necesita credenciales**, así que esta
   mitad se ejecuta siempre. Imprime el resultado por fuente: cuántas fuentes públicas responden de
   verdad es un dato que ningún fichero guardado puede dar
2. Si `GOOGLE_GENERATIVE_AI_API_KEY` está presente, sigue hasta el informe. Si no está, **no se
   inventa ni se simula**: se deja listo y se le dice al dueño el comando exacto

### T17 · El juicio del dueño, y la bitácora

Leer la salida y decir dos cosas: si la recolección sirve (cuántas fuentes responden, si lo que
llega es relevante, si la memoria hace su trabajo en una segunda pasada) y si el contenido gana
profundidad respecto a los fixtures escritos a mano de la fase 1. La segunda es la nota que la
bitácora dejó abierta.

---

## Contratos que fija esta fase

Seis. Que una fase posterior tenga que romper uno sería la señal de que este corte está mal.

1. **`Item`**, movido a `src/sources/types.ts` y con la fecha opcional. Lo consumen el prompt (fase
   1, ya escrito), el renderizado (fase 4) y la validación de enlaces (fase 3)
2. **`SourceReader` y `ReadContext`**, con `fetch` y `now` inyectados. Es lo que hace que el CI
   pueda ejercitar la receta de ejemplo entera sin red, y lo que un tercero implementa para añadir
   una fuente
3. **`SourceResult`**, que la fase 4 escribe en `runs.ndjson` y en `meta`
4. **El orden del pipeline de recolección a llamada.** La fase 3 mete la cadena de proveedores
   después, la fase 4 mete el renderizado después: ninguna toca este orden
5. **`state/seen.json` tal como lo fija `docs/03-modelo-datos.md`**, sin ampliarlo
6. **Los campos nuevos de `recipe.yaml`** (`sources`, `window`, `scoring`, `caps`) y la forma de su
   error de validación, que es la de la fase 1

**Señal de que el corte está bien:** `docs/03-modelo-datos.md` no cambia en toda la fase. El formato
del estado se escribió antes y esta fase lo implementa tal cual.

## Ficheros que se tocan

```text
docs/01-especificacion.md          RF-B09 nuevo (T0)
docs/06-extensibilidad.md          el crecimiento medido, con su disparador
package.json                       fast-xml-parser, probe:fase2
src/sources/types.ts               nuevo
src/sources/registry.ts            nuevo
src/sources/{feed,json-api,repo-search,repo-releases,archive}.ts   nuevos
src/sources/collect.ts             nuevo
src/rank/{window,score,dedupe,caps,pipeline}.ts                    nuevos
src/state/seen.ts                  nuevo
src/recipe/types.ts                SourceSpec, WindowConfig, ScoringConfig, CapsConfig
src/recipe/validate.ts             fuentes, ventana, pesos y topes
src/model/prompt.ts                importa Item; renderiza la fecha desconocida
scripts/check-receta-ejemplo.ts    ejercita también la recolección, con fetch guardado
scripts/probe-fase2.ts             nuevo
recipes/example/recipe.yaml        sources, window, scoring, caps
tests/fixtures/{feeds,http,archive}/   nuevos
tests/{rank,state,sources}/*.test.ts   nuevos
docs/bitacora.md                   entrada al cerrar
docs/ops.md                        casillas de la fase 2
```

---

## Las doce trampas de esta fase

Cada una es un defecto medido del sistema anterior o una regla de la constitución. Si aparece en el
código construido, la fase está mal hecha aunque los tests estén verdes.

| #   | La trampa                                                                | Por qué es grave                                                                  |
| --- | ------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| 1   | Elegir el lector mirando la URL                                          | D-03 y ADR-012. Dejó 2 de 8 fuentes rotas durante 41 ejecuciones seguidas         |
| 2   | Dar la hora actual a un elemento sin fecha                               | D-04 y RF-B07. Hacía que el peor formado ganara y reapareciera todos los días     |
| 3   | Rellenar un peso, una ventana o un tope ausente con un valor por defecto | Prohibición explícita. Ausente ⇒ error que nombra el campo                        |
| 4   | Aplicar el tope por fuente antes de puntuar                              | Te quedas con los primeros de la fuente, no con los mejores                       |
| 5   | Marcar como visto todo lo recogido en vez de lo que salió en el informe  | RF-C01. Entierra para siempre lo que el agente no eligió                          |
| 6   | Guardar el título en claro en `seen.json`                                | `03-modelo-datos.md`: se guarda la huella. El fichero no debe exponer qué se leyó |
| 7   | Ampliar el formato de `seen.json` sobre la marcha                        | Está fijado. Un formato que cada fase interpreta a su manera es una migración     |
| 8   | Suplantar un navegador en el identificador de cliente                    | RF-B08                                                                            |
| 9   | Un test que necesite red o credenciales                                  | R13 y RF-H02. La recolección real vive en el probe, nunca en `pnpm test`          |
| 10  | Que `probe-fase2.ts` haga su propia recolección o su propia llamada      | R10. Es la trampa #4 de la fase 1, repetida                                       |
| 11  | Resolver `archive/` o `state/` desde el directorio de trabajo            | RF-A07, defecto D-12                                                              |
| 12  | La raya larga, o `npm install`                                           | Prohibiciones de la constitución                                                  |

---

## Lo que NO entra, aunque esté cerca

- **La validación de enlaces contra la entrada.** La fase 1 dejó producida la lista de campos `url`
  y esta fase deja producido el conjunto de entrada. Juntarlos es fase 3, y es la línea más fácil de
  cruzar sin darse cuenta
- **Cadena de proveedores, reintento, punto único de fallo, marcadores de posición.** Fase 3
- **La batería de ataques.** Fase 3. Aquí se guardan los ficheros de los ataques 1 a 4 y el caso del
  8, y no se declara aprobada ninguna defensa
- **Renderizadores, escapado, entrega.** Fase 4
- **Escritura del archivo y de `runs.ndjson`.** Fase 4. Esta fase **lee** el archivo (lector
  `archive`) y escribe **solo** `seen.json`
- **Códigos de salida diferenciados.** Fase 4
- **RF-C04** (no sobrescribir un informe) y **RF-C06** (concurrencia). Son del archivo y del workflow
- **Los comandos del CLI.** La prueba es un script, no un comando
- **Similitud difusa de títulos.** Dirección y título normalizado, y nada más
- **Crecimiento medido de verdad en el radar.** Queda en `06-extensibilidad.md` con su disparador
- **Lector de Reddit.** ADR-012

---

## Dónde para quien construye

De **T0 a T15** se construye entero y sin red. Ahí se para:

- la mitad de recolección de **T16 se ejecuta siempre**: no necesita credenciales, solo internet
- la mitad de síntesis solo si `GOOGLE_GENERATIVE_AI_API_KEY` está presente. Si no está, se deja
  listo y se dice el comando exacto, sin simular nada

T17 no lo firma nadie más que el dueño.

---

## Criterio de terminada

1. `pnpm run typecheck`, `pnpm run lint` y `pnpm test` en verde, y los tests pasan **con la variable
   de la credencial sin definir y sin red**
2. Los cinco tipos existen y se eligen por el tipo declarado, con el test nominal de la URL de
   reddit declarada como `feed`
3. Una fuente caída no tumba la ejecución, y el resultado por fuente lo dice. Con todas caídas, el
   resultado es distinguible del éxito
4. Un elemento sin fecha válida no obtiene puntuación de recencia, con su test
5. `seen.json` se poda por ventana, y **un elemento que salió ayer no vuelve hoy**: se prueba con dos
   pasadas sobre un directorio temporal
6. Los topes por fuente y global se aplican después de puntuar, con sus tests
7. `pnpm run check:receta-ejemplo` en verde, ahora ejercitando **también la recolección** con
   ficheros guardados y sin red
8. `pnpm run check:sin-datos-personales` en verde sobre el `src/` nuevo (RF-A02)
9. RF-B09 está escrito en `docs/01-especificacion.md` y el lector lo cumple con un test que
   inspecciona la petición construida
10. `pnpm run probe:fase2` recolecta de verdad de las fuentes de `recipes/example/`, y **el dueño ha
    leído la salida y ha dicho si sirve**, incluida la pregunta de profundidad que dejó abierta la
    bitácora de la fase 1
11. Entrada en `docs/bitacora.md` con lo que se desvió y el veredicto

**Después de la confirmación del dueño**, y solo entonces: `@fiel-al-plan` y `/verifier`. `verifier`
llamará a `@guardarrailes`, porque esta fase cambia lo que entra en el prompt: por primera vez son
elementos de terceros de verdad, no un fichero escrito a mano.
