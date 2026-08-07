# Arranque del repositorio

De cero al primer commit. Se hace una vez. Corresponde a la **Fase 0** de `ops.md`.

> **Regla dura antes de nada: el repositorio se crea vacío.** No se copia el directorio del sistema
> anterior, ni siquiera "solo el código". Aquel tiene tres credenciales en texto plano en dos ficheros
> distintos, y una vez entran en el historial de git no salen. Ver ADR-001.

---

## 1 · El repositorio público

```bash
mkdir chronorium && cd chronorium
git init -b main
```

Vuelca aquí el contenido de este paquete: `CLAUDE.md` y `docs/` a la raíz, `.claude/` en su sitio,
`.gitignore`, `.markdownlint.json` y `.mcp.json.example` a la raíz, y `ci.yml` a
`.github/workflows/ci.yml`.

**Comprueba antes del primer commit** que no hay ningún `.env`, ningún fichero de secretos y ningún
dato personal. Es el único momento en que arreglarlo es gratis.

## 2 · Proyecto y dependencias

```bash
pnpm init
```

En `package.json`, **fija la versión del entorno de ejecución en `engines`**. Ese es el único sitio
donde vive ese número (`RF-A10`): la documentación y el CI lo leen de ahí, no lo repiten.

Antes de fijarlo, **verifica cuál es la LTS actual** contra la documentación oficial de hoy. No lo
copies de este documento ni de memoria: es exactamente el tipo de número que envejece.

```bash
pnpm add ai zod yaml
pnpm add -D typescript tsx @types/node
```

Sobre las dependencias, y es una decisión, no un descuido:

- **El SDK de modelos se instala sin fijar major.** El lockfile lo congela. Ver la política de
  versiones en `/CLAUDE.md`.
- **Sin librería de tests.** El entorno de ejecución trae la suya.
- **Sin servidor HTTP, sin planificador, sin cliente de peticiones.** Nada de eso hace falta aquí
  (ADR-008).
- Los proveedores de modelo se añaden uno por uno según los que la receta de ejemplo use. Cada uno es
  un paquete aparte.

## 3 · TypeScript, linter y formateador

Módulos ES, modo estricto, salida a `dist/`. Sin decoradores ni nada exótico: el proyecto es una
tubería de datos.

**Regla que no se relaja:** el modo estricto entra desde el primer commit. Activarlo después de tener
código es una tarde perdida, y el proyecto existe precisamente porque los contratos importan
(ADR-007).

## 4 · Integración continua

`ci.yml` corre en cada envío y en cada propuesta de cambio: comprobación de tipos, linter, tests y
construcción. Además, y esto es específico de este proyecto:

- **Comprueba que `src/` no contiene datos personales** (`RF-A02`). Una búsqueda que falla el trabajo.
- **Ejercita la receta de ejemplo con un modelo simulado** (`RF-H05`). Es lo único que demuestra que
  la herramienta sirve a alguien que no seas tú, ahora que los datos reales viven en otro repositorio.
- **Comprueba que la documentación no contradice al código** (`RF-A09`).

Las tres existen porque el sistema anterior falló exactamente ahí.

## 5 · Contexto de documentación para el asistente

```bash
cp .mcp.json.example .mcp.json
```

Pon la credencial real dentro. `.mcp.json` está en `.gitignore`; el ejemplo, no.

Sirve para consultar la documentación actual de las librerías en vez de trabajar de memoria. Es la
herramienta que hay que usar antes de fijar cualquier número de versión.

## 6 · Primer commit y etiqueta

```bash
git add -A
git commit -m "Fase 0: estructura del proyecto y documentación de diseño"
git tag v0.0.0
```

La etiqueta importa desde el principio: las instancias fijan etiqueta, no rama (ADR-014), y eso es
también una defensa de seguridad (amenaza A6 en `05-seguridad-legal.md`).

---

## 7 · El repositorio de la instancia

**Esto es de la Fase 5, no de la 0.** Está aquí para que se vea el conjunto.

```text
chronorium-<nombre>/          privado
  recipes/daily/
  recipes/weekly/
  archive/                    vacío al empezar, o con el histórico importado
  state/
  .github/workflows/briefing.yml
```

El workflow son unas diez líneas que invocan el workflow reutilizable del repositorio público, fijado
a una etiqueta. Los secretos van en el almacén de secretos de **este** repositorio, nunca en un
fichero.

**El sentido del flujo es el que confunde:** el repositorio público no se ejecuta nunca ni lee nada de
aquí. Es esta instancia la que tiene el cron y llama a la herramienta. Como una aplicación llamando a
su librería.

---

## Comprobación final de la Fase 0

- [ ] `git log` tiene exactamente un commit y ninguna credencial en él
- [ ] La versión del entorno de ejecución aparece en **un solo sitio**
- [ ] El CI pasa en verde sin ninguna variable de entorno local
- [ ] `.gitignore` cubre `.env*`, `.mcp.json`, `dist/` y `node_modules/`
- [ ] Existe el fichero de licencia. No basta con declararla en los metadatos: el sistema anterior
      declaraba una y no tenía fichero, que es no tener licencia
