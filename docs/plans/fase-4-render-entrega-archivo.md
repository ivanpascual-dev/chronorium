# Fase 4 · Renderizado, entrega y archivo

> Plan escrito el 2026-08-09 con el repositorio delante. **No construye nada**: fija el orden, los
> contratos y el criterio de terminada. Lo ejecuta `/ejecutar-fase`.

Es la fase que convierte un objeto validado en algo que llega a una bandeja de entrada y queda
guardado. También es la primera que produce un **proceso**: hasta ahora todo eran funciones puras y
scripts de prueba, y sin proceso no hay códigos de salida que diferenciar.

Es la fase más grande del plan. El corte está hecho por verificabilidad: cada pieza (escapado,
renderizado, archivo, registro, entrega, orquestación) se prueba sola, sin que las demás existan.

---

## Estado de partida, comprobado en el repositorio hoy

- **198 tests en verde** (`pnpm test`, sin red ni credenciales). Fase 3 cerrada y mergeada en `main`
  (`0ca11c8`), con la corrección posterior de `@ai-sdk/openai` incluida (`bdd90dc`).
- **No existe nada de `src/render/`, `src/deliver/` ni `src/cli/`.** Ni un fichero. Lo que hay es
  `src/state/seen.ts` (memoria de lo ya mostrado), que esta fase consume pero no cambia.
- **`RecipeConfig` no tiene bloque `delivery`** (`src/recipe/types.ts:92`), y `validate.ts` no lo
  valida. Tampoco hay umbrales de salud declarables.
- **`condition` (`always` | `non-empty`) se valida pero no lo consume nadie**:
  `src/recipe/schema.ts:146` lo comprueba y `sectionSchema()` lo ignora. Esta fase es la que le da
  su único consumidor (RF-F05).
- **`resolveRecipeDir()` (`src/paths.ts:9`) resuelve siempre contra `projectRoot/recipes`.** Con eso,
  la instancia privada (cuyas recetas viven en **otro** repositorio, ADR-002) no puede ejecutar la
  herramienta. Es un bloqueo real para la fase 5 y se arregla aquí.
- **`loadRecipe()` no devuelve el nombre de la receta**, y el nombre del fichero de archivo lo lleva
  (`archive/YYYY-MM-DD--<recipe>.json`).
- **`src/sources/archive.ts` ya lee los dos formatos** (`schemaVersion` 1 y 2). El escritor que esta
  fase construye tiene que producir exactamente el formato 2 que ese lector espera, o la receta
  semanal no podrá destilar a la diaria.
- **`SynthesisResult`** (`src/model/types.ts:17`) ya trae todo lo que `meta` necesita salvo la salud:
  `provider`, `providerWasFallback`, `providersTried`, `linksDropped`.
- **`CollectResult.results`** (`src/sources/collect.ts:5`) ya trae el resultado por fuente que
  `runs.ndjson` tiene que escribir (RF-B05, RF-G03).

## Comprobado hoy fuera del repositorio

- **`nodemailer@9.0.5`**: cero dependencias de ejecución, licencia MIT-0, `engines.node >= 6`.
  Consultado al registro hoy, no de memoria.
- **`nodemailer` no declara tipos propios** (sin `types`, `typings` ni `exports`). Hacen falta
  `@types/nodemailer@8.0.1` como dependencia de desarrollo, que solo depende de `@types/node`, ya
  presente.
- Lo anterior es el punto de partida de la auditoría de T0, **no su conclusión**: cero dependencias
  no dice nada sobre avisos de seguridad abiertos.

---

## Decisiones tomadas con el dueño antes de escribir el plan

Las tres cambian el alcance y ninguna estaba fijada en un ADR.

### D1 · El correo se envía por SMTP, con `nodemailer`

Descartado el transporte por API HTTP (Resend y similares), que habría sido cero dependencias:
el dueño usa Gmail y quiere seguir usándolo, con contraseña de aplicación.

### D2 · No se importa el archivo del sistema anterior. Se empieza en limpio

Deroga la tarea de `ops.md` "Conversión e importación de los 45 informes del sistema anterior". El
dueño prefiere que todo lo que exista lo haya generado este proyecto.

Contradice el **ADR-013**, que decidió importarlos tal cual. Los ADR no se reescriben: entra como
**ADR-019, que supersede al ADR-013**, con las dos consecuencias que hay que asumir por escrito:

