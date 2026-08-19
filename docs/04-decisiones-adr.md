# Decisiones de arquitectura (ADR)

Un registro por decisión relevante: contexto, opciones consideradas, decisión y consecuencias.
**Este documento no se reescribe.** Si una decisión cambia, se añade un ADR nuevo que supersede al
anterior y se marca el viejo. Es el registro de por qué el proyecto es como es.

Notación de estado: `aceptado` · `superseded por ADR-NNN` · `propuesto`.

---

## ADR-001 · Reescritura desde cero, no refactor del proyecto anterior

**Estado:** aceptado

**Contexto.** Existe un Chronorium en producción desde junio de 2026, unas 3.500 líneas de
JavaScript, que entrega un briefing diario y funciona. La auditoría previa encontró que el código
está limpio (cero marcadores `TODO`/`FIXME`/`HACK`, cero bloques `catch` vacíos, módulos bien
separados) pero que **el dominio vive dentro del código**: el destinatario está escrito nueve veces
literales en el prompt, y el esquema del informe está escrito a mano en cuatro sitios distintos.

**Opciones.**

1. Refactor progresivo sobre el repositorio actual.
2. Reescritura desde cero en un repositorio nuevo.

**Decisión.** Reescritura desde cero.

**Por qué.** No hay nada que limpiar: hay que cambiar **dónde viven las decisiones**. Un refactor que
mueva el dominio del código a la configuración toca los cinco módulos, el prompt, el esquema, los dos
renderizadores y el servidor, es decir, todo. Y el proyecto actual **no tiene historial de git**, así
que un refactor no se podría revisar por partes ni revertir.

**Consecuencias.**

- El repositorio nuevo se crea **vacío**, nunca copiando el directorio actual. Así los tres secretos
  en texto plano del proyecto anterior no entran jamás en el historial.
- El proyecto anterior sigue en marcha hasta que el nuevo entregue briefings correctos varios días
  seguidos. Sin convivencia parcial: el cambio es de golpe.
- Se pierde el panel web actual (unas 1.900 líneas de frontend). Es intencionado, ver ADR-008.

---

## ADR-002 · Dos repositorios: herramienta pública, instancia privada

**Estado:** aceptado

**Contexto.** El proyecto se publica como código abierto, y a la vez su autor lo usa a diario. Su
perfil real (busca empleo, busca sus primeros clientes, qué proyectos lleva) y su archivo de
briefings son datos personales que no deben ser públicos.

**Opciones.**

1. **Un repositorio público con todo dentro.** Simple, y su receta real sirve de ejemplo vivo. A
   cambio, sus datos son públicos y el historial del repositorio del portfolio queda tapado por un
   commit de datos al día.
2. **Un repositorio público con los datos en `.gitignore`** y ficheros de ejemplo. **Descartada por
   imposible:** el workflow arranca en una máquina limpia y clona el repositorio, así que un fichero
   ignorado no existe para él. Y la mitad del diseño es commitear el estado de vuelta, que es
   justamente lo que un fichero ignorado no permite. Esta opción solo es coherente con ejecución
   local (ver ADR-003).
3. **Dos repositorios:** herramienta pública, instancia privada.

**Decisión.** Opción 3.

**Cómo funciona, porque el sentido del flujo es contraintuitivo.** El repositorio público **no se
ejecuta nunca** para el autor y no lee ningún dato suyo. El que tiene el cron y los secretos es el
privado, y este invoca a la herramienta. La relación es la de una aplicación con su librería, no la
de un servidor con su cliente.

| Repositorio público                      | Repositorio privado                                |
| ---------------------------------------- | -------------------------------------------------- |
| `src/`, el motor                         | `recipes/daily/` y `recipes/weekly/` reales        |
| `recipes/example/`, genérica y funcional | `archive/`, los briefings                          |
| el workflow reutilizable                 | `state/`, lo ya visto y el registro de ejecuciones |
| documentación, licencia, CI              | el workflow de 10 líneas y los secretos            |

**Consecuencias.**

- **La receta de ejemplo tiene que funcionar de verdad**, porque no puede apoyarse en los datos de
  nadie. Eso convierte el objetivo de arranque rápido en algo que verifica el CI, no en un buen
  propósito.
- El repositorio del portfolio conserva un historial de commits de código, sin ruido de datos.
- Coste: una ceremonia mínima para actualizar la herramienta en la instancia (ver ADR-014).

---

## ADR-003 · GitHub Actions como entorno de ejecución, no un cron alojado

**Estado:** aceptado

**Contexto.** El proyecto anterior se ejecutaba con el programador de tareas de Windows. En 49 días
produjo 38 briefings de 49: **11 días perdidos**, de los cuales 3 fueron porque la tarea no llegó a
lanzarse (equipo apagado o suspendido). Se valoró alojar la ejecución en un subdominio propio.

**Opciones.**

1. Programador local (el estado anterior).
2. **Cloudflare Workers con Cron Triggers.** Verificado en la documentación: el plan gratuito da
   **10 milisegundos de CPU por invocación**. El tiempo de espera de red no cuenta, pero **parsear
   veinte ficheros XML sí es CPU**, y no cabe. El plan de pago sube a 15 minutos de CPU para tareas
   programadas por 5 dólares al mes.
3. **Vercel Cron.** El plan Hobby corta las funciones a 60 segundos, y las ejecuciones reales
   medidas duran entre uno y cuatro minutos cuando hay reintentos.
4. **GitHub Actions.**

**Decisión.** Opción 4.

**Por qué.** Es el único que da holgura de tiempo en su plan gratuito, porque cobra por minutos de
ejecución y no por milisegundos de CPU. Además, para el desconocido el arranque es hacer un fork y
poner dos secretos, sin crear cuenta en ninguna plataforma ni desplegar nada.

**Consecuencias.**

- Se recuperan los 3 días de 11 en que la tarea no se lanzó. **Los otros 8 no los arregla esto**: 6
  son ADR-009 y 1 fue un proceso interrumpido a mitad.
