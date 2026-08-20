// T8 de la fase 6: la lógica de check-docs.ts es pura (dado un texto y un hecho del código, ¿hay
// divergencia?) y se prueba aquí con cadenas en memoria, nunca leyendo `docs/` real. Un test que
// dependiera del contenido real de la documentación se rompería cada vez que alguien corrigiera
// una coma.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  checkAudienceDeclared,
  checkEnvVars,
  checkExampleSourceCount,
  checkExitCodes,
  checkGlossaryCoverage,
  checkLinkedFiles,
  checkMarkedList,
  checkNodeVersion,
  checkReadmeParity,
} from '../../scripts/check-docs.ts';

test('detecta una versión de Node que no es la de engines.node', () => {
  const findings = checkNodeVersion('README.md', 'Requires Node.js 22 or later.', '24');
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /Node 22.*exige 24/);
});

test('no reporta nada cuando la versión de Node citada coincide', () => {
  const findings = checkNodeVersion('README.md', 'Requires Node.js 24 or later.', '24');
  assert.deepEqual(findings, []);
});

test('detecta un nombre de variable de entorno que no existe en el código', () => {
  const findings = checkEnvVars(
    'docs/guia.md',
    'Exporta `NOT_A_REAL_VAR` antes de arrancar.',
    new Set(['GOOGLE_GENERATIVE_AI_API_KEY']),
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /NOT_A_REAL_VAR/);
});

test('no reporta nada cuando la variable de entorno citada existe de verdad', () => {
  const findings = checkEnvVars(
    'docs/guia.md',
    'Exporta `GOOGLE_GENERATIVE_AI_API_KEY` antes de arrancar.',
    new Set(['GOOGLE_GENERATIVE_AI_API_KEY']),
  );
  assert.deepEqual(findings, []);
});

test('detecta un código de salida que no está en exit-codes.ts', () => {
  const text = [
    '<!-- check-docs:exit-codes -->',
    '',
    '| Código | Significado |',
    '| --- | --- |',
    '| `0` | ok |',
    '| `9` | inventado |',
    '<!-- /check-docs:exit-codes -->',
  ].join('\n');
  const findings = checkExitCodes('docs/02-arquitectura.md', text, new Set([0, 1, 2, 3, 4]));
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /"9"/);
});

test('no reporta nada cuando la tabla de códigos de salida coincide con el código real', () => {
  const text = [
    '<!-- check-docs:exit-codes -->',
    '| `0` | ok |',
    '| `1` | config |',
    '<!-- /check-docs:exit-codes -->',
  ].join('\n');
  const findings = checkExitCodes('docs/02-arquitectura.md', text, new Set([0, 1, 2, 3, 4]));
  assert.deepEqual(findings, []);
});

test('detecta que el número de fuentes prometido en prosa no coincide con recipe.yaml', () => {
  const text = [
    'This fetches from <!-- check-docs:example-source-count -->`5`<!-- /check-docs:example-source-count -->',
    'live public sources.',
  ].join('\n');
  const findings = checkExampleSourceCount('README.md', text, 4);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /5 fuentes.*declara 4/);
});

test('no reporta nada cuando el número prometido coincide con recipe.yaml', () => {
  const text = [
    'This fetches from <!-- check-docs:example-source-count -->`4`<!-- /check-docs:example-source-count -->',
    'live public sources.',
  ].join('\n');
  assert.deepEqual(checkExampleSourceCount('README.md', text, 4), []);
});

test('checkExampleSourceCount no hace nada si el documento no lleva el marcador', () => {
  assert.deepEqual(
    checkExampleSourceCount('docs/otro.md', 'Aquí no se menciona ninguna cuenta.', 4),
    [],
  );
});

test('detecta un tipo de lector que no está en el registro', () => {
  const text = [
    '<!-- check-docs:reader-types -->',
    '- **`feed`**: un canal, con `url` obligatorio.',
    '- **`inventado`**: no existe.',
    '<!-- /check-docs:reader-types -->',
  ].join('\n');
  const findings = checkMarkedList(
    'docs/07-escribir-una-receta.md',
    text,
    'reader-types',
    new Set(['feed', 'json-api', 'repo-search', 'repo-releases', 'archive']),
    'el tipo de lector',
  );
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /inventado/);
});

test('checkMarkedList ignora backticks sin negrita dentro del segmento marcado (solo cuenta el nombre listado, no los campos que menciona de paso)', () => {
  const text = [
    '<!-- check-docs:reader-types -->',
    '- **`feed`**: un canal, con `url` y `mapping` opcionales, ninguno de los dos un tipo.',
    '<!-- /check-docs:reader-types -->',
  ].join('\n');
  const findings = checkMarkedList(
    'docs/07-escribir-una-receta.md',
    text,
    'reader-types',
    new Set(['feed']),
    'el tipo de lector',
  );
  assert.deepEqual(findings, []);
});