1. **La receta semanal nace sin historial.** Era el argumento concreto del ADR-013 ("con la
   importación funciona desde la primera semana en lugar de esperar siete días"). El primer resumen
   semanal saldrá pobre o vacío hasta que el archivo propio tenga varios días.
2. **`extractSchemaV1` de `src/sources/archive.ts` se queda sin ningún productor real.** No se
   retira: RF-C05 sigue vigente (el lector del archivo tolera formatos anteriores identificados por
   su marca de versión), ya está construido y probado, y el salto de `schemaVersion` 2 a 3 ocurrirá
   algún día. Lo que cambia es que deja de haber datos de la versión 1 en el mundo, y el ADR-019 lo
   dice para que nadie lo busque.

### D3 · El notificador de webhook entra, desactivado

`docs/02-arquitectura.md` promete tres notificadores y `ops.md` nombraba dos. Gana el documento de
arquitectura: son unas treinta líneas con el `fetch` que ya trae el entorno, cero dependencias y cero
secretos nuevos. Con tres notificadores de formas deliberadamente distintas (SMTP, API de bot con
credencial, POST crudo sin credencial) el contrato de entrega queda demostrado de verdad, que es el
mismo argumento por el que existe Telegram (ADR-011).

---

## Requisitos que cubre

| Requisito                 | Dónde se cumple en esta fase                                                       |
| ------------------------- | ---------------------------------------------------------------------------------- |
| **RF-F01**                | tres renderizadores desde un mismo `Report` (T4, T5)                               |
| **RF-F02**                | el markdown es autocontenido y pegable, y es lo que se archiva (T5)                |
| **RF-F03**                | `Notifier` + registro; añadir un canal no toca el orquestador (T8, T9)             |
| **RF-F04**                | un canal que falla no detiene los demás; entrega parcial ⇒ código 4 (T8, T10)      |
| **RF-F05**                | `condition: non-empty` sin elementos ⇒ la sección no entra en el informe (T6, T7)  |
| **RF-F06**                | una implementación por capacidad: `buildReport`, `renderAll`, `deliver`, `runOnce` |
| **RF-E04**                | escapado de todo contenido externo o generado antes de HTML y de markdown (T2, T3) |
| **RF-C01, RF-C02**        | `markSeen` y `pruneSeen` cableados en el orquestador, sobre lo **publicado** (T11) |
| **RF-C04**                | nunca se sobrescribe un informe archivado (T6, T7)                                 |
| **RF-C05**                | el escritor produce el formato exacto que `sources/archive.ts` ya lee (T6, T7)     |
| **RF-D07**                | el proveedor de respaldo se ve en el informe entregado, no solo en el registro     |
| **RF-G01**                | cero elementos ⇒ código 2, jamás cero (T10, T11)                                   |
| **RF-G02**                | tasa de fuentes fallidas de esta ejecución sobre el umbral ⇒ se señala (T7, T11)   |
| **RF-G03**                | `runs.ndjson` con marca de tiempo, fuentes, elementos, proveedor y resultado (T7)  |
| **RF-G04**                | `doctor` responde "cuántos de los últimos treinta" sin mirar nombres de fichero    |
| **RF-G05**                | el estado agregado viaja **dentro** del informe entregado (T5, T7)                 |
| **RF-G06**                | cinco códigos de salida distinguibles, observados como proceso (T10, T11)          |
| **RF-A05, RF-A06**        | `delivery` y `health` validados nombrando el campo, sin defaults silenciosos (T12) |
| **RF-A07**                | `dataRoot` y la raíz de recetas, explícitos y absolutos, nunca desde el cwd (T11)  |
| **RF-A04**                | **el criterio que decide el proyecto**: sección nueva ⇒ aparece también en el      |
|                           | correo y en el archivo sin tocar `src/` (T14, criterio de terminada)               |
| **RF-B03** (por analogía) | un canal activo cuyo secreto falta ⇒ la receta se rechaza al validar (T12)         |
| **RF-E07**                | los casos 4 y 7 de la batería se completan de punta a punta (T13)                  |
| **RF-H02**                | todo lo anterior probado sin red y sin credenciales                                |
| **RF-H05**                | `check:receta-ejemplo` se alarga hasta el archivo escrito y el correo renderizado  |

**Tareas de `ops.md` que este plan añade o quita, y por qué:**

- **Añade el CLI** (`run`, `run --dry-run`, `validate`, `doctor`). `ops.md` solo dice "códigos de
  salida diferenciados", y un código de salida exige un proceso. Los cuatro comandos son el contrato
  de `docs/02-arquitectura.md:181`, y la fase 5 (workflow) no tiene nada que invocar sin ellos.
- **Quita la importación de los 45 informes** (D2, ADR-019).
- **Añade el webhook** (D3).
- **Añade la resolución explícita de la raíz de recetas.** Sin ella la fase 5 no puede existir: las
  recetas reales viven en el repositorio privado.

---

## Orden de tareas

Regla de la fase: **cada bloque de tests se escribe en rojo antes de su implementación** (R13). Las
seis piezas son independientes; el orquestador (T11) es el único que las necesita todas.

### T0 · Verificar y auditar antes de instalar nada

Mismo mecanismo que abrió la fase 2 y la fase 3, y en las dos cambió una decisión del plan.

1. **`@dependency-audit` sobre `nodemailer` y `@types/nodemailer`.** Lo que decide no es el número
   de dependencias (ya comprobado: cero), es el historial de avisos y el estado del mantenimiento.
2. **Verificar contra la documentación del día** la forma de uso (`createTransport`, `sendMail`,
   `verify`) y los parámetros de Gmail (`smtp.gmail.com`, 465 con TLS implícito o 587 con STARTTLS,
   contraseña de aplicación, que exige verificación en dos pasos).
3. **Punto de parada declarado:** si la auditoría encuentra un patrón como el de `fast-xml-parser`
   en la fase 2 (CVEs concentrados en el mismo mecanismo, o subdependencias nuevas de un solo
   mantenedor), **se para y se vuelve al dueño con la alternativa**, no se improvisa. La alternativa
   ya identificada es el transporte por API HTTP, que fue la opción descartada en D1.
4. **Escribir ADR-019 y ADR-020 antes de escribir código.** Los dos cambian decisiones ya escritas
   (el 019 supersede al 013), y un ADR redactado después de construir es una justificación, no una
   decisión.

### T1 · Los tipos, que son el contrato (ADR-007)

Sin implementación: solo los tipos, con `typecheck` verde. Fija de una vez la forma de todo lo que
las tareas siguientes se pasan entre sí.

`src/render/types.ts`:

```ts
/** El dato canónico: docs/03-modelo-datos.md. Todo lo demás se deriva de aquí. */
export interface ReportSection {
  readonly key: string;
  readonly title: string;
  /** Cardinalidad `one` ⇒ exactamente un elemento. La forma es la misma para no bifurcar. */
  readonly items: readonly Record<string, string>[];
}

export interface ReportHealth {
  readonly windowDays: number;
  readonly runsOk: number;
  readonly runsFailed: number;
}

export interface ReportMeta {
  readonly provider: string;
  readonly providerWasFallback: boolean;
  readonly itemsCollected: number;
  readonly itemsAnalyzed: number;
  readonly sourcesOk: number;
  readonly sourcesFailed: number;
  readonly linksDropped: number;
  readonly health: ReportHealth;
  /** Condiciones degradadas de esta ejecución (RF-G02, RF-G05), en tokens, no en prosa. */
  readonly degraded: readonly DegradedFlag[];
}

export type DegradedFlag =
  | "fallback-provider"
  | "sources-below-threshold"
  | "runs-below-threshold";

export interface Report {
  readonly schemaVersion: 2;
  readonly recipe: string;
  readonly date: string; // YYYY-MM-DD
  readonly generatedAt: string; // ISO 8601
  readonly sections: readonly ReportSection[];
  readonly meta: ReportMeta;
}

export type RenderFormat = "json" | "markdown" | "email";

export interface Renderer {
  readonly format: RenderFormat;
  /** Recibe la declaración de secciones. No conoce ninguna clave concreta (R12). */
  render(report: Report, sections: readonly SectionSpec[]): string;
}

/** Lo que recibe un notificador: el mismo informe en las tres formas, ya renderizado una sola vez. */
export interface RenderedReport {
  readonly report: Report;
  readonly subject: string;
  readonly markdown: string;
  readonly html: string;
  readonly json: string;
}
```

`src/deliver/types.ts`:

```ts
export interface NotifierConfig {
  readonly id: string;
  readonly enabled: boolean;
  /** Campos propios del canal, misma bolsa abierta que `SourceSpec` y por el mismo motivo. */
  readonly [key: string]: unknown;
}

export interface DeliverContext {
  readonly secret: (name: string) => string | undefined;
  readonly fetch: FetchLike;
  readonly timeoutMs: number;
}

export interface Notifier {
  readonly id: string;
  readonly requiredSecrets: readonly string[];
  send(
    rendered: RenderedReport,
    cfg: NotifierConfig,
    ctx: DeliverContext,
  ): Promise<void>;
}

export interface DeliveryResult {
  readonly id: string;
  readonly ok: boolean;
  /** Nunca contiene el valor de una credencial, ni completo ni parcial (A4). */
  readonly error?: string;
  readonly durationMs: number;
}
```

`src/state/types.ts`:

```ts
export type RunResult =
  | "ok"
  | "skipped_existing"
  | "no_items"
  | "model_failed"
  | "delivery_failed"
  | "config_error";

export interface RunRecord {
  readonly ts: string;
  readonly recipe: string;
  readonly result: RunResult;
  readonly exitCode: number;
  readonly durationMs: number;
  readonly provider?: string;
  readonly fallback?: boolean;
  readonly itemsCollected?: number;
  readonly sources?: { readonly ok: number; readonly failed: number };
  readonly providersTried?: readonly string[];
  readonly delivery?: readonly { readonly id: string; readonly ok: boolean }[];
  readonly lastError?: string;
}
```

Y en `src/recipe/types.ts`, tres extensiones:

```ts
export interface DeliveryChannel {
  readonly id: string;
  readonly enabled: boolean;
  readonly [key: string]: unknown;
}

export interface HealthConfig {
  readonly windowDays: number;
  /** RF-G05: proporción de ejecuciones fallidas en la ventana a partir de la cual se marca. */
  readonly runFailureThreshold: number;
  /** RF-G02: proporción de fuentes fallidas de ESTA ejecución a partir de la cual se marca. */
  readonly sourceFailureThreshold: number;
}

// RecipeConfig gana:
//   readonly name: string;                      derivado del directorio, lo necesita el archivo
//   readonly delivery: readonly DeliveryChannel[];
//   readonly health: HealthConfig;
//   readonly subject?: string;                  plantilla opcional, con {recipe} y {date}
// FieldSpec gana:
//   readonly label?: string;                    etiqueta humana para el renderizado, ver T5
```

### T2 · Tests del escapado · **rojo primero**

`tests/render/escape.test.ts`. Es lógica pura y es una defensa de seguridad (A3), así que va
primero de todo.

- `escapeHtml` neutraliza `<`, `>`, `&`, `"` y `'`; un título con `<script>alert(1)</script>` sale
  visible como texto y **nunca como etiqueta**
- `<img src=x onerror=...>` sale escapado (es el caso 4 literal de la batería)
- `escapeMarkdown` neutraliza lo que rompe la estructura del documento o fabrica un enlace:
  `[`, `]`, `<`, `>`, `` ` ``, y `|` (que parte una tabla)
- Un texto sin nada peligroso **no cambia**: escapar no es reescribir prosa
- Escapar dos veces no duplica las secuencias (guarda contra el doble escapado de T5)

### T3 · `src/render/escape.ts`

Las dos funciones, y nada más. Es el único sitio del proyecto que escapa (R10).

### T4 · Tests de los renderizadores · **rojo primero**

`tests/render/report.test.ts`, `markdown.test.ts`, `email.test.ts`, `json.test.ts`. Se ejercitan con
**las dos recetas de forma distinta** que ya existen (`recipes/example` y la de biotech), que es para
lo que existen.

`buildReport`:

- Convierte la salida del modelo (objeto con claves de sección) en `sections`, **array y en el orden
  declarado** en `sections.yaml`
- Una sección `cardinality: one` produce un array de exactamente un elemento
- **RF-F05**: una sección `condition: non-empty` con cero elementos **no aparece** en el informe
- Una sección `condition: always` con cero elementos **sí aparece**: se declaró siempre, y que se vea
  vacía es la señal de que la receta está mal, no algo que ocultar
- `meta` se rellena desde `SynthesisResult` y las estadísticas de recolección, sin inventar ninguno
- `meta.degraded` contiene `fallback-provider` cuando el proveedor no fue el principal, y los otros
  dos cuando se cruzan los umbrales de `health`

Los tres renderizadores, contra las dos recetas:

- **Ninguno contiene ninguna clave de sección** (R12). Test explícito: se renderiza una receta cuyas
  claves de sección son `alfa`/`beta`/`gamma` y el resultado sigue teniendo tres bloques con sus
  títulos
- El markdown lleva el título de cada sección como encabezado, y los enlaces visibles en claro
  (RF-F02: se pega en otra herramienta y sigue teniendo sentido)
- El correo no referencia **ningún recurso externo**: sin `<img src="http...">`, sin hoja de estilo
  enlazada, sin fuente remota
- Todo valor que viene del modelo pasa por el escapado del formato correspondiente (RF-E04)
- El JSON renderizado vuelve a leerse con `JSON.parse` y es idéntico al `Report` de entrada
- **La línea de estado aparece en markdown y en correo** cuando `meta.degraded` no está vacío, y no
  aparece cuando lo está
- Un campo con `label` declarado se renderiza con su etiqueta; sin `label`, se renderiza como
  párrafo suelto, **nunca con el nombre técnico del campo**

### T5 · `src/render/report.ts`, `json.ts`, `markdown.ts`, `email.ts`

`buildReport()` es la única función que convierte la salida del modelo en `Report` (R10).

**Cómo renderiza un elemento sin conocer sus campos** (es la regla que hace posible R12):

1. El **primer campo declarado** de la sección es el rótulo del elemento (en negrita).
2. Los campos de tipo `url` no se imprimen como texto: **son el enlace del rótulo**. Si hay más de
   uno, los siguientes van como enlaces sueltos al final del elemento.
3. Los demás campos, en el orden declarado, como líneas. Con `label`, prefijadas por su etiqueta;
   sin `label`, sin prefijo.
4. Un campo vacío (el caso de un enlace descartado por `validateLinks`) **no se imprime**: el enlace
   inventado desaparece, no deja un hueco ni un `[texto]()` roto.

**La línea de estado no lleva prosa traducible.** El idioma del informe lo declara la receta
(`recipes/example` es español, la de biotech es inglés): una advertencia escrita en español dentro de
un informe en inglés sería un defecto, y meter las dos traducciones en `src/` sería meter dominio en
el mecanismo. La línea es metadato técnico, con la misma forma en cualquier idioma:

```text
> ⚠ chronorium · runs 19/30 · sources 12/17 · provider openai (fallback)
```

`subject` sale de `recipe.subject` si está declarado (con `{recipe}` y `{date}` sustituidos), y si no
de `` `${report.recipe} · ${report.date}` ``, que no es prosa.

### T6 · Tests del archivo, del registro y de la salud · **rojo primero**

`tests/state/archive.test.ts`, `tests/state/runs.test.ts`. Todo sobre un directorio temporal.

- Escribir un informe deja **los dos ficheros**, `.json` y `.md`, con el nombre
  `YYYY-MM-DD--<receta>.json` exacto que `docs/03-modelo-datos.md` fija
- **RF-C04**: escribir sobre una fecha y receta que ya existen **no sobrescribe** y lo dice. Test que
  comprueba que el contenido anterior sigue byte a byte igual
- Dos recetas distintas el mismo día conviven (el nombre lleva la receta, por eso lo lleva)
- El `.json` escrito, releído por `src/sources/archive.ts` (el lector de la fase 2, sin tocarlo),
  produce elementos. **Es el test que impide que el escritor y el lector se separen**
- `runs.ndjson` **se añade, nunca se reescribe**: tres ejecuciones dejan tres líneas, y la primera
  sigue intacta
- Una ejecución **fallida también deja su línea** (es el defecto D-07 entero)
- Ninguna línea contiene el valor de ninguna credencial (se ejercita con un error de SMTP simulado
  cuyo mensaje incluye usuario y contraseña, y se comprueba que la contraseña no llega al fichero)
- `readHealth()` cuenta ejecuciones dentro de la ventana y responde **RF-G04** sin mirar nombres de
  fichero: 19 de 30, con líneas fuera de ventana que no cuentan
- Un `runs.ndjson` con una línea corrupta **no tumba la lectura**: se ignora esa línea y se sigue.
  Un registro es un histórico, y un histórico con una línea rota no puede dejar ciego al sistema

### T7 · `src/state/archive.ts`, `src/state/runs.ts`

- `writeArchive()` escribe con la bandera `wx` (falla si existe), no con "comprobar y luego
  escribir": entre la comprobación y la escritura cabe otra ejecución. Crea el directorio si falta.
- `appendRun()` añade una línea y hace `fsync` del directorio no: es una línea corta, la escritura
  con `appendFileSync` basta y no hay dos escritores (RF-C06 lo garantiza el workflow, fase 5).
- `readHealth(path, windowDays, now)` devuelve `ReportHealth`. Es la única implementación (R10): la
  consumen el orquestador (para meterla en el informe) y `doctor` (para responder por consola).

### T8 · Tests de los notificadores y de la entrega · **rojo primero**

`tests/deliver/*.test.ts`. Sin red: `fetch` doblado, y el transporte SMTP inyectado.

- **RF-F03**: `deliver()` recorre los canales **declarados** en la receta, por su `id`, contra el
  registro. Un canal desconocido es un error de receta, no un salto silencioso
- Un canal con `enabled: false` **no se intenta**
- **RF-F04**: con tres canales, si el primero lanza, los otros dos se intentan igual, y el resultado
  agregado dice "parcial" con el detalle por canal
- Todos los canales fallando ⇒ entrega fallida, con su código
- **Un canal no reintenta.** Un fallo de entrega es un fallo de entrega; el reintento es una decisión
  de la fase 3 y era para el modelo
- El notificador de correo compone un mensaje con `subject`, cuerpo de texto (el markdown) y cuerpo
  HTML, y **no adjunta nada ni referencia nada externo**
- El notificador de correo **nunca deja la contraseña en el mensaje de error** que propaga
- Telegram y webhook: se prueban con un `fetch` doblado que captura la petición, comprobando método,
  cabeceras y que el cuerpo lleva el informe
- `requiredSecrets` de cada notificador es lo que `validate.ts` consultará en T12

### T9 · `src/deliver/registry.ts`, `email.ts`, `telegram.ts`, `webhook.ts`

Mismo patrón que `sources/registry.ts` y `model/providers.ts`: un registro por `id` declarado, nunca
por inspección de nada. El notificador de correo se construye con una fábrica que acepta el
transporte inyectado (por defecto, `nodemailer`), igual que `ProviderFactory` en la fase 3: es lo que
permite que los tests no toquen la red sin que el flujo real tenga un camino distinto (R10).

Secretos por canal, leídos solo del entorno (R3): `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASSWORD` para correo; `TELEGRAM_BOT_TOKEN` para Telegram; ninguno para webhook (la URL es
dominio y va en la receta).

### T10 · Tests del orquestador y de los códigos de salida · **rojo primero**

`tests/cli/run.test.ts`. La mitad se prueba llamando a `runOnce()` como función con todo doblado; los
**códigos de salida se prueban ejecutando el proceso de verdad** como hijo, porque un código de
salida que solo existe como valor de retorno no es un código de salida.

Los cinco caminos de `docs/02-arquitectura.md:190`:

| Código | Se provoca con                                                  |
| ------ | --------------------------------------------------------------- |
| `0`    | camino feliz completo, y también `skipped_existing` (ver abajo) |
| `1`    | receta inválida (un campo de `delivery` mal declarado)          |
| `2`    | todas las fuentes vacías ⇒ cero elementos (**RF-G01**)          |
| `3`    | el modelo doblado devuelve una salida que no valida             |
| `4`    | informe generado y todos los canales fallando                   |

Más:

- **`--dry-run` no escribe nada**: ni archivo, ni `seen.json`, ni `runs.ndjson`, ni entrega. Test que
  comprueba que el directorio de datos queda idéntico
- El informe de hoy ya archivado ⇒ **no se llama al modelo** (el doble registra si lo llamaron) y se
  sale con `0`
- `seen.json` se marca con **lo que salió en el informe**, no con lo recogido (RF-C01), y solo en una
  ejecución que llegó a archivar
- Una ruta de datos relativa se rechaza, no se resuelve contra el directorio de trabajo (RF-A07)

### T11 · `src/cli/main.ts`, `run.ts`, `validate.ts`, `doctor.ts`, `exit-codes.ts`

`runOnce()` es la única orquestación (R10). Orden:

```text
cargar receta y validar        fallo ⇒ 1
comprobar archivo de hoy       existe ⇒ 0, sin llamar al modelo
recolectar                     cero elementos ⇒ 2
pipeline de rank/
sintetizar (fase 3)            ningún proveedor ⇒ 3
buildReport (+ salud)
renderizar
archivar (json + md)
marcar seen y podar
entregar                       todos los canales fallan ⇒ 4
anotar la ejecución            SIEMPRE, también en los caminos de fallo
```

**El informe de hoy ya existe ⇒ código 0, no un fallo.** Es la decisión que este plan toma y el
modelo de datos no fija: es el workflow relanzado, el sistema está sano, y hacerlo fallar generaría
una alarma falsa cada vez que alguien reintenta un job. Queda registrado como
`result: "skipped_existing"` en `runs.ndjson`, así que no es silencioso, y no cuenta como día
perdido en la salud. R6 no se viola: R6 habla de fallos, y esto no lo es.

**Rutas, resueltas explícitamente y siempre absolutas (RF-A07, R11):**

| Qué                 | Precedencia                                                          |
| ------------------- | -------------------------------------------------------------------- |
| Directorio de datos | `--data-root` › `CHRONORIUM_DATA_ROOT` › `projectRoot/data`          |
| Raíz de recetas     | `--recipes-root` › `CHRONORIUM_RECIPES_ROOT` › `projectRoot/recipes` |

`src/paths.ts` deja de asumir que las recetas viven en el repositorio. Una ruta relativa se rechaza
con un error que la nombra, igual que ya hace `state/seen.ts`.

`validate --recipe <n>`: carga, valida, y llama a `diagnoseChain` (fase 3) para emitir el aviso de
punto único de fallo (RF-D04). **Sin red.** Dice qué secretos están presentes, **nunca su valor ni
parte de él**.

`doctor`: responde "cuántos días de los últimos treinta hubo informe" (RF-G04) leyendo
`runs.ndjson`, y sale con `1` si la tasa de fallo cruza `health.runFailureThreshold`, para que se
pueda cablear como alarma.

`package.json` gana `"bin": { "chronorium": "./dist/cli/main.js" }` y un script `cli`. Publicar en el
registro sigue fuera (ADR-015); el `bin` existe porque el workflow de la fase 5 lo va a invocar.

### T12 · La receta: `delivery`, `health` y las dos recetas de prueba

- `validate.ts` gana `validateDelivery()` y `validateHealth()`, con la misma forma de error
  (`campo` + `motivo`) y sin abortar en el primero (RF-A05)
- **Un canal activo cuyos `requiredSecrets` no están en el entorno hace fallar la validación**, con
  el nombre de la variable. Es la misma regla que RF-B03 aplica a las fuentes, y aquí es la que evita
  el "cada mañana falla el envío" del sistema anterior
- Campos por canal: correo exige `to` y `from`; telegram exige `chatId`; webhook exige `url`
- **Cero canales activos es válido**, y es lo que distribuye `recipes/example` (RF-B04, RF-H04): un
  desconocido con solo la credencial del modelo obtiene su informe **en el archivo**, y activa el
  correo cuando quiera. Un informe archivado ya es un informe entregado
- `loadRecipe()` devuelve `name` (el nombre del directorio) y los dos bloques nuevos
- `recipes/example`: los tres canales declarados y desactivados, con direcciones de ejemplo y
  comentarios que expliquen los secretos; `health` con sus umbrales; `label` en los campos donde
  ayuda a leer el correo
- La receta de biotech (fixture): forma **deliberadamente distinta** otra vez, para que los
  renderizadores no puedan apoyarse en la forma de la primera. Distinto idioma (ya lo es), distinto
  orden de campos, alguna sección `non-empty` que se quedará vacía a propósito en su fixture y un
  canal activo distinto del correo

### T13 · La batería de ataques crece hasta donde esta fase alcanza

`tests/security/bateria.test.ts`, sin duplicar nada (los once casos siguen en un solo sitio):

- **Caso 4 (marcado en el título), ahora de punta a punta.** Hasta hoy llegaba al prompt. Ahora se
  sigue un título con `<script>` y con `<img onerror>` desde el fichero de fuente hasta el **correo
  HTML** y hasta el **markdown archivado**, y se comprueba que sale escapado en los dos
- **Caso 7 (salida que no valida), ahora con su código de salida.** La tabla de
  `docs/05-seguridad-legal.md:73` dice "falla con código 3": hasta ahora fallaba, pero no había
  códigos. Se comprueba el `3` de verdad
- **Caso 5** se extiende un paso: además de `linksDropped: 1`, el enlace descartado **no deja rastro
  en el markdown ni en el HTML** (nada de `[título]()`)
- Se añade un caso a la tabla del documento, con su fila: **un canal de entrega que devuelve un error
  cuyo mensaje contiene la contraseña no la propaga al registro ni al informe** (A4)

`docs/05-seguridad-legal.md` se actualiza con esa fila nueva en la misma tarea, no después.

### T14 · `check:receta-ejemplo` llega hasta el final (RF-H05, RF-A04)

El script de CI se alarga: hoy termina en "el modelo simulado produjo un informe válido". Ahora sigue
hasta **archivar en un directorio temporal, renderizar los tres formatos y entregar con un notificador
simulado**, sin conocer ninguna clave de sección.

Y prueba **el criterio que decide el proyecto** (RF-A04, el primero de los tres de
`docs/01-especificacion.md:345`): el script añade en memoria una sección más a las declaradas por la
receta y comprueba que esa sección aparece en el `.json`, en el `.md` y en el HTML del correo, **sin
que ningún fichero de `src/` cambie**. Es la primera vez en el proyecto que ese criterio se puede
comprobar entero, porque hasta ahora no había ni correo ni archivo.

### T15 · La prueba con red real · `pnpm run probe:fase4`

Como `probe:fase3`: el script existe, es idempotente y **falla ruidosamente si faltan credenciales**,
nunca simula nada en su lugar. Tres partes:

1. **Sin credenciales de correo**: ejecución completa contra un directorio de datos temporal con el
   modelo real, hasta archivo escrito. Verifica el camino largo sin depender del correo
2. **Con las credenciales de Gmail exportadas por el dueño en su propia sesión** (nunca en un
   fichero, R3): un informe real entregado a su bandeja
3. **Segunda ejecución el mismo día**: no sobrescribe, sale con 0, deja su línea `skipped_existing`

Se para donde tiene que pararse: sin credenciales, la parte 1 corre y las otras dos quedan escritas
en la bitácora como pendientes, igual que hizo la fase 3.

### T16 · El juicio del dueño, y la bitácora

**No es un test.** El dueño abre el correo recibido y dice si sirve: si se lee bien en el móvil, si
el markdown archivado se pega en otra herramienta sin editarlo (RF-F02), y si la línea de estado se
entiende. Si no sirve, se arregla antes de cerrar.

En el cierre, además:

- Entrada de bitácora con lo que se desvió
- **Limpiar las notas caducas de `ops.md`**: las fases 2 y 3 siguen marcadas "pendiente de
  confirmación del dueño" cuando la bitácora dice que ambas se confirmaron y cerraron
- Marcar en `ops.md` la tarea de importación como retirada, apuntando al ADR-019

---

## Contratos que fija esta fase

Ninguno de estos debería tener que romperse en la fase 5 ni en la 6. Si alguno se rompe, el corte
estaba mal.

1. **`Report` es el dato canónico**, con `schemaVersion: 2` y `sections` como **array**. Nada aguas
   abajo puede acceder por clave (`report.pulse` no existe, por diseño).
2. **`Renderer.render(report, sections)`**: tres formatos hoy, y añadir un cuarto no toca nada más.
3. **`Notifier.send(rendered, cfg, ctx)`**: tres canales hoy, y añadir un cuarto es un fichero y una
   línea en el registro.
4. **Cinco códigos de salida**, los de `docs/02-arquitectura.md`. La fase 5 los va a leer desde el
   workflow, así que a partir de aquí son API pública.
5. **`runs.ndjson` se añade y no se reescribe**, una línea por ejecución, también las fallidas.
6. **Un informe archivado no se sobrescribe jamás.** Es una prohibición de la constitución, y se
   implementa con la bandera del sistema de ficheros, no con una comprobación previa.
7. **Las rutas de datos y de recetas se resuelven explícitamente y son absolutas.**
8. **El escapado ocurre en el renderizador, nunca antes.** El `Report` canónico guarda el texto tal
   cual; cada formato lo escapa a su manera. Escapar en `buildReport` produciría un JSON con
   `&amp;lt;` dentro, que es el bug clásico de esta clase de sistemas.

---

## Ficheros que se tocan

**Nuevos:**

```text
src/render/    types.ts · escape.ts · report.ts · json.ts · markdown.ts · email.ts
src/deliver/   types.ts · registry.ts · email.ts · telegram.ts · webhook.ts
src/state/     types.ts · archive.ts · runs.ts
src/cli/       main.ts · run.ts · validate.ts · doctor.ts · exit-codes.ts
tests/render/  escape · report · json · markdown · email
tests/deliver/ registry · email · telegram · webhook
tests/state/   archive · runs
tests/cli/     run (incluye los códigos de salida como proceso hijo)
scripts/       probe-fase4.ts
docs/          plans/fase-4-render-entrega-archivo.md (este fichero)
```

**Modificados:**

```text
src/recipe/types.ts       name, delivery, health, subject, FieldSpec.label
src/recipe/load.ts        devuelve name y los bloques nuevos
src/recipe/validate.ts    validateDelivery, validateHealth
src/paths.ts              raíz de recetas y de datos resueltas por precedencia explícita
src/render/CLAUDE.md      nuevo, como el de src/model/: la regla de esta capa
recipes/example/*         delivery desactivado, health, labels
tests/fixtures/recipes/biotech/*   la misma extensión, de otra forma
tests/security/bateria.test.ts     casos 4, 5 y 7 completados, más el nuevo
scripts/check-receta-ejemplo.ts    hasta el archivo y el correo, más la prueba de RF-A04
package.json              nodemailer, @types/nodemailer, bin, scripts cli y probe:fase4
docs/04-decisiones-adr.md ADR-019 y ADR-020
docs/05-seguridad-legal.md la fila nueva de la batería, y los secretos de correo
docs/ops.md               notas caducas de fases 2 y 3, tarea de importación retirada
docs/bitacora.md          la entrada de esta sesión
```

---

## Las trampas de esta fase

Once cosas que se hacen mal por defecto, y que en este proyecto son defectos con nombre.

1. **`if (section.key === 'pulse')` en cualquier sitio de `render/`.** Es la premisa del proyecto (R12,
   D-02). El test de las claves `alfa`/`beta`/`gamma` existe para que no cuele.
2. **Escapar dos veces, o escapar en `buildReport`.** El dato canónico guarda el texto crudo.
3. **Prosa traducible dentro de `src/`.** El idioma del informe lo pone la receta. Si te apetece
   escribir "no hubo novedades", ese texto pertenece a la receta o no existe.
4. **Rellenar `meta` con valores por defecto** cuando falte un dato. Es la prohibición literal de la
   constitución y el defecto D-02 del sistema anterior.
5. **Sobrescribir un informe archivado.** Ni con `--force`, que no existe.
6. **Salir con 0 en un fallo** (R6). Y su simétrico, menos obvio: **salir con error en algo que no es
   un fallo** (el informe de hoy ya existe), que fabrica alarmas falsas hasta que nadie las mira.
7. **No escribir la línea de `runs.ndjson` en el camino de fallo.** Es exactamente el defecto D-07: un
   fallo que no deja rastro es el que se pierde.
8. **Dejar un secreto en un mensaje de error, en el registro o en el informe** (A4). Los errores de
   SMTP son especialmente propensos: incluyen la configuración de conexión.
9. **Un recurso externo en el correo.** Una imagen remota es un rastreador y rompe "autocontenido".
10. **Reintentar la entrega.** El reintento vive en `model/retry.ts`, es para el modelo, y tiene su
    ADR. Un segundo bucle de reintento en otra capa es el camino a las dos capas que se pelean.
11. **Escribir el markdown sin el JSON.** El JSON es el dato; el markdown se deriva. Si algún día solo
    hay markdown, la receta de archivo (la semanal destilando a la diaria) se queda ciega.

---

## Lo que NO entra, aunque esté cerca

- **El workflow reutilizable, el grupo de concurrencia y el bloqueo entre ejecuciones (RF-C06).** Es
  fase 5, y su mecanismo declarado es el workflow, no un fichero de bloqueo.
- **Las recetas reales, los secretos de la instancia y el rodaje en sombra.** Fase 5 entera.
- **La importación de los 45 informes anteriores.** ADR-019.
- **`check:docs` (RF-A09).** Fase 6. Esta fase deja la documentación al día a mano; automatizar la
  comprobación es otro trabajo.
- **README, capturas y guías de extensión.** Fase 6.
- **Un segundo transporte de correo** (API HTTP). El contrato queda abierto; construirlo hoy sería
  mantener dos caminos con un solo usuario.
- **Plantillas de correo configurables, adjuntos, seguimiento de aperturas.** Nada de eso está en
  ningún requisito.
- **Traducir la línea de estado.** Si algún día molesta, se declara en la receta, no en `src/`.
- **Tocar `src/model/`.** Esta fase consume `synthesize()` tal cual. Si aparece la tentación de
  cambiarlo, es señal de que algo se está colando de la fase 3 a la 4.

---

## Dónde para quien construye

Tres puntos de parada declarados. Pararse aquí es cumplir el plan, no incumplirlo.

1. **T0, si la auditoría de `nodemailer` encuentra un patrón feo.** Se vuelve al dueño con la
   alternativa (transporte por API HTTP), no se improvisa. Precedente: `fast-xml-parser` en la fase 2.
2. **T15, sin credenciales de correo.** La parte 1 corre; las partes 2 y 3 y todo T16 quedan escritos
   como pendientes en la bitácora. No se simula un envío y se declara probado.
3. **Cualquier punto en que el contrato de `Report` no dé para lo que un renderizador necesita.** Si
   hace falta que el renderizador sepa algo que `SectionSpec` no dice, el sitio de esa información es
   `sections.yaml`, y el cambio se razona antes de hacerlo, no dentro del renderizador.

---

## Criterio de terminada

Concreto y comprobable. La fase no se cierra hasta que los ocho se cumplen.

1. `pnpm test`, `pnpm run typecheck`, `pnpm run lint` y `pnpm run build` en verde, con los tests
   nuevos de `render/`, `state/`, `deliver/` y `cli/`, **sin red y sin credenciales**.
2. `pnpm run bateria` en verde, con los casos 4, 5 y 7 completados hasta el correo y hasta el código
   de salida, y la tabla de `docs/05-seguridad-legal.md` con su fila nueva.
3. `pnpm run check:sin-datos-personales` limpio (el correo del dueño va a aparecer en recetas y en
   variables de entorno esta fase: es el momento en que ese check más vale).
4. `pnpm run check:receta-ejemplo` llega hasta el archivo escrito, los tres formatos y el notificador
   simulado, **y demuestra RF-A04**: una sección añadida aparece en los tres sin tocar `src/`.
5. **Los cinco códigos de salida observados como proceso**, no como valor de retorno.
6. Un informe real, generado con el modelo de verdad, **recibido en la bandeja del dueño** por Gmail
   (T15 parte 2).
7. Una segunda ejecución el mismo día **no sobrescribe** el informe y sale con 0 (T15 parte 3).
8. **El juicio del dueño (T16):** el correo se lee bien en el móvil, el markdown archivado se pega en
   otra herramienta sin editarlo, y la línea de estado se entiende. Si no, se arregla antes de cerrar.

Cumplidos los ocho, y **solo entonces**, se lanzan `@fiel-al-plan` y `/verifier` (con
`@guardarrailes`, obligatorio porque esta fase toca el escapado y la salida).
