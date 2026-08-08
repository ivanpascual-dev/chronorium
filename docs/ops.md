# Plan por fases

El plan, no el diario. Lo que pasó en cada sesión (qué se desvió, qué costó más de lo previsto, qué
deuda quedó) va en `bitacora.md`. Mezclarlos hace que este fichero crezca hasta que nadie lo lea
entero.

**Ciclo de cada fase:** `/fase` planifica → `/ejecutar-fase` construye → **el dueño prueba y confirma
que está terminada** → `@fiel-al-plan` y `/verifier` cierran. Ninguna puerta de verificación se lanza
antes de esa confirmación.

---

## FASE 0 · Inicialización

Ver `arranque.md` para el detalle de comandos.

- [x] Crear el repositorio público **vacío**. Nunca copiando el directorio del sistema anterior: sus
      tres credenciales en texto plano no pueden entrar en el historial (ADR-001)
- [x] Volcar el contenido de este paquete en la raíz
- [x] Inicializar el proyecto, fijar la versión del entorno de ejecución en un solo sitio
- [x] Configurar TypeScript, linter y formateador
- [x] Integración continua: comprobación de tipos, linter, tests y construcción
- [x] Licencia MIT, guía de contribución, política de seguridad
- [x] Primer commit y etiqueta `v0.0.0`

---

## FASE 1 · La prueba que decide el proyecto

**Esta fase existe para responder una pregunta, no para construir producto.** Si la respuesta es que
no, hay que volver al ADR-005 antes de escribir nada más. Detectarlo aquí cuesta una tarde;
detectarlo en la fase 6 cuesta el proyecto.

> **Pregunta:** ¿produce un modelo contenido de calidad para secciones que solo conoce por un fichero
> de configuración?

- [x] Tests de la construcción del esquema: `sections.yaml` válido, con campos que faltan, con
      cardinalidad inválida, con tipos desconocidos
- [x] Implementar la carga y validación de recetas
- [x] Implementar la derivación del esquema y su envoltura para generación estructurada
- [x] Escribir **dos recetas de forma distinta** (secciones, cardinalidades y persona distintas)
- [x] Ejecutar las dos contra un modelo real con un puñado de elementos fijos
- [x] **Juicio del dueño sobre la calidad del texto de cada sección.** No es un test automático: es
      leerlo y decir si sirve

**Puerta de salida.** Si la calidad se cae con secciones genéricas, se aplica el plan de contingencia
del ADR-005 (instrucciones por sección dentro de `sections.yaml`) y se vuelve a medir. Si tampoco,
para y replantea.

---

## FASE 2 · Recolección y memoria

- [x] Tests de la lógica pura primero: puntuación, deduplicación, ventana temporal, interpretación de
      fechas, tope por fuente
- [x] Ficheros de prueba guardados con los casos reales que rompieron el sistema anterior: canal sin
      fecha, con fecha inválida, vacío, caído, y con título que intenta inyectar instrucciones
- [x] Registro de lectores y los cinco tipos (`feed`, `json-api`, `repo-search`, `repo-releases`,
      `archive`)
- [x] Aislamiento de fuente caída: registrar, continuar, reportar por fuente
- [x] Memoria persistente de lo ya mostrado, con poda por ventana
- [x] Corrección del radar de repositorios: ordenar por crecimiento en la ventana, no por total
      acumulado, y excluir lo mostrado en los últimos 30 días

  **Construida, pendiente de confirmación del dueño (ver `docs/bitacora.md`).** `@fiel-al-plan` y
  `/verifier` no se lanzan hasta esa confirmación.

---

## FASE 3 · Modelo, cadena de proveedores y seguridad

- [ ] Tests de la política de reintento por clase de error, **sin red**
- [ ] Test de la advertencia de punto único de fallo: con una credencial la emite, con dos no
- [ ] Test del rechazo de credenciales que sean un marcador de posición
- [ ] Cliente de modelos, cadena de proveedores y reintento
- [ ] **Validación de enlaces contra el conjunto de entrada**, con su test
- [ ] Delimitación de la entrada no confiable en el prompt
- [ ] Batería de ataques repetible (`docs/05-seguridad-legal.md`), cableada como comando

---

## FASE 4 · Renderizado, entrega y archivo

- [ ] Tests de escapado y de renderizado sin conocer nombres de sección
- [ ] Tres renderizadores desde un mismo objeto: datos, marcado ligero y correo
- [ ] Notificador de correo, y Telegram como ejemplo desactivado
- [ ] Escritura del archivo, del estado y del registro de ejecuciones
- [ ] Códigos de salida diferenciados
- [ ] Estado agregado dentro del propio informe cuando la tasa de fallo supere el umbral
- [ ] Conversión e importación de los 45 informes del sistema anterior, con marca de versión

---

## FASE 5 · Ejecución programada y la instancia

- [ ] Workflow reutilizable en el repositorio público, con grupo de concurrencia
- [ ] Crear el repositorio privado de la instancia
- [ ] Recetas reales: la diaria y el resumen semanal del lunes
- [ ] Secretos en el repositorio de la instancia
- [ ] **Rodaje en sombra:** las dos versiones en paralelo varios días, comparando informes
- [ ] Apagar el sistema anterior **solo** cuando el nuevo gane esa comparación

---

## FASE 6 · Publicación

- [ ] README con la promesa, la ruta rápida y una captura de un informe real (anonimizado)
- [ ] `README.es.md`
- [ ] Guías de extensión: escribir una receta, añadir un lector, añadir un notificador
- [ ] Verificación en CI de que la documentación no contradice al código
- [ ] Cronometrar la ruta del desconocido en una cuenta limpia. Objetivo: cinco minutos
- [ ] `/pre-lanzamiento` y etiqueta `v1.0.0`

---

## Tareas previas que no dependen de este plan

- [ ] **Poner una credencial real de un segundo proveedor en el sistema anterior.** Diez minutos, y
      recupera la mayoría de los días perdidos mientras se construye esto. Ver ADR-009
- [ ] Rotar las tres credenciales del sistema anterior, recordando que su fichero de secretos gana a
      las variables de entorno

---

## FUTURO · fuera de la primera versión

Cada uno con su porqué en `06-extensibilidad.md`. No son deuda, son criterio.

- **Chat sobre los elementos descartados.** Solo tiene sentido si da acceso a lo que el agente
  **no** eligió. Sobre lo que sí eligió, pegar el informe en otra herramienta ya funciona mejor
- **Sitio propio en un subdominio.** Se añade conectando un servicio de páginas estáticas al
  repositorio de la instancia, sin tocar el motor
- **Crecimiento medido de verdad en el radar de repositorios.** `repo-search` (fase 2) aproxima
  "qué crece" con "qué es nuevo", porque la API no ofrece ninguna ordenación por crecimiento
  (RF-B09). Entra si esa aproximación se queda corta de forma visible durante varias semanas
- **Lector de Reddit.** Cuando exista un camino que no obligue a todos los usuarios a registrar una
  aplicación OAuth
- **Publicación en el registro de paquetes.** Cuando alguien la pida