- Un workflow que falla envía correo por sí solo y deja la marca en el repositorio, así que los
  fallos no necesitan canal propio (ver ADR-011).
- La instancia privada consume unos 90 minutos al mes de los 2.000 gratuitos.
- El CLI sigue siendo la primitiva: lo que el workflow ejecuta es el mismo comando que se puede
  lanzar en local, así que la ejecución local sigue funcionando sin trabajo extra.

**Riesgo asumido.** Los cron de GitHub Actions no son puntuales: pueden retrasarse en horas punta.
Para un briefing diario es irrelevante, para algo sensible a la hora no lo sería.

---

## ADR-004 · El repositorio es la base de datos

**Estado:** aceptado

**Contexto.** El sistema necesita recordar tres cosas entre ejecuciones: los briefings ya generados,
los artículos ya mostrados (para no repetirlos) y el resultado de cada ejecución.

**Opciones.**

1. SQLite en fichero. Se rompe con un runner efímero salvo que se commitee, y entonces es un binario
   que no se puede revisar en un diff.
2. Base de datos alojada (Neon, D1, Turso). Añade cuenta, esquema, migraciones y secretos.
3. Ficheros en el propio repositorio, commiteados por el workflow.

**Decisión.** Opción 3.

| Ruta                      | Contenido                                     | Formato  |
| ------------------------- | --------------------------------------------- | -------- |
| `archive/YYYY-MM-DD.json` | el briefing, dato canónico                    | JSON     |
| `archive/YYYY-MM-DD.md`   | el briefing renderizado, para leer            | Markdown |
| `state/seen.json`         | huellas de lo ya mostrado, ventana de 30 días | JSON     |
| `state/runs.ndjson`       | una línea por ejecución                       | NDJSON   |

**Por qué.** Los volúmenes son minúsculos (un briefing son unos 12 KB, 365 al año). Todo es
inspeccionable desde el navegador, diffeable y respaldado por el propio git. Y evita que el
desconocido tenga que crear una base de datos para probar la herramienta.

**Consecuencias.**

- **No puede haber dos ejecuciones simultáneas** sobre la misma instancia: el workflow declara un
  grupo de concurrencia que las serializa.
- `state/seen.json` se poda por ventana en cada ejecución, no crece indefinidamente.
- `state/runs.ndjson` sí crece, una línea al día. A 365 líneas al año es irrelevante durante años.
- Si algún día el volumen creciera (muchas recetas, muchas ejecuciones al día), esta decisión se
  revisa. Hoy no es el caso.

---

## ADR-005 · El esquema de salida se deriva de la receta en tiempo de ejecución

**Estado:** aceptado · **es la decisión central del proyecto**

**Contexto.** En el sistema anterior, las secciones del informe estaban escritas a mano en cuatro
sitios: el JSON de ejemplo dentro del prompt, la función de normalización, el renderizador de correo
y el del panel. Cambiar de dominio obligaba a editar código. Eso es lo que impide que otra persona
use la herramienta para lo suyo.

**Opciones.**

1. Secciones fijas en código, con las fuentes y los temas configurables. Es el sistema anterior.
2. Un conjunto cerrado de secciones predefinidas que la receta activa o desactiva. Más flexible, pero
   sigue sin servir para un dominio que nadie previó.
3. **La receta declara sus secciones y el código construye el esquema en tiempo de ejecución.**

**Decisión.** Opción 3.

**Mecanismo, verificado contra la documentación del SDK.** `sections.yaml` declara cada sección con
su clave, título, cardinalidad y campos. El código produce un JSON Schema en memoria y lo envuelve
con `jsonSchema()`, la función que el AI SDK expone **precisamente para esquemas dinámicos**, con una
función de validación propia. `generateObject` lo consume igual que si fuera estático.

**Consecuencias.**

- El motor no sabe nada de noticias ni de inteligencia artificial. El dominio entero vive en la
  receta.
- Los renderizadores no pueden conocer nombres de sección: renderizan cualquier informe válido a
  partir de su declaración.
- **Riesgo vivo, y es el principal del proyecto.** Que la mecánica funcione no garantiza que el
  modelo **escriba bien** para secciones que solo conoce por un fichero de configuración. Con
  secciones fijas, el prompt puede dar instrucciones muy específicas de cada una. Se prueba en la
  primera fase de construcción, contra dos recetas distintas, **antes de construir nada más**.
- **Plan de contingencia si la calidad baja:** permitir instrucciones por sección dentro de
  `sections.yaml`. Más verboso, mismo resultado, y sigue sin tocar el código.

---

## ADR-006 · Un SDK unificado de modelos en lugar de adaptadores propios

**Estado:** aceptado · la elección de `generateObject` queda superseded por ADR-017

**Contexto.** El sistema anterior tenía **tres implementaciones independientes** de la llamada a un
modelo compatible con OpenAI, **tres** de la llamada a Gemini y **tres** del mapa de proveedor a
modelo y URL base, repartidas entre el agente, el servidor y los scripts de prueba. Más una función
de parseo tolerante de JSON y otra de normalización con valores por defecto campo a campo.

**Decisión.** Usar el AI SDK de Vercel (versión 6, estable), con `generateObject`.

**Consecuencias.**

- Desaparecen las nueve implementaciones duplicadas, el parseo tolerante y la normalización manual:
  unas 150 líneas y tres puntos donde el comportamiento podía divergir.
- Cambiar de proveedor es una línea. El respaldo entre proveedores se implementa una sola vez.
- La salida llega validada contra el esquema o falla, sin campos vacíos silenciosos.
- Se acepta una dependencia que se mueve rápido. Por eso no se fija un major concreto en la
  documentación: se instala sin pin y queda congelada en el lockfile.

---

## ADR-007 · TypeScript

**Estado:** aceptado

**Contexto.** El sistema anterior es JavaScript sin comprobación de tipos ni linter. El nuevo se
apoya en contratos de extensión (lectores de fuentes, notificadores, renderizadores) que terceros
deben poder implementar.

**Decisión.** TypeScript, con `tsx` para desarrollo.

