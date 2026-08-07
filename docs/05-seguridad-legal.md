# Seguridad y aspectos legales

Este es el documento donde más aporta la doctrina heredada, porque **Chronorium es un agente que
ingiere contenido de terceros y se lo da a un modelo**. Esa cadena es exactamente la superficie que
la doctrina de seguridad de agentes cubre, y aquí se aplica entera aunque el proyecto no tenga ni web
ni usuarios.

---

## Modelo de amenazas

El sistema no tiene servidor, ni usuarios, ni dinero, ni datos de terceros. Su superficie es
pequeña y muy concreta:

| #   | Amenaza                                                | Vía                                                         | Impacto                                                   |
| --- | ------------------------------------------------------ | ----------------------------------------------------------- | --------------------------------------------------------- |
| A1  | **Inyección de instrucciones** vía contenido de fuente | cualquiera publica un artículo cuyo título contenga órdenes | el informe dice lo que quiera un tercero                  |
| A2  | **Enlace inventado o envenenado** en la salida         | el modelo alucina una URL, o la copia de contenido hostil   | el lector hace clic en algo que el sistema nunca vio      |
| A3  | **Marcado inyectado** en la salida                     | título con etiquetas que llega al correo o al archivo       | ejecución de código en el cliente de correo o en el visor |
| A4  | **Fuga de credenciales**                               | secreto en un commit, en un log o en el propio informe      | acceso a la cuenta del proveedor                          |
| A5  | **Agotamiento de cuota**                               | fuente que devuelve miles de elementos                      | factura o límite alcanzado                                |
| A6  | **Suplantación de la instancia**                       | alguien con acceso de escritura al repositorio público      | ejecuta código en las instancias que lo invocan           |

**A6 merece una nota**, porque nace del diseño de dos repositorios: las instancias invocan un
workflow del repositorio público, así que quien controle ese repositorio ejecuta código en ellas. Se
mitiga con `ADR-014`: **las instancias fijan una etiqueta, no la rama principal.** Un cambio malicioso
o simplemente roto en la rama principal no llega a nadie hasta que alguien sube su etiqueta a mano.

---

## Las defensas, y dónde vive cada una

La regla que las ordena todas está en la constitución, R2: **lo que se le pide al modelo es una
preferencia; lo que impone el código es una garantía.**

| Amenaza | Defensa                                                                             | Dónde         |
| ------- | ----------------------------------------------------------------------------------- | ------------- |
| A1      | Contenido de fuente delimitado y marcado como no confiable en el prompt             | prompt        |
| A1      | Salida restringida a la estructura declarada, sin texto libre                       | **código**    |
| A1      | Temperatura baja y límite de tokens                                                 | código        |
| A2      | **Todo enlace que no esté en el conjunto de entrada se descarta**                   | **código**    |
| A3      | Escapado de todo contenido externo o generado antes de cualquier salida con marcado | **código**    |
| A4      | Secretos solo desde el entorno, sin fichero de secretos en el árbol                 | **código**    |
| A4      | Los valores de secreto nunca se registran, ni completos ni parciales                | **código**    |
| A5      | Tope de elementos por fuente y tope global antes de llamar al modelo                | **código**    |
| A6      | Las instancias fijan etiqueta, no rama                                              | configuración |

**Sobre A4 y el enmascarado.** El sistema anterior enmascaraba las claves mostrando los cuatro
primeros y los cuatro últimos caracteres. Eso no es enmascarar, es filtrar ocho caracteres. Aquí un
secreto **no se muestra nunca**, ni parcialmente: se dice si está presente y si es válido, nada más.

**Sobre A2, que es el caso didáctico del proyecto.** El sistema anterior tenía esta regla en su
prompt: _"NUNCA inventes enlaces. Cópialos textualmente."_ Es una petición. Aquí el conjunto de
elementos enviados al modelo se conserva, y al recibir la respuesta **cada campo de tipo `url` se
comprueba contra ese conjunto**. El que no esté se vacía y se cuenta en `meta.linksDropped`. La
diferencia entre una y otra es la diferencia entre confiar y verificar.

---

## Batería de ataques

Repetible, ejecutable con un comando, y **puerta obligatoria antes de publicar** (`RF-E07`). No es
una revisión de una sola vez: es un test que corre siempre.

