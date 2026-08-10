# Fase 5 · Ejecución programada y la instancia

> Plan escrito el 2026-08-10 con el repositorio delante. **No construye nada**: fija el orden, los
> contratos y el criterio de terminada. Lo ejecuta `/ejecutar-fase`.

Es la fase que convierte una herramienta que funciona cuando alguien la lanza en un sistema que
entrega solo, todos los días, sin que nadie esté delante. Y es la primera que toca **dos
repositorios**: casi todo lo que se construye aquí no vive en este árbol.

También es la fase donde se mide el tercer criterio de `docs/01-especificacion.md:345` ("el usuario
cero recibe su informe todos los días"), el único que no se aprueba con un test sino con varios días
seguidos de producción.

---

## Estado de partida, comprobado en el repositorio hoy

- **315 tests en verde**, fase 4 cerrada y confirmada por el dueño el 2026-08-10 (`c397976` en
  `main`). Rama actual `feat/fase5`, limpia.
- **El CLI ya existe entero** y acepta todo lo que un workflow necesita: `run`, `validate`, `doctor`,
  cada uno con `--recipe`, `--recipes-root` y `--data-root`, resueltos por precedencia explícita
  (`src/paths.ts:33`, `src/cli/run.ts:318`). No hay que añadir ningún comando.
- **Los cinco códigos de salida son observables como proceso** (fase 4, T10). El workflow los lee.
- **Node ejecuta `src/cli/main.ts` directamente**, sin `tsx` y sin `dist/` (bitácora del 2026-08-09,
  y `tests/cli/run.test.ts` lo hace ya con `spawnSync`). El workflow no necesita paso de compilación.
- **No existe ningún workflow más que `ci.yml`.** `.github/workflows/run.yml` (el reutilizable que
  promete `docs/02-arquitectura.md:209`) está por escribir.
- **La única etiqueta del repositorio es `v0.0.0`.** Las instancias fijan etiqueta, no rama
  (ADR-014, amenaza A6), así que esta fase tiene que producir una.
- **`archiveReader` (`src/sources/archive.ts:87`) ya filtra por receta** (`source.recipe`), que es lo
  que la receta semanal necesita para destilar solo a la diaria.
- **`readHealth` ya filtra por receta** (`src/cli/run.ts:210`), así que un `runs.ndjson` compartido
  por dos recetas no mezcla su salud.

## Cuatro hallazgos de hoy, leyendo el código con la fase 5 en la cabeza

Los dos primeros son **bloqueos**: sin resolverlos, las tareas de `ops.md` no se pueden completar.

### H1 · La receta semanal, hoy, produciría cero elementos siempre (bloqueo)

`state/seen.json` es **uno por instancia**, no uno por receta: `src/cli/run.ts:106` lo resuelve como
`join(dataRoot, 'seen.json')` sin mirar el nombre de la receta. La diaria marca como visto todo lo
que publicó (`markSeen`, RF-C01). La semanal lee esos mismos informes por la fuente `archive`, y los
elementos que saca tienen **la misma url y el mismo título** que los que la diaria ya marcó, así que
`runPipeline` los descarta enteros en su filtro de memoria (`src/rank/pipeline.ts:50`).

Resultado: cero elementos, código de salida 2 (RF-G01), correo de fallo del workflow, **todos los
lunes**. No es un caso límite, es el camino nominal de la receta semanal.

**Es un cambio del modelo de datos**, así que entra por ADR (ver D1), no por decisión dentro de una
tarea.

### H2 · Las rutas de estado del código no son las que fija el modelo de datos (bloqueo suave)

`docs/03-modelo-datos.md:9` y `docs/arranque.md:101` fijan `state/seen.json` y `state/runs.ndjson`.
El código escribe los dos en la **raíz** del directorio de datos (`src/cli/run.ts:105-106`,
`src/cli/doctor.ts`), solo `archive/` cae donde la documentación dice.

Hasta hoy daba igual porque el directorio de datos era temporal en los tests y en las pruebas. Deja
de dar igual el día que ese directorio es el repositorio de la instancia: los ficheros aparecen en
sitios que ninguna documentación describe.

Añadido: **ni `appendRun` ni `saveSeen` crean su directorio padre** (`src/state/runs.ts:24`,
`src/state/seen.ts:110`). Con `state/` como subdirectorio, y sabiendo que git no versiona
directorios vacíos, la primera ejecución de una instancia recién clonada fallaría con `ENOENT`.

### H3 · El identificador de cliente lleva una URL vacía

`src/cli/run.ts:354` manda `chronorium/1.0 (+https://github.com/)` a cada fuente. RF-B08 pide
identificarse con un identificador propio del proyecto; una URL sin repositorio no identifica nada, y
esta es la primera fase en la que existe una URL real que poner. Arreglo de una línea, se hace aquí
porque aquí es donde el sistema empieza a golpear fuentes ajenas todos los días.

### H4 · La ventana de memoria y la de recolección son el mismo número

`pruneSeen` se llama con `recipe.window.days` (`src/cli/run.ts:244`), es decir, la memoria de lo ya
mostrado dura exactamente lo que la ventana de recolección (7 días en `recipes/example`). El ejemplo
de `docs/03-modelo-datos.md:103` muestra `windowDays: 30`, que es lo que ninguna receta produce hoy.

**No se añade un campo nuevo.** RF-C02 pide que la ventana sea configurable, y lo es. Se corrige el
ejemplo de la documentación para que no prometa un número que el código no escribe, y se anota que si
algún día molesta que un elemento pueda reaparecer al octavo día, entonces (y solo entonces) entra un
`window.memoryDays` opcional.

---

## Decisiones que este plan propone al dueño antes de construir

Ninguna estaba fijada en un ADR, y las dos primeras cambian un documento que sí lo está.

### D1 · La memoria de lo ya mostrado pasa a ser por receta · **ADR-021**

`state/seen--<receta>.json`, con el mismo criterio de nombre que ya usa el archivo
(`YYYY-MM-DD--<receta>.json`) y por el mismo motivo declarado en `docs/03-modelo-datos.md:16`: hay
dos recetas escribiendo en la misma instancia.

Alternativas consideradas y por qué no:

1. **Un campo en la receta para desactivar la memoria** (`memory: false` en la semanal). Mete en el
   dominio una decisión que es del mecanismo: la semanal sí quiere memoria, quiere **la suya**, para
   no repetir en el resumen del lunes lo que ya resumió el lunes anterior.
2. **Que la fuente `archive` marque sus elementos como exentos.** Sería el lector decidiendo sobre la
   memoria, es decir, dos capas conociéndose que hoy no se conocen.
3. **Mantener un solo fichero y filtrar por receta dentro.** Es la opción 1 con más pasos, y hace que
   una receta pueda corromper la memoria de otra al podar con su propia ventana.

`runs.ndjson` **sigue siendo uno solo por instancia**, y no se toca: `readHealth` ya filtra por
receta, y un registro único es lo que responde "¿cuántos días hubo informe?" sin comparar ficheros
(RF-G04).

Consecuencia que hay que asumir por escrito: **la semanal repetirá enlaces que ya salieron en la
diaria**, y eso es lo que se quiere. Un resumen semanal que solo pudiera hablar de lo que la diaria
no contó no sería un resumen, sería una segunda diaria.

### D2 · `state/` es un directorio de verdad, y el código lo crea si falta

Se corrige el código, no la documentación: `docs/03-modelo-datos.md` y `docs/arranque.md` describen
la forma que el dueño va a ver en su repositorio privado, y esa forma (tres directorios claros:
`recipes/`, `archive/`, `state/`) es mejor que cuatro ficheros sueltos en la raíz.

### D3 · Los secretos que el workflow pasa a la herramienta

El motor lee los secretos **solo del entorno** (R3, RF-E05), y **el nombre de cada variable lo
declara la receta** (`apiKeyEnv` por eslabón, ADR-018). Un workflow reutilizable, en cambio, tiene
que declarar por adelantado qué secretos acepta, o recibirlos todos con `secrets: inherit`.

Este plan **no fija cuál de las dos vías se usa**: es exactamente el tipo de detalle de plataforma que
la constitución prohíbe fijar de memoria. T0 lo verifica contra la documentación del día y elige, con
este orden de preferencia y su motivo:

1. **`secrets: inherit` en el llamador**, y el reutilizable exporta al entorno lo que le llegue. Es la
   única forma que respeta que **el nombre de la variable lo elija la receta**, que es la premisa del
   proyecto. Riesgo a comprobar: si la única manera de enumerarlos es serializar el contexto de
   secretos, hay que garantizar que ese valor nunca se imprime.
2. **Lista explícita de secretos opcionales en `on.workflow_call.secrets`**. Funciona seguro, pero
   mete en el mecanismo una lista de nombres de proveedor, y obliga a tocar el repositorio público
   (y a subir etiqueta) el día que alguien use un proveedor con otro nombre de variable.

Si gana la opción 2, se escribe en el ADR **con su límite dicho en voz alta**, no como si fuera
gratis.

---

## Requisitos que cubre

| Requisito          | Dónde se cumple en esta fase                                                     |
| ------------------ | -------------------------------------------------------------------------------- |
| **RF-C06**         | grupo de concurrencia por instancia en el reutilizable, sin cancelar (T3, T4)    |
| **RF-C01, RF-C02** | memoria por receta, podada, que deja de romper la semanal (T1, T2, D1)           |
| **RF-C04**         | relanzar el workflow el mismo día no sobrescribe: sale 0 y no commitea (T3, T7)  |
| **RF-G06**         | los cinco códigos de salida, leídos por el workflow, deciden si el job falla     |
| **RF-G03**         | el registro de la ejecución vuelve commiteado a la instancia (T4, T7)            |
| **RF-G04, RF-G05** | paso de `doctor` al final: el patrón, no el evento (R9)                          |
| **RF-A07**         | el workflow pasa raíces absolutas de recetas y de datos, nunca un cwd (T4)       |
| **RF-E05**         | los secretos viven en el almacén de la instancia, nunca en un fichero (T5, D3)   |
| **RF-D04, RF-D05** | paso de `validate` antes de ejecutar: aviso de punto único y marcador de posición |
| **RF-B08**         | identificador de cliente con la URL real del proyecto (H3, T2)                   |
| **RF-A01, RF-A08** | las recetas reales, con el perfil **real y actual**, no el aspiracional (T6)     |
| **RF-A03, RF-A04** | dos recetas reales de forma distinta produciendo informes sin tocar `src/` (T6)  |
| **RF-H04**         | el camino "fork, dos secretos, informe" recorrido de verdad por primera vez (T5) |
| **RF-H02**         | todo lo que esta fase añade en código, probado sin red y sin credenciales (T1)   |

**Amenaza A6** (`docs/05-seguridad-legal.md:22`): la instancia fija **etiqueta**, nunca `main`. Esta
fase produce la primera etiqueta consumible y la usa (T4, T5).

**Tareas de `ops.md` que no mapean a ningún requisito, y por qué se quedan:** crear el repositorio
privado, escribir las recetas reales, poner los secretos, el rodaje en sombra y apagar el sistema
anterior no son requisitos funcionales, son **el tercer criterio de aceptación** de
`docs/01-especificacion.md:353` ("el usuario cero recibe su informe todos los días"), el único que se
mide en producción. No falta requisito ni sobra tarea.

**Lo que este plan añade a `ops.md`:** los tres arreglos de código de H1, H2 y H3. `ops.md` daba por
hecho que la herramienta estaba lista para que la invocara un workflow, y con la memoria compartida
entre recetas no lo está.

---

## Orden de tareas

Regla de la fase, igual que las anteriores: **los tests se escriben en rojo antes de la
implementación** (R13). Lo que aquí es nuevo es que la mitad de la fase no es código, y esa mitad
tiene su propia forma de verificarse: el workflow se prueba parseando su YAML y, al final,
ejecutándolo de verdad contra la instancia.

### T0 · Verificar la plataforma contra su documentación del día, no de memoria

Mismo mecanismo que abrió las fases 2, 3 y 4, y en las tres cambió algo del plan. Cinco preguntas,
todas con respuesta en la documentación de GitHub Actions, ninguna deducible del código:

1. **Qué repositorio deja `actions/checkout` por defecto dentro de un workflow reutilizable**, y cómo
   se hace el segundo checkout (el de la herramienta) **fijado exactamente a la referencia que el
   llamador puso en su `uses:`**. Candidato a verificar: `github.job_workflow_sha`. Si no existiera o
   no significara eso, la alternativa es un input explícito con la etiqueta, y entonces hay que decir
   en voz alta que el llamador la escribe dos veces.
2. **Cómo llegan los secretos** (D3), y si el llamador necesita `secrets: inherit`.
3. **Permisos para commitear y empujar** desde el reutilizable (`permissions: contents: write`), y si
   el llamador puede recortarlos.
4. **Cómo se evalúa `concurrency` en un reutilizable**: si `github.repository` dentro del
   reutilizable es el repositorio del **llamador** (que es lo que RF-C06 necesita) o el de la
   herramienta.
5. **Retraso real de los cron** y la sintaxis del `schedule` (ADR-003 ya asume que se retrasan y lo
   da por irrelevante para un informe diario; aquí solo se confirma la sintaxis y que la zona es UTC).

**Punto de parada declarado:** si la pregunta 1 no tiene respuesta que garantice el pinado exacto, se
para y se vuelve al dueño. Sin ella, A6 no está mitigada y ADR-014 es una promesa, no un mecanismo.

### T1 · Tests en rojo de la memoria por receta y de las rutas de estado

`tests/cli/run.test.ts` y `tests/state/seen.test.ts`, todo sobre directorio temporal, sin red:

- **El caso de H1, escrito como test:** una ejecución de la receta A publica un elemento; una
  ejecución de la receta B sobre **el mismo directorio de datos** con ese mismo elemento en su entrada
  **sí lo ve**. Hoy este test falla, y es el que justifica toda D1.
- Una segunda ejecución de la receta A **no** vuelve a ver lo que ella misma publicó (la memoria sigue
  haciendo su trabajo dentro de cada receta).
- Las rutas exactas: `state/seen--<receta>.json` y `state/runs.ndjson`, comprobadas como cadena, no
  como "algún fichero por ahí". Es lo que ata el código a `docs/03-modelo-datos.md`.
- **Un directorio de datos sin `state/`** (una instancia recién clonada) ejecuta sin fallar y lo crea.
- `runs.ndjson` sigue siendo **uno solo** para las dos recetas, y `readHealth` sigue distinguiéndolas.
- `doctor --recipe <n>` lee el registro en su ruta nueva.

### T2 · La implementación de los tres arreglos

- **Una sola función que resuelve las rutas de estado** (`statePaths(dataRoot, recipe)` en
  `src/state/`), consumida por `cli/run.ts` y `cli/doctor.ts`. R10: no dos sitios componiendo la misma
  ruta, que es exactamente cómo H2 se coló.
- `appendRun` y `saveSeen` crean su directorio padre si falta.
- El identificador de cliente pasa a llevar la URL real del repositorio público (H3).
- **`docs/03-modelo-datos.md` se actualiza en esta misma tarea**, no después: nombre del fichero de
  memoria, y el ejemplo de `windowDays` que hoy promete 30 (H4).
- **ADR-021 escrito antes que el código**, no después. Un ADR redactado al terminar es una
  justificación, no una decisión.

`pnpm test`, `typecheck`, `lint` y `build` en verde al cerrar la tarea. A partir de aquí, la
herramienta está lista para que la invoquen.

### T3 · Tests del workflow reutilizable, en rojo primero

`tests/workflow/run-workflow.test.ts`. Parsea `.github/workflows/run.yml` con la dependencia `yaml`
que el proyecto ya tiene y comprueba las garantías que, si no, solo existirían como buena intención
en un fichero que nadie ejecuta en CI:

- Declara `on.workflow_call` con un input `recipe` **requerido**.
- **Declara `concurrency`, su grupo depende del repositorio del llamador y NO del nombre de la
  receta** (RF-C06 es por instancia: la diaria y la semanal del lunes se serializan, no corren a la
  vez), y **`cancel-in-progress` es `false`**. Cancelar una ejecución a medias es perder el informe.
- Ninguna acción de terceros sin versión fijada.
- El paso que ejecuta la herramienta **no imprime ninguna variable de entorno** ni el contexto de
  secretos (A4).
- El commit y el empuje ocurren **antes** del paso que decide si el job falla: un fallo de entrega
  (código 4) tiene informe archivado y línea en el registro, y esos dos tienen que volver al
  repositorio igual.
- Los checkouts son dos, y el de la herramienta va fijado a una referencia inmutable, nunca a `main`
  (A6).

Es un test de forma, no de comportamiento, y se dice aquí para que nadie lo confunda: **no sustituye a
T7**, que es ejecutarlo de verdad.

### T4 · `.github/workflows/run.yml`, el workflow reutilizable

Forma acordada, sujeta a lo que T0 devuelva:

```text
entradas:  recipe (requerido) · recipes-root (opcional, por defecto "recipes")
           data-root (opcional, por defecto ".")
pasos:     checkout de la instancia (el llamador)
           checkout de la herramienta, fijada a la referencia del propio workflow
           node de la versión que declara engines de la HERRAMIENTA (RF-A10)
           pnpm install --frozen-lockfile en la herramienta
           validate --recipe <n>        ← falla rápido, sin red, y emite el aviso de RF-D04
           run --recipe <n>             ← se captura el código, no se aborta el job todavía
           commit y push de archive/ y state/ si hay cambios
           doctor --recipe <n>          ← el patrón agregado (R9); su fallo marca el job
           salir con el código que devolvió run
```

Decisiones que van dentro y su motivo:

- **El código de salida se guarda y el job termina con él**, después de commitear. Un informe generado
  cuya entrega falló (código 4) no puede perderse porque el job muriera antes de empujar.
- **Nada se commitea si nada cambió.** El caso `skipped_existing` (el workflow relanzado a mano) sale
  con 0, no toca el archivo y no deja un commit vacío.
- **Rutas absolutas siempre**, construidas desde el espacio de trabajo. RF-A07 es del código, y el
  código rechaza una ruta relativa: el workflow no puede pasarle una.
- **`workflow_dispatch` no va aquí**, va en el llamador: es quien tiene el cron y quien se relanza a
  mano.
- Se ejecuta `node <herramienta>/src/cli/main.ts`, sin paso de compilación (comprobado: Node lo
  ejecuta directo). Es la misma primitiva que en local, R10.

Al terminar T4 se etiqueta el repositorio público (**`v0.5.0`**), porque la instancia fija etiqueta y
sin etiqueta no hay nada que fijar. Cada arreglo posterior de esta fase sube etiqueta, y eso no es una
molestia: es el mecanismo de ADR-014 funcionando por primera vez.

### T5 · El repositorio privado de la instancia

Trabajo del dueño, con los comandos escritos. Estructura, que ya fija `docs/arranque.md:101`:

```text
chronorium-<nombre>/            privado
  recipes/daily/  recipes/weekly/
  archive/                      nace vacío (ADR-019)
  state/                        nace vacío
  .github/workflows/briefing.yml
```

- El workflow del llamador son unas diez líneas: `schedule` más `workflow_dispatch`, y un `uses:`
  apuntando al reutilizable **fijado a `v0.5.0`**, con `secrets` según lo que T0 decida.
- **Dos crones, no uno:** el diario todos los días, y el semanal los lunes. Con la serialización de
  T4, coincidir el lunes es correcto por diseño, no un accidente tolerado.
- **Secretos en el almacén del repositorio privado, nunca en un fichero** (R3): la credencial del
  proveedor principal, **la del segundo proveedor** (ADR-009: es la línea que recupera 6 de los 11
  días perdidos, y es de las tareas sueltas de `ops.md`), y las cuatro de SMTP.
- **`validate` se ejecuta a mano antes del primer cron**, con los secretos puestos: si el aviso de
  punto único de fallo aparece, es que la segunda credencial no está de verdad. Es el fallo exacto que
  el sistema anterior tuvo durante 49 días sin que nadie lo viera.

### T6 · Las recetas reales

Viven **solo en el repositorio privado**. Nada de esto entra en este árbol, y esa es justamente la
prueba de ADR-002.

**La diaria** parte de `recipes/example` y cambia lo que es dominio: fuentes reales, temas reales,
`persona.md` con el perfil **real y actual, no el aspiracional** (RF-A08, y el motivo escrito en
`docs/01-especificacion.md:60`: un mes de recomendaciones dirigidas a un director de empresa que no
existe). Canal `email` activado, `subject` a gusto del dueño.

**La semanal**, con tres cosas que este plan deja fijadas porque son trampas comprobadas hoy:

1. Una sola fuente, `type: archive`, con `recipe: daily` para destilar solo la diaria.
2. **`caps.perSourceMaxPercent: 100`.** Todos los elementos de la fuente `archive` comparten el mismo
   valor de `source` (`src/sources/archive.ts:54`), así que un tope del 40% tiraría el 60% del archivo
   de la semana sin que nadie entendiera por qué.
3. `window.days: 7`, y secciones **de forma distinta a la diaria**: aquí es donde vive el "cómo me lo
   aplico" desarrollado, la decisión que la bitácora del 2026-08-10 dejó tomada para esta fase.

**Se asume, y está en ADR-019:** la primera semanal saldrá pobre porque el archivo nace vacío. Por eso
su cron se activa **a partir del segundo lunes**, cuando ya hay una semana de diarias que destilar.
Activarlo antes produce un `no_items` con código 2, que es un fallo correcto sobre una situación
esperada, es decir, una alarma falsa el primer día.

### T7 · La primera ejecución de verdad, lanzada a mano

Antes de dejar ningún cron suelto:

1. `workflow_dispatch` de la diaria. Se comprueba, en el repositorio privado: el informe en
   `archive/` (`.json` y `.md`), la línea en `state/runs.ndjson`, el `state/seen--daily.json` creado,
   el commit de vuelta, y **el correo en la bandeja**.
2. **Relanzar el mismo día.** Tiene que salir con 0, dejar `skipped_existing` en el registro, **no
   sobrescribir** y no generar commit (RF-C04).
3. **Dos ejecuciones a la vez** (dos `workflow_dispatch` seguidos, o el diario y el semanal a la vez):
   la segunda espera a la primera, ninguna muere cancelada (RF-C06). Es la única forma de comprobar
   esa garantía de verdad; el test de T3 solo comprueba que está declarada.

### T8 · Rodaje en sombra

Los dos sistemas en paralelo, **varios días**, sin apagar nada. Lo que se compara cada día, escrito
antes de empezar para no acabar decidiendo por la impresión del último informe leído:

- ¿Llegó el informe? (es el criterio que decide: el sistema anterior fallaba uno de cada cinco días)
- ¿Repite elementos que ya salieron?
- ¿La opinión y las acciones son al menos tan útiles como las del anterior?
- ¿Algún enlace roto o inventado? (`meta.linksDropped` debería responderlo solo)
- ¿Alguna fuente fallando en silencio? (`meta.sourcesOk`/`sourcesFailed` y el paso de `doctor`)

Se anota en la bitácora, un párrafo por día, no de memoria al final.

### T9 · Apagar el sistema anterior

**Solo cuando el nuevo gane la comparación**, que es lo que `ops.md` pide literalmente. Y con las dos
tareas sueltas de `ops.md` resueltas antes de apagarlo: rotar sus tres credenciales (recordando que su
fichero de secretos gana a las variables de entorno) y, si el rodaje se alarga, ponerle la segunda
credencial de proveedor mientras siga vivo.

Cierre: entrada de bitácora, casillas de `ops.md`, y `@fiel-al-plan` más `/verifier` **después** de la
confirmación del dueño, nunca antes.

---

## Contratos que fija esta fase

1. **`state/seen--<receta>.json` y `state/runs.ndjson`**, con `archive/` al lado. Es la forma del
   repositorio de la instancia y la fase 6 la va a documentar tal cual.
2. **La memoria de lo ya mostrado es por receta; el registro de ejecuciones es por instancia.**
3. **El grupo de concurrencia es por instancia, no por receta.** Si algún día se quiere paralelismo
   entre recetas, hay que resolver antes quién escribe `runs.ndjson`.
4. **La instancia fija etiqueta.** El repositorio público etiqueta con disciplina a partir de aquí,
   porque hay una instancia real dependiendo de ello.
5. **Los inputs del reutilizable** (`recipe`, `recipes-root`, `data-root`): a partir de la primera
   etiqueta consumida son API pública, y quitar uno rompe instancias ajenas.
6. **El workflow commitea antes de decidir si falla.** Un fallo nunca puede perder el rastro que ese
   fallo dejó escrito.

---

## Ficheros que se tocan

**Nuevos:**

```text
.github/workflows/run.yml            el reutilizable
src/state/paths.ts                   statePaths(dataRoot, recipe), única implementación
tests/workflow/run-workflow.test.ts  las garantías del workflow, comprobadas en CI
docs/plans/fase-5-ejecucion-programada.md   (este fichero)
```

**Modificados:**

```text
src/cli/run.ts               rutas de estado, memoria por receta, identificador de cliente
src/cli/doctor.ts            la ruta del registro, por la misma función
src/state/runs.ts            crea su directorio padre
src/state/seen.ts            crea su directorio padre
tests/cli/run.test.ts        el caso de H1 y las rutas exactas
tests/state/seen.test.ts     lo mismo, en su nivel
docs/03-modelo-datos.md      nombre del fichero de memoria y el ejemplo de windowDays (H4)
docs/04-decisiones-adr.md    ADR-021 (memoria por receta), y el ADR de D3 si T0 obliga a la lista
docs/05-seguridad-legal.md   A6: cómo queda mitigada de verdad, con el mecanismo del checkout
docs/arranque.md             la sección 7, con lo que la instancia resulte ser de verdad
docs/ops.md                  casillas de la fase 5
docs/bitacora.md             la entrada de esta sesión y los días del rodaje
```

**Fuera de este árbol** (repositorio privado, no se commitea aquí nada de esto): `recipes/daily/`,
`recipes/weekly/`, `.github/workflows/briefing.yml`, y los secretos.

---

## Las trampas de esta fase

1. **Fijar la herramienta a `main` en el llamador** porque "es más cómodo para iterar". Es A6 entera, y
   ADR-014 existe por ella.
2. **`cancel-in-progress: true`** copiado de `ci.yml`. En CI cancelar es correcto; aquí cancelar es
   perder un informe a medio escribir.
3. **Agrupar la concurrencia por receta.** Parece más paralelo y rompe RF-C06: dos procesos escribiendo
   `runs.ndjson` y empujando al mismo repositorio.
4. **Abortar el job en cuanto `run` devuelva distinto de cero.** Se pierde el commit del archivo y del
   registro justo en el caso en que más falta hacen.
5. **Imprimir el entorno para depurar.** Un `echo` de más y la credencial queda en un log que la
   plataforma guarda (A4). Y con el registro público del repositorio, para siempre.
6. **Rellenar valores por defecto en el workflow** cuando falte un input. Misma prohibición que en el
   código: fallar es la respuesta.
7. **Meter el nombre de la receta o el correo del dueño en el reutilizable.** El workflow vive en el
   repositorio público: RF-A02 y el `check:sin-datos-personales` aplican igual, aunque no sea `src/`.
8. **Escribir la receta semanal reusando la forma de la diaria.** Las dos recetas de forma distinta
   son la prueba viva de ADR-005; hacerlas gemelas desperdicia la única muestra real que hay.
9. **Dar por probado el rodaje en sombra con dos días buenos.** El sistema anterior también tenía
   rachas buenas: fallaba uno de cada cinco días, no cinco de cada cinco.
10. **Apagar el sistema anterior antes de tiempo.** `ops.md` lo dice con la palabra "solo".

---

## Lo que NO entra, aunque esté cerca

- **README, `README.es.md`, guías de extensión y la captura de un informe real.** Es la fase 6 entera.
- **`check:docs` (RF-A09).** Fase 6. Esta fase deja la documentación al día a mano.
- **Cronometrar la ruta del desconocido en una cuenta limpia (RF-H04).** Fase 6. Lo que esta fase hace
  es recorrerla una vez, con el dueño, que no es lo mismo que medirla con alguien que no la conoce.
- **La etiqueta `v1.0.0`.** Esta fase produce `v0.5.0` y las que necesite; la 1.0 la da
  `/pre-lanzamiento`.
- **Un fichero de bloqueo, un semáforo o cualquier mecanismo propio de exclusión.** RF-C06 se resuelve
  con el grupo de concurrencia, que es el mecanismo declarado. Construir el nuestro sería una segunda
  implementación de algo que la plataforma ya garantiza.
- **`window.memoryDays`** (H4). Solo si algún día molesta de verdad.
- **Tocar `src/render/`, `src/model/` o `src/sources/`.** Si aparece la tentación, es que algo de otra
  fase se está colando en esta. Las únicas excepciones son las tres líneas de H1, H2 y H3, que están
  nombradas una a una.
- **Un tercer proveedor, un tercer canal, una tercera receta.** Nada de eso quita un día perdido.

---

## Dónde para quien construye

1. **T0, pregunta 1.** Si no hay forma de fijar el checkout de la herramienta a la referencia exacta
   que el llamador pinó, se para: sin eso, A6 sigue abierta.
2. **T0, D3.** Si la única vía de pasar secretos obliga a una lista fija de nombres en el repositorio
   público, se vuelve al dueño antes de escribirla, porque contradice que el nombre de la variable lo
   declare la receta.
3. **T1, si el test de H1 pasa a la primera.** Entonces el diagnóstico de este plan está mal y hay que
   entender por qué antes de cambiar nada.
4. **T7, si el commit de vuelta no llega.** No se arregla empujando a mano "solo por esta vez": una
   instancia que necesita intervención manual es el sistema anterior con otro nombre.

---

## Criterio de terminada

La fase no se cierra hasta que los ocho se cumplen.

1. `pnpm test`, `typecheck`, `lint` y `build` en verde, con los tests nuevos de T1 y T3, **sin red y
   sin credenciales**. `pnpm run bateria` y `pnpm run check:receta-ejemplo` siguen verdes.
2. **El caso de H1 probado:** dos recetas sobre el mismo directorio de datos no se pisan la memoria.
3. El repositorio público tiene una **etiqueta** consumible, y el repositorio privado de la instancia
   existe con sus dos recetas, sus secretos y su workflow **fijado a esa etiqueta**.
4. `validate` ejecutado con los secretos reales **sin emitir el aviso de punto único de fallo**: hay
   dos proveedores con credencial de verdad (ADR-009).
5. **Un informe real generado por el workflow programado**, no lanzado a mano, entregado por correo, y
   con su archivo y su estado commiteados de vuelta a la instancia.
6. **Relanzar el mismo día no sobrescribe** y no ensucia el historial, y **dos ejecuciones simultáneas
   se serializan** (RF-C04 y RF-C06, observadas en la plataforma, no solo en un test).
7. **Varios días seguidos de rodaje en sombra con informe todos los días**, anotados en la bitácora, y
   el juicio del dueño de que el informe nuevo gana al anterior.
8. **El sistema anterior apagado y sus credenciales rotadas.**

Cumplidos los ocho, y **solo entonces**, se lanzan `@fiel-al-plan` y `/verifier`. `@guardarrailes` es
condicional: entra si T2 acaba tocando algo más que las rutas y el identificador de cliente.
