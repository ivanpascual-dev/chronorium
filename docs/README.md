# Documentación · qué leer y cuándo

Esta carpeta tiene dos públicos, desde la fase 6. La mayoría de estos ficheros son internos y
técnicos, para quien construye el motor. Tres no lo son: sirven a quien usa Chronorium sin tocar
`src/`, y llegan aquí desde el `README.md` de la raíz.

## Si llegas desde el README, sin programar

No necesitas nada más que estos dos, en este orden:

1. **`07-escribir-una-receta.md`** · cómo montar tu propia receta: temas, fuentes, secciones,
   persona. Sin una sola línea de código.
2. **`glosario.md`** · cada término técnico que esa guía usa, consultado al vuelo cuando lo
   necesites, no leído de principio a fin.

Si además programas en TypeScript y quieres añadir un tipo de fuente o un canal de entrega que no
existe de fábrica, esa pieza sí es de código: `08-extender-el-motor.md`.

## Si es tu primera sesión aquí (vas a construir el motor)

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

| Fichero                     | Público                                | Qué es                                                             | Se reescribe                             |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| `00-vision-producto.md`     | quien construye                        | el qué y el para quién, sin tecnología                             | rara vez                                 |
| `01-especificacion.md`      | quien construye                        | los requisitos en notación EARS                                    | al añadir requisitos                     |
| `02-arquitectura.md`        | quien construye                        | pipeline, contratos, estructura, códigos de salida                 | al cambiar la forma                      |
| `03-modelo-datos.md`        | quien construye                        | formatos del archivo y del estado                                  | con versión de esquema nueva             |
| `04-decisiones-adr.md`      | quien construye                        | las decisiones y su porqué                                         | **nunca.** Se añade un ADR que supersede |
| `05-seguridad-legal.md`     | quien construye                        | amenazas, defensas, batería de ataques, licencia                   | al aparecer una amenaza                  |
| `06-extensibilidad.md`      | quien construye                        | los futuros y su disparador                                        | al descartar o admitir algo              |
| `07-escribir-una-receta.md` | **cualquiera**                         | cómo montar tu receta, sin código                                  | al cambiar un campo de la receta         |
| `08-extender-el-motor.md`   | quien programa                         | añadir un lector o un notificador nuevo                            | al cambiar un contrato de extensión      |
| `glosario.md`               | **cualquiera**                         | cada término técnico de las guías de entrada, una frase            | al introducir un término nuevo           |
| `ops.md`                    | quien construye                        | el plan por fases                                                  | al cerrar una fase                       |
| `bitacora.md`               | quien construye                        | el diario fechado                                                  | en cada sesión                           |
| `arranque.md`               | **cualquiera**                         | la forma de tu instancia: `briefing.yml`, secretos, checklist      | al cambiar la plantilla                  |
| `informe-ejemplo.md`        | **cualquiera**                         | el informe completo de `recipes/example`, en texto                 | al regenerar la captura del README       |
| `plans/`                    | quien construye                        | el plan detallado de cada fase, escrito justo antes de construirla | por fase                                 |

**`ops.md` y `bitacora.md` no son lo mismo y no se mezclan.** El primero es el plan y se mantiene
corto porque se lee entero en cada sesión. El segundo es el diario y crece. Juntarlos hace que el plan
se vuelva ilegible en unas semanas.

**`04-decisiones-adr.md` no se reescribe nunca.** Si una decisión cambia, se añade un ADR nuevo que
supersede al anterior y el viejo se marca. Un registro de decisiones que se edita deja de ser un
registro.
