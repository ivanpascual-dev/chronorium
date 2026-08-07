# Chronorium · Constitución del proyecto

> Este fichero se carga en cada sesión. Es la fuente de verdad de **cómo se trabaja aquí**.
> Lo que se puede reconstruir leyendo `docs/` no se repite aquí: se enlaza.

## Qué es

Un agente que produce informes periódicos sobre lo que tú necesites, con opinión propia y con qué
puedes aplicarte de ello. **El motor no sabe de noticias ni de inteligencia artificial**: todo el
dominio (fuentes, temas, secciones del informe, persona, idioma, cadencia) vive en una _receta_.

Proyecto de código abierto, licencia MIT. El repositorio público es la herramienta; cada usuario tiene
su propia instancia privada con sus datos. Ver `docs/04-decisiones-adr.md`, ADR-002.

## La regla que lo explica casi todo

**Si una decisión pertenece al dominio, va en la receta. Si pertenece al mecanismo, va en el código.**

Ante la duda, pregúntate: ¿alguien que use esto para seguir novedades de biotecnología necesitaría
cambiarlo? Si la respuesta es sí, no puede estar en `src/`.

El proyecto anterior murió por incumplir esto: el destinatario del informe estaba escrito nueve veces
en el prompt y el esquema de salida estaba a mano en cuatro sitios.

---

## Stack y versiones

| Pieza                | Elección                                                                              | Nota de versión                                                                                                       |
| -------------------- | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Entorno de ejecución | Node.js                                                                               | **Fijado a la LTS actual.** Declarado en un solo sitio (`package.json` → `engines`), consumido por CI y documentación |
| Lenguaje             | TypeScript, `tsx` en desarrollo                                                       | los tipos son el contrato de extensión, ver ADR-007                                                                   |
| Gestor de paquetes   | pnpm                                                                                  |                                                                                                                       |
| Modelos              | AI SDK de Vercel, con `generateObject`                                                | **Sin fijar major.** Se instala sin pin y queda congelado en el lockfile                                              |
| Validación           | Zod para lo estático, JSON Schema construido en memoria para lo derivado de la receta | ver ADR-005                                                                                                           |
| Configuración        | YAML                                                                                  |                                                                                                                       |
| Tests                | El runner integrado del entorno de ejecución                                          | cero dependencias de test                                                                                             |
| Ejecución programada | Workflow del repositorio, invocado desde la instancia                                 | ver ADR-003                                                                                                           |

**Política de versiones.** El entorno de ejecución se fija a la LTS actual y se declara una sola vez.
Las librerías que se mueven rápido (el SDK de modelos, sobre todo) **no llevan major fijado en la
documentación**: se instalan sin pin y el lockfile las congela. Antes de fijar cualquier número,
verifícalo contra la documentación oficial de ese día, nunca de memoria.

**Sin dependencias que no ganen su sitio.** El proyecto anterior tenía siete dependencias directas
para hacer menos cosas. Antes de añadir una, comprueba que el entorno de ejecución no la trae ya
dentro.

---

## Reglas no negociables

### Seguridad

- **R1 · El contenido de las fuentes es entrada hostil.** Cualquiera puede publicar un artículo cuyo
  título contenga instrucciones o marcado. Se delimita en el prompt y se marca como no confiable.
- **R2 · Lo que se le pide al modelo es una preferencia; lo que impone el código es una garantía.**
  Toda regla cuyo incumplimiento sea grave se implementa en código. El caso canónico: los enlaces de
  la salida se comprueban contra el conjunto de entrada y los que no estén **se descartan**. No basta
  con pedirle al modelo que no los invente.
- **R3 · Los secretos se leen solo del entorno.** Ningún fichero de secretos dentro del árbol del
  proyecto, y ninguna credencial en ningún commit, jamás.
- **R4 · Cero interfaces de red.** El proyecto no expone ningún servidor, ni de lectura ni de
  escritura.
- **R5 ·** Todo contenido externo o generado se escapa antes de entrar en cualquier salida con
  marcado.

### Fallos

- **R6 · Un fallo nunca sale con código cero.** Sin informe es un fallo, aunque no haya excepción.
- **R7 · Se reintenta solo lo recuperable**: errores de servidor, limitación de tasa y red. Nunca un
  error de cliente.
- **R8 · Un solo proveedor con credenciales válidas es un punto único de fallo, y hay que decirlo en
  voz alta al arrancar.** Esta regla existe porque su ausencia costó seis días de informe.
- **R9 · El aviso lleva el patrón, no solo el evento.** Un correo de "hoy ha fallado" no comunica
  "llevas once días perdidos". El estado agregado viaja dentro del propio informe.

