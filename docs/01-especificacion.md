# Especificación de requisitos

Criterios de aceptación en notación EARS. Cada requisito tiene un disparador y un comportamiento
**medible**. Un requisito que no se pueda comprobar con un test o un comando no es un requisito, es
un deseo.

## Chuleta de notación

| Patrón     | Forma                                                                  |
| ---------- | ---------------------------------------------------------------------- |
| Ubicuo     | El sistema **deberá** `<respuesta>`                                    |
| Por evento | **CUANDO** `<disparador>`, el sistema **deberá** `<respuesta>`         |
| Por estado | **MIENTRAS** `<estado>`, el sistema **deberá** `<respuesta>`           |
| No deseado | **SI** `<condición>`, **ENTONCES** el sistema **deberá** `<respuesta>` |
| Opcional   | **DONDE** `<característica>`, el sistema **deberá** `<respuesta>`      |

**Glosario.** _Receta_: carpeta que define un agente concreto (fuentes, temas, secciones, persona).
_Informe_: la salida de una ejecución. _Elemento_: un artículo, lanzamiento o repositorio recogido de
una fuente. _Instancia_: el repositorio privado que ejecuta la herramienta con datos reales.

---

## A · Recetas y configuración

**RF-A01** (ubicuo) · El sistema **deberá** componer el prompt completo (identidad, destinatario,
misión y reglas) a partir de la receta activa.

**RF-A02** (ubicuo) · El código fuente del sistema **no deberá** contener ningún nombre de persona,
dirección de correo, profesión ni contexto personal de ningún usuario.

> _Criterio:_ una búsqueda de los nombres propios del autor y de sus proyectos sobre `src/` no
> devuelve coincidencias. **Se comprueba en integración continua**, no a ojo.

**RF-A03** (ubicuo) · El sistema **deberá** derivar el esquema de salida del informe de la declaración
de secciones de la receta activa, construyendo en tiempo de ejecución el esquema de validación que se
le exige al modelo.

**RF-A04** (ubicuo) · El sistema **deberá** producir cualquier informe declarado en una receta válida
sin que su código conozca de antemano los nombres de las secciones.

> _Criterio de aceptación, el que decide si el proyecto tiene sentido:_ añadir una sección nueva a una
> receta produce esa sección en el informe, en el correo y en el archivo, **sin modificar ningún
> fichero de `src/`**.

**RF-A05** (por evento) · **CUANDO** se cargue una receta, el sistema **deberá** validarla por
completo (secciones, fuentes, entrega, credenciales requeridas) y **rechazarla con un error que
nombre el campo concreto** antes de ejecutar nada.

**RF-A06** (no deseado) · **SI** un fichero de configuración está corrupto o no se puede leer,
**ENTONCES** el sistema **deberá** terminar con error, y **nunca** continuar en silencio con valores
por defecto.

**RF-A07** (ubicuo) · El sistema **deberá** resolver las rutas de sus datos y recetas de forma
explícita, independiente del directorio de trabajo desde el que se invoca.

**RF-A08** (ubicuo) · La declaración del perfil del usuario dentro de una receta **deberá** ir
acompañada de instrucciones que adviertan de que su contenido se interpreta literalmente para decidir
qué se recomienda, y pedir la situación real y actual en lugar de una descripción aspiracional.

> _Por qué existe este requisito:_ el usuario cero describió su propio perfil como lo que su negocio
> aspira a ser, el agente lo tomó al pie de la letra, y el resultado fue un mes de recomendaciones
> dirigidas a un director de empresa con empleados que no existe. Si el autor calibró mal su perfil,
> un desconocido lo calibrará peor.

**RF-A09** (ubicuo) · Los valores por defecto, las variables de entorno y las fuentes que aparecen en
la documentación **deberán** verificarse contra el código en integración continua, de modo que una
divergencia rompa la construcción.

