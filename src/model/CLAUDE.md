# Capa de modelo

> Se carga junto al `/CLAUDE.md` de la raíz, que sigue aplicando entero. Aquí solo va lo específico
> de esta carpeta.
>
> Fuente de verdad de la estructura y de los contratos: `docs/02-arquitectura.md`.
> Seguridad de esta capa: `docs/05-seguridad-legal.md`.

## Qué vive aquí

```text
src/model/
  client.ts     llamada al proveedor con el esquema derivado (maxRetries: 0, ver más abajo)
  providers.ts  registro de proveedor → cómo construir su LanguageModel, por `provider` declarado
  chain.ts      diagnóstico de la cadena (créditos utilizables, punto único de fallo) y su recorrido
  retry.ts      clasificación de errores y política de reintento por clase
  links.ts      único punto que valida un enlace de la salida contra el conjunto de entrada
  synthesize.ts única capacidad de "producir un informe validado" (R10, RF-F06)
  prompt.ts     composición del prompt desde la receta, con el delimitador blindado
```

Es la única capa que habla con un modelo. Si otra carpeta importa el SDK, hay un problema de
arquitectura.

---

## La regla de esta capa

**Lo que se le pide al modelo es una preferencia. Lo que impone el código es una garantía.**

Cada vez que estés a punto de añadir una frase al prompt para evitar algo, pregúntate si el
incumplimiento sería grave. Si lo es, **la frase no basta**: hay que implementarlo.

El caso canónico ya está resuelto y sirve de patrón: la instrucción de no inventar enlaces existe en
el prompt **y además** el código descarta todo enlace ausente del conjunto de entrada. Lo primero
mejora el resultado; lo segundo lo garantiza.

Señal de que la capa se está degradando: el prompt crece a base de "y por favor no hagas X".

---

## El prompt

Se compone entero desde la receta (`RF-A01`). **Ningún dato de ningún usuario concreto aparece aquí**,
y CI lo comprueba (`RF-A02`).

Orden de bloques:

1. Identidad y destinatario, desde `persona.md`
2. Áreas de interés, desde `recipe.yaml`
3. Idioma de salida, desde la receta
4. **Delimitador de entrada no confiable**, y dentro los elementos
5. Instrucciones de salida

El bloque 4 no es negociable: el contenido de las fuentes va delimitado y marcado como no confiable,
siempre. Es contenido que cualquiera puede publicar.

**El esquema NO se describe en el prompt.** Se pasa como esquema estructurado, derivado de
`sections.yaml`. Describirlo en prosa fue lo que hizo que el sistema anterior tuviera el esquema
escrito a mano en cuatro sitios.

---

## La cadena de proveedores

Esta máquina existe por un fallo medido: seis de los once días perdidos del sistema anterior fueron
el mismo error, una caída temporal del único proveedor vivo de una cadena que aparentaba tener cuatro.

Al validar, en este orden:

1. Descartar los proveedores sin credenciales utilizables
2. **Rechazar las credenciales que sean un marcador de posición documentado**. El sistema anterior
   tenía guardado el texto de ejemplo de su plantilla como si fuera una clave
3. **Contar los que quedan vivos. Si es uno, avisar en voz alta** y nombrarlo como punto único de
   fallo

Al ejecutar:

- `5xx`, `429` o fallo de red → reintentar con espera creciente
- **Cualquier otro error de cliente → abandonar ese proveedor de inmediato.** No se reintenta un 401:
  el sistema anterior gastaba 77 segundos diarios haciéndolo
- Éxito con un proveedor que no era el principal → **marcarlo en el informe**, no solo en el registro
- Anotar siempre qué proveedores se intentaron y por qué se descartó cada uno

---

## Parámetros

- **Temperatura baja.** Esto no es escritura creativa: es síntesis con estructura fija.
- **Límite de tokens de salida acotado**, con un valor por defecto en `client.ts`
  (`DEFAULT_MAX_OUTPUT_TOKENS`) y ajustable por receta (`model.maxOutputTokens`, dominio: depende
  del tamaño de esa receta en concreto, no del proveedor). Coherente con la cardinalidad máxima de
  las secciones.
