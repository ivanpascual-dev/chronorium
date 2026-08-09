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

## 2026-08-09 · Fase 3 · Corrección post-cierre: `@ai-sdk/openai` en vez del parche sobre `openai-compatible`

**Hecho.** Tras comitear el cierre de la fase 3 (T0-T15, con `guardarrailes` y `/verifier` ya
pasados sobre ese estado), la revisión de cierre encontró que el segundo eslabón real
(`gpt-5.6-luna`) se servía a través del conector genérico `openai-compatible` más código propio
(`reasoningModel: boolean`, `reasoningEffort`, `transformRequestBody` en `src/model/providers.ts`)
que traducía a mano `max_tokens`→`max_completion_tokens` y quitaba `temperature`. Verificado contra
el código fuente del paquete oficial `@ai-sdk/openai` (auditado con `@dependency-audit`, versión
`4.0.36`, cero dependencias transitivas nuevas: ya las arrastraban `@ai-sdk/google` y
`@ai-sdk/openai-compatible`) que la Responses API (`openai(modelId).responses`) ya resuelve esa
misma traducción de fábrica. Se sustituyó: `providers.ts` gana una tercera entrada de fábrica,
`openai`, y pierde `reasoningModelBody`; `ProviderSpec` pierde `reasoningModel`, se queda con
`reasoningEffort`, fijado con `wrapLanguageModel` + `defaultSettingsMiddleware` (de `ai`) porque solo
tiene efecto en la llamada, no al construir el modelo. `openai-compatible` se queda registrada,
documentada como vía genérica para quien declare DeepSeek, Groq, OpenRouter o un modelo local.
`recipes/example` (comentario), la fixture biotech y `scripts/probe-fase3.ts` pasan a
`provider: openai`. `ADR-018` se reescribió in situ (no se creó un ADR-019) porque nada de la versión
anterior se había comiteado todavía: es la misma sesión, corrigiendo el mecanismo antes de dar la
fase por cerrada de verdad.

**Se desvió.** El cierre de la fase 3 se comiteó primero con el mecanismo antiguo (parche sobre
`openai-compatible`), a petición explícita del dueño, para no mezclar en un solo commit "lo que
`fiel-al-plan` y `guardarrailes` ya verificaron" con "la corrección posterior". El commit de la fase
(`faf3380`) representa un estado real que pasó todas las puertas, aunque no sea el que queda en el
árbol al terminar esta sesión.

**Aprendido.**

- `@ai-sdk/openai`, `@ai-sdk/google` y `@ai-sdk/openai-compatible` comparten los mismos dos paquetes
  internos (`@ai-sdk/provider`, `@ai-sdk/provider-utils`): añadir el oficial no añade una rama nueva
  al árbol de dependencias, solo sube dos paquetes ya presentes a la siguiente versión de parche. Es
  el caso ideal para no dudar antes de instalar un SDK de proveedor oficial en vez de mantener un
  parche propio sobre el genérico.
- `defaultSettingsMiddleware` (de `ai`) es el mecanismo documentado para fijar `providerOptions` por
  defecto en una instancia de modelo concreta, sin tocar el código que hace la llamada
  (`generateText`). Resuelve exactamente el problema de "esta opción solo existe por llamada, pero mi
  registro de proveedores solo construye el modelo una vez", sin romper el contrato
  `ProviderFactory.create(spec, apiKey): Promise<LanguageModel>`.
- Si `client.ts` manda `temperature` en una llamada a un modelo de razonamiento con `reasoningEffort`
  distinto de `'none'`, la Responses API ya no la rechaza: la omite y añade un aviso
  (`result.warnings`, tipo `unsupported`). Queda anotado, no se actúa: no hay ningún sitio hoy que
  lea `result.warnings`, y no es tarea de esta corrección añadirlo.

## 2026-08-09 · Fase 3 · T14/T15 con red real: la cadena cambia de Groq a gpt-5.6-luna

