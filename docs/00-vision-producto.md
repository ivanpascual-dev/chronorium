# Visión de producto

Qué es, para quién y por qué. **Sin tecnología**: el cómo está en `02-arquitectura.md`.

---

## En una frase

Un agente que te da noticias sobre lo que tú necesites, con opinión propia y con qué puedes aplicarte
tú de eso, configurado sin tocar código.

Las tres partes de esa frase son el producto, y las tres tienen que sobrevivir a cualquier decisión
que se tome después:

- **noticias sobre lo que tú necesites** · el dominio entero es configuración, no código
- **con opinión propia** · no es un agregador. Juzga, prioriza y dice qué es ruido
- **qué puedes aplicarte tú** · aterrizado en lo que la persona tiene entre manos, no consejos
  genéricos

---

## El problema

Quien trabaja en un campo que se mueve rápido tiene dos malas opciones: seguir veinte fuentes a mano
y perder media mañana, o suscribirse a boletines escritos para todo el mundo, que hablan de todo y no
le sirven para nada.

Existen agregadores de noticias, y existen boletines con criterio. Lo que no existe es algo que
**tenga el criterio de un boletín y a la vez sepa quién eres tú**, sin que pases por una redacción
que decide por su cuenta qué es importante.

Y la mayoría de las herramientas que se acercan tienen el mismo defecto de fábrica: **están escritas
para su autor.** Sirven para el tema de su autor, con las secciones que su autor quiso, dirigidas al
trabajo de su autor. Para usarlas con lo tuyo hay que editar su código.

---

## La idea

**Separar el motor del dominio.**

El motor recoge, filtra, ordena, pide una síntesis, la valida, la formatea y la entrega. No sabe de
qué va lo que está procesando.

El dominio vive en una **receta**: una carpeta que declara de dónde leer, qué importa, **qué secciones
tiene el informe**, quién es el agente y a quién le habla. Copias la carpeta, la cambias, y tienes
otro agente.

**La parte que no es obvia y que hace el diseño:** que las *secciones del informe* estén en la receta,
no solo las fuentes. Un desarrollador quiere una sección de repositorios; alguien que sigue
biotecnología no sabe qué hacer con ella y quiere otra de ensayos clínicos. Si las secciones están en
el código, la herramienta solo sirve para el dominio de quien la escribió.

---

## Para quién

**El usuario primario:** alguien que ya sigue un campo por su cuenta, que tiene criterio propio y que
está harto de hacer de filtro a mano. Sabe editar un fichero de configuración. No quiere montar
infraestructura.

**Quién no es:** alguien que quiere una herramienta con interfaz gráfica para todo, alguien que quiere
un boletín ya curado por otros, o alguien que busca una plataforma con cuentas y suscriptores. Nada
de eso está aquí.

---

## Historias de usuario

**Recibir**

- Como lector, quiero recibir un informe corto cada mañana, para enterarme de lo que importa en dos o
  tres minutos.
- Como lector, quiero que el informe **no repita** lo que ya me enseñó, para no releer lo mismo.
- Como lector, quiero que las secciones vacías desaparezcan, para que un día flojo sea un informe
  corto y no un informe con huecos.
- Como lector, quiero poder pegar el informe en otra herramienta conversacional y que se entienda,
  para profundizar en lo que me interese.

**Configurar**

- Como usuario nuevo, quiero **hacer un fork y poner mis credenciales**, para tener mi primer informe
  sin editar código.
- Como usuario, quiero declarar mis fuentes y mis temas en un fichero, para ajustarlo sin tocar el
  programa.
- Como usuario, quiero **definir las secciones de mi informe**, para que se parezca a mi trabajo y no
  al de otro.
- Como usuario, quiero que el fichero donde me describo **me avise de que se va a tomar al pie de la
  letra**, para no describirme como lo que aspiro a ser y recibir consejos que no aplican.

**Confiar**

- Como usuario, quiero enterarme si el sistema lleva días fallando, **sin abrir ningún registro**.
- Como usuario, quiero que me avise si tengo un solo proveedor configurado, para saber que estoy a
  una caída de quedarme sin informe.
- Como usuario, quiero que ningún enlace del informe sea inventado, para poder hacer clic sin
  comprobar.

**Extender**

- Como desarrollador, quiero añadir una fuente de un tipo nuevo implementando una interfaz, sin tocar
  el orquestador.
- Como desarrollador, quiero añadir un canal de entrega igual.
- Como desarrollador, quiero que los tipos me digan qué tengo que implementar, sin leerme el código
  entero.

---

## Qué NO es

| Fuera | Por qué |
|---|---|
| Publicar en redes o generar contenido para publicar | Es otro agente. Frontera, no fase futura |
| Un chat sobre las noticias | Pegar el informe en una herramienta que ya tiene tu contexto funciona mejor |
| Una plataforma con cuentas y suscriptores | Cada uno opera su instancia. No hay servicio central |
| Un agregador neutral | La opinión es la mitad del producto |
| Una interfaz gráfica de configuración | La configuración es un fichero, y eso es una ventaja |

---

## Cómo se sabe que ha salido bien

Tres pruebas, en orden. Ninguna es una métrica de adopción, y es deliberado.

1. **Una segunda receta, de otro dominio y con otras secciones, produce un informe coherente sin
   tocar el código.** Si esto falla, el proyecto no ofrece nada que no ofrecieran los que ya existen.
2. **Alguien que no conoce el proyecto llega a su primer informe en cinco minutos.**
3. **Su autor recibe su informe todos los días.** Es el único que se mide en producción y no en un
   test, y es el listón mínimo: la versión anterior fallaba uno de cada cinco días.

**Lo que explícitamente no es un criterio de éxito:** estrellas, contribuciones, número de usuarios.
El proyecto está pensado para **estar acabado, no para estar vivo**. Eso es una decisión de alcance,
no falta de ambición, y es lo que permite decir que no a la mitad de las ideas razonables que
aparecerán.
