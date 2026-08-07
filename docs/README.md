# Documentación · qué leer y cuándo

Esta carpeta es interna y técnica. Lo que ve quien llega al proyecto desde fuera está en el `README.md`
de la raíz.

## Si es tu primera sesión aquí

Lee en este orden y para cuando entiendas la premisa:

1. **`/CLAUDE.md`** (raíz) · cómo se trabaja aquí y las reglas duras
2. **`00-vision-producto.md`** · qué es y para quién
3. **`04-decisiones-adr.md`** · por qué es así. **Es el documento que evita que propongas algo que ya
   se descartó con motivo**

## Si vas a construir

| Antes de                                   | Lee                                                             |
| ------------------------------------------ | --------------------------------------------------------------- |
| escribir cualquier código                  | `01-especificacion.md`, el requisito concreto que vas a cumplir |
| tocar la estructura o un contrato          | `02-arquitectura.md`                                            |
| tocar el archivo o el estado               | `03-modelo-datos.md`                                            |
| tocar el prompt, los enlaces o el escapado | `05-seguridad-legal.md`                                         |
| proponer una funcionalidad nueva           | `06-extensibilidad.md`, por si ya está descartada con su porqué |
| empezar una fase                           | `ops.md`, y luego `/fase` para planificarla                     |

## Si vuelves después de un tiempo

`bitacora.md` primero. Es lo que pasó de verdad en cada sesión, incluido lo que se desvió del plan.
`ops.md` te dice el plan; la bitácora te dice la realidad.

---

## Los ficheros

| Fichero                 | Qué es                                                             | Se reescribe                             |
| ----------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `00-vision-producto.md` | el qué y el para quién, sin tecnología                             | rara vez                                 |
| `01-especificacion.md`  | los requisitos en notación EARS                                    | al añadir requisitos                     |
| `02-arquitectura.md`    | pipeline, contratos, estructura, códigos de salida                 | al cambiar la forma                      |
| `03-modelo-datos.md`    | formatos del archivo y del estado                                  | con versión de esquema nueva             |
| `04-decisiones-adr.md`  | las decisiones y su porqué                                         | **nunca.** Se añade un ADR que supersede |
| `05-seguridad-legal.md` | amenazas, defensas, batería de ataques, licencia                   | al aparecer una amenaza                  |
| `06-extensibilidad.md`  | los futuros y su disparador                                        | al descartar o admitir algo              |
| `ops.md`                | el plan por fases                                                  | al cerrar una fase                       |
| `bitacora.md`           | el diario fechado                                                  | en cada sesión                           |
| `arranque.md`           | inicializar el repositorio                                         | una vez                                  |
| `plans/`                | el plan detallado de cada fase, escrito justo antes de construirla | por fase                                 |

**`ops.md` y `bitacora.md` no son lo mismo y no se mezclan.** El primero es el plan y se mantiene
corto porque se lee entero en cada sesión. El segundo es el diario y crece. Juntarlos hace que el plan
se vuelva ilegible en unas semanas.

**`04-decisiones-adr.md` no se reescribe nunca.** Si una decisión cambia, se añade un ADR nuevo que
supersede al anterior y el viejo se marca. Un registro de decisiones que se edita deja de ser un
registro.