**RF-A10** (ubicuo) · El proyecto **deberá** declarar la versión de entorno de ejecución que soporta
en un único sitio, consumido por la documentación, el empaquetado y la integración continua.

---

## B · Recolección de fuentes

**RF-B01** (ubicuo) · El sistema **deberá** seleccionar el lector de una fuente por **el tipo
declarado en la receta**, y nunca por inspección de su URL.

**RF-B02** (ubicuo) · El sistema **deberá** soportar cinco tipos de lector: canal de sindicación, API
de datos, búsqueda de repositorios, **lanzamientos de repositorio** y **archivo propio**.

**RF-B03** (por evento) · **CUANDO** una fuente declare un tipo que requiere credenciales y esas
credenciales no estén presentes, el sistema **deberá** rechazar la receta al validarla.

**RF-B04** (ubicuo) · Las recetas que se distribuyen con el proyecto **deberán** funcionar sin
ninguna credencial más allá de la del proveedor de modelo.

**RF-B05** (no deseado) · **SI** una fuente falla o agota su tiempo de espera, **ENTONCES** el sistema
**deberá** registrar el fallo de esa fuente, continuar con las demás y hacer constar el resultado por
fuente en el registro de la ejecución.

**RF-B06** (ubicuo) · El sistema **deberá** limitar la aportación de una sola fuente a un porcentaje
máximo del total de elementos, configurable en la receta.

> _Por qué:_ en el sistema anterior, una fuente generalista aportó 26 de 67 elementos, el 39%.

**RF-B07** (no deseado) · **SI** un elemento no tiene fecha de publicación válida, **ENTONCES** el
sistema **deberá** tratarlo como de fecha desconocida y **no asignarle puntuación de recencia**.

> _Por qué:_ el sistema anterior le asignaba la hora actual, con lo que el artículo peor formado
> obtenía la puntuación máxima y reaparecía todos los días.

**RF-B08** (ubicuo) · El sistema **deberá** identificarse ante las fuentes con un identificador de
cliente propio del proyecto, sin suplantar a un navegador ni incluir datos personales.

---

## C · Memoria entre ejecuciones

**RF-C01** (ubicuo) · El sistema **deberá** mantener un registro persistente de los elementos ya
incluidos en informes anteriores y excluirlos de los siguientes.

**RF-C02** (ubicuo) · La ventana de retención de ese registro **deberá** ser configurable, y el
sistema **deberá** podarlo en cada ejecución para que no crezca sin límite.

**RF-C03** (ubicuo) · El sistema **deberá** deduplicar los elementos de una misma ejecución por
dirección y por título normalizado.

**RF-C04** (por evento) · **CUANDO** ya exista un informe para la fecha de la ejecución en curso, el
sistema **deberá** conservar el anterior en lugar de sobrescribirlo.

**RF-C05** (ubicuo) · El sistema **deberá** poder leer informes archivados en formatos de versiones
anteriores del esquema, identificados por su marca de versión.

**RF-C06** (por estado) · **MIENTRAS** una ejecución esté en curso sobre una instancia, el sistema
**deberá** impedir que arranque otra sobre la misma instancia.

---

## D · Síntesis con el modelo

**RF-D01** (ubicuo) · El sistema **deberá** obtener del modelo una salida que valide contra el esquema
derivado de la receta, o fallar. **No deberá** rellenar campos ausentes con valores por defecto
silenciosos.

**RF-D02** (no deseado) · **SI** la llamada al modelo falla con un error de cliente distinto de
limitación de tasa, **ENTONCES** el sistema **deberá** abandonar ese proveedor de inmediato, sin
reintentar.

**RF-D03** (ubicuo) · El sistema **deberá** reintentar únicamente ante errores de servidor, limitación
de tasa y fallos de red.

**RF-D04** (por evento) · **CUANDO** se valide la configuración, el sistema **deberá** contar los
proveedores con credenciales utilizables y **advertir explícitamente si el recuento es uno**,
nombrando la situación como punto único de fallo.