**Por qué.** En un proyecto cuya premisa es que otros lo extiendan, **los tipos son la documentación
del contrato**, y la única que no se queda desactualizada. Un lector de fuentes mal implementado
falla al compilar en vez de a las 10:00 de la mañana.

**Consecuencias.** Aparece un paso de compilación, que no existía. A cambio, la comprobación de
tipos entra en integración continua y es la primera red contra las regresiones.

---

## ADR-008 · Sin servidor y sin panel propio

**Estado:** aceptado

**Contexto.** El sistema anterior tenía un servidor Express con panel web. Su API **no pedía
credenciales en ningún endpoint** y tenía CORS abierto, de modo que cualquier página abierta en el
navegador podía reescribir la configuración (por ejemplo, apuntar el webhook a un servidor ajeno y
recibir cada briefing) y hacer peticiones a URLs arbitrarias desde el servidor.

**Opciones.**

1. Conservar el panel y protegerlo con autenticación, CSRF y validación estricta.
2. Panel de solo lectura, sin escritura de configuración.
3. **Sin panel.**

**Decisión.** Opción 3.

**Por qué.** La configuración pasa a vivir en ficheros versionados, así que no hace falta una interfaz
para editarla. Y para leer el archivo **no hay que construir nada**: los briefings se guardan también
en Markdown, y GitHub renderiza Markdown de forma nativa, incluido el móvil. El visor ya existe.

**Consecuencias.**

- Se eliminan tres dependencias completas (servidor HTTP, CORS, planificador interno) y unas 1.900
  líneas de frontend.
- Las dos vulnerabilidades del sistema anterior no se mitigan: **dejan de existir**, porque
  desaparece la superficie.
- Si algún día se quiere un sitio propio, se conecta un servicio de páginas estáticas al repositorio
  de la instancia. Queda en extensibilidad, no en la primera versión.

---

## ADR-009 · Reintento por clase de error y aviso de punto único de fallo

**Estado:** aceptado

**Contexto.** Este ADR sale del hallazgo más importante de la auditoría. El sistema anterior
reintentaba **cinco veces con espera exponencial ante cualquier excepción**, sin mirar el código de
estado. Consecuencias medidas sobre el histórico real:

- La clave del proveedor principal era el texto de ejemplo de la plantilla. La API respondía 401 y el
  sistema gastaba entre 75 y 77 segundos diarios reintentando contra un error permanente, unas 40
  veces.
- Peor: **de las siete ejecuciones fallidas, seis son el mismo fallo.** El proveedor devolvía
  `503 · high demand` y la ejecución moría con `Todos los proveedores (deepseek → gemini) fallaron`.
  La cadena aparentaba cuatro proveedores y **tenía un solo eslabón vivo**, porque el primero era un
  marcador de posición y los otros dos no tenían credenciales.
- **Con una segunda credencial válida, 6 de los 11 días perdidos habrían tenido briefing.** La
  funcionalidad que resolvía ese fallo exacto estaba escrita y bien diseñada, y no funcionó nunca.

**Decisión.** Tres reglas.

1. **Reintentar solo lo recuperable**: errores de servidor, limitación de tasa y fallos de red.
   Nunca un error de cliente que no sea limitación de tasa.
2. **Descartar al validar, no al fallar**: un proveedor sin credenciales utilizables sale de la
   cadena al arrancar, no tras cinco intentos.
3. **Contar los eslabones vivos y avisar si son uno**, nombrando la situación como punto único de
   fallo. Es la regla que habría evitado los seis días.

**Consecuencias.**

- Un marcador de posición guardado como credencial se rechaza al validar la configuración.
- El informe entregado hace constar de forma visible si lo generó un proveedor de respaldo.
- El registro de la ejecución anota qué proveedores se intentaron y por qué se descartó cada uno.

---

## ADR-010 · Los enlaces se validan en el código, no en el prompt

**Estado:** aceptado

**Contexto.** El sistema anterior confiaba en la regla número 6 de su prompt: _"NUNCA inventes
enlaces. Cópialos textualmente del campo Link de los artículos."_ Eso es una petición al modelo, no
una garantía del sistema. Nada comprobaba que el enlace devuelto estuviera entre los artículos
suministrados.

Además, todo el contenido llegaba a `innerHTML` sin escapar, tanto en el panel como en el correo. La
cadena es **fuente de terceros → modelo → HTML**, es decir, cualquiera que publique un artículo puede
intentar inyectar instrucciones o etiquetas.

**Decisión.** Cuatro medidas, todas en código y todas verificables con un test:

1. Todo enlace de la salida del modelo que no esté en el conjunto de entrada **se descarta**.
2. El contenido de las fuentes se delimita explícitamente en el prompt y se marca como no confiable.
3. La salida del modelo se restringe a la estructura declarada. No hay texto libre.
4. Todo contenido externo se escapa antes de entrar en cualquier salida HTML.

**Consecuencias.** Existe una batería de ataques repetible que se ejecuta antes de cada publicación,
con al menos: título de fuente con instrucciones de sobrescritura, título con etiquetas HTML, y
respuesta del modelo con un enlace inventado. Un fallo en cualquiera bloquea la publicación.

**Principio general que este ADR fija para el resto del proyecto:** lo que se le pide al modelo es
una preferencia; lo que impone el código es una garantía. Cualquier regla cuyo incumplimiento sea
grave se implementa en código, no en el prompt.

---

## ADR-011 · Entrega solo por correo; los demás canales, como plugin

**Estado:** aceptado

**Contexto.** El sistema anterior entregaba por correo, Telegram y webhook, con los tres cableados
dentro de una función de 247 líneas que también cargaba configuración, recogía fuentes, puntuaba,
construía el prompt y guardaba en disco. El autor apenas usa Telegram.

**Decisión.**

| Canal           | Estado                                                   |
| --------------- | -------------------------------------------------------- |
| Correo          | por defecto, es donde se lee                             |
| Telegram        | se conserva como **notificador de ejemplo**, desactivado |
| Webhook         | plugin, desactivado                                      |
| Avisos de fallo | **sin canal propio**                                     |

