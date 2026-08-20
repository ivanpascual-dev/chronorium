# Arquitectura

Cómo está construido y por qué encaja así. El **porqué** de cada decisión está en
`04-decisiones-adr.md`; aquí está la forma.

---

## El pipeline

Seis etapas. Cada una recibe lo anterior y no conoce a las siguientes.

```text
              recipe.yaml + sections.yaml + persona.md
                              │
        ┌─────────────────────┴─────────────────────┐
        ▼                                           ▼
   1 · collect                                  esquema derivado
   (un lector por tipo declarado)               (sections.yaml → JSON Schema)
        │                                           │
        ▼                                           │
   2 · filter                                       │
   (ventana temporal, memoria de lo ya visto,       │
    tope por fuente)                                │
        │                                           │
        ▼                                           │
   3 · rank  ────────────────────────────────────┐  │
   (recencia + coincidencia de temas)            │  │
        │                                        ▼  ▼
        │                                   4 · synthesize
        │                                   (modelo + esquema + validación)
        │                                        │
        └───── conjunto de entrada ──────────────┤
               (para validar los enlaces)         │
                                                  ▼
                                             5 · render
                                        (json · markdown · correo)
                                                  │
                                                  ▼
                                             6 · deliver
                                        (notificadores declarados)
                                                  │
                                                  ▼
                                     archivo + estado + registro
```

**El detalle que no se ve en el dibujo y que importa:** la etapa 4 recibe **dos** entradas, el
esquema derivado y los elementos, y su salida se valida contra **ambas**. Contra el esquema, para que
la forma sea correcta; contra el conjunto de elementos, para que **ningún enlace inventado sobreviva**
(`RF-E03`). Esa segunda validación es código, no una instrucción en el prompt.

---

## La receta

Una carpeta con tres ficheros. Es todo el dominio del sistema.

```text
recipes/<nombre>/
  recipe.yaml     fuentes, temas, ventana, pesos de puntuación, entrega, proveedor
  sections.yaml   las secciones del informe: la declaración de la que sale el esquema
  persona.md      quién es el agente y a quién le habla
```

### `sections.yaml` y el esquema derivado

Es el mecanismo central del proyecto (ADR-005). La receta declara secciones; el código las convierte
en el esquema que se le exige al modelo.

```yaml
sections:
  - key: pulse
    title: "Pulso del día"
    cardinality: one # one | list
    condition: always # always | non-empty
    fields:
      - { name: text, type: string, description: "..." }

  - key: releases
    title: "Novedades de tu stack"
    cardinality: list
    min: 0
    max: 5
    condition: non-empty # si no hay nada, la sección no aparece
    fields:
      - { name: title, type: string }
      - { name: change, type: string }
      - { name: impact, type: string }
      - { name: link, type: url } # tipo url ⇒ se valida contra la entrada
```

De ahí sale un JSON Schema en memoria, que se envuelve con el ayudante de esquemas dinámicos del SDK
y se pasa a la generación estructurada, con una función de validación propia.

**Dos consecuencias que son reglas de código:**

- `condition: non-empty` es lo que permite declarar seis secciones sin engordar el informe: la que no
  tiene contenido no se renderiza (`RF-F05`).
- El tipo `url` no es decorativo: **marca los campos que pasan por la validación contra la entrada.**
  Un campo de tipo `url` cuyo valor no esté entre los elementos suministrados se vacía.

---

## Contratos de extensión

Los tres puntos por los que alguien extiende el sistema sin tocar el orquestador. En TypeScript,
porque **el tipo es la documentación del contrato** (ADR-007).

### Lector de fuentes

```ts
export interface SourceReader {
  /** Identificador que la receta declara en `type`. */
  readonly type: string;
  /** Credenciales de entorno que exige. Vacío ⇒ apta para receta de fábrica. */
  readonly requiredSecrets: readonly string[];
  read(source: SourceConfig, ctx: ReadContext): Promise<Item[]>;
}
```

Cinco implementaciones en la primera versión: `feed` (sindicación), `json-api`, `repo-search`,
`repo-releases` y `archive`.

**`archive` es el que demuestra la tesis del proyecto.** Su fuente no es internet, son los informes ya
generados. Es lo que permite que una receta destile a otra (el resumen semanal), y solo puede existir
si el motor de verdad no sabe nada del dominio.

**`repo-releases`** alimenta la sección de novedades del stack leyendo el canal de lanzamientos de
cada proyecto. No depende del criterio de ningún medio: lo publica quien hace la herramienta.

### Notificador