> _Criterio:_ con una sola credencial válida, el arranque emite la advertencia; con dos, no la emite.
> Verificable en test, sin red.
> _Por qué:_ seis de los once días perdidos del sistema anterior fueron una caída temporal del único
> proveedor vivo de una cadena que aparentaba tener cuatro.

**RF-D05** (por evento) · **CUANDO** se valide la configuración, **SI** el valor de una credencial
coincide con un marcador de posición documentado, **ENTONCES** el sistema **deberá** rechazarla.

**RF-D06** (ubicuo) · El sistema **deberá** agotar la cadena de proveedores antes de darse por
vencido, y anotar en el registro cuáles se intentaron y por qué se descartó cada uno.

**RF-D07** (por evento) · **CUANDO** el informe se genere con un proveedor distinto del principal, el
sistema **deberá** hacerlo constar de forma visible **en el propio informe entregado**, no solo en el
registro.

**RF-D08** (ubicuo) · El sistema **deberá** puntuar los elementos por recencia y por coincidencia con
los temas de la receta, con los pesos declarados en la receta, y limitar el número enviado al modelo.

---

## E · Seguridad

El contenido de las fuentes es **entrada hostil**: cualquiera puede publicar un artículo cuyo título
contenga instrucciones o etiquetas. La cadena es fuente de terceros → modelo → salida.

**RF-E01** (ubicuo) · El sistema **deberá** delimitar explícitamente el contenido de las fuentes
dentro del prompt y marcarlo como no confiable.

**RF-E02** (ubicuo) · El sistema **deberá** restringir la salida del modelo a la estructura declarada,
sin admitir texto libre fuera de ella.

**RF-E03** (ubicuo) · El sistema **deberá** descartar todo enlace presente en la salida del modelo que
no aparezca en el conjunto de elementos suministrado como entrada.

> _Por qué:_ en el sistema anterior esto era la regla número 6 de un prompt, es decir, una petición al
> modelo. Aquí es una comprobación del código.

**RF-E04** (ubicuo) · El sistema **deberá** escapar todo contenido procedente de una fuente externa o
del modelo antes de insertarlo en cualquier salida con marcado.

**RF-E05** (ubicuo) · El sistema **deberá** leer los secretos exclusivamente del entorno, con una
única fuente de verdad, y **no deberá** existir ningún fichero de secretos dentro del árbol del
proyecto.

**RF-E06** (ubicuo) · El sistema **no deberá** exponer ninguna interfaz de red, ni de lectura ni de
escritura.

**RF-E07** (ubicuo) · El proyecto **deberá** incluir una batería de ataques repetible, ejecutable
antes de cada publicación, que cubra como mínimo: título de fuente con instrucciones de sobrescritura
del prompt, título con etiquetas de marcado, respuesta del modelo con un enlace inventado, y respuesta
del modelo que no valida contra el esquema.

> _Criterio:_ un fallo en cualquiera de los casos **bloquea la publicación**.

---

## F · Renderizado y entrega

**RF-F01** (ubicuo) · El sistema **deberá** producir el informe en tres formatos desde un mismo
objeto: datos estructurados, texto con marcado ligero y correo.

**RF-F02** (ubicuo) · El formato de texto con marcado ligero **deberá** ser autocontenido y legible
tal cual, apto para pegarse en otra herramienta conversacional sin edición previa.

> _Por qué:_ el uso real del usuario cero es leer el informe y pasar a otra IA lo que quiere
> profundizar. Ese paso existe hoy y se hace copiando y pegando a mano.

**RF-F03** (ubicuo) · El sistema **deberá** entregar el informe por los canales declarados en la
receta, cada uno tras un contrato común, de modo que añadir un canal no requiera modificar el
orquestador.

**RF-F04** (no deseado) · **SI** un canal de entrega falla, **ENTONCES** el sistema **deberá** intentar
los canales restantes, registrar el fallo y terminar con un estado que refleje la entrega parcial.