**Por qué Telegram se queda aunque no se use.** Es la prueba de que el contrato de notificadores
funciona. Sin un segundo notificador, "puedes añadir el tuyo" es una promesa sin demostrar. Mismo
argumento que la segunda receta respecto al esquema declarativo.

**Por qué los fallos no llevan canal propio.** El sistema anterior **sí avisaba**: el registro
muestra `Aviso de fallo enviado (email, telegram)` cinco veces. Aun así se perdieron once días. Lo
que faltaba no era el aviso, era el patrón: cinco correos sueltos de "hoy ha fallado" no suman nunca
a "llevas once días perdidos". Con el entorno de ejecución elegido, un fallo ya genera correo y marca
visible por sí solo, así que el esfuerzo se pone en lo que faltaba: **el estado agregado viaja dentro
del propio briefing**.

**Consecuencias.** Dos secretos para arrancar en lugar de cuatro. Cada secreto de más aleja el
objetivo de arranque rápido.

---

## ADR-012 · Reddit queda fuera de la primera versión

**Estado:** aceptado

**Contexto.** El sistema anterior enrutaba **cualquier URL que contuviera `reddit.com`** al camino de
autenticación OAuth, con independencia de cómo estuviera declarada la fuente. Las credenciales nunca
se rellenaron, así que esas dos fuentes fallaron en 41 ejecuciones consecutivas. Una instalación
nueva nacía con 2 de sus 8 fuentes por defecto rotas.

**Decisión.** Reddit no entra en la primera versión.

**Por qué.** Una regla del proyecto es que las recetas de fábrica funcionen **sin más credenciales
que la del modelo**. Reddit exige registrar una aplicación OAuth, lo que rompe esa regla para todos
los usuarios a cambio de dos fuentes.

**Consecuencias.** Se puede añadir después como tipo de lector opcional, con su condición: una fuente
que requiere credenciales hace fallar la validación de la receta si no están presentes, en vez de
fallar en silencio cada mañana.

**Regla general que este ADR fija:** el lector de una fuente se elige por **el tipo declarado en la
receta**, jamás inspeccionando su URL. Esa inspección fue la causa raíz aquí.

---

## ADR-013 · El archivo anterior se importa tal cual, con marca de versión

**Estado:** superseded por ADR-019

**Contexto.** Existen 45 briefings del sistema anterior. Siete de ellos son de un formato de boletín
semanal previo a junio de 2026, con campos que ya no existen.

**Opciones.** Empezar en limpio · convertirlos al esquema nuevo · importarlos tal cual.

**Decisión.** Importarlos tal cual, cada uno con una marca de versión de esquema, y que el lector del
archivo tolere ambos formatos.

**Por qué.** Reescribir datos reales para que encajen en un esquema nuevo es la clase de conversión
que se hace una vez y se lamenta después. Y hay una ventaja concreta: **la receta semanal necesita
historial para producir algo**, así que con la importación funciona desde la primera semana en lugar
de esperar siete días.

---

## ADR-014 · La instancia consume la herramienta por workflow reutilizable, fijado por etiqueta

**Estado:** aceptado

**Contexto.** Con dos repositorios (ADR-002), la instancia privada necesita ejecutar código que vive
en el repositorio público.

**Opciones.** Dependencia de git en el `package.json` · clonar el repositorio dentro del workflow ·
workflow reutilizable.

**Decisión.** Workflow reutilizable, invocado desde la instancia y **fijado a una etiqueta**, no a la
rama principal.

**Por qué.** Es una función nativa de la plataforma, evita empaquetar y publicar nada, y actualizar la
herramienta no obliga a tocar la instancia. Fijar a etiqueta en vez de a la rama principal significa
que **una noche de refactor no deja sin briefing a la mañana siguiente**: la actualización es
deliberada, dos caracteres en un fichero.

**Consecuencias.** Las dos alternativas quedan como plan B documentado. El repositorio público debe
etiquetar sus versiones con disciplina, porque hay una instancia real dependiendo de ellas.

---

## ADR-015 · Sin publicación en el registro de paquetes en la primera versión

**Estado:** aceptado

**Contexto.** El camino principal de uso es hacer un fork y configurar dos secretos, no instalar un
paquete.

**Decisión.** No se publica en npm en la primera versión.

**Por qué.** Publicar añade un ciclo de versionado, una superficie de compatibilidad y una promesa
implícita de mantenimiento. El objetivo declarado del proyecto es **estar acabado, no estar vivo**.

**Consecuencias.** El binario del CLI existe y funciona dentro del repositorio, así que publicarlo más
adelante es trivial si alguna vez interesa.

---

## ADR-016 · Desviaciones respecto al camino estándar del arnés

**Estado:** aceptado

**Contexto.** El arnés de origen tiene un camino por defecto pensado para webs y tiendas de cliente:
Astro sobre Vercel o Cloudflare, Stripe, Neon con Drizzle, autenticación propia, presupuestos de
rendimiento web y criterios de carácter visual. Este proyecto no es nada de eso.

**Decisión.** Se desvía casi por completo, y se documenta aquí en bloque para no repetir el porqué en
cada ADR.

| Estándar                                          | Aquí                              | Motivo                           |
| ------------------------------------------------- | --------------------------------- | -------------------------------- |
| Astro sobre Vercel o Cloudflare                   | CLI de Node sobre un cron alojado | no hay web que servir            |
| Pasarela de pago                                  | ninguna                           | no hay dinero                    |
| Base de datos alojada con migraciones             | ficheros en el repositorio        | ver ADR-004                      |
| Autenticación propia                              | ninguna                           | no hay usuarios                  |
| Presupuestos de rendimiento web y carácter visual | no aplican                        | no hay interfaz, ver ADR-008     |
| Documentos legales de cliente                     | licencia y política de seguridad  | es código abierto, no un encargo |

