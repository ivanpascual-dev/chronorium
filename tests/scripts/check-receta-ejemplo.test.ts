// T1 de la fase 6: las tres trampas medidas en `recipes/example` (docs/plans/fase-6-publicacion.md)
// como afirmaciones comprobables, sin red y sin credenciales. Reutilizan la misma recolección que
// `check-receta-ejemplo.ts` sirve en CI (RF-H05), así que corren contra lo que la receta declare
// hoy: con el `recipe.yaml` de antes de T2 el primero y el tercer test fallan a propósito.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collectExample, FIXED_NOW } from '../../scripts/check-receta-ejemplo.ts';
import { applyCaps } from '../../src/rank/caps.ts';
import { runPipeline } from '../../src/rank/pipeline.ts';
import { topicsComponent } from '../../src/rank/score.ts';
import { defaultRegistry } from '../../src/sources/registry.ts';

test('cada topic de recipes/example casa al menos una vez contra el corpus de fixtures', async () => {
  const { recipe, collected } = await collectExample();

  for (const topic of recipe.topics) {
    const matches = collected.filter((item) => topicsComponent(item, [topic]) > 0);
    assert.ok(
      matches.length > 0,
      `el tema "${topic}" no aparece en ningún título ni resumen recolectado: no puede sumar puntos`,
    );
  }
});

test('el componente de temas decide el orden: no coincide con ordenar solo por recencia', async () => {
  const { recipe, collected } = await collectExample();

  const conTemas = runPipeline(collected, { now: FIXED_NOW, recipe, isSeen: () => false });
  const soloRecencia = runPipeline(collected, {
    now: FIXED_NOW,
    recipe: { ...recipe, scoring: { recencyWeight: 1, topicsWeight: 0 } },
    isSeen: () => false,
  });

  assert.notDeepStrictEqual(
    conTemas.map((item) => item.url),
    soloRecencia.map((item) => item.url),
    'el orden con topicsWeight real es idéntico al orden solo por recencia: los temas no están ' +
      'decidiendo nada, topicsWeight no hace nada útil con estos topics',
  );
});

test('perSourceMaxPercent recorta al menos una fuente, sin redondear a cero (Math.floor)', async () => {
  const { recipe, collected } = await collectExample();

  const sinCap = runPipeline(collected, {
    now: FIXED_NOW,
    recipe: { ...recipe, caps: { maxItems: collected.length, perSourceMaxPercent: 100 } },
    isSeen: () => false,
  });

  const perSourceLimit = Math.floor(sinCap.length * (recipe.caps.perSourceMaxPercent / 100));
  assert.ok(
    perSourceLimit > 0,
    `perSourceMaxPercent=${recipe.caps.perSourceMaxPercent} redondea a 0 con un pool de ` +
      `${sinCap.length} elementos tras Math.floor: no recorta nada, aunque una fuente domine`,
  );

  const conCap = applyCaps(sinCap, recipe.caps);

  const countBySource = (items: readonly { readonly source: string }[]): Map<string, number> => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.source, (counts.get(item.source) ?? 0) + 1);
    }
    return counts;
  };

  const antes = countBySource(sinCap);
  const despues = countBySource(conCap);
  const algunaFuenteRecortada = [...antes].some(
    ([source, count]) => (despues.get(source) ?? 0) < count,
  );

  assert.ok(
    algunaFuenteRecortada,
    'perSourceMaxPercent no reduce la aportación de ninguna fuente con el pool actual',
  );
});

test('ninguna fuente de recipes/example exige un secreto propio (RF-B04)', async () => {
  const { recipe } = await collectExample();

  for (const source of recipe.sources) {
    const reader = defaultRegistry.get(source.type);
    assert.ok(reader, `no hay lector registrado para el tipo "${source.type}"`);
    assert.deepStrictEqual(
      reader?.requiredSecrets,
      [],
      `la fuente "${source.id}" (${source.type}) exige secretos propios: ` +
        `${reader?.requiredSecrets.join(', ')}; recipes/example solo puede exigir la credencial del modelo`,
    );
  }
});
