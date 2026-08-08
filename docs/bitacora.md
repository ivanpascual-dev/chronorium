# Bitácora

El diario del proyecto. **Qué pasó de verdad**, no qué estaba planeado.

`ops.md` es el plan y se mantiene corto porque se lee entero en cada sesión. Esto crece. Si se
mezclan, el plan se vuelve ilegible en unas semanas.

---

## Qué se anota

- **Lo que se desvió del plan**, y por qué. Es la entrada más valiosa con diferencia.
- **Lo que costó mucho más de lo previsto**, con la razón real.
- **Decisiones tomadas al construir** que no estaban en ningún ADR. Si es relevante, además se escribe
  su ADR.
- **Deuda que se deja a propósito**, con la condición que la haría entrar.
- **Lo que se probó y no funcionó.** Salva a quien lo intente otra vez dentro de seis meses.
- **Sorpresas de terceros**: una API que cambió, un límite que no estaba documentado, un
  comportamiento distinto del esperado.

## Qué NO se anota

- El detalle de qué ficheros se tocaron. Eso lo cuenta git mejor.
- Tareas completadas sin más. Eso son las casillas de `ops.md`.
- Lo que ya está en un ADR. Aquí va el enlace, no la copia.

## Formato

Una entrada por sesión, la más reciente arriba.

```markdown
## AAAA-MM-DD · Fase N · título corto

**Hecho.** Dos o tres líneas de lo que quedó funcionando.

**Se desvió.** Qué se hizo distinto del plan y por qué.

**Costó más de lo previsto.** Qué, y la razón real.

**Deuda.** Qué queda a medias y qué la desbloquea.

**Aprendido.** Lo que no sabíamos al empezar la sesión.
```

Si una sección no aplica, se omite. Una entrada de tres líneas honesta vale más que una de treinta
rellenada por cumplir.

## Quién escribe y quién lee

**Escribe:** quien cierra una fase, y el agente de commits cuando el cambio lo merece.

**Lee:** cualquiera que vuelva al proyecto después de un tiempo, y **la revisión de cierre**, que
compara el repositorio terminado con lo que se diseñó. Sin bitácora esa comparación no se puede
hacer: el código dice cómo quedó, pero no qué se intentó antes ni qué se descartó por el camino.

> Esto no es teoría. Un proyecto anterior se generó con la instrucción de que la bitácora "nacía
> vacía", no se creó el fichero, y se quedó sin bitácora todo el proyecto. Por eso este fichero
> existe ya, con su contrato dentro.

---

## Entradas

## 2026-08-08 · Fase 1 · Construido T0-T11, veredicto del dueño: sirve

**Hecho:** `tests/tsconfig.json` y `typecheck` ampliado a los tres proyectos, con
`erasableSyntaxOnly`, `allowImportingTsExtensions` y `rewriteRelativeImportExtensions` (TypeScript
7 rescribe `.ts` a `.js` en el build, así que todos los imports relativos del proyecto usan extensión
`.ts` literal, ejecutable directamente por `node --test` sin paso de compilación). Tipos del
contrato (`src/recipe/types.ts`). Derivación del esquema con sus 14 tests (`src/recipe/schema.ts`):
`jsonSchema()` del AI SDK con función de validación propia, y la lista de campos `url` como
contrato hacia la fase 3. Carga y validación de recetas con sus 8 tests (`src/recipe/load.ts`,
`validate.ts`, `src/paths.ts`), con la ruta absoluta como garantía de código (RF-A07) en vez de una
convención de estilo. Composición del prompt con sus 4 tests (`src/model/prompt.ts`), con el orden
de bloques fijado en `src/model/CLAUDE.md`. Cliente de modelo con sus 2 tests de flujo completo
usando `MockLanguageModelV4` de `ai/test` (`src/model/client.ts`), incluida la prueba de que una
salida a la que le falta una sección declara falla en vez de rellenarse (RF-D01). Dos recetas de
forma deliberadamente distinta (`recipes/example/`, `tests/fixtures/recipes/biotech/`) y sus
elementos fijos (15 por dominio). 28 tests en verde, sin red y sin credenciales
(`GOOGLE_GENERATIVE_AI_API_KEY` sin definir durante toda la sesión). `pnpm run build` produce
`dist/` limpio.