**RF-F05** (ubicuo) · El sistema **deberá** omitir del informe las secciones que no tengan contenido
en esa ejecución.

> _Por qué:_ es lo que permite declarar seis secciones sin romper el presupuesto de lectura de dos o
> tres minutos. Una sección de lanzamientos de tecnología solo tiene contenido un par de veces por
> semana.

**RF-F06** (ubicuo) · Cada capacidad del sistema (llamada al modelo, resolución de proveedor, entrega
por un canal, renderizado de un formato) **deberá** tener una única implementación, consumida por
igual desde el flujo principal, las herramientas de diagnóstico y los tests.

---

## G · Observabilidad y fallos

**RF-G01** (no deseado) · **SI** la recolección no produce ningún elemento, **ENTONCES** el sistema
**deberá** terminar con estado de fallo y **código de salida distinto de cero**.

> _Por qué:_ en el sistema anterior este camino devolvía nulo sin lanzar, el proceso salía con código
> cero y el registro escribía "finalizada con éxito".

**RF-G02** (no deseado) · **SI** la proporción de fuentes fallidas de una ejecución supera un umbral
configurable, **ENTONCES** el sistema **deberá** señalarlo aunque el informe se haya generado.

**RF-G03** (ubicuo) · El sistema **deberá** anotar cada ejecución en un registro persistente e
inspeccionable con: marca de tiempo, resultado por fuente, número de elementos, proveedor utilizado y
resultado final.

**RF-G04** (ubicuo) · Ese registro **deberá** permitir responder "¿cuántos días de los últimos treinta
se generó informe?" sin comparar nombres de fichero.

**RF-G05** (por estado) · **MIENTRAS** la tasa de fallo de las últimas ejecuciones supere un umbral
configurable, el sistema **deberá** marcar esa condición **dentro del informe entregado**, de modo que
la degradación se vea sin abrir ningún registro.

> _Por qué:_ el sistema anterior sí enviaba aviso de fallo, cinco veces, por dos canales. Aun así se
> perdieron once días. Lo que faltaba no era el aviso, era el patrón.

**RF-G06** (ubicuo) · Los códigos de salida del proceso **deberán** distinguir éxito, fallo de
recolección, fallo del modelo y fallo de entrega.

---

## H · Distribución y arranque

**RF-H01** (ubicuo) · El repositorio público **deberá** incluir licencia, guía de contribución,
política de seguridad e integración continua que ejecute comprobación de tipos, linter, tests y
construcción en cada envío y en cada propuesta de cambio.

**RF-H02** (ubicuo) · La lógica pura del sistema (puntuación, deduplicación, construcción del esquema,
validación de enlaces, interpretación de fechas, escapado) **deberá** estar cubierta por tests
automáticos que **no requieran red ni credenciales**.

**RF-H03** (ubicuo) · El proveedor de modelo **deberá** estar tras una interfaz que permita
sustituirlo por un doble en los tests, de modo que el flujo completo se pueda ejercitar sin gastar
tokens ni depender de la red.

**RF-H04** (por evento) · **CUANDO** una persona haga un fork del repositorio público y configure las
credenciales requeridas, el sistema **deberá** producir su primer informe sin ninguna edición de
código.

> _Criterio:_ se cronometra sobre una cuenta limpia. Objetivo declarado: cinco minutos.

**RF-H05** (ubicuo) · La integración continua **deberá** ejercitar la receta de ejemplo con un
proveedor de modelo simulado, de modo que una receta de ejemplo rota rompa la construcción.

> _Por qué:_ al vivir los datos reales en otro repositorio, el ejemplo es lo único que demuestra que
> la herramienta funciona para alguien que no sea su autor.

---

## Fuera de alcance

Lo siguiente **no** entra en la primera versión. Cada punto lleva su porqué, y los que puedan volver
están desarrollados en `06-extensibilidad.md`.

