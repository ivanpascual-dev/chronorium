# La instancia de Chronorium

**Para quién es este documento:** cualquiera que quiera su propia instancia diaria, no solo probar
el ejemplo una vez. Necesitas lo mismo que en el `README` (una cuenta de GitHub y la credencial del
modelo) más pegar un fichero de configuración; nada de código.

**El sentido del flujo es el que confunde:** el repositorio público (el motor) no se ejecuta nunca
ni lee nada de tu instancia. Es tu **instancia** (tu [repositorio](glosario.md) privado, con tus
recetas y tus secretos) la que tiene el [cron](glosario.md) y llama al motor. Como una aplicación
llamando a una librería, nunca al revés.

```text
chronorium-<tu-nombre>/       privado, en tu cuenta
  recipes/daily/              tu receta de cada mañana
  recipes/weekly/             opcional: un resumen que destila la diaria (docs/07-escribir-una-receta.md)
  archive/                    vacío al crear la instancia; se llena solo, un informe por fecha
  state/                      memoria de lo ya visto y registro de ejecuciones; también se llena solo
  .github/workflows/briefing.yml   cuándo se ejecuta, y con qué receta
```

Nada de esto necesita crearse a mano salvo `briefing.yml`: `archive/` y `state/` los escribe el
motor la primera vez que corre.

## El atajo: que tu IA te guíe

Este documento ya está completo por sí solo (con las URL exactas de cada credencial), así que
pegarlo entero a la IA que uses junto con el bloque de abajo también funciona: aquí no hay
decisiones de dominio que interrogar, es sobre todo rellenar una plantilla y seguir una lista de
pasos por tres sitios distintos (GitHub, Google, Telegram) que la IA no puede pulsar por ti, solo
guiarte.

```text
Quiero que me ayudes a montar mi instancia de Chronorium siguiendo esta guía "La instancia de
Chronorium" que te he pegado junto a este mensaje. No inventes ningún bloque, secreto ni paso que
no aparezca en ella.

Primero pregúntame:
1. Mi usuario de GitHub, y el nombre que le quiero dar al repositorio de la instancia.
2. Si voy a usar solo la receta diaria, o también una semanal.
3. A qué hora UTC quiero que se ejecute cada una.
4. Qué canales de entrega activé en mi recipe.yaml (correo, Telegram, webhook, ninguno) y si
   declaré un segundo proveedor de modelo (`fallbacks`), para saber qué secretos necesito de verdad
   y no pedirme los que no aplican.

Con mis respuestas, dame el `briefing.yml` completo ya relleno con mi usuario y mis horas de cron.
Después, guíame secreto a secreto solo por los que necesito según mis respuestas del punto 4: dime
dónde se consigue cada uno (con la URL de esta guía) y qué pasa si me lo dejo. Al final, repásame la
lista de comprobación "Antes de dejar los crones sueltos" uno a uno, sin dar ninguno por hecho.
```

## `briefing.yml`, bloque por bloque

Este fichero no contiene ninguna lógica del informe (eso vive en tu receta): solo dice **cuándo**
ejecutar y **con qué receta**, y delega el trabajo en el motor público.

```yaml
name: Chronorium

on:
  schedule:
    # Hora en UTC, siempre, sin cambio de horario. Elige la hora pensando en cuándo quieres
    # tenerlo listo, no en tu hora local de hoy.
    - cron: "0 6 * * *" # la diaria, cada mañana
    - cron: "30 6 * * 1" # opcional: la semanal, los lunes, después de la diaria

  workflow_dispatch: # lanzar a mano, eligiendo receta: para la primera prueba y para recuperar un día
    inputs:
      recipe:
        required: true
        type: choice
        default: daily
        options: [daily, weekly]

jobs:
  diaria:
    if: >
      github.event_name == 'schedule' && github.event.schedule == '0 6 * * *'
      || github.event_name == 'workflow_dispatch' && inputs.recipe == 'daily'
    # El motor commitea el informe y la memoria de vuelta a TU repositorio, así que este job
    # necesita permiso de escritura explícito. Sin esta línea, GitHub rechaza la llamada antes de
    # arrancar nada: el permiso por defecto de un workflow es de solo lectura. Va por job, no en un
    # ajuste global del repositorio, para que solo tenga ese permiso lo que de verdad lo necesita.
    permissions:
      contents: write
    # LA ETIQUETA, NUNCA UNA RAMA. Apuntar a "@main" significaría que un commit cualquiera en el
    # repositorio público cambia lo que se ejecuta aquí mañana, sin que tú lo hayas decidido.
    #
    # ivanpascual-dev/chronorium es el repositorio ORIGINAL del motor, no el tuyo: no hace falta
    # forkearlo para tener tu instancia. Un workflow reutilizable se llama desde cualquier
    # repositorio, sin relación entre ellos. Este job hace checkout de TU repositorio (el de la
    # instancia) y, por separado, de la herramienta desde aquí, en un directorio aparte: son dos
    # cosas independientes. Solo cambia esta línea si de verdad mantienes tu propio fork del motor.
    uses: ivanpascual-dev/chronorium/.github/workflows/run.yml@v0.5.4
    with:
      recipe: daily
    # Pasa el almacén de secretos entero; el motor solo lee, por nombre, los que tu receta declara.
    secrets: inherit
```