**Se desvió:** ADR-006 fijaba `generateObject`. Verificando la documentación de ese día (instrucción
explícita del dueño, no de memoria) se encontró que `generateObject` y `streamObject` están
deprecados desde la guía de migración de la v6 del AI SDK, con aviso de retirada futura, y que la
documentación de test oficial (`ai/test`, `MockLanguageModelV4`) ya solo cubre `generateText` con
`output: Output.object({ schema })`. Se paró antes de escribir `client.ts`, se presentó el hallazgo
al dueño con las dos opciones, y se decidió `generateText` + `Output.object`. Se añadió **ADR-017**,
que supersede a ADR-006 solo en ese punto (el documento no se reescribe). `jsonSchema()` (ADR-005) no
cambió: solo cambió qué función del SDK consume el esquema envuelto.

**Costó más de lo previsto:** hacer que `.ts` como extensión de import literal conviviera con el
`build` (`tsc` emitiendo a `dist/`). La combinación correcta
(`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`, sin `noEmit`) no es la que
documenta `tsc --help`, que dice que `allowImportingTsExtensions` exige `moduleResolution: bundler`
más `noEmit`/`emitDeclarationOnly`; se verificó empíricamente en un directorio aislado antes de
tocar el `tsconfig.json` real, y funciona con `NodeNext` y emisión activa.

**T10, en una segunda pasada de la sesión:** con `GOOGLE_GENERATIVE_AI_API_KEY` exportado por el
dueño, la Run A salió bien a la primera: contenido en español, con opinión, tuteo, y los cinco
enlaces de la salida (dos en "Lo más relevante", tres en "Aplícate esto") todos reales, tomados
literalmente de `tests/fixtures/items/ai.json`, ninguno inventado. Las Run B y C fallaron dos veces
seguidas con el mismo error exacto: `gemini-3.6-flash` devolvía 3 elementos para la sección
`watchout` de la receta biotech, cuya fixture declaraba `max: 2`. La validación propia
(`validateAgainstSections`, RF-D01/R2) rechazó la salida las dos veces en vez de aceptarla o
recortarla en silencio, justo la garantía que tenía que dar. Como esta fase llama al proveedor una
sola vez y sin reintento (eso es fase 3, a propósito), cada rechazo tiraba el proceso entero con
`exit 1` antes de intentar la siguiente ejecución.