| Fuera                                               | Por qué                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Publicar en redes o generar contenido para publicar | Frontera del producto, no fase futura. Es otro agente                                                                                                                  |
| Chat sobre las noticias                             | Descartado por el usuario cero: ya lo hace pegando el informe en otra IA, que tiene más contexto. Solo tendría sentido si diera acceso a los elementos **descartados** |
| Aplicación de escritorio o widget                   | Era el envoltorio de la idea del chat                                                                                                                                  |
| Panel web propio                                    | El archivo se guarda en marcado ligero y la plataforma de alojamiento lo renderiza sola. Ver ADR-008                                                                   |
| Interfaz de edición de la configuración             | La configuración vive en ficheros versionados                                                                                                                          |
| Lector de Reddit                                    | Exige credenciales OAuth y rompería RF-B04. Ver ADR-012                                                                                                                |
| Publicación en el registro de paquetes              | Ver ADR-015                                                                                                                                                            |
| Base de datos alojada                               | Ver ADR-004                                                                                                                                                            |
| Sitio propio en un subdominio                       | Se añade conectando un servicio de páginas estáticas al repositorio de la instancia, sin tocar el motor                                                                |

---

## Trazabilidad de los defectos auditados

Los quince defectos del sistema anterior. **Ninguno queda sin destino**: o es un requisito, o está
fuera de alcance con su porqué.

| Defecto | Qué era                                                           | Requisitos                            |
| ------- | ----------------------------------------------------------------- | ------------------------------------- |
| D-01    | El destinatario, escrito en el código                             | RF-A01, RF-A02, RF-A08                |
| D-02    | El esquema del informe, escrito a mano en cuatro sitios           | RF-A03, RF-A04, RF-F06                |
| D-03    | El lector se elegía inspeccionando la URL                         | RF-B01, RF-B03, RF-B04                |
| D-04    | Sin memoria entre ejecuciones                                     | RF-C01, RF-C02, RF-B07                |
| D-05    | La entrega, cableada en el orquestador                            | RF-F03, RF-F04                        |
| D-06    | Cadena de respaldo con un solo eslabón vivo                       | RF-D02 a RF-D07                       |
| D-07    | Cero elementos se reportaba como éxito                            | RF-G01, RF-G02, RF-G06                |
| D-08    | Uno de cada cinco días sin informe, sin registro del patrón       | RF-G03, RF-G04, RF-G05, RF-C04        |
| D-09    | Interfaz de red sin autenticación, con petición de URL arbitraria | RF-E06 (**desaparece**, no se mitiga) |
| D-10    | Contenido de terceros sin escapar, enlaces sin verificar          | RF-E01 a RF-E04, RF-E07               |
| D-11    | Sin repositorio, tests, linter, integración continua ni licencia  | RF-H01, RF-H02, RF-H03                |
| D-12    | Rutas dependientes del directorio de trabajo                      | RF-A07                                |
| D-13    | Nueve bloques duplicados, tres con implementación triple          | RF-F06                                |
| D-14    | La documentación contradecía al código en cinco puntos            | RF-A09, RF-A10, RF-H05                |
| D-15    | Credenciales en texto plano y duplicadas                          | RF-E05, RF-D05                        |

---

## Los tres criterios que deciden si la versión ha salido bien

Por encima de la lista de requisitos, tres pruebas que no se pueden aprobar a medias:

1. **RF-A04 · el diseño de recetas funciona.** Una segunda receta, de otra forma y con otras
   secciones, produce un informe coherente sin tocar `src/`. Si falla, el proyecto no tiene nada que
   ofrecer que no tuviera el anterior, y hay que volver a ADR-005.
2. **RF-H04 · un desconocido llega al primer informe.** Fork, credenciales, informe. Cronometrado.
3. **El usuario cero recibe su informe todos los días.** Hoy falla uno de cada cinco. Es el listón
   mínimo, y el único que se mide en producción y no en un test.
