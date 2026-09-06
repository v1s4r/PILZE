import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quantile, selectThreshold } from '../js/model/heat.js';
import { CONFIG } from '../js/config.js';

test('quantile', () => {
  const v = [1, 2, 3, 4, 5];
  assert.equal(quantile(v, 0), 1);
  assert.equal(quantile(v, 1), 5);
  assert.equal(quantile(v, 0.5), 3);
  assert.equal(quantile([], 0.5), 0);
  assert.equal(quantile([3, 1, NaN, 2], 0.5), 2); // sortiert, NaN ignoriert
});

test('markiert höchstens den eingestellten Anteil', () => {
  // 1000 Zellen, gleichmässig von 0 bis 1 – alle über der Untergrenze wären sonst rot
  const scores = Array.from({ length: 1000 }, (_, i) => i / 999);
  const r = selectThreshold(scores, { topFraction: 0.1, minScore: 0.65 });
  assert.ok(r.fraction <= 0.101, `fraction=${r.fraction}`);
  assert.ok(r.fraction >= 0.09, `fraction=${r.fraction}`);
  assert.equal(r.limitedBy, 'relativ');
  assert.ok(r.threshold > 0.65);
});

test('gleichförmig gutes Gebiet wird nicht flächendeckend rot', () => {
  // realistischer Fall: fast alle Waldzellen liegen eng beieinander knapp über der Untergrenze
  const scores = Array.from({ length: 1000 }, (_, i) => (i < 350 ? 0.66 + (i % 7) * 0.005 : 0.2));
  const r = selectThreshold(scores, { topFraction: 0.1, minScore: 0.65 });
  assert.ok(r.fraction <= 0.15, `35 % lägen über der Untergrenze, markiert: ${r.fraction}`);
});

test('schwaches Gebiet bleibt leer statt «beste der schlechten»', () => {
  const scores = Array.from({ length: 500 }, () => 0.4);
  const r = selectThreshold(scores, { topFraction: 0.1, minScore: 0.65 });
  assert.equal(r.marked, 0);
  assert.equal(r.limitedBy, 'absolut');
  assert.equal(r.threshold, 0.65);
});

test('Spitzengebiet: nur die Spitze, nicht alles', () => {
  const scores = Array.from({ length: 500 }, () => 0.9);
  const r = selectThreshold(scores, { topFraction: 0.1, minScore: 0.65 });
  assert.ok(r.fraction <= 1);
  assert.ok(r.threshold >= 0.65);
});

test('Voreinstellungen sind stimmig', () => {
  assert.ok(CONFIG.heat.topFraction > 0 && CONFIG.heat.topFraction <= 0.3);
  assert.equal(CONFIG.heat.minScore, 0.65);
});
