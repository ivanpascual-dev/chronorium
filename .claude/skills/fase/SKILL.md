---
name: fase
description: >
  Cuando toca empezar una fase de ops.md y hay que decidir el orden de ataque con el estado real del
  repositorio delante: lee la fase, la bitácora y el código que ya existe, y escribe el plan en
  docs/plans/fase-N-<nombre>.md con los requisitos que cubre, los tests antes que la implementación,
  los contratos que fija y el criterio de terminada. NO construye nada (eso es `ejecutar-fase`); NO
  juzga si lo construido cumple (eso es `verifier`).
---

# Skill: fase · planificar antes de construir

Planificas una fase concreta con el repositorio real delante. **No escribes código.**

## Paso 0 · Leer

En este orden, y sin saltarte ninguno:

1. `docs/ops.md` · la fase que toca y sus tareas
2. `docs/bitacora.md` · las dos últimas entradas. Qué se desvió y qué deuda quedó
3. `docs/01-especificacion.md` · los requisitos que esta fase cumple, por identificador
4. `docs/04-decisiones-adr.md` · para no replanificar algo ya decidido
5. **El código que ya existe.** No planifiques sobre lo que `ops.md` supone que hay: mira lo que hay

Si la fase anterior dejó deuda que bloquea esta, dilo y para.

## Paso 1 · Escribir el plan

En `docs/plans/fase-N-<nombre>.md`:

- **Requisitos que cubre**, por identificador (`RF-xxx`). Si una tarea de `ops.md` no mapea a ningún
  requisito, pregunta antes de planificarla: o falta el requisito, o sobra la tarea
- **Orden de tareas**, con los **tests antes de la implementación** donde aplique. La lógica pura de
  este proyecto (puntuación, deduplicación, esquema, validación de enlaces, fechas, escapado) se
  presta a ello y la constitución lo exige (R13)
- **Ficheros que se tocan** y **contratos que se fijan**. Un contrato fijado en esta fase que otra
  tendrá que romper es una señal de que el corte está mal
- **Lo que NO entra**, aunque esté cerca. Es la parte que evita que la fase crezca sola
- **Criterio de terminada.** Concreto y comprobable. Sin él, la fase se da por buena cuando alguien
  se cansa

## Paso 2 · Presentar y esperar

Presenta el plan y **espera confirmación** antes de que `ejecutar-fase` lo tome. Iterar en el plan es
barato; iterar en el código, no.

## Reglas

- **Corta por verificabilidad, no por tema.** Cada pieza tiene que poder probarse sola, sin depender
  de que las demás estén hechas. Si una pieza no se puede verificar aislada, el corte está mal.
- **No reabras decisiones.** Si algo del blueprint no se sostiene, dilo y para: se añade un ADR, no se
  improvisa dentro de un plan de fase.
- **La fase 1 es especial.** No construye producto, responde una pregunta (ver `ops.md`). Su criterio
  de terminada es un juicio de calidad del dueño, no un test que pasa.
- Cero raya larga en lo que escribas.
