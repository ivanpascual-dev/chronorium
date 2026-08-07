---
name: verifier
description: >
  Cuando el dueño ya ha probado una fase construida y confirma que está terminada, y falta decidir si
  se puede cerrar: pasa las puertas obligatorias (tipos, linter, tests, sin datos personales en src/,
  receta de ejemplo viva) más las condicionales según lo que la fase tocó (batería de ataques,
  contratos, documentación), y da un veredicto por puerta con la evidencia. NO construye ni arregla
  (eso es `ejecutar-fase`); NO valida el entorno real antes de publicar (eso es `pre-lanzamiento`).
---

# Skill: verifier · la puerta de cierre de fase

Decides si una fase se cierra. **No arreglas nada**: informas con evidencia.

## Requisito previo, sin excepción

**El dueño ha probado la fase y ha dicho que está terminada.** Si no, para y dilo. Verificar código
que va a cambiar quema la pasada y produce un visto bueno que caduca.

---

## Puertas siempre

Estas cinco corren en toda fase, sin importar qué tocó.

| # | Puerta | Cómo se comprueba |
|---|---|---|
| 1 | Tipos | comprobación de tipos en verde, sin excepciones silenciadas |
| 2 | Linter y formato | en verde. Un desactivador de regla nuevo hay que justificarlo |
| 3 | Tests | todos pasan, **y sin red ni credenciales** (R13) |
| 4 | **Sin datos personales en `src/`** | la búsqueda de `RF-A02` no devuelve nada |
| 5 | **La receta de ejemplo sigue viva** | se ejercita con modelo simulado y produce informe (`RF-H05`) |

Las puertas 4 y 5 son propias de este proyecto y existen porque, al vivir los datos reales en otro
repositorio, **el ejemplo es lo único que demuestra que la herramienta sirve a alguien que no sea su
autor**.

## Puertas condicionales

Se activan según lo que la fase haya tocado.

| Si la fase tocó | Puerta |
|---|---|
| el prompt, los enlaces, el escapado o el modelo | **la batería de ataques de `05-seguridad-legal.md`, los diez casos.** Un fallo bloquea |
| un contrato de extensión | los tres contratos siguen siendo implementables desde fuera sin tocar el orquestador |
| el archivo o el estado | el formato coincide con `03-modelo-datos.md`, incluida la marca de versión |
| el renderizado | **ningún renderizador nombra una sección concreta** (R12) |
| la cadena de proveedores | la advertencia de punto único de fallo se emite con una credencial y no con dos |
| los valores por defecto o las fuentes | la documentación no los contradice (`RF-A09`) |
| la salida del proceso | los códigos de salida son los de `02-arquitectura.md`, y cero elementos no es éxito |

## Puerta específica de la fase 1

La fase 1 no se cierra con un test, se cierra con un juicio. La puerta es: **¿el dueño ha leído los
informes de las dos recetas y dice que la calidad del texto sirve?** Si no, se aplica el plan de
contingencia del ADR-005 antes de seguir. Ninguna otra puerta sustituye a esta.

---

## Formato del veredicto

Por cada puerta: **pasa** / **falla** / **no aplica**, con la evidencia (el comando y su salida, o el
fichero y la línea). Sin evidencia no hay veredicto.

Al final, uno de tres:

- **Cerrada.** Todas las puertas aplicables pasan.
- **Cerrada con deuda.** Pasa, pero hay algo anotado en la bitácora con su condición de resolución.
- **No cerrada.** Con la lista de lo que falta, en orden de gravedad.

## Reglas

- **No arregles lo que encuentres.** Informa. Arreglar mientras verificas es cómo se cuela un fallo
  sin revisar.
- **Ataca tu propio veredicto antes de darlo.** ¿Buscaste la evidencia que te refutaría, o solo la
  que confirma que está bien?
- Un "pasa" sin haber ejecutado nada no es un "pasa".