test('checkMarkedList no hace nada si el documento no lleva el marcador', () => {
  const findings = checkMarkedList(
    'docs/08-extender-el-motor.md',
    '- **`plain-list`**: un tipo de ejemplo hipotético, no de fábrica.',
    'reader-types',
    new Set(['feed']),
    'el tipo de lector',
  );
  assert.deepEqual(findings, []);
});

test('detecta un enlace a un fichero que no existe', () => {
  const findings = checkLinkedFiles('README.md', 'Ver [la guía](docs/no-existe.md).', () => false);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /docs\/no-existe\.md/);
});

test('no reporta nada para un enlace externo ni para un enlace a un fichero que sí existe', () => {
  const findings = checkLinkedFiles(
    'README.md',
    'Ver [pnpm](https://pnpm.io) y [la guía](docs/existe.md).',
    (target) => target === 'docs/existe.md',
  );
  assert.deepEqual(findings, []);
});

test('checkReadmeParity detecta apartados que no coinciden entre README.md y README.es.md', () => {
  const en = '# T\n\n## One\n\n## Two\n';
  const es = '# T\n\n## Uno\n';
  const findings = checkReadmeParity(en, es);
  assert.ok(findings.some((f) => /apartados/.test(f.motivo)));
});

test('checkReadmeParity detecta un bloque de consola que difiere', () => {
  const en = '```bash\npnpm install\n```\n';
  const es = '```bash\nnpm install\n```\n';
  const findings = checkReadmeParity(en, es);
  assert.ok(findings.some((f) => /bloque de consola/.test(f.motivo)));
});

test('checkReadmeParity no reporta nada cuando los dos README están en paridad', () => {
  const en = '# T\n\n## One\n\n```bash\npnpm install\n```\n';
  const es = '# T\n\n## Uno\n\n```bash\npnpm install\n```\n';
  assert.deepEqual(checkReadmeParity(en, es), []);
});

test('checkGlossaryCoverage detecta un término de jerga sin entrada en el glosario', () => {
  const glossary = '- **receta**: una frase.\n- **fuente**: otra frase.\n';
  const findings = checkGlossaryCoverage(glossary, ['receta', 'fuente', 'cron']);
  assert.equal(findings.length, 1);
  assert.match(findings[0]?.motivo ?? '', /cron/);
});

test('checkGlossaryCoverage no reporta nada cuando el glosario cubre toda la lista', () => {
  const glossary = '- **receta**: una frase.\n- **cron**: otra frase.\n';
  assert.deepEqual(checkGlossaryCoverage(glossary, ['receta', 'cron']), []);
});

test('checkAudienceDeclared detecta que falta la declaración de público en el primer párrafo', () => {
  const findings = checkAudienceDeclared(
    'README.md',
    'Chronorium hace informes.\n\n## Quickstart\n',
  );
  assert.equal(findings.length, 1);
});

test('checkAudienceDeclared no reporta nada cuando el primer párrafo declara el público', () => {
  const text =
    '**Para quién es esto:** cualquiera.\n\nChronorium hace informes.\n\n## Quickstart\n';
  assert.deepEqual(checkAudienceDeclared('README.es.md', text), []);
});

test('con documentación correcta, ninguna comprobación salta (evita la puerta que grita siempre)', () => {
  const text = [
    '**Para quién es esto:** cualquiera con Node.js 24.',
    '',
    'Usa `GOOGLE_GENERATIVE_AI_API_KEY`. Ver [el glosario](glosario.md).',
    '',
    '<!-- check-docs:reader-types -->',
    '- **`feed`**: un canal.',
    '<!-- /check-docs:reader-types -->',
    '',
    '<!-- check-docs:exit-codes -->',
    '| `0` | ok |',
    '<!-- /check-docs:exit-codes -->',
  ].join('\n');

  const findings = [
    ...checkNodeVersion('README.md', text, '24'),
    ...checkEnvVars('README.md', text, new Set(['GOOGLE_GENERATIVE_AI_API_KEY'])),
    ...checkExitCodes('README.md', text, new Set([0, 1, 2, 3, 4])),
    ...checkMarkedList('README.md', text, 'reader-types', new Set(['feed']), 'el tipo de lector'),
    ...checkLinkedFiles('README.md', text, (target) => target === 'glosario.md'),
    ...checkAudienceDeclared('README.md', text),
  ];

  assert.deepEqual(findings, []);
});
