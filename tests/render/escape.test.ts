// El único sitio del proyecto que escapa (R10). Va primero de todo (A3): es una defensa de
// seguridad, no un detalle de presentación.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escapeHtml, escapeMarkdown } from '../../src/render/escape.ts';

test('escapeHtml neutraliza <, >, &, " y \' sin dejar ninguna etiqueta activa', () => {
  const hostile = '<script>alert(1)</script>';
  const escaped = escapeHtml(hostile);

  assert.ok(!escaped.includes('<script>'), 'no debe sobrevivir ninguna etiqueta real');
  assert.equal(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('caso 4 de la batería: <img src=x onerror=...> sale escapado, nunca activo', () => {
  const hostile = '<img src=x onerror="alert(1)">';
  const escaped = escapeHtml(hostile);

  assert.ok(!escaped.includes('<img'));
  assert.equal(escaped, '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});

test('escapeHtml escapa comillas simples y el símbolo & suelto', () => {
  assert.equal(escapeHtml(`d'Artagnan`), 'd&#39;Artagnan');
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

test('escapeMarkdown neutraliza [ ] < > ` y |, que rompen estructura o fabrican un enlace', () => {
  const hostile = '[texto](http://x) <b> `code` a|b';
  const escaped = escapeMarkdown(hostile);

  assert.equal(escaped, '\\[texto\\](http://x) \\<b\\> \\`code\\` a\\|b');
});

test('un texto sin nada peligroso no cambia con ninguno de los dos escapados', () => {
  const inocuo = 'Esto es una frase normal, con números 2026 y sin marcado.';
  assert.equal(escapeHtml(inocuo), inocuo);
  assert.equal(escapeMarkdown(inocuo), inocuo);
});

test('escapar dos veces no duplica las secuencias (guarda contra el doble escapado de T5)', () => {
  const hostile = '<b>Tom & Jerry\'s "show"</b>';
  const oncia = escapeHtml(hostile);
  const dosVeces = escapeHtml(oncia);

  assert.equal(dosVeces, oncia, 'escapar un HTML ya escapado no debe alterarlo');

  const hostileMd = '[a](b) | `c`';
  const unaVezMd = escapeMarkdown(hostileMd);
  const dosVecesMd = escapeMarkdown(unaVezMd);

  assert.equal(dosVecesMd, unaVezMd, 'escapar un markdown ya escapado no debe alterarlo');
});
