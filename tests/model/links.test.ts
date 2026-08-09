import assert from 'node:assert/strict';
import { test } from 'node:test';
import { validateLinks } from '../../src/model/links.ts';
import { deriveSections } from '../../src/recipe/schema.ts';
import type { SectionSpec } from '../../src/recipe/types.ts';
import type { Item } from '../../src/sources/types.ts';

function item(url: string, title = 'un elemento'): Item {
  return { title, url, source: 'fuente', summary: 'resumen' };
}

const oneSectionWithLink: readonly SectionSpec[] = [
  {
    key: 'raro-nombre-de-seccion',
    title: 'Sección de nombre extraño',
    cardinality: 'one',
    condition: 'always',
    fields: [
      { name: 'texto', type: 'string' },
      { name: 'enlace', type: 'url' },
    ],
  },
];

function derive(sections: readonly SectionSpec[]) {
  const result = deriveSections(sections);
  assert.equal(result.ok, true);
  if (!result.ok) throw new Error('receta de prueba mal formada');
  return result.value;
}

test('una URL inventada ausente de la entrada llega vacía y cuenta en linksDropped', () => {
  const derived = derive(oneSectionWithLink);
  const report = {
    'raro-nombre-de-seccion': { texto: 'x', enlace: 'https://inventada.example/x' },
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, []);

  assert.equal(linksDropped, 1);
  assert.equal(
    (sanitized as Record<string, { enlace: string }>)['raro-nombre-de-seccion']?.enlace,
    '',
  );
});

test('una URL de aspecto legítimo pero ajena se descarta igual', () => {
  const derived = derive(oneSectionWithLink);
  const items = [item('https://legitima.example/articulo')];
  const report = {
    'raro-nombre-de-seccion': { texto: 'x', enlace: 'https://legitima.example.evil.test/articulo' },
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, items);

  assert.equal(linksDropped, 1);
  assert.equal(
    (sanitized as Record<string, { enlace: string }>)['raro-nombre-de-seccion']?.enlace,
    '',
  );
});

test('una URL presente con parámetros de seguimiento se acepta y se sustituye por la URL canónica', () => {
  const derived = derive(oneSectionWithLink);
  const items = [item('https://legitima.example/articulo')];
  const report = {
    'raro-nombre-de-seccion': {
      texto: 'x',
      enlace: 'https://legitima.example/articulo?utm_source=x#seccion',
    },
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, items);

  assert.equal(linksDropped, 0);
  assert.equal(
    (sanitized as Record<string, { enlace: string }>)['raro-nombre-de-seccion']?.enlace,
    'https://legitima.example/articulo',
  );
});

test('un valor que no parsea como URL absoluta http/https se descarta sin normalización tolerante', () => {
  const derived = derive(oneSectionWithLink);
  const items = [item('no-es-una-url')];
  const report = {
    'raro-nombre-de-seccion': { texto: 'x', enlace: 'no-es-una-url' },
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, items);

  assert.equal(linksDropped, 1);
  assert.equal(
    (sanitized as Record<string, { enlace: string }>)['raro-nombre-de-seccion']?.enlace,
    '',
  );
});

test('campos url en cardinalidad one, en cardinalidad list, y más de uno en la misma sección', () => {
  const sections: readonly SectionSpec[] = [
    {
      key: 'destacado',
      title: 'Destacado',
      cardinality: 'one',
      condition: 'always',
      fields: [{ name: 'enlace', type: 'url' }],
    },
    {
      key: 'novedades',
      title: 'Novedades',
      cardinality: 'list',
      min: 0,
      max: 5,
      condition: 'always',
      fields: [
        { name: 'enlacePrincipal', type: 'url' },
        { name: 'enlaceSecundario', type: 'url' },
      ],
    },
  ];
  const derived = derive(sections);
  const items = [item('https://a.example/1'), item('https://b.example/2')];

  const report = {
    destacado: { enlace: 'https://a.example/1' },
    novedades: [
      { enlacePrincipal: 'https://a.example/1', enlaceSecundario: 'https://inventada.example/x' },
      { enlacePrincipal: 'https://b.example/2', enlaceSecundario: 'https://b.example/2' },
    ],
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, items);
  const typed = sanitized as {
    destacado: { enlace: string };
    novedades: { enlacePrincipal: string; enlaceSecundario: string }[];
  };

  assert.equal(linksDropped, 1);
  assert.equal(typed.destacado.enlace, 'https://a.example/1');
  assert.equal(typed.novedades[0]?.enlacePrincipal, 'https://a.example/1');
  assert.equal(typed.novedades[0]?.enlaceSecundario, '');
  assert.equal(typed.novedades[1]?.enlaceSecundario, 'https://b.example/2');
});

test('una sección sin ningún campo url no se toca', () => {
  const sections: readonly SectionSpec[] = [
    {
      key: 'solo-texto',
      title: 'Solo texto',
      cardinality: 'one',
      condition: 'always',
      fields: [{ name: 'resumen', type: 'string' }],
    },
  ];
  const derived = derive(sections);
  const report = { 'solo-texto': { resumen: 'sin cambios' } };

  const { report: sanitized } = validateLinks(report, derived, []);

  assert.deepEqual(sanitized, report);
});

test('el recorrido usa derived.urlFields, no una clave de sección literal', () => {
  const sections: readonly SectionSpec[] = [
    {
      key: 'zzz-nombre-cualquiera-123',
      title: 'Nombre cualquiera',
      cardinality: 'one',
      condition: 'always',
      fields: [{ name: 'link', type: 'url' }],
    },
  ];
  const derived = derive(sections);
  const items = [item('https://c.example/3')];
  const report = { 'zzz-nombre-cualquiera-123': { link: 'https://c.example/3' } };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, items);

  assert.equal(linksDropped, 0);
  assert.equal(
    (sanitized as Record<string, { link: string }>)['zzz-nombre-cualquiera-123']?.link,
    'https://c.example/3',
  );
});

test('entrada vacía: todos los enlaces se descartan y no explota', () => {
  const derived = derive(oneSectionWithLink);
  const report = {
    'raro-nombre-de-seccion': { texto: 'x', enlace: 'https://cualquiera.example/x' },
  };

  const { report: sanitized, linksDropped } = validateLinks(report, derived, []);

  assert.equal(linksDropped, 1);
  assert.equal(
    (sanitized as Record<string, { enlace: string }>)['raro-nombre-de-seccion']?.enlace,
    '',
  );
});
