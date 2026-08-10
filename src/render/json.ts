import type { Renderer } from './types.ts';

/** El JSON es el dato; no escapa nada (contrato #8 de la fase): `JSON.stringify` ya produce una
 * sintaxis válida por sí sola, y escapar aquí produciría entidades dentro del propio JSON. */
export const jsonRenderer: Renderer = {
  format: 'json',
  render(report) {
    return JSON.stringify(report, null, 2);
  },
};