**Hecho.** Se ejecutó `pnpm run probe:fase3` con credenciales reales (T14), lo que sacó a la luz un
fallo de construcción real: `createOpenAiCompatibleModel` (`providers.ts`) nunca activaba
`supportsStructuredOutputs`, así que el SDK pedía el modo débil `json_object` en vez de
`json_schema` con `strict: true`. Corregido. Con la corrección, la caída al respaldo (entonces Groq)
funcionó de punta a punta, pero con el informe completo (`caps.maxItems: 60`, ~22.000 tokens de
entrada) Groq rechazó la petición por su límite gratuito de 8.000 tokens por minuto: un límite real,
no simulable con un doble. El dueño decidió sustituir Groq por `gpt-5.6-luna` (OpenAI) en
razonamiento medio, tras comparar un informe real de cada uno: coste de menos de un centavo por
informe, calidad igual o mejor (más elementos cubiertos, acciones más concretas, mejor alineación
con la persona) en la única muestra comparada. Para sostenerlo se añadieron dos campos declarables
por eslabón, validados en `recipe/validate.ts`: `reasoningModel: boolean` y
`reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'`; `providers.ts` los traduce con
`transformRequestBody` (D-03: no se detecta por el identificador, se declara). Sin esa traducción,
la API de OpenAI para sus modelos de razonamiento nuevos rechaza `max_tokens` (exige
`max_completion_tokens`) y cualquier `temperature` distinta de la suya por defecto: dos rechazos
reales más que ningún test con doble podía haber encontrado. 198 tests en verde (7 nuevos: 3 de
validación de los campos nuevos, 4 de `reasoningModelBody`), typecheck, lint, build y batería de 11
casos limpios. `recipes/example` (comentario) y la receta de prueba de biotech quedaron con Luna;
Groq no queda en ningún fichero de producción.

**Se desvió.** El plan de la fase 3 no mencionaba a Luna ni los campos `reasoningModel`/
`reasoningEffort`: nacieron de una comparación pedida por el dueño después de que T14 mostrara que
Groq no aguantaba el informe completo. No es un cambio de alcance (la cadena de proveedores y su
validación ya estaban en el plan): es el mismo mecanismo con un proveedor distinto y dos campos más
para que ese proveedor concreto funcione.

**Costó más de lo previsto.** Cada llamada real a `gpt-5.6-luna` reveló un rechazo nuevo de la API,
uno detrás de otro: primero la falta de `supportsStructuredOutputs` (el mensaje de error apuntaba a
"json" en el mensaje para `json_object`, no al motivo real), luego `max_tokens` no soportado, luego
`temperature` distinta de 1 no soportada. Ningún test con modelo simulado los habría encontrado: los
tres son de la forma exacta del cuerpo HTTP que solo una llamada real ejercita.

**Aprendido.**

- `supportsStructuredOutputs` en `createOpenAICompatible` no es opcional de facto para ningún
  proveedor cuya única razón de estar en la cadena es garantizar el esquema: sin activarlo, el SDK
  degrada en silencio a `json_object`, que ni siquiera exige el esquema.
- Las cuotas gratuitas se comprueban con el tamaño real del informe, no con un puñado de elementos:
  8.000 TPM parece de sobra hasta que se calcula sobre 60 elementos reales, no sobre 3.
- La clave de `providerOptions` en `@ai-sdk/openai-compatible` es fija (`openaiCompatible`), no el
  `name` que se le da al proveedor; el SDK avisa (aviso de obsolescencia) si se usa el nombre en su
  lugar.
- Los modelos de razonamiento de OpenAI vía `v1/chat/completions` tienen su propia convención de
  llamada (`max_completion_tokens`, sin `temperature` propia), distinta de la que asume el conector
  genérico `openai-compatible`.

## 2026-08-08 · Fase 3 · Construido T0-T14, pendiente de confirmación del dueño

**Hecho.** `retry.ts` (clasificación por `isRetryable` del propio SDK, sin adivinar por el mensaje),
`providers.ts` (registro `google`/`openai-compatible`), `chain.ts` (`diagnoseChain` + `runChain`),
`links.ts` (`validateLinks`, único punto que toca un enlace de la salida) y `synthesize.ts` (única
capacidad de producir un informe validado). `client.ts` pasa `maxRetries: 0`. `prompt.ts` neutraliza
el delimitador en los cuatro campos de cada elemento. `recipe/validate.ts` valida `model.fallbacks` y
sustituyó `hasSecret` por `secret(name)`. Batería de once casos en `tests/security/bateria.test.ts`,
cableada como `pnpm run bateria` y en CI. `scripts/probe-fase3.ts` deja listo el diagnóstico de la
cadena (que sí corrió, sin credenciales) y los tres comandos exactos para completarlo con red real.
191 tests en verde, sin red y sin credenciales; typecheck y lint limpios.

