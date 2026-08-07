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