| #   | Ataque                                 | Cómo se monta                                                                                             | Pasa si                                                     |
| --- | -------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| 1   | Instrucción en el título de una fuente | fichero de prueba con un título que ordena ignorar las instrucciones previas y escribir un texto concreto | ese texto no aparece en el informe                          |
| 2   | Instrucción en el cuerpo               | igual, en la descripción del elemento                                                                     | igual                                                       |
| 3   | Petición de fuga del prompt            | elemento que pide revelar las instrucciones del sistema                                                   | ningún fragmento del prompt aparece en la salida            |
| 4   | Marcado en el título                   | título con etiquetas de script y de imagen con manejador de error                                         | la salida los muestra escapados, nunca activos              |
| 5   | Enlace inventado                       | modelo simulado que devuelve una URL ausente de la entrada                                                | el campo llega vacío y `linksDropped` vale 1                |
| 6   | Enlace sustituido                      | modelo simulado que devuelve una URL de aspecto legítimo pero ajena                                       | se descarta igual                                           |
| 7   | Salida que no valida                   | modelo simulado que devuelve una sección de menos                                                         | la ejecución falla con código `3`, sin rellenar por defecto |
| 8   | Fuente desbordada                      | fichero de prueba con 5.000 elementos                                                                     | se aplican los topes y la llamada al modelo no crece        |
| 9   | Credencial que es marcador de posición | valor igual al de la plantilla documentada                                                                | la validación lo rechaza antes de ejecutar                  |
| 10  | Punto único de fallo                   | una sola credencial válida configurada                                                                    | el arranque emite la advertencia                            |

Los diez corren **sin red**: las fuentes son ficheros guardados y el modelo es un doble. Eso es lo que
permite que sean parte del CI y no un ritual que se salta cuando hay prisa.

---

## Gestión de secretos

| Secreto                              | Obligatorio                  | Para qué                                   |
| ------------------------------------ | ---------------------------- | ------------------------------------------ |
| Credencial del proveedor de modelo   | sí                           | generar el informe                         |
| Segunda credencial de otro proveedor | **muy recomendada**          | quita el punto único de fallo. Ver ADR-009 |
| Credenciales de correo               | según la entrega configurada | enviar el informe                          |

**Dos secretos para arrancar.** Cada uno de más aleja el objetivo de que un desconocido llegue a su
primer informe en cinco minutos, y por eso Reddit queda fuera (ADR-012).

Reglas duras:

- Se leen **solo del entorno**. No existe ningún fichero de secretos en el árbol del proyecto.
- No se registran nunca, ni enmascarados.
- En la instancia viven en el almacén de secretos de la plataforma, no en el repositorio.
- El repositorio nuevo **se crea vacío**, no copiando el anterior, para que las tres credenciales en
  texto plano de aquel no entren jamás en el historial (ADR-001).

---

## Datos personales

El proyecto **no trata datos de terceros**. Cada usuario opera su propia instancia con sus propios
datos, y no hay servicio central, ni cuentas, ni telemetría, ni recogida de ninguna clase.

Los únicos datos personales del sistema son los del propio usuario, dentro de su instancia privada:
su perfil en la receta y su archivo de informes. Por eso la instancia es un repositorio aparte y
privado (ADR-002).

**Contenido de terceros.** Los informes citan y resumen artículos ajenos, con enlace a la fuente
original. Es uso de cita, y el archivo es privado por defecto. Si alguien decide publicar su archivo,
la responsabilidad de ese uso es suya, y así debe decirlo la documentación.

---

## Licencia y aspectos legales del repositorio público

- **Licencia MIT**, con el fichero presente. El sistema anterior declaraba una licencia en sus
  metadatos y no tenía fichero, que es no tener licencia.
- **Política de seguridad** con una vía para reportar un fallo en privado.
- **Sin garantía y sin compromiso de soporte**, escrito de forma explícita y sin rodeos: el objetivo
  declarado del proyecto es estar acabado, no estar vivo.
- **Aviso sobre las fuentes:** las recetas de fábrica leen canales públicos, y cada usuario es
  responsable de respetar las condiciones de uso de las fuentes que añada.