```ts
export interface Notifier {
  readonly id: string;
  readonly requiredSecrets: readonly string[];
  send(report: RenderedReport, cfg: NotifierConfig): Promise<void>;
}
```

Tres en la primera versión: `email` (por defecto), `telegram` y `webhook`, los dos últimos
desactivados. **Telegram existe para demostrar que el contrato funciona**, no porque se use (ADR-011).

### Renderizador

```ts
export interface Renderer {
  readonly format: "json" | "markdown" | "email";
  render(report: Report, sections: SectionSpec[]): string;
}
```

**Recibe la declaración de secciones, no las conoce.** Si un renderizador contiene el nombre de una
sección concreta, está roto (regla R12 de la constitución).

---

## Modelos y cadena de proveedores

```text
validar configuración
   │
   ├─ descartar proveedores sin credenciales utilizables
   ├─ rechazar credenciales que sean un marcador de posición
   └─ contar los vivos ─── si == 1 ⇒ AVISO de punto único de fallo
   │
   ▼
por cada proveedor de la cadena:
   │
   ├─ error 5xx / 429 / red   ⇒ reintentar con espera creciente
   ├─ otro error de cliente   ⇒ abandonar este proveedor YA, sin reintentar
   └─ éxito                   ⇒ si no era el principal, marcarlo en el informe
```

Esta máquina es la respuesta directa al fallo que costó seis de los once días perdidos del sistema
anterior. Ver ADR-009.

---

## Contratos del CLI

No hay API HTTP (ADR-008). La superficie del sistema son cuatro comandos.

<!-- check-docs:cli-commands -->

| Comando                      | Qué hace                                            | Salida                         |
| ---------------------------- | --------------------------------------------------- | ------------------------------ |
| `run --recipe <n>`           | ejecuta el pipeline completo                        | archivo, estado y entrega      |
| `run --recipe <n> --dry-run` | igual pero sin entregar ni archivar                 | el informe por salida estándar |
| `validate --recipe <n>`      | valida receta, credenciales y cadena de proveedores | diagnóstico, **sin red**       |
| `doctor`                     | comprueba el entorno y resume la salud reciente     | estado agregado                |

<!-- /check-docs:cli-commands -->

**Códigos de salida**, y son parte del contrato porque el programador de tareas los lee (`RF-G06`):

<!-- check-docs:exit-codes -->

| Código | Significado                                        |
| ------ | -------------------------------------------------- |
| `0`    | informe generado y entregado                       |
| `1`    | error de configuración o de receta                 |
| `2`    | la recolección no produjo ningún elemento          |
| `3`    | ningún proveedor de modelo pudo generar el informe |
| `4`    | informe generado, **pero la entrega falló**        |

<!-- /check-docs:exit-codes -->

El código `2` existe porque en el sistema anterior ese caso devolvía `0` y el registro escribía
"finalizada con éxito".

---

## Ejecución programada

```text
repositorio privado (la instancia)          repositorio público (la herramienta)
   .github/workflows/briefing.yml     ──▶      .github/workflows/run.yml
   ~10 líneas, fijado a una etiqueta           el workflow reutilizable
   sus secretos, sus recetas
   su archive/ y su state/
```

El repositorio público **no se ejecuta nunca** para nadie: se invoca. La instancia es quien tiene el
cron, los secretos y los datos (ADR-002 y ADR-014).

El workflow declara un **grupo de concurrencia** para que dos ejecuciones no se pisen escribiendo el
estado (`RF-C06`).

---

## Estructura de carpetas

Esta es la fuente de verdad. Si `CLAUDE.md` diverge, manda este fichero.

```text
src/
  recipe/       load.ts · validate.ts · schema.ts   ← sections.yaml → JSON Schema
  sources/      registry.ts · feed.ts · json-api.ts · repo-search.ts
                repo-releases.ts · archive.ts
  rank/         score.ts · dedupe.ts · window.ts
  model/        client.ts · chain.ts · retry.ts · links.ts · synthesize.ts · providers.ts
  render/       json.ts · markdown.ts · email.ts · escape.ts
  deliver/      registry.ts · email.ts · telegram.ts · webhook.ts
  state/        archive.ts · seen.ts · runs.ts
  cli/          run.ts · validate.ts · doctor.ts
recipes/example/
tests/          fixtures/ con canales reales guardados, incluidos los rotos
```

**Los ficheros de prueba guardados incluyen los casos que rompieron el sistema anterior**: un canal
sin fecha, uno con fecha inválida, uno vacío, uno caído, y uno cuyo título intenta inyectar
instrucciones. Son parte de la especificación, no del atrezo.
