# Planes de fase

Aquí escribe la skill `/fase` el plan detallado de cada fase, **justo antes de construirla**, con el
estado real del repositorio delante.

## Por qué está vacía

Porque planificar las siete fases el primer día produce seis planes que hay que tirar.

`ops.md` tiene el plan de alto nivel: qué fases hay, qué entra en cada una y en qué orden. Eso se
decide una vez y aguanta. El **cómo** de una fase depende de cómo quedó la anterior, y eso no se sabe
hasta llegar.

## Cómo funciona

1. Al empezar una fase, `/fase` lee `ops.md`, el estado real del repositorio y la bitácora, y escribe
   aquí `fase-N-<nombre>.md`.
2. `/ejecutar-fase` construye siguiendo ese plan, **sin reabrir lo ya decidido**. Si algo del plan no
   se sostiene contra la realidad, se para y se replanifica: no se improvisa a mitad.
3. `@fiel-al-plan` compara lo construido con el plan y detecta desvíos silenciosos.
4. El plan **se conserva** después de cerrar la fase. Es el material que permite comparar lo diseñado
   con lo construido.

## Qué lleva un plan de fase

- Los requisitos de `01-especificacion.md` que esta fase cumple, por su identificador
- El orden de las tareas, **con los tests antes de la implementación** donde aplique
- Los ficheros que se van a tocar y los contratos que se van a fijar
- Lo que **no** entra en esta fase aunque esté cerca, para que no se cuele
- Cómo se comprueba que la fase está terminada

**La última es la que más se olvida y la que más duele.** Una fase sin criterio de terminada se da por
buena cuando alguien se cansa.