**Lo que sí se aplica entero, y es lo más valioso que aporta el arnés a este proyecto:** la doctrina
de seguridad de agentes. El contenido de las fuentes es entrada hostil que va a un modelo, y eso se
trata con las mismas capas de defensa que un asistente de cara al público (ver ADR-010).

**Consecuencia para el arnés de origen:** no existe un camino por defecto para "herramienta de línea
de comandos de código abierto". Este proyecto lo estrena, y el aprendizaje vuelve al arnés cuando se
entregue.

---

## ADR-017 · `generateText` con `Output.object`, no `generateObject`

**Estado:** aceptado · supersede parcialmente a ADR-006

**Contexto.** ADR-006 fijó `generateObject` para generación estructurada. Al construir la fase 1 se
verificó el identificador y la forma de uso contra la documentación de ese día (ai-sdk.dev, agosto de
2026), no de memoria, tal como exige la constitución antes de fijar nada de un proveedor externo. La
comprobación mostró que `generateObject` y `streamObject` están **deprecados** desde la guía de
migración de la v6 del SDK, con aviso explícito de que se eliminarán en una versión futura. La
documentación de test oficial (`ai/test`, `MockLanguageModelV4`) ya solo cubre el patrón
`generateText` con `output: Output.object({ schema })`. El paquete instalado es `ai@7.0.55`: la
función deprecada sigue funcionando hoy, no es un bloqueo, pero fase 1 nacería apoyada en algo
marcado para desaparecer.

**Decisión.** `src/model/client.ts` usa `generateText` con `output: Output.object({ schema })`, no
`generateObject`.

**Por qué.** La documentación vigente y las utilidades de test oficiales ya asumen el patrón nuevo.
Adoptar la función deprecada el primer día es deuda conocida de entrada, evitable sin coste: la
envoltura del esquema con `jsonSchema()` (ADR-005) no cambia, solo cambia la función que la consume.

**Consecuencias.**

- El resultado se lee en `result.output`, no en `result.object`.
- El doble de proveedor para tests (RF-H03) se construye con `MockLanguageModelV4` de `ai/test`.
- Si una versión futura del SDK elimina `generateObject`, este proyecto no se ve afectado.

---

## ADR-018 · El segundo proveedor de ejemplo es `gpt-5.6-luna`, servido por el paquete oficial `@ai-sdk/openai`

**Estado:** aceptado

**Contexto.** El plan de la fase 3 fijaba `@ai-sdk/openai-compatible` como mecanismo genérico de
segundo eslabón (ADR de la propia fase 3, no reescrito aquí) y sugería DeepSeek, Groq, OpenRouter o un
modelo local como ejemplo. T0 verificó que DeepSeek no ofrece `json_schema` estricto y eligió Groq
(`openai/gpt-oss-20b`), que sí lo documenta. Ese cambio ya quedó escrito en la bitácora del
2026-08-08, dentro de lo que el propio plan preveía: "si no aguanta, se para y se cambia a un
proveedor concreto".

Lo que el plan no preveía es lo que salió de T14, con red y credenciales reales, el 2026-08-09:

1. **Groq rechazó el informe completo.** Con `caps.maxItems: 60` (~22.000 tokens de entrada), la
   petición choca contra el límite gratuito de 8.000 tokens por minuto de Groq. No es un fallo de
   diseño, es una cuota que ningún doble (`MockLanguageModelV4`) puede reproducir, porque depende del
   tamaño real del informe, no de la forma de la llamada.
2. **`gpt-5.6-luna` (OpenAI) exige una convención de llamada distinta.** Sus modelos de razonamiento
   rechazan `max_tokens` (piden `max_completion_tokens`) y cualquier `temperature` fuera de la suya
   por defecto.

**Por qué el modelo.** El dueño comparó un informe real de cada proveedor tras corregir el fallo de
`supportsStructuredOutputs` (ver bitácora): coste menor de un centavo por informe en ambos, y calidad
igual o mejor en Luna sobre la única muestra comparada (más elementos cubiertos, acciones más
concretas, mejor alineación con la persona). No es una medición estadística, es una decisión de
producto tomada con datos reales en lugar de con la lista de nombres que traía el plan.

**Primera implementación, y por qué se corrigió antes de cerrar la fase.** La primera versión servía
`gpt-5.6-luna` a través del conector genérico `openai-compatible`, con dos campos nuevos en
`ProviderSpec` (`reasoningModel: boolean`, `reasoningEffort`) y una función,
`reasoningModelBody(body, reasoningEffort)`, que traducía a mano `max_tokens`→`max_completion_tokens`
y quitaba `temperature` antes de mandar la petición. Funcionaba y estaba probada (7 tests), pero era
mantener por cuenta propia una traducción de parámetros que **el paquete oficial `@ai-sdk/openai` ya
resuelve**: verificado contra su código fuente (no solo su documentación) que la Responses API
(`openai(modelId).responses`) traduce `max_tokens` automáticamente y omite `temperature` para modelos
de razonamiento salvo que se pida `reasoningEffort: 'none'`, exactamente el comportamiento que el
proyecto reimplementaba. Revisado esto antes de comitear nada de la fase, se sustituyó por la
dependencia oficial.

**Opciones para declarar el esfuerzo de razonamiento.**

1. Detectar la convención de razonamiento inspeccionando el identificador del modelo (`spec.id`).
   Descartada: es exactamente D-03/ADR-012, elegir comportamiento por inspección de un valor en vez
   de por lo declarado en la receta.
2. **Un solo campo opcional, `reasoningEffort`, en `ProviderSpec`**, con efecto cuando
   `provider: 'openai'`. El resto de la convención de llamada la resuelve el paquete oficial sin que
   el proyecto lo declare.