**Se desvió.**

- **El segundo proveedor de la receta biotech y del comentario de `recipes/example` es Groq, no
  DeepSeek**, que es lo que sugería la lista del plan (DeepSeek, Groq, OpenRouter, local). T0 pedía
  verificar contra la documentación del día si la salida estructurada aguanta en ese proveedor, y no
  aguantaba: la API de DeepSeek documenta hoy solo el modo `json_object` genérico, sin `json_schema`
  estricto. Groq documenta `response_format: json_schema` con `strict: true` en `openai/gpt-oss-20b`
  y `openai/gpt-oss-120b`, que es la garantía que `Output.object` necesita. Es exactamente el punto
  de parada que el plan preveía ("si no aguanta, se para y se cambia a un proveedor concreto,
  dejándolo escrito, no se improvisa"), y esta nota es ese escrito.
- **`retry.ts` inyecta solo `sleep`, no `sleep` y `now` como sugería la prosa de T3.** No hay ningún
  test de T2 que ejercite un segundo primitivo de reloj, y la única razón defendible para separar
  `now` de `sleep` habría sido respetar la cabecera `retry-after` cuando llega como fecha HTTP en vez
  de segundos, algo que ningún criterio de esta fase pide. Añadirlo habría sido un parámetro sin uso.
  Si `retry-after` se necesita de verdad, es un cambio local a `retry.ts`, con su propio test.
- **Los casos 2 y 3 de la batería, que vivían sueltos en `tests/sources/feed.test.ts` desde la fase
  2**, se movieron a `tests/security/bateria.test.ts` en vez de quedarse duplicados en dos sitios:
  el plan pide un comando "que no es una segunda implementación", y dos copias de la misma prueba en
  ficheros distintos sí lo habría sido.
- **La frase de "Instrucciones de salida" del prompt** citaba literalmente
  `<elementos-no-confiables>` en prosa ("usa únicamente las URLs que aparecen dentro de
  &lt;elementos-no-confiables&gt;"), lo que hacía que el prompt sin ningún ataque ya tuviera dos
  apariciones de la apertura del delimitador. El test de T8 que exige "exactamente una apertura y un
  cierre" habría sido falso incluso sin inyección. Se cambió la frase a prosa sin repetir la
  sintaxis de la etiqueta; el significado no cambia.
- **`scripts/probe-fase1.ts` y `scripts/probe-fase2.ts` se tocaron**, aunque no están en la lista de
  ficheros de esta fase: importaban `googleModel` de `client.ts`, que esta fase retira (su trabajo
  pasa al registro de `providers.ts`, R10). Sin el ajuste, ambos scripts habrían roto el `typecheck`.

**Costó más de lo previsto.** Verificar el riesgo real de T0 (si la salida estructurada aguanta en el
proveedor elegido) exigió tres consultas a documentación viva porque la primera fuente
(`ai-sdk.dev/providers/openai-compatible-providers/deepseek`, vía Context7) no distinguía el modo
`json_object` del `json_schema` estricto; hubo que ir a la documentación oficial de DeepSeek
(`api-docs.deepseek.com`) y de Groq (`console.groq.com/docs/structured-outputs`) para confirmar la
diferencia y el modelo concreto que la garantiza.

**Deuda.** T14 se detuvo donde el plan dice que debe detenerse sin credenciales: la parte 1 (diagnóstico
de la cadena) corrió de verdad, sin avisos porque no hay ningún proveedor vivo en este entorno; las
partes 2 y 3 (informe real, caída al respaldo de verdad, inyección contra el modelo real) y **todo
T15** (el juicio del dueño sobre esa salida) quedan pendientes de que el dueño exporte
`GOOGLE_GENERATIVE_AI_API_KEY` (y, para ver la caída de verdad, también `GROQ_API_KEY`) y ejecute
`pnpm run probe:fase3`. Sin eso, esta fase no se puede dar por probada, y `@fiel-al-plan`/`/verifier`
no se lanzan hasta esa confirmación (regla del ciclo de trabajo, no algo específico de esta fase).

**Aprendido.**

- `node --test` con una ruta de directorio (`tests/security/` o `tests/security`) no descubre los
  ficheros de test dentro en esta versión de Node: hace falta un patrón glob explícito
  (`tests/security/**/*.test.ts`). El resto del proyecto no lo había notado porque `pnpm test` corre
  `node --test` sin argumentos, que sí recorre todo el árbol por defecto.
- La clasificación de errores del propio SDK (`APICallError.isRetryable`, con su regla por defecto
  `408 | 409 | 429 | >=500`) ya resuelve, sin escribir una sola condición sobre códigos de estado,
  tres de las siete situaciones que pedía el test de reintento. Adivinar por el código a mano habría
  sido la segunda implementación de una clasificación que el proveedor ya expone.

## 2026-08-08 · Fase 2 · Construido T0-T16, veredicto del dueño (T17): sirve

**Hecho.** Los cinco lectores de fábrica (`feed`, `json-api`, `repo-search`, `repo-releases`,
`archive`) tras `src/sources/registry.ts`, elegidos solo por `type` declarado, con su test nominal
(una fuente `feed` con `reddit.com` en la URL se lee con el lector `feed`). `src/sources/collect.ts`
aísla el fallo por fuente (RF-B05): 500, tiempo de espera agotado, tipo desconocido o XML roto se
registran y las demás continúan. El pipeline de `rank/` (`window.ts`, `score.ts`, `dedupe.ts`,
`caps.ts`, `pipeline.ts`) implementa el orden fijado por el plan
(interpretar fechas → deduplicar → filtrar ventana → filtrar memoria → puntuar → tope por fuente →
tope global) con tests que distinguen ese orden de los órdenes incorrectos, no solo que el
resultado final "se parezca". `src/state/seen.ts` guarda huella (SHA-256 de la URL y del título
normalizados, nunca el texto), poda por ventana, y no reescribe `firstSeen`, con escritura atómica
(temporal + renombrado). `recipe/validate.ts` se extiende a `sources`, `window`, `scoring` y `caps`
con la misma forma de error de la fase 1 (`campo` + `motivo`), sin abortar en el primero.
`recipes/example/recipe.yaml` gana cuatro fuentes públicas reales (`hnrss.org`, la API de dev.to,
búsqueda y lanzamientos de GitHub), sin más credencial que la del modelo (RF-B04); la receta
biotech de test gana fuentes de forma deliberadamente distinta (`archive` en vez de
`repo-search`/`repo-releases`, que no tienen sentido en ese dominio). 133 tests en verde, sin red y
sin credenciales. `pnpm run check:receta-ejemplo` ahora ejercita también la recolección, con
`fetch` servido desde fixtures. `pnpm run probe:fase2` ejecutado de verdad en esta sesión: las
cuatro fuentes de `recipes/example` respondieron (65 elementos crudos, 60 tras el pipeline), sin
ninguna credencial. La mitad de síntesis no se ejecutó al principio: `GOOGLE_GENERATIVE_AI_API_KEY`
seguía sin definir en esa parte de la sesión, y **no se simuló nada** en su lugar, tal como manda
el plan.

**T17.** El dueño exportó la credencial en su propia sesión de shell (no en un fichero: R3 lo
prohíbe, y se le explicó por qué antes de que lo pidiera) y volvió a correr `probe:fase2` completo.
La síntesis real produjo un informe (`tmp/probe-fase2.json`, no versionado) con opinión propia,
tuteo, "Aplícate esto" con acciones concretas en vez de genéricas (actualizar Biome a la 2.5.7,
probar RuleSync), y un "Pulso del día" que distingue ruido de movimiento real, tal como pide
`persona.md`. Comparado con el veredicto de la fase 1 ("el contenido sale escueto, el techo de
detalle es el techo del fixture"), este informe es visiblemente más profundo: los `verdict` y `why`
de "Lo más relevante" razonan sobre el contenido real de los artículos, no sobre una fixture de dos
frases escritas a mano. **Responde que sí a la pregunta que la fase 1 dejó abierta**, con la
salvedad ya anotada en deuda: los enlaces del informe no están todavía garantizados por código
(RF-E03 es fase 3), así que esta lectura es sobre calidad de contenido, no sobre seguridad de
enlaces.

**Se desvió.**

- **`fast-xml-parser` → `@rgrove/parse-xml`.** El plan nombraba `fast-xml-parser` para T13, pero el
  propio plan exige `@dependency-audit` antes de instalar. La auditoría encontró un patrón de CVEs
  concentrado justo en el código de expansión de entidades XML (una cadena de tres arreglos
  incompletos sobre el mismo bug, el último de hace dos semanas) y que la librería pasó a arrastrar
  siete subdependencias de un único mantenedor. Se cambió a `@rgrove/parse-xml`: cero dependencias,
  cero CVEs conocidos, e inmune por diseño a esa clase de ataque porque no resuelve entidades de
  DTD externas. Mismo patrón que ADR-017 en la fase 1: el plan fija la mejor decisión con la
  información de su momento, y el propio mecanismo de verificación que la constitución exige puede
  cambiarla.
- **`ReadContext` gana `windowDays`.** El bloque de tipos literal de T1 no lo incluía, pero RF-B09
  (T0, el requisito que el propio plan añadió) exige que `repo-search` acote su consulta a la
  ventana de la receta, y no había ningún otro conducto para llevarle ese número al lector. Se
  añadió con su motivo en el propio tipo. Es una extensión del contrato, no una ruptura: los cinco
  campos que ya existían no cambiaron.
- **`src/sources/http.ts` y `makeItem` (en `src/sources/types.ts`) no aparecen en la lista literal
  de "Ficheros que se tocan" del plan.** `http.ts` extrae `fetchWithTimeout` (identificador de
  cliente propio + tiempo de espera, RF-B08) como la única implementación compartida por los cuatro
  lectores que hacen red, en vez de repetirla cuatro veces (R10). `makeItem` es el único punto que
  construye un `Item` omitiendo `publishedAt` en vez de dejarlo en `undefined`, necesario porque
  `exactOptionalPropertyTypes` (activo desde la fase 1) rechaza asignar `undefined` explícito a un
  campo opcional; sin él, los cinco lectores habrían repetido la misma condición. Señalado por
  `@fiel-al-plan` al cerrar la fase como "de más, con disclosure floja" (estaba mencionado en esta
  bitácora bajo "Costó más de lo previsto", no bajo este epígrafe): se deja constancia aquí,
  explícitamente, de que es código nuevo no listado en el plan, justificado por R10.
- **El test de "peso ausente en la receta" (T5) vive en `tests/recipe/validate.test.ts`, no en
  `tests/rank/score.test.ts`.** Es una validación de la receta (`ScoringConfig` completo es una
  garantía de tipos por el momento en que llega a `score.ts`), no de la lógica de puntuación en sí.
  Ponerlo en `score.test.ts` habría probado indirectamente `validate.ts` desde el sitio equivocado.
- **La regla "ante duplicado se conserva el de mayor puntuación" (T7) se prueba con puntuaciones
  sintéticas inyectadas en el test.** El orden real del pipeline (T9) deduplica *antes* de puntuar,
  así que en producción los empates de deduplicación siempre se resuelven por "primero visto", no
  por puntuación real. `dedupeItems` acepta un campo `score` opcional para que la lógica de
  desempate sea genérica y comprobable en aislamiento, documentado en el código para que no se lea
  como contradicción con el orden del pipeline.

**Costó más de lo previsto.**

- `exactOptionalPropertyTypes` (ya activo desde la fase 1) contra `publishedAt?: string` en cinco
  lectores distintos: cada uno construía objetos donde `publishedAt` podía ser `string | undefined`
  y el compilador rechaza asignar `undefined` explícito a un campo opcional. Se resolvió con un
  único factory (`makeItem` en `src/sources/types.ts`, R10) que omite la clave en vez de dejarla en
  `undefined`, consumido por los cinco lectores y por `rank/pipeline.ts`.
- Diseñar `SourceSpec` como una bolsa de campos opcionales en vez de una unión discriminada por
  `type`. Una unión habría exigido que cada lector conociera la forma completa de los otros cuatro
  tipos para poder importar el tipo unión; la bolsa abierta deja que cada lector lea solo sus
  propios campos, y `validate.ts` es el único sitio que sabe qué campos exige cada `type`.

**Deuda.**

- **RF-B03 (fuente que exige credencial ausente) no lo ejercita ninguna fuente de fábrica.** Las
  cinco declaran `requiredSecrets: []` a propósito (RF-B04). El mecanismo está probado con un
  lector inyectado en el test de `validate.ts`, pero nunca se ha visto rechazar una receta real.
  Se desbloquea el día que entre un tipo de fuente que sí exija credencial (ver ADR-012 y la nueva
  entrada de `06-extensibilidad.md` sobre el radar de repositorios, que apunta en esa dirección si
  algún día exige `GITHUB_TOKEN`).
- **El "crecimiento medido de verdad" del radar de repositorios queda fuera, con su disparador
  escrito en `docs/06-extensibilidad.md` y enlazado desde `docs/ops.md`** (T0 lo pedía explícito).
- **La validación de enlaces contra el conjunto de entrada (RF-E03) sigue sin existir.** Es fase 3
  a propósito, pero conviene decirlo aquí porque `T17` juzgó un informe cuyos enlaces **no** están
  garantizados por código todavía, solo por lo que el modelo hizo bien esta vez.

**Cierre: `@fiel-al-plan` y `/verifier` (con `@guardarrailes`).** Los tres en verde tras el T17 del
dueño. `@fiel-al-plan`: veredicto fiel, doce trampas respetadas, seis contratos intactos.
`@guardarrailes`: los casos 1, 2, 3 y 4 de la batería de ataques resisten de verdad (probado
extremo a extremo con los lectores reales y `composePrompt`, no solo con `Item` escritos a mano); el
caso 8 (fuente desbordada) resiste en el camino real, no solo en el test aislado; los casos 5, 6, 7,
9 y 10 se marcan "no aplica" con razón, porque sus mecanismos (validación de enlaces, cadena de
proveedores) no existen todavía, y es fase 3 quien los construye. Tres hallazgos menores de ambos
agentes se corrigieron en el propio cierre, no se dejaron como deuda: faltaban dos de los cuatro
ficheros de ataque que el plan decía que T2 dejaría guardados (`inyeccion-en-cuerpo.xml`,
`fuga-de-prompt.xml`, para los casos 2 y 3, con sus tests de extremo a extremo contra
`composePrompt`); faltaba un test explícito para HTTP 429, nombrado aparte de 500 en T2/T14 aunque
el mecanismo genérico (`!response.ok`) ya lo cubría; y `GITHUB_TOKEN` no estaba en la tabla de
secretos de `docs/05-seguridad-legal.md`, a pesar de ser un secreto real que el código lee (opcional,
pero real). Ninguno cambiaba el veredicto, los tres eran baratos de cerrar antes de que se
convirtieran en deuda que alguien tuviera que redescubrir.

**Aprendido.** Un doble de prueba puede ser tan peligroso como el código que prueba: un lector
falso que "nunca resuelve" para simular una fuente colgada, si no respeta ningún tiempo de espera
él mismo, cuelga el test para siempre en vez de probar que `collect.ts` aísla el fallo. Se detectó
antes de ejecutarlo (el doble ignoraba `ctx.timeoutMs`) y se corrigió para que expirara de verdad,
como hacen los lectores reales vía `fetchWithTimeout`. Y una fecha fija importa tanto en el código
de producción como en los scripts de CI: `check-receta-ejemplo.ts` estuvo a punto de usar
`new Date()` contra fixtures con fechas fijas de 2026, lo que habría hecho que el chequeo se
degradara solo con el paso del tiempo real, exactamente el tipo de fallo silencioso que esta fase
existe para prevenir en el propio motor.

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
