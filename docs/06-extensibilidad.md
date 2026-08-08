# Extensibilidad

Lo que se dejó fuera de la primera versión y **por qué ahora no**. Un futuro sin su porqué se
convierte en deuda: alguien lo lee dentro de seis meses, no encuentra el motivo y lo construye.

Regla de este documento: **cada entrada declara qué tendría que pasar para que entre.** Si no se
puede escribir ese disparador, es que no era un futuro, era una idea suelta.

---

## Lo que está medio hecho a propósito

Tres decisiones de la primera versión existen en parte para que el futuro sea barato. No son
sobreingeniería: cada una se paga sola dentro de la primera versión.

| Pieza | Lo que resuelve hoy | Lo que abarata mañana |
|---|---|---|
| Contrato de lectores de fuente | los cinco tipos que la primera versión necesita | cualquier fuente nueva es una implementación, no un cambio del motor |
| Contrato de notificadores | correo, y Telegram como ejemplo | cualquier canal nuevo, igual |
| Secciones declaradas en la receta | que el informe se adapte a cada usuario | que un dominio que nadie previó funcione sin tocar código |

**Lo que NO está medio hecho, y es deliberado:** no hay capa de abstracción para una base de datos,
ni para un servidor, ni para múltiples usuarios. Prepararse para algo que se ha decidido no hacer es
la forma más cara de no hacerlo.

---

## Futuros, con su disparador

### Chat sobre los elementos descartados

**Qué sería.** Poder preguntar sobre el material del día, no solo leer el informe.

**Por qué ahora no.** Se planteó y se descartó tras una pregunta incómoda: por qué usarlo, si pegar
el informe en una herramienta conversacional que ya tiene tu contexto funciona mejor. La respuesta
fue que no compensa.

**Qué lo haría entrar.** La única ventaja que el descarte dejó viva: **acceso a los elementos que el
agente NO eligió.** Un chat sobre las seis noticias seleccionadas no aporta nada; un chat sobre los
sesenta artículos descartados es otra cosa. Si alguna vez se construye, es sobre eso o no es.

**Qué costaría.** Conservar el conjunto de entrada del día junto al informe, y un comando de
conversación. La decisión de conservar la entrada no está tomada.

### Sitio propio en un subdominio

**Qué sería.** El archivo publicado en una dirección propia en vez de leerse en el repositorio.

**Por qué ahora no.** El archivo se guarda en marcado ligero y la plataforma de alojamiento lo
renderiza sola. El visor ya existe y no hay que escribirlo.

**Qué lo haría entrar.** Querer enseñarlo a alguien, o querer buscar en el histórico. Lo segundo es
el disparador de verdad: cuando haya cientos de informes y haga falta buscar dentro.

**Qué costaría.** Conectar un servicio de páginas estáticas al repositorio de la instancia. **No
toca el motor**, y por eso puede esperar sin coste.

**Aviso que no hay que olvidar:** publicarlo hace públicos los informes, y la sección de aplicación
personal nombra los proyectos del usuario. Se protege con el control de acceso de la plataforma, que
es un interruptor, o se filtra esa sección al publicar.

### Crecimiento medido de verdad en el radar de repositorios

**Qué sería.** `repo-search` (fase 2) ordena por estrellas dentro de una consulta acotada por
`created:` (RF-B09), que aproxima "qué ha crecido" con "qué es nuevo y tiene tracción". No es lo
mismo: un repositorio de hace tres años que despega esta semana no aparece, porque la API de
búsqueda de GitHub no ofrece ninguna ordenación por crecimiento real (comprobado contra su
documentación en la fase 2). Medirlo de verdad exigiría guardar las estrellas de cada repositorio
en cada ejecución y ordenar por el incremento entre dos lecturas.

**Por qué ahora no.** Tres costes, todos medidos al decidirlo: un cuarto fichero de estado que
`docs/03-modelo-datos.md` no contempla (el ADR-004 ya fija cuatro); ninguna línea base en la
primera ejecución (el primer día no hay incremento que calcular); y una petición HTTP por
repositorio candidato contra un límite de solo 10 por minuto sin autenticar, que con una lista de
candidatos de tamaño real se agota enseguida.

**Qué lo haría entrar.** Que el radar acotado por fecha de creación se quede corto **de forma
visible durante varias semanas**: repositorios que un usuario sabe que están creciendo y que el
informe no recoge, repetido lo bastante como para dejar de ser ruido.

**Qué costaría.** El cuarto fichero de estado (con su formato fijado antes de escribir código, como
exige `03-modelo-datos.md`), y aceptar el coste de peticiones por repositorio bajo el límite sin
autenticar, o exigir `GITHUB_TOKEN` para esta fuente en concreto.

### Lector de Reddit

**Por qué ahora no.** Exige registrar una aplicación OAuth, lo que rompería la regla de que las
recetas de fábrica funcionen sin más credenciales que la del modelo. En el sistema anterior estuvo
roto 41 ejecuciones seguidas.

**Qué lo haría entrar.** Una vía de lectura que no obligue a todos los usuarios a registrar nada, o
una receta que lo declare como fuente opcional asumiendo que quien la quiera se registre.

**Cuando entre, entra con su condición:** una fuente que requiere credenciales hace **fallar la
validación de la receta** si no están, en vez de fallar en silencio cada mañana.

### Publicación en el registro de paquetes

**Por qué ahora no.** El camino de uso es hacer un fork, no instalar. Publicar añade un ciclo de
versiones y una promesa implícita de mantenimiento.

**Qué lo haría entrar.** Que alguien la pida. Literalmente: hasta que exista esa petición, no hay
evidencia de que la instalación por paquete sea el camino que nadie quiere.

### Más de un modelo por informe

**Qué sería.** Un modelo barato filtrando y otro mejor escribiendo las secciones que importan.

**Por qué ahora no.** No hay evidencia de que la calidad lo necesite ni de que el coste sea un
problema. Optimizar coste antes de tener un problema de coste es el ejemplo de manual de trabajo
inútil.

**Qué lo haría entrar.** Un coste mensual que moleste, o una diferencia de calidad medible entre
secciones. El campo del informe que cuenta los elementos analizados da la primera señal.

### Distribuciones de recetas hechas por otros

**Qué sería.** Un sitio donde encontrar recetas de otras personas y copiarlas.

**Por qué ahora no.** Es una funcionalidad de comunidad, y el proyecto declara explícitamente que no
persigue comunidad.

**Qué lo haría entrar.** Que aparezcan recetas de terceros por su cuenta. Entonces bastaría una
sección del README enlazándolas, no una plataforma.

---

## Lo que no entrará nunca

No son futuros. Son la frontera del producto, y están aquí para que quede escrito **dónde se dice que
no**.

| Idea | Por qué es frontera y no futuro |
|---|---|
| Publicar en redes o generar contenido para publicar | Otro agente. Un agente que hace dos cosas hace las dos peor |
| Cuentas, suscriptores, servicio central | Cada uno opera su instancia. En cuanto haya un servicio central, hay datos de terceros, y eso es otro proyecto |
| Interfaz gráfica de configuración | La configuración es un fichero versionado. Esa es una característica, no una carencia |
| Volver a exponer una interfaz de red | Fue el origen de las dos peores vulnerabilidades del sistema anterior |

**Cómo se usa esta tabla.** Cuando llegue una petición razonable que empuje hacia una de estas
casillas (y llegará, siempre en la forma de "¿y si además..."), la respuesta no es discutirla: es
señalar la fila y proponer construirlo aparte.
