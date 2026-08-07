---
name: pre-lanzamiento
description: >
  Cuando todas las fases están cerradas y toca publicar el repositorio o etiquetar una versión que
  las instancias van a consumir: valida contra el entorno real (ejecución completa con modelo y
  fuentes de verdad, la ruta del desconocido cronometrada, el historial sin credenciales, la
  documentación sin contradicciones) y da un veredicto de publicable o no. NO cierra una fase
  intermedia (eso es `verifier`); NO construye.
---

# Skill: pre-lanzamiento · la puerta contra el mundo real

`verifier` cierra fases contra tests. Esta skill valida contra **la realidad**: red de verdad, modelo
de verdad, una cuenta que no es la tuya.

Se ejecuta antes de publicar el repositorio y antes de cada etiqueta que una instancia vaya a
consumir.

---

## 1 · El sistema funciona de verdad

- [ ] Ejecución completa con fuentes y modelo reales. Produce informe
- [ ] El informe generado **no contiene ningún enlace inventado**. Se comprueba a mano contra el
      conjunto de entrada, al menos una vez
- [ ] La segunda receta produce un informe coherente **sin haber tocado `src/`**. Es el criterio que
      decide si el proyecto tiene sentido
- [ ] Los códigos de salida son los correctos: fuerza un fallo de recolección y comprueba que no sale
      cero
- [ ] Un proveedor caído cae al siguiente, y el informe lo hace constar

## 2 · La ruta del desconocido

**En una cuenta que no sea la tuya, o al menos en un directorio limpio sin nada configurado.**

- [ ] Fork, credenciales, informe. **Cronometrado.** Objetivo declarado: cinco minutos
- [ ] Siguiendo **solo** el README, sin conocimiento previo
- [ ] Ninguna receta de fábrica pide credenciales más allá de la del modelo (`RF-B04`)
- [ ] El fichero de ejemplo de entorno menciona **todas** las variables que el código lee

> Este bloque existe porque el sistema anterior fallaba justo aquí: su fichero de ejemplo omitía diez
> variables que el código sí leía, y su guía de instalación apuntaba a una ruta que ya no existía.
> Quien lo siguiera arrancaba con medio sistema muerto.

## 3 · Seguridad

- [ ] **La batería de ataques completa, los diez casos, en verde**
- [ ] **Ninguna credencial en el historial de git.** Se revisa el historial entero, no el último
      commit
- [ ] Ningún secreto aparece en la salida del proceso, ni completo ni parcial
- [ ] Ningún dato personal en `src/` ni en `recipes/example/`
- [ ] La instancia fija **etiqueta, no rama** (amenaza A6)

## 4 · La documentación no miente

- [ ] Cada comando del README se ejecuta y hace lo que dice
- [ ] Las fuentes que promete el README son las que trae la receta de ejemplo
- [ ] La versión del entorno de ejecución es la misma en todos los sitios
- [ ] No hay rutas absolutas de la máquina de nadie
- [ ] Existe el fichero de licencia

> Los cinco puntos son fallos reales del sistema anterior, uno por uno.

## 5 · Publicación

- [ ] Etiqueta creada con notas de versión
- [ ] Si es una etiqueta que consumen instancias: probada **desde una instancia** antes de anunciarla

---

## Veredicto

**Publicable** o **no publicable**, con la lista de lo que falta. Sin término medio: una etiqueta que
consumen instancias reales o está lista o no lo está.

**Regla dura:** un punto sin comprobar cuenta como fallado. Este documento no se rellena de memoria.
