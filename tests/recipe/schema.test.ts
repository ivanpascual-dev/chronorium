import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveSections } from '../../src/recipe/schema.ts';

const pulse = {
  key: 'pulse',
  title: 'Pulso del día',
  cardinality: 'one',
  condition: 'always',
  fields: [{ name: 'text', type: 'string' }],
};

const top = {
  key: 'top',
  title: 'Lo más relevante',
  cardinality: 'list',
  min: 2,
  max: 5,
  condition: 'always',
  fields: [
    { name: 'title', type: 'string' },
    { name: 'verdict', type: 'string' },
    { name: 'link', type: 'url' },
  ],
};

function assertOk<T extends { ok: boolean }>(result: T): asserts result is T & { ok: true } {
  assert.equal(result.ok, true, 'ok' in result ? undefined : 'se esperaba éxito');
}

function assertFail<T extends { ok: boolean }>(result: T): asserts result is T & { ok: false } {
  assert.equal(result.ok, false, 'se esperaba fallo');
}

test('una receta válida produce un esquema con las claves declaradas, required completo y additionalProperties false', () => {
  const result = deriveSections([pulse, top]);
  assertOk(result);

  const schema = result.value.jsonSchema as {
    type: string;
    properties: Record<string, unknown>;
    required: string[];
    additionalProperties: boolean;
  };

  assert.equal(schema.type, 'object');
  assert.deepEqual(Object.keys(schema.properties), ['pulse', 'top']);
  assert.deepEqual(schema.required, ['pulse', 'top']);
  assert.equal(schema.additionalProperties, false);
});

test('cardinality: one produce un objeto en el esquema', () => {
  const result = deriveSections([pulse]);
  assertOk(result);

  const schema = result.value.jsonSchema as { properties: Record<string, { type: string }> };
  assert.equal(schema.properties.pulse?.type, 'object');
});

test('cardinality: list con min/max produce un array con minItems/maxItems', () => {
  const result = deriveSections([top]);
  assertOk(result);

  const schema = result.value.jsonSchema as {
    properties: Record<string, { type: string; minItems: number; maxItems: number }>;
  };
  assert.equal(schema.properties.top?.type, 'array');
  assert.equal(schema.properties.top?.minItems, 2);
  assert.equal(schema.properties.top?.maxItems, 5);
});

test('un campo sin name produce un error que nombra la sección y el campo', () => {
  const broken = { ...pulse, fields: [{ type: 'string' }] };
  const result = deriveSections([broken]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[0\]\.fields\[0\]\.name/);
  assert.match(result.issues[0]?.motivo ?? '', /pulse/);
});

test('un campo sin type produce un error que nombra la sección y el campo', () => {
  const broken = { ...pulse, fields: [{ name: 'text' }] };
  const result = deriveSections([broken]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[0\]\.fields\[0\]\.type/);
  assert.match(result.issues[0]?.motivo ?? '', /pulse/);
});

test('max menor que min produce un error que nombra la cardinalidad', () => {
  const broken = { ...top, min: 5, max: 2 };
  const result = deriveSections([broken]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[0\]\.max/);
  assert.match(result.issues[0]?.motivo ?? '', /top/);
});

test('una cardinalidad desconocida produce un error que la nombra', () => {
  const broken = { ...pulse, cardinality: 'many' };
  const result = deriveSections([broken]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[0\]\.cardinality/);
  assert.match(result.issues[0]?.motivo ?? '', /many/);
});

test('un tipo de campo desconocido produce un error que nombra el tipo y dónde aparece', () => {
  const broken = { ...pulse, fields: [{ name: 'when', type: 'datetime' }] };
  const result = deriveSections([broken]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[0\]\.fields\[0\]\.type/);
  assert.match(result.issues[0]?.motivo ?? '', /datetime/);
  assert.match(result.issues[0]?.motivo ?? '', /pulse/);
});

test('un campo tipo url produce string en el esquema y queda en la lista de rutas a validar', () => {
  const result = deriveSections([top]);
  assertOk(result);

  const schema = result.value.jsonSchema as {
    properties: {
      top: { items: { properties: Record<string, { type: string }> } };
    };
  };
  assert.equal(schema.properties.top.items.properties.link?.type, 'string');

  assert.deepEqual(result.value.urlFields, [{ sectionKey: 'top', fieldName: 'link' }]);
});

test('una sección sin ningún campo url deja la lista de rutas vacía', () => {
  const result = deriveSections([pulse]);
  assertOk(result);
  assert.deepEqual(result.value.urlFields, []);
});

test('condition: non-empty sobrevive al SectionSpec devuelto', () => {
  const result = deriveSections([top]);
  assertOk(result);
  assert.equal(result.value.sections[0]?.condition, 'always');

  const nonEmpty = { ...top, condition: 'non-empty' };
  const result2 = deriveSections([nonEmpty]);
  assertOk(result2);
  assert.equal(result2.value.sections[0]?.condition, 'non-empty');
});

test('dos secciones con la misma key producen un error', () => {
  const result = deriveSections([pulse, { ...top, key: 'pulse' }]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections\[1\]\.key/);
  assert.match(result.issues[0]?.motivo ?? '', /pulse/);
});

test('cero secciones produce un error', () => {
  const result = deriveSections([]);
  assertFail(result);

  assert.equal(result.issues.length, 1);
  assert.match(result.issues[0]?.campo ?? '', /sections/);
});

test('algo que no es un array de secciones produce un error', () => {
  const result = deriveSections({ not: 'an array' });
  assertFail(result);
  assert.equal(result.issues.length, 1);
});

test('un campo con label declarado sobrevive al SectionSpec devuelto (T5, render)', () => {
  const conLabel = {
    key: 'top',
    title: 'Lo más relevante',
    cardinality: 'one',
    condition: 'always',
    fields: [{ name: 'verdict', type: 'string', label: 'Veredicto' }],
  };
  const result = deriveSections([conLabel]);
  assertOk(result);

  assert.equal(result.value.sections[0]?.fields[0]?.label, 'Veredicto');
});

test('un campo sin label declarado no lo trae en el SectionSpec devuelto', () => {
  const result = deriveSections([pulse]);
  assertOk(result);

  assert.equal(result.value.sections[0]?.fields[0]?.label, undefined);
});

test('un label que no es texto produce un error que nombra el campo', () => {
  const malo = {
    key: 'top',
    title: 'Lo más relevante',
    cardinality: 'one',
    condition: 'always',
    fields: [{ name: 'verdict', type: 'string', label: 42 }],
  };
  const result = deriveSections([malo]);
  assertFail(result);
  assert.match(result.issues[0]?.campo ?? '', /label/);
});