El job `semanal` (si usas una receta semanal) tiene la misma forma, con su propio `if` y
`recipe: weekly`.

## Los secretos

**Van en `Settings → Secrets and variables → Actions` de tu repositorio de instancia, nunca en un
fichero de ese árbol**. La tabla dice qué pasa si te falta cada uno, para que decidas cuáles necesitas
de verdad:

| Secreto                                                | Para qué                                                | Sin él                                                                                                       |
| ------------------------------------------------------ | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GOOGLE_GENERATIVE_AI_API_KEY`                         | el proveedor de modelo que declares como principal      | no hay informe ese día                                                                                       |
| `OPENAI_API_KEY` (o el que uses)                       | **segundo proveedor**, si declaraste `fallbacks`        | el informe sigue saliendo, hasta el día que falle el único que tenías                                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD` | el canal de correo, si lo activaste                     | no llega el correo; el informe se archiva igual                                                              |
| `TELEGRAM_BOT_TOKEN`                                   | el canal de Telegram, si lo activaste                   | no llega el mensaje; el informe se archiva igual                                                             |
| un token de lectura de GitHub                          | identificarte ante su API en vez de contar como anónimo | las fuentes de tipo `repo-search` y `repo-releases` fallan días sueltos por límite de peticiones, no siempre |

**Cómo conseguir cada una:**

- **`SMTP_*` con Gmail.** `SMTP_PASSWORD` nunca es la contraseña de tu cuenta: es una contraseña de
  aplicación, y Google solo deja crearlas si ya tienes la verificación en dos pasos activada. Actívala
  primero en tu cuenta de Google si no la tienes, luego entra en
  [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords) y genera una. Copia
  esa cadena (no la vuelves a ver después) como `SMTP_PASSWORD`; `SMTP_USER` es tu dirección de Gmail
  completa, `SMTP_HOST` es `smtp.gmail.com` y `SMTP_PORT` es `465`.
- **`TELEGRAM_BOT_TOKEN`.** Habla con [@BotFather](https://t.me/BotFather) dentro de Telegram, envíale
  `/newbot` y sigue sus dos preguntas (nombre, y un usuario que termine en `bot`). Te devuelve el
  token al momento; ese es el valor del secreto. Para el `chatId` que pide la receta (no es un
  secreto, va en `sections.yaml`/`recipe.yaml` en claro): escríbele cualquier mensaje a tu bot recién
  creado y visita `https://api.telegram.org/bot<tu-token>/getUpdates` en el navegador; el número en
  `message.chat.id` de la respuesta es tu `chatId`.
- **Un token de lectura de GitHub.** `Settings → Developer settings → Personal access tokens` en tu
  cuenta de GitHub, sin ningún permiso marcado (de solo lectura pública basta): sirve solo para que la
  API te cuente como autenticado, no anónimo, y suba el límite de peticiones.

**El segundo proveedor de modelo no es un lujo.** Es la línea que evita el fallo más caro que este
proyecto tiene medido: una cadena de respaldo con un solo eslabón vivo aparenta redundancia sin
tenerla (ver el README). Si `pnpm cli doctor` avisa de punto único de fallo, la segunda credencial
no está puesta de verdad.

## Antes de dejar los crones sueltos

- [ ] Cada secreto que tu receta necesita está puesto, y **relee el valor, no solo que exista**: un
      puerto SMTP mal copiado no falla al guardarse, falla cada mañana.
- [ ] Lanzada a mano una vez (`workflow_dispatch`, receta `daily`): llega el informe por los
      canales que activaste, aparecen el `.json` y el `.md` en `archive/`, y el commit con ellos
      vuelve solo a tu repositorio.
- [ ] Relanzada el mismo día: sale con código 0 y no sobrescribe el informe ya archivado.
- [ ] Si tienes una receta semanal: su primer disparo real cae en el primer lunes con una semana
      entera de diarias detrás (el archivo nace vacío). Antes de esa fecha, ejecutarla solo produce
      un informe correctamente vacío, no un fallo.
