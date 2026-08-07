# Capa de modelo

> Se carga junto al `/CLAUDE.md` de la raíz, que sigue aplicando entero. Aquí solo va lo específico
> de esta carpeta.
>
> Fuente de verdad de la estructura y de los contratos: `docs/02-arquitectura.md`.
> Seguridad de esta capa: `docs/05-seguridad-legal.md`.

## Qué vive aquí

```text
src/model/
  client.ts    llamada al proveedor con el esquema derivado
  chain.ts     orden de proveedores, validación de credenciales, aviso de punto único de fallo
  retry.ts     política de reintento por clase de error
  prompt.ts    composición del prompt desde la receta
```

Es la única capa que habla con un modelo. Si otra carpeta importa el SDK, hay un problema de
arquitectura.

---

## La regla de esta capa

**Lo que se le pide al modelo es una preferencia. Lo que impone el código es una garantía.**

Cada vez que estés a punto de añadir una frase al prompt para evitar algo, pregúntate si el
incumplimiento sería grave. Si lo es, **la frase no basta**: hay que implementarlo.

El caso canónico ya está resuelto y sirve de patrón: la instrucción de no inventar enlaces existe en
el prompt **y además** el código descarta todo enlace ausente del conjunto de entrada. Lo primero
mejora el resultado; lo segundo lo garantiza.

Señal de que la capa se está degradando: el prompt crece a base de "y por favor no hagas X".

---

## El prompt

Se compone entero desde la receta (`RF-A01`). **Ningún dato de ningún usuario concreto aparece aquí**,
y CI lo comprueba (`RF-A02`).

Orden de bloques:

1. Identidad y destinatario, desde `persona.md`
2. Áreas de interés, desde `recipe.yaml`
3. Idioma de salida, desde la receta
4. **Delimitador de entrada no confiable**, y dentro los elementos
5. Instrucciones de salida

El bloque 4 no es negociable: el contenido de las fuentes va delimitado y marcado como no confiable,
siempre. Es contenido que cualquiera puede publicar.

**El esquema NO se describe en el prompt.** Se pasa como esquema estructurado, derivado de
`sections.yaml`. Describirlo en prosa fue lo que hizo que el sistema anterior tuviera el esquema
escrito a mano en cuatro sitios.

---

## La cadena de proveedores

Esta máquina existe por un fallo medido: seis de los once días perdidos del sistema anterior fueron
el mismo error, una caída temporal del único proveedor vivo de una cadena que aparentaba tener cuatro.

Al validar, en este orden:

1. Descartar los proveedores sin credenciales utilizables
2. **Rechazar las credenciales que sean un marcador de posición documentado**. El sistema anterior
   tenía guardado el texto de ejemplo de su plantilla como si fuera una clave
3. **Contar los que quedan vivos. Si es uno, avisar en voz alta** y nombrarlo como punto único de
   fallo

Al ejecutar:

- `5xx`, `429` o fallo de red → reintentar con espera creciente
- **Cualquier otro error de cliente → abandonar ese proveedor de inmediato.** No se reintenta un 401:
  el sistema anterior gastaba 77 segundos diarios haciéndolo
- Éxito con un proveedor que no era el principal → **marcarlo en el informe**, no solo en el registro
- Anotar siempre qué proveedores se intentaron y por qué se descartó cada uno

---

## Parámetros

- **Temperatura baja.** Esto no es escritura creativa: es síntesis con estructura fija.
- **Límite de tokens de salida acotado** y coherente con la cardinalidad máxima de las secciones.
- **Tope de elementos de entrada** aplicado antes de llamar, nunca después.

---

## Antes de tocar nada aquí

- Lee el ADR-005 (esquema derivado), el ADR-006 (el SDK) y el ADR-009 (cadena y reintentos). Los tres
  están en `docs/04-decisiones-adr.md` y los tres tienen su porqué medido.
- Si cambias el prompt, la validación de la salida, los enlaces o la cadena, **lanza `@guardarrailes`**.
  Es puerta obligatoria de `verifier` para las fases que tocan esta capa.
- Antes de fijar un identificador de modelo, verifícalo contra la documentación del proveedor de ese
  día. Un identificador retirado convierte el primer arranque de un desconocido en un error críptico.