**Decisión.** Opción 2. `providers.ts` gana una tercera entrada de fábrica, `openai`
(`@ai-sdk/openai`, `defaultApiKeyEnv: 'OPENAI_API_KEY'`), que construye el modelo con
`createOpenAI({ apiKey }).responses(spec.id)`. Como `reasoningEffort` solo tiene efecto pasado como
`providerOptions` **en la llamada** (`generateText`), no al construir el modelo, y el contrato
`ProviderFactory.create(spec, apiKey): Promise<LanguageModel>` no expone ningún sitio para eso sin que
`client.ts`/`chain.ts` tuvieran que conocer detalles de proveedor, se usa `wrapLanguageModel` +
`defaultSettingsMiddleware` (ambos de `ai`, ya dependencia del proyecto) para fijarlo como valor por
defecto de esa instancia de modelo. Es el mecanismo que la propia documentación de AI SDK describe
para este caso exacto.

`openai-compatible` **no se retira**: se queda registrada como vía genérica declarada para quien
prefiera otro proveedor remoto compatible (DeepSeek, Groq, OpenRouter) o un modelo local, sin que el
código lo sepa. Deja de ser el mecanismo del ejemplo documentado, pero sigue siendo una opción válida
de la cadena.

**Extensión: el mismo campo también traduce a Gemini.** Verificado contra ai-sdk.dev: Gemini 3 y
posteriores aceptan `providerOptions.google.thinkingConfig.thinkingLevel`, con los mismos cuatro
valores (`minimal | low | medium | high`) que ya tenía `reasoningEffort` (Gemini 2.5 usaría
`thinkingBudget` en tokens en su lugar; no aplica a `gemini-3.6-flash`, el modelo que declara este
proyecto). En vez de inventar un segundo campo (`thinkingLevel`) para decir lo mismo con otro nombre,
`reasoningEffort` pasa a interpretarse también con `provider: 'google'`: es el mismo campo de dominio
("cuánto debe razonar el modelo"), traducido distinto por proveedor en `providers.ts`
(`openAiReasoningOptions`, `googleReasoningOptions`), sin que quien escribe la receta tenga que saber
el nombre que le da cada API.

**Consecuencias.**

- `ProviderSpec` pierde `reasoningModel: boolean` (ya no hace falta: `reasoningEffort` expresa la
  intención por sí solo, y solo tiene efecto con `provider: 'openai'` o `'google'`). Se queda con
  `reasoningEffort?: ReasoningEffort`.
- Desaparece `reasoningModelBody` y sus 4 tests de traducción manual; los sustituyen tests que
  confirman que las tres entradas del registro (`google`, `openai`, `openai-compatible`) siguen
  eligiéndose solo por nombre (D-03), y que `openAiReasoningOptions`/`googleReasoningOptions` traducen
  el mismo valor a la forma exacta que cada API espera.
- `recipes/example` (comentario, en el eslabón principal `google` y en el de respaldo `openai`) y la
  fixture biotech (activo, con valores distintos en cada eslabón a propósito) declaran
  `reasoningEffort`. Ninguno necesita `baseUrl` salvo `openai-compatible`.
- Groq no queda en ningún fichero de producción.
- Si `client.ts` sigue mandando `temperature` en la llamada para un modelo de razonamiento con
  `reasoningEffort` distinto de `'none'`, el SDK de OpenAI ya no lo rechaza: lo omite y añade un aviso
  de tipo `unsupported` en `result.warnings`. No es un error, es el mismo comportamiento que antes
  forzaba `reasoningModelBody` a mano; queda anotado por si algún día se decide registrar esos avisos.
- `recipe/validate.ts` valida el tipo de `reasoningEffort` para cualquier `provider`, sin restringirlo
  a `openai`/`google` (mismo criterio que ya usa con `baseUrl` en ese validador): si se declara en
  `openai-compatible`, valida pero no tiene efecto, porque ese conector no lo interpreta.

---

## ADR-019 · El archivo nace vacío. No se importan los 45 informes anteriores

**Estado:** aceptado · supersede a ADR-013

**Contexto.** ADR-013 decidió importar los 45 briefings del sistema anterior tal cual, con marca de
versión de esquema, para que la receta semanal (que destila el archivo diario) tuviera historial
desde el primer día. Al planificar la fase 4, con el escritor del archivo por construir de verdad, el
dueño decidió lo contrario: prefiere que todo lo que exista en su instancia lo haya generado este
proyecto, sin arrastrar datos del sistema que se está reemplazando.

**Decisión.** No se construye ningún conversor ni importador. El archivo de cada instancia empieza
vacío el día que se activa esta herramienta.

**Consecuencias, que hay que asumir por escrito porque ADR-013 ya las había resuelto:**

1. **La receta semanal nace sin historial.** Era el argumento concreto de ADR-013: con la importación
   funciona desde la primera semana en vez de esperar siete días. Sin ella, el primer resumen semanal
   saldrá pobre o vacío hasta que el archivo propio acumule varios días de informes diarios.
2. **`extractSchemaV1` de `src/sources/archive.ts` se queda sin ningún productor real.** No se retira:
   `RF-C05` sigue vigente (el lector del archivo tolera formatos anteriores identificados por su marca
   de versión, y el salto de `schemaVersion` 2 a 3 ocurrirá algún día), y ya está construido y probado.
   Lo que cambia es que deja de haber datos de la versión 1 en el mundo real; queda anotado aquí para
   que nadie los busque ni interprete su presencia en el código como una importación pendiente.

**Por qué no es una regresión.** El coste (una semana de resumen pobre) es pequeño y se paga una sola
vez por instancia nueva. El beneficio es no mezclar en el historial de la herramienta datos generados
por un sistema que ya no existe, y que su formato o su tono no coincidan con lo que esta herramienta
produce.

---

## ADR-020 · Entrega de correo por SMTP con `nodemailer`, y el webhook entra desactivado

**Estado:** aceptado

**Contexto.** La fase 4 necesita un notificador de correo. `docs/02-arquitectura.md` promete tres
canales (correo, Telegram, webhook); D1 (decisión tomada con el dueño antes de escribir el plan de la
fase) fija SMTP en vez de una API HTTP de envío (Resend y similares, que habría sido cero
dependencias): el dueño usa Gmail y quiere seguir usándolo, con contraseña de aplicación.