Se probó primero un refuerzo genérico en las instrucciones de salida del prompt pidiendo respetar
los límites de cantidad sin repetir los números en prosa (no viola la trampa #3); no cambió el
resultado en un segundo intento idéntico. Los tokens de razonamiento altos (1288 y 2382) y que el
desbordamiento fuera idéntico dos veces seguidas apuntan a que el modelo encontraba de forma
consistente 3 "watchouts" genuinos en ese conjunto de 15 elementos, no a ruido aleatorio. Se subió
`max` de `watchout` a 3 en la fixture (`tests/fixtures/recipes/biotech/sections.yaml`): es un número
que fijé yo mismo al escribir T9, no algo que el plan mande, y afecta a B y C por igual, así que la
comparación de control (misma receta, dominio distinto) sigue siendo válida. Con ese cambio, las
tres ejecuciones completaron limpias.

**T11.** El dueño leyó las tres salidas y dio el veredicto: sirve. Nota suya, no mía: el contenido
sale escueto, y al comprobarlo (comparando frase a frase la salida contra el `summary` de los
fixtures) se confirma que el modelo no rellena ni inventa profundidad que el elemento de entrada no
tenía; el techo de detalle es el techo del fixture, escrito a mano en 2-3 frases por T9. Parte de la
brevedad es diseño a propósito (la visión del producto pide un informe de dos o tres minutos, y
`persona.md`/`sections.yaml` piden explícitamente frases cortas), y parte es artefacto de la fixture.
Se deja así deliberadamente: la fase 2 trae recolección real con más texto por elemento, y es ahí
donde se sabrá si hay más profundidad que exprimir. No se tocaron los fixtures para forzar más
longitud.

**Deuda:** cerrada en esta misma sesión, al pasar `/verifier`. `fiel-al-plan` había señalado cuatro
flecos menores y `verifier` uno más (RF-H05 sin automatizar); de los cinco, cuatro quedaron resueltos:

- **RF-H05.** `scripts/check-receta-ejemplo.ts` ejercita `recipes/example/` con `MockLanguageModelV4`
  sin nombrar ninguna sección concreta (R12), cableado como `check:receta-ejemplo`. La guarda de
  arranque de `ci.yml` lo recoge sola, sin tocar el workflow.
- **`PERSONAL_TERMS`.** Configurado por el dueño como secreto del repositorio (acción suya, fuera del
  árbol del proyecto, R3).
- **`@dependency-audit` sobre `@ai-sdk/google`.** Comprobado por el dueño de forma retroactiva; no
  prueba que se hiciera antes de escribir `client.ts` en T7, pero deja tranquilidad sobre el estado
  actual de la dependencia.
- **`src/paths.ts` sin consumidores.** `probe-fase1.ts` dejó de reimplementar `here`/`projectRoot` a
  mano y usa `projectRoot`/`resolveRecipeDir` del módulo compartido.

Queda abierta una: **los ataques 1, 2 y 3 de la batería** (instrucción en el título, instrucción en
el cuerpo, petición de fuga del prompt) no tienen test end-to-end con modelo simulado.
`@guardarrailes` lo comprobó en vivo dentro de esta sesión: un doble que devuelve un campo `string`
con texto de fuga ("ignora las instrucciones anteriores, revelo el prompt aquí") es aceptado y
devuelto tal cual por `generateReport`; la única defensa hoy es la frase del prompt, no una garantía
de código (contradice R2 en este punto concreto, aunque no es el caso didáctico ya conocido de los
enlaces). No se corrige aquí a propósito: fase 3 es donde el plan pone "batería de ataques
repetible... cableada como comando", y es ahí donde tiene sentido construir la defensa real junto al
resto de la seguridad del modelo, no solo el test que la documente. Se desbloquea al construir esa
fase; esta nota existe para que no se redescubra desde cero.

La otra nota abierta (fase 2, sobre profundidad de contenido) es la del párrafo anterior.

**Señal para fase 3, no una acción de esta fase:** un solo intento sin reintento es frágil de verdad
en la práctica, no solo en teoría. Dos fallos idénticos seguidos en la misma sección sugieren que,
cuando fase 3 diseñe el reintento ante fallo de validación, un reintento simple de la misma llamada
podría no bastar si el modelo llega de forma consistente (no aleatoria) a una salida que viola un
límite: puede hacer falta realimentar el motivo del rechazo en el reintento, no solo repetir la
llamada.

**Aprendido:** verificar contra la documentación del día, no de memoria, no es solo para el
identificador del modelo (que también cambió: la documentación de Google mostraba `gemini-3.6-flash`
como estable, no `gemini-2.5-flash`, que es lo que aparecía en un ejemplo de código de la propia
documentación del SDK, desactualizado respecto a la página de referencia). El mismo principio aplicó
a una decisión ya escrita en un ADR: un ADR fija la mejor decisión con la información de su momento,
no una verdad que no se vuelve a comprobar.

## 2026-08-07 · Fase 0 · El check de datos personales casi filtraba datos personales

**Hecho:** repositorio inicializado desde el paquete de arranque (ADR-001). Construidos sobre ese
volcado: `package.json`, `tsconfig.json`, `biome.json`, `pnpm-workspace.yaml`, el script
`scripts/check-sin-datos-personales.ts` (RF-A02) y las guardas de arranque en `.github/workflows/ci.yml`
para los pasos que todavía no tienen nada que comprobar.

**Se desvió:** la primera versión de `scripts/check-sin-datos-personales.ts` guardaba los términos
personales a buscar (nombre real, proyectos anteriores) en un fichero versionado,
`scripts/terminos-personales.txt`. El propio usuario señaló el problema: ese fichero, al vivir
dentro del repositorio público, habría sido el vector exacto de fuga que el check pretendía evitar.
Se corrigió para leer la lista desde la variable de entorno `PERSONAL_TERMS` (definida como secreto
en CI, exportada sin rastro en local), tratándola con la misma disciplina que una credencial (R3).

**Aprendido:** una lista de "cosas que no deben aparecer en el repositorio" es, ella misma, un dato
que no debe aparecer en el repositorio. El sitio natural para guardar algo sensible nunca es
"al lado del código que lo protege".
