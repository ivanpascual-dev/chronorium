# Modelo de datos

No hay base de datos (ADR-004). El estado son ficheros dentro del repositorio de la instancia,
escritos por el propio proceso y commiteados al terminar. Este documento fija sus formatos, porque un
formato que cada fase interpreta a su manera se convierte en una migración a los seis meses.

**Los cuatro ficheros viven en el repositorio privado, nunca en el público.**

```text
archive/YYYY-MM-DD--<recipe>.json    el informe, dato canónico
archive/YYYY-MM-DD--<recipe>.md      el mismo informe, para leer y para pegar
state/seen--<recipe>.json            huellas de lo ya mostrado, una por receta
state/runs.ndjson                    una línea por ejecución, una sola para toda la instancia
```

El archivo y la memoria de lo ya visto llevan la receta en el nombre porque hay dos que escriben en
la misma instancia (la diaria y el resumen semanal del lunes) y no pueden pisarse (ADR-021). El
registro de ejecuciones no la lleva: es una sola cuenta por instancia, y `readHealth` filtra por
receta al leerlo.

---

## `archive/<fecha>--<receta>.json`

El dato canónico. Todo lo demás se deriva de aquí.

```jsonc
{
  "schemaVersion": 2,
  "recipe": "daily",
  "date": "2026-08-05",
  "generatedAt": "2026-08-05T08:00:31.412Z",

  "sections": [
    {
      "key": "pulse",
      "title": "Pulso del día",
      "items": [{ "text": "..." }],
    },
    {
      "key": "releases",
      "title": "Novedades de tu stack",
      "items": [
        {
          "title": "...",
          "change": "...",
          "impact": "...",
          "link": "https://...",
        },
      ],
    },
  ],

  "meta": {
    "provider": "gemini",
    "providerWasFallback": false,
    "itemsCollected": 67,
    "itemsAnalyzed": 60,
    "sourcesOk": 17,
    "sourcesFailed": 2,
    "linksDropped": 0,
    "health": { "windowDays": 30, "runsOk": 28, "runsFailed": 2 },
  },
}
```

**Decisiones de formato, y su porqué:**

- **`sections` es un array, no un objeto con claves fijas.** Es lo que permite que un renderizador
  recorra el informe sin conocer los nombres (regla R12). Un objeto invitaría a escribir
  `report.pulse`, y eso rompe el proyecto.
- **`schemaVersion` existe desde el día uno.** El sistema anterior cambió de formato sin marca y
  arrastró campos fósiles durante meses. En el mundo real solo existe la versión `2`: el archivo de
  cada instancia nace vacío y no se importó nada del sistema anterior (ADR-019, que supersede al
  ADR-013). `extractSchemaV1` sigue en `src/sources/archive.ts` a propósito y sin ningún productor:
  `RF-C05` seguirá vigente el día que la marca salte de `2` a `3`. **Su presencia en el código no es
  una importación pendiente.**
- **`meta.providerWasFallback`** alimenta `RF-D07`: si el informe lo generó un proveedor de respaldo,
  se ve en el informe, no solo en el registro.
- **`meta.linksDropped`** cuenta los enlaces que el modelo se inventó y el código descartó. Si sube,
  el prompt se está degradando y hay que mirarlo.
- **`meta.health`** es el estado agregado que viaja dentro del informe (`RF-G05`). Es lo que faltaba
  en el sistema anterior: no el aviso, el patrón.

---

## `archive/<fecha>--<receta>.md`

El mismo informe renderizado. **No es un artefacto secundario**: es lo que se lee y lo que se pega en
otra herramienta conversacional (`RF-F02`), y es el visor, porque la plataforma de alojamiento
renderiza marcado ligero de forma nativa (ADR-008).

Requisitos: autocontenido, sin recursos externos, con los enlaces visibles, y con la línea de salud
cuando la haya.

---

## `state/seen--<receta>.json`

Evita que un elemento reaparezca días seguidos. Es lo que el sistema anterior no tenía. Un fichero
por receta (ADR-021): la semanal destila los informes de la diaria por la fuente `archive`, y esos
elementos comparten url y título con lo que la diaria ya marcó, así que un fichero compartido haría
que la semanal viera cero elementos siempre.

```jsonc
{
  "schemaVersion": 1,
  "windowDays": 7,
  "entries": [
    { "h": "a3f1...", "firstSeen": "2026-07-22", "kind": "url" },
    { "h": "9c02...", "firstSeen": "2026-07-22", "kind": "title" },
  ],
}
```

- Dos huellas por elemento: una de la dirección y otra del **título normalizado** (minúsculas, sin
  acentos ni puntuación). La segunda es la que atrapa la misma noticia publicada en dos sitios.
- Se guarda la huella, no el texto: el fichero no crece y no expone qué se leyó.
- **Se poda en cada ejecución** por `windowDays`, que es el mismo número que `window.days` de la
  receta (RF-C02): la memoria de lo ya mostrado dura lo que dura la ventana de recolección. Si algún
  día molesta que un elemento pueda reaparecer justo al filo de la ventana, la vía es un
  `window.memoryDays` opcional, no un número fijo aquí.

---

## `state/runs.ndjson`

Una línea por ejecución, se añade y no se reescribe. A una línea al día, es irrelevante durante años.

```jsonc
{"ts":"2026-08-05T08:00:31Z","recipe":"daily","result":"ok","exitCode":0,"provider":"gemini","fallback":false,"itemsCollected":67,"sources":{"ok":17,"failed":2},"durationMs":41200}
{"ts":"2026-08-06T08:00:12Z","recipe":"daily","result":"model_failed","exitCode":3,"providersTried":["gemini","openai"],"lastError":"503"}
```

**Este fichero es la respuesta directa al defecto que más costó.** Con él, "¿cuántos días de los
últimos treinta hubo informe?" se responde con un comando (`RF-G04`). Sin él, hay que comparar
nombres de fichero, que es como se descubrió que faltaban once días.

`providersTried` cumple `RF-D06`: deja por escrito qué se intentó y por qué se descartó cada uno.

---

## Ciclo de vida y concurrencia

1. El proceso lee `seen--<receta>.json` (la suya, no la de otra receta) al arrancar, y `runs.ndjson`
   solo para calcular la salud agregada.
2. Escribe los cuatro ficheros al terminar, **también si falla**: una ejecución fallida deja su línea
   en `runs.ndjson`. Un fallo que no deja rastro es el que se pierde.
3. El workflow commitea y empuja los cambios.
4. **Nunca sobrescribe un informe existente** (`RF-C04`): si el fichero de esa fecha y receta ya
   existe, conserva el anterior y lo dice.
5. El workflow declara un grupo de concurrencia. Dos ejecuciones simultáneas sobre la misma instancia
   producirían un conflicto al empujar, así que se serializan (`RF-C06`).

---

## Sobre el crecimiento

| Fichero             | Ritmo                                  | A tres años              |
| ------------------- | -------------------------------------- | ------------------------ |
| `archive/`          | 2 informes al día, unos 12 KB cada uno | ~26 MB                   |
| `state/seen--*.json` | acotado por la ventana, uno por receta | unos pocos cientos de KB |
| `state/runs.ndjson` | ~730 líneas al año                     | ~1 MB                    |

Holgado para un repositorio de git durante años. **Si algún día dejara de serlo** (muchas recetas,
varias ejecuciones al día), es la señal para revisar el ADR-004, no para parchear este formato.