**Auditoría de `nodemailer` (`@dependency-audit`, 2026-08-09), lo que decide, no el recuento de
dependencias.** `nodemailer@9.0.5`: cero dependencias de ejecución, licencia `MIT-0`,
`engines.node >= 6` (sin conflicto con el `>=24.0.0` de este proyecto). `@types/nodemailer@8.0.1`:
única dependencia `@types/node`, ya presente.

Dos patrones reales encontrados, ninguno al nivel del precedente que paró la fase 2
(`fast-xml-parser`: tres arreglos incompletos sobre el mismo bug en dos semanas, más siete
subdependencias nuevas de un único mantenedor):

1. **Inyección en cabeceras MIME vía CRLF, con parches repetidos sobre el mismo mecanismo** entre las
   versiones 8.0.5 y 9.0.5 (`GHSA-268h-hp4c-crq3`, `GHSA-vvjj-xcjg-gr5g`, y varios endurecimientos más
   en la serie 9.0.1-9.0.5): caracteres de control en cabeceras, IDs de mensaje, direcciones,
   etiquetas DKIM. Todos corregidos en la versión que se instala hoy, pero es exactamente el mecanismo
   que este proyecto trata como amenaza real (R1: el contenido de las fuentes, y lo que el modelo
   sintetiza a partir de él, es entrada hostil).
2. **Bypass repetido de `disableFileAccess`/`disableUrlAccess`** por dos rutas de código distintas en
   tres semanas (`GHSA-wqvq-jvpq-h66f`, `GHSA-p6gq-j5cr-w38f`). No aplica si el proyecto no usa `raw`
   ni `jsonTransport`, que es la decisión que se toma aquí.
3. Mantenimiento: un solo mantenedor con permisos de publicación, pero activo (última publicación dos
   días antes de esta auditoría, un solo issue abierto sobre 17.6k estrellas). No es un patrón de
   abandono.

**Decisión.** Instalar `nodemailer` y `@types/nodemailer`, sin pin de major (se instalan sin fijar
versión y quedan congelados en el lockfile, igual que el resto de dependencias que se mueven rápido).
Con tres garantías de código, no de configuración, coherentes con R2:

1. **Nunca se usan las opciones `raw` a nivel de mensaje ni `jsonTransport`.** Es la superficie de los
   dos bypasses de la amenaza 2, y este proyecto no tiene ningún caso de uso que las necesite.
2. **Todo campo derivado de la receta o del informe que llegue a una cabecera de correo (`subject`,
   nombre de remitente) se sanea contra `\r`, `\n` y `\0` en `src/deliver/email.ts` antes de pasarlo a
   `nodemailer`**, en vez de confiar solo en el saneado interno de la librería. Es la misma doctrina
   que ya aplica a los enlaces (ADR-010): lo que impone el código es una garantía, lo que corrige una
   librería de terceros es una capa adicional, no la única.
3. **Ningún error propagado por el notificador de correo puede contener el valor de una credencial.**
   `nodemailer` no ecoa la contraseña en sus errores de `EAUTH` (la respuesta SMTP de fallo de
   autenticación no la incluye), pero el mensaje de error sí puede incluir el usuario y, según el
   servidor, fragmentos de la configuración de conexión. El notificador sustituye cualquier valor de
   secreto conocido (`ctx.secret(...)`) que aparezca en el mensaje de error antes de devolverlo, no
   confía en que la librería o el servidor remoto nunca lo incluyan.

**Transporte genérico, no el atajo `service: 'gmail'`.** La documentación de `nodemailer` ofrece un
atajo (`service: 'gmail'`) que preconfigura host, puerto y TLS. Se descarta a favor de la
configuración SMTP explícita (`host`, `port`, `secure`, `auth.user`, `auth.pass`, los cuatro leídos de
`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASSWORD`) porque el notificador no debe conocer que el
operador usa Gmail: cualquier proveedor SMTP (Gmail, Fastmail, un servidor propio) se declara con los
mismos cuatro secretos, sin una rama de código dedicada a uno concreto.

**Webhook entra desactivado, como tercer notificador.** `docs/02-arquitectura.md` promete tres
notificadores; con SMTP y Telegram (ADR-011) ya cubiertos, un tercero con forma deliberadamente
distinta (POST crudo, sin credencial, con el `fetch` que ya trae el entorno) demuestra que el contrato
`Notifier` funciona con tres formas de entrega distintas: una con credencial de aplicación (correo),
una con credencial de bot (Telegram) y una sin ninguna (webhook). Mismo argumento que ADR-011 usa para
justificar que Telegram se quede aunque no se use.

**Consecuencias.**

- `package.json` gana `nodemailer` y `@types/nodemailer` (desarrollo).
- Ningún fichero de `src/deliver/` usa `raw` ni `jsonTransport`.
- `tests/deliver/email.test.ts` incluye el caso de un error de SMTP simulado cuyo mensaje contiene
  usuario y contraseña, y comprueba que ninguno de los dos llega al resultado que el orquestador anota
  en `runs.ndjson` ni al informe.

---

## ADR-021 · La memoria de lo ya mostrado es por receta; el registro de ejecuciones sigue siendo por instancia

**Estado:** aceptado

**Contexto.** Planificando la fase 5 (ejecución programada), con dos recetas reales por primera vez
sobre la misma instancia (la diaria y un resumen semanal que la destila por la fuente `archive`), se
encontró H1: `state/seen.json` es un único fichero por instancia, sin distinguir qué receta marcó cada
huella. La semanal lee, por la fuente `archive`, los informes que la propia diaria ya publicó; esos
elementos llevan la misma url y el mismo título que la diaria ya marcó como vistos, así que
`runPipeline` los descarta enteros en su filtro de memoria. Resultado: la receta semanal vería cero
elementos supervivientes cada vez que se ejecutara, sobre el camino nominal, no un caso límite.

