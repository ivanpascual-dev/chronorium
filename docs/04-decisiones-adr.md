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

**Estado:** aceptado

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
