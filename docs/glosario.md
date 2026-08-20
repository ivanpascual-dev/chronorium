# Glosario

Cada término que usan las guías de entrada (`README`, `docs/07-escribir-una-receta.md`,
`docs/arranque.md`), una frase por entrada, sin jerga dentro de la definición. Si una definición
necesitara otra palabra técnica para explicarse, esa palabra también está aquí.

Esta es la lista completa. `pnpm run check:docs` comprueba que cada término de una lista cerrada de
jerga (fijada en `scripts/check-docs.ts`) tenga su entrada aquí, no que las guías de entrada eviten
jerga sin definir: eso lo comprueba una persona, en el punto 10 del criterio de terminada de la
fase 6.

- **API**: una dirección a la que un programa (no una persona con un navegador) le pide datos y
  recibe una respuesta estructurada, lista para que otro programa la use.
- **archivo** (el del proyecto, no un fichero cualquiera): la carpeta donde Chronorium guarda cada
  informe que genera, uno por fecha, para poder consultarlo más adelante.
- **canal** (de sindicación): una dirección que un sitio publica para que otros programas lean sus
  novedades automáticamente, sin que nadie tenga que visitar la página a mano.
- **credencial**: la prueba, normalmente una clave, de que tienes permiso para usar el servicio de
  otra empresa.
- **cron**: un programador de tareas que ejecuta algo a una hora fija en automático, sin que nadie
  tenga que lanzarlo a mano.
- **deduplicar**: descartar las copias de la misma noticia que llegaron por dos fuentes distintas,
  para no repetirla en el informe.
- **esquema**: la forma exacta que debe tener un dato (qué campos trae y de qué tipo), para poder
  comprobar automáticamente si algo la cumple.
- **fork**: tu propia copia independiente de un repositorio ajeno, donde puedes cambiar lo que
  quieras sin afectar al original.
- **fuente**: un sitio de internet del que Chronorium recoge información, declarado en tu receta.
- **instancia**: tu propia copia de Chronorium en funcionamiento, con tus recetas y tus secretos,
  ejecutándose sola en tu cuenta.
- **Markdown**: un formato de texto ligero para dar forma (títulos, negritas, enlaces) sin
  necesitar un editor visual.
- **modelo**: el programa de inteligencia artificial que lee lo recolectado y redacta el informe.
- **notificador**: la pieza que entrega el informe ya terminado por un canal de entrega concreto
  (correo, Telegram, un webhook).
- **proveedor**: la empresa que da acceso a un modelo a través de su API, a cambio de una
  credencial.
- **puntuación**: el número que Chronorium calcula para cada elemento recolectado, y que decide el
  orden en que compite por un hueco en el informe.
- **receta**: el conjunto de ficheros donde defines de qué habla tu informe: tus temas, de dónde
  sale la información y cómo quieres que se cuente.
- **repositorio**: el espacio donde vive el código y su historial de cambios, alojado en un sitio
  como GitHub.
- **secreto**: un valor confidencial (una clave, una contraseña) que un programa necesita para
  funcionar pero que nunca debe quedar escrito en un fichero del proyecto.
- **token**: la unidad mínima de texto que un modelo procesa o genera; el coste y los límites de
  una llamada se miden en tokens.
- **variable de entorno**: un valor que le pasas a un programa desde fuera al arrancarlo, en vez de
  escribirlo dentro de un fichero.
- **ventana**: el número de días hacia atrás que Chronorium considera "reciente" al decidir qué
  entra en el informe.
- **YAML**: un formato de texto para escribir configuración, pensado para que una persona lo lea y
  lo edite sin herramientas especiales.