**Decisión.** La memoria de lo ya mostrado pasa a ser un fichero por receta:
`state/seen--<receta>.json`, con el mismo criterio de nombre que ya usa el archivo
(`YYYY-MM-DD--<receta>.json`, `docs/03-modelo-datos.md`) y por el mismo motivo: dos recetas escriben
en la misma instancia y no pueden pisarse. `state/runs.ndjson` **no se toca**: sigue siendo un único
fichero para todas las recetas de la instancia. `readHealth` ya filtra por receta (fase 4), y un
registro único es lo que responde "¿cuántos días hubo informe?" para toda la instancia sin comparar
ficheros (RF-G04).

Una sola función compone las dos rutas (`statePaths(dataRoot, recipe)` en `src/state/paths.ts`, R10):
`cli/run.ts` y `cli/doctor.ts` la consumen, y ninguno de los dos vuelve a decidir por su cuenta dónde
vive cada fichero.

**Alternativas consideradas y por qué no:**

1. **Un campo en la receta para desactivar la memoria** (`memory: false` en la semanal). Mete en el
   dominio una decisión que es del mecanismo: la semanal sí quiere memoria, quiere la suya, para no
   repetir en el resumen del lunes lo que ya resumió el lunes anterior.
2. **Que la fuente `archive` marque sus elementos como exentos de memoria.** Sería el lector
   decidiendo sobre la memoria: dos capas conociéndose que hoy no se conocen.
3. **Mantener un solo fichero y filtrar por receta dentro.** Es la opción 1 con más pasos, y además deja
   que una receta pueda podar (por `windowDays`) la memoria de otra al guardar con su propia ventana.

**Consecuencia que hay que asumir por escrito.** La receta semanal repetirá enlaces que ya salieron en
la diaria, y eso es lo que se quiere: un resumen semanal que solo pudiera hablar de lo que la diaria no
contó no sería un resumen, sería una segunda diaria.

**Consecuencias de código:**

- `src/state/paths.ts` (nuevo): `statePaths(dataRoot, recipe)` devuelve `seenPath` y `runsPath`.
- `src/cli/run.ts` y `src/cli/doctor.ts` dejan de componer las rutas de estado a mano y consumen
  `statePaths`.
- `src/state/runs.ts` (`appendRun`) y `src/state/seen.ts` (`saveSeen`) crean su directorio padre si
  falta: `state/` es ahora un subdirectorio, y una instancia recién clonada no lo trae (git no
  versiona directorios vacíos).
- `docs/03-modelo-datos.md` documenta `state/seen--<receta>.json` en vez de `state/seen.json`.

---

## ADR-022 · El tope de tokens de salida es un campo de la receta, y el fallo por corte de salida dice su motivo real

**Estado:** aceptado

**Contexto.** La receta "weekly" (destila varias diarias vía una fuente `archive`) falló el
2026-08-17 con `model_failed` (código 3): los dos proveedores de la cadena terminaron con el mismo
mensaje inútil, "No output generated.", del AI SDK. `client.ts` usa `generateText` + `Output.object`
(ADR-017): cuando `finishReason` no es `"stop"` (aquí, `"length"`, tokens de salida agotados a mitad
del JSON), el getter `result.output` lanza ese mensaje genérico sin decir el motivo. El tope de
tokens de salida vivía como una única constante en `client.ts`, igual para cualquier receta, y la
semanal recolecta bastantes más elementos que una diaria corriente.

**Decisión.** Dos cambios:

1. `model.maxOutputTokens` pasa a ser un campo opcional de la receta (`ModelConfig`). Cuántos
   tokens de salida hacen falta depende del tamaño de esa receta en concreto (elementos de entrada,
   secciones a rellenar), no del mecanismo que llama al modelo: es la regla central del proyecto
   ("si pertenece al dominio, va en la receta"). Ausente, sigue el valor por defecto de `client.ts`.
2. `client.ts` intercepta `finishReason !== 'stop'` antes de tocar el getter que lanza el error
   genérico, y guarda el motivo real (`finishReason` y tokens de salida usados) para que
   `runs.ndjson` distinga "se acabaron los tokens" de "el proveedor rechazó la petición" (R9,
   RF-G05).

**Por qué entra por ADR.** El plan de fase 5 (`docs/plans/fase-5-ejecucion-programada.md`) prohibía
tocar `src/model/` salvo las tres líneas nombradas de H1, H2 y H3. Este cambio nace de un incidente
real de producción (el primer lunes con cron activo) y no es ninguna de esas tres, así que amplía el
blueprint vigente y necesita su propia decisión registrada, no una nota suelta en la bitácora.

**Alternativas consideradas y por qué no:**

1. **Subir la constante fija de `client.ts`** para cubrir el peor caso conocido (la semanal).
   Descartada: el tamaño de la receta es justo el tipo de decisión que la constitución manda sacar
   del mecanismo, y una constante subida a mano para el peor caso de hoy vuelve a fallar el día que
   otra receta sea más grande.
2. **Dejar el mensaje genérico del SDK y confiar solo en el reintento existente.** Descartada:
   reintentar contra un presupuesto de tokens insuficiente sin subirlo repite el mismo fallo
   indefinidamente, y el registro seguiría sin decir el motivo real, contradiciendo R9
   directamente.

**Consecuencias de código:**

- `src/recipe/types.ts`: `ModelConfig.maxOutputTokens?: number`, común a todos los eslabones de la
  cadena (no varía por proveedor, a diferencia de `reasoningEffort`).
- `src/recipe/validate.ts`: rechaza el campo si está presente y no es un entero mayor que cero.
- `src/model/synthesize.ts`: pasa el valor a `generateReport` solo si la receta lo declara.
- `src/model/client.ts`: intercepta `finishReason !== 'stop'` con un mensaje que incluye el motivo
  y los tokens de salida usados.
- `recipes/example/recipe.yaml`: comentario que documenta el campo, sin activarlo.

**Deuda declarada.** La hipótesis (agotamiento de tokens de salida, `finishReason: "length"`) no
quedó confirmada al 100% sobre el incidente real del 17: el registro de esa ejecución no guardaba
el dato porque el mensaje genérico no lo exponía. Se confirma con la siguiente ejecución programada
de la receta semanal (2026-08-24).