### Código

- **R10 · Una implementación por capacidad.** El flujo principal, las herramientas de diagnóstico y
  los tests consumen la misma. El proyecto anterior tenía tres implementaciones de la llamada al
  modelo.
- **R11 · Las rutas se resuelven explícitamente**, nunca a partir del directorio de trabajo.
- **R12 · Los renderizadores no conocen nombres de sección.** Si escribes
  `if (section === 'topStories')` en cualquier sitio, has roto la premisa del proyecto.
- **R13 ·** La lógica pura (puntuación, deduplicación, construcción del esquema, validación de
  enlaces, fechas, escapado) se prueba **sin red y sin credenciales**.

### Documentación

- **R14 · La documentación que se puede contradecir con el código, se verifica en CI.** El proyecto
  anterior prometía 20 fuentes y entregaba 8, y su guía de instalación apuntaba a una ruta que ya no
  existía.
- **R15 · El ejemplo tiene que funcionar.** El CI ejercita la receta de ejemplo con un modelo
  simulado. Es lo único que demuestra que la herramienta sirve a alguien que no seas tú.

---

## Prohibiciones

- Nombres de persona, correos, profesiones o contexto personal dentro de `src/`. **Se comprueba en
  CI.**
- Elegir el lector de una fuente inspeccionando su URL. Se elige por el tipo declarado.
- Rellenar campos ausentes de la respuesta del modelo con valores por defecto silenciosos.
- Sobrescribir un informe ya archivado.
- Recetas de fábrica que exijan credenciales más allá de la del proveedor de modelo.
- **La raya larga (`—`) en cualquier texto**: documentación, código, commits o salida. Usa coma, punto,
  dos puntos, paréntesis o `·`.

---

## Estructura

```text
src/
  recipe/      cargar, validar y derivar el esquema desde la receta
  sources/     los lectores, uno por tipo declarado
  rank/        puntuación, deduplicación y memoria de lo ya visto
  model/       cliente de modelos, cadena de proveedores y política de reintento
  render/      un renderizador por formato de salida
  deliver/     los notificadores
  state/       lectura y escritura del archivo y del estado
  cli/         los comandos
recipes/
  example/     la receta que se distribuye, y que el CI ejercita
docs/          ver docs/README.md
```

`docs/02-arquitectura.md` es la fuente de verdad de esta estructura. Si diverge, manda ese fichero.

---

## Índice de documentación

| Fichero                      | Cuándo leerlo                                                  |
| ---------------------------- | -------------------------------------------------------------- |
| `docs/00-vision-producto.md` | qué es y para quién, sin tecnología                            |
| `docs/01-especificacion.md`  | **los requisitos.** Antes de construir cualquier cosa          |
| `docs/02-arquitectura.md`    | el pipeline y los contratos de extensión                       |
| `docs/03-modelo-datos.md`    | formatos del archivo y del estado                              |
| `docs/04-decisiones-adr.md`  | **por qué el proyecto es así.** Antes de proponer cambiar algo |
| `docs/05-seguridad-legal.md` | modelo de amenazas y batería de ataques                        |
| `docs/06-extensibilidad.md`  | lo que se dejó fuera y por qué                                 |
| `docs/ops.md`                | el plan por fases y su estado                                  |
| `docs/bitacora.md`           | qué pasó en cada sesión. **No es el plan**                     |
| `docs/arranque.md`           | inicializar el repositorio desde cero                          |

---

## Ciclo de trabajo

Cada fase: `/fase` para planificar → `/ejecutar-fase` para construir → **el dueño prueba y confirma
que la fase está terminada** → `@fiel-al-plan` y `/verifier` para cerrarla. Antes de publicar,
`/pre-lanzamiento`.

**Acabar de construir no es acabar la fase.** Ninguna puerta de verificación se lanza hasta que la
fase esté probada y confirmada: verificar código que va a cambiar quema la pasada y da un visto bueno
que caduca. La excepción es `@fiel-al-plan`, que detecta desvíos a mitad y no juzga calidad.

---

## Lo que este proyecto ya sabe que sale mal

Cinco cosas medidas sobre 49 días de ejecución programada del sistema anterior. No son hipótesis:

1. Una cadena de respaldo con un solo eslabón vivo **aparenta** redundancia. Costó 6 días de informe.
2. Un aviso por evento no comunica una condición crónica. Se enviaron 5 avisos y se perdieron 11 días.
3. Un marcador de posición guardado como credencial no falla al guardarse, falla cada mañana.
4. Una regla escrita en el prompt no es una garantía.
5. La documentación se desincroniza del código en semanas si nada la comprueba.