- **Tope de elementos de entrada** aplicado antes de llamar, nunca después.
- **`maxRetries: 0` en la llamada al SDK (`client.ts`), a propósito.** Es una sola capa de
  reintento, la nuestra (`retry.ts`), la que ADR-009 describe. El reintento por defecto del SDK no
  distingue un 401 permanente de un 503 pasajero; dos capas juntas reintentarían lo que la de fuera
  se niega a reintentar. No subas este número dentro de seis meses sin releer el ADR-009.

## El delimitador del prompt no se puede cerrar desde fuera

Cada elemento aporta cuatro campos de terceros: `title`, `url`, `source`, `summary`. Cualquiera de
los cuatro puede contener `</elementos-no-confiables>` (o la apertura, con o sin atributos) tratando
de escribir fuera del bloque no confiable. `prompt.ts` neutraliza esa etiqueta en los cuatro campos,
en el único punto que los renderiza (`renderItem`): sustituye los ángulos por caracteres que no
forman una etiqueta real, sin borrar el texto. El invariante que el test comprueba sobre el prompt
compuesto entero: exactamente una apertura y un cierre reales, los que añade el propio código.

## La cadena de proveedores, en código

- `providers.ts` es el registro: nombre de proveedor declarado en la receta → cómo construir su
  `LanguageModel`. Tres entradas de fábrica, `google`, `openai` y `openai-compatible`. Se elige por
  el nombre, nunca inspeccionando la URL o el identificador de modelo (D-03, ADR-012).
- `chain.ts` expone dos funciones: `diagnoseChain` (sin red, para `validate`/`doctor` en fase 4) y
  `runChain` (recorre la cadena de verdad, usada solo por `synthesize()`).
- El conjunto de marcadores de posición que `RF-D05` rechaza vive en `chain.ts`
  (`PLACEHOLDER_CREDENTIALS`) y está documentado en `docs/05-seguridad-legal.md`: son el mismo
  texto, y si uno cambia sin el otro es el defecto D-14.
- **`provider: 'openai'` es el paquete oficial `@ai-sdk/openai`**, no el conector genérico. Ya
  traduce por sí solo la convención de llamada de sus modelos de razonamiento
  (`max_completion_tokens`, sin `temperature` propia salvo que se pida `reasoningEffort: 'none'`),
  verificado contra su código fuente (ADR-018).
- **`reasoningEffort` es un campo de dominio único** ("cuánto debe razonar el modelo"), con efecto en
  `provider: 'openai'` y en `provider: 'google'`. Cada uno lo traduce a su propia convención en
  `providers.ts` (`openAiReasoningOptions` → `providerOptions.openai.reasoningEffort`;
  `googleReasoningOptions` → `providerOptions.google.thinkingConfig.thinkingLevel`, Gemini 3+), fijado
  como valor por defecto de esa instancia de modelo con `wrapLanguageModel` +
  `defaultSettingsMiddleware` (de `ai`), porque solo tiene efecto pasado en la llamada, nunca al
  construir el modelo. Quien escribe la receta declara un único valor; el nombre que le da cada API es
  mecanismo, no dominio.
- **`openai-compatible` se queda como vía genérica** para quien declare otro proveedor remoto
  compatible (DeepSeek, Groq, OpenRouter) o un modelo local: exige `baseUrl`, y no interpreta
  `reasoningEffort` (se valida el tipo, pero ese conector lo ignora). Si algún día un proveedor
  concreto por esa vía necesita una traducción parecida a la de `openai`/`google`, se declara con su
  propio campo en la receta y su propio ADR, no se adivina por el identificador.

---

## Antes de tocar nada aquí

- Lee el ADR-005 (esquema derivado), el ADR-006 (el SDK) y el ADR-009 (cadena y reintentos). Los tres
  están en `docs/04-decisiones-adr.md` y los tres tienen su porqué medido.
- Si cambias el prompt, la validación de la salida, los enlaces o la cadena, **lanza `@guardarrailes`**.
  Es puerta obligatoria de `verifier` para las fases que tocan esta capa.
- Antes de fijar un identificador de modelo, verifícalo contra la documentación del proveedor de ese
  día. Un identificador retirado convierte el primer arranque de un desconocido en un error críptico.
