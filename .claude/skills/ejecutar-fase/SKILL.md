---
name: ejecutar-fase
description: >
  Cuando ya existe el plan de la fase en docs/plans/ y toca construirlo: implementa las tareas en el
  orden planificado, con los tests antes que el código donde el plan lo marque, sin reabrir lo ya
  decidido, y anota en la bitácora lo que se desvió al cerrar. NO decide el orden ni el alcance (eso
  es `fase`, que va antes); NO da por buena la fase ni lanza las puertas de calidad (eso es
  `verifier`, que va después del OK del dueño).
---

# Skill: ejecutar-fase · construir lo planificado

Construyes lo que `fase` planificó. **El plan manda.**

## Paso 0 · Leer

1. `docs/plans/fase-N-<nombre>.md` · lo que toca hacer y en qué orden
2. `/CLAUDE.md` · las 15 reglas duras. Son de aplicación en cada línea que escribas
3. `docs/02-arquitectura.md` · si vas a tocar un contrato

## Cómo se construye aquí

- **Sigue el orden del plan.** Si el plan pone los tests antes, van antes: un test escrito después
  del código prueba tu comprensión del código, y pasa igual si comprendiste mal.
- **Una implementación por capacidad** (R10). Antes de escribir una función, busca si ya existe.
- **Los renderizadores no conocen nombres de sección** (R12). Si estás a punto de escribir
  `if (section === '...')`, para: has roto la premisa del proyecto.
- **Lo que impone el código es una garantía; lo que se le pide al modelo es una preferencia** (R2).
  Si una regla importa, va en código.
- **Los fallos no salen con código cero** (R6).
- Cero raya larga, también en comentarios y en mensajes de commit.

## Si el plan no se sostiene

Pasa, y es información valiosa. **Para y replanifica.** No improvises a mitad: un desvío silencioso
es lo que `fiel-al-plan` está buscando después, y es más caro descubrirlo entonces.

Si el desvío toca una decisión del blueprint, se añade un ADR. `04-decisiones-adr.md` no se reescribe.

## Al terminar de construir

1. Marca las casillas en `docs/ops.md`
2. **Escribe la entrada de la bitácora**, con su formato: qué se desvió, qué costó más de lo previsto,
   qué deuda queda y qué se aprendió. Es la parte que más se salta y la que más vale después
3. **Dilo claro: has terminado de construir, no has terminado la fase**

## La regla que separa esta skill de `verifier`

**Acabar de construir no es acabar la fase.** Ninguna puerta de calidad se lanza hasta que el dueño
haya probado lo construido y confirme que está terminado. Puede querer añadir, quitar o rehacer, y
verificar código que va a cambiar quema la pasada y da un visto bueno que caduca.

La única excepción es `@fiel-al-plan`, que detecta desvíos a mitad y no juzga calidad.
