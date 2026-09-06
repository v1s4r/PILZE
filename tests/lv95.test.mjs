import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wgs84ToLv95, lv95ToWgs84, toLv95Int } from '../js/geo/lv95.js';

test('Bern (alte Sternwarte) liegt beim LV95-Ursprung 2600000/1200000', () => {
  const { E, N } = wgs84ToLv95(46.951082877, 7.438632495);
  assert.ok(Math.abs(E - 2600000) < 2, `E=${E}`);
  assert.ok(Math.abs(N - 1200000) < 2, `N=${N}`);
});

test('Zürich HB liegt ungefähr bei 2683000/1248000', () => {
  const { E, N } = wgs84ToLv95(47.3779, 8.5403);
  assert.ok(Math.abs(E - 2683100) < 400, `E=${E}`);
  assert.ok(Math.abs(N - 1248100) < 400, `N=${N}`);
});

test('Hin- und Rücktransformation ist stabil (< 3 m)', () => {
  for (const [lat, lon] of [[46.2, 6.15], [47.55, 7.6], [46.85, 9.53], [46.0, 8.95], [47.05, 8.3]]) {
    const { E, N } = wgs84ToLv95(lat, lon);
    const back = lv95ToWgs84(E, N);
    assert.ok(Math.abs(back.lat - lat) < 3e-5, `lat ${lat} -> ${back.lat}`);
    assert.ok(Math.abs(back.lon - lon) < 4e-5, `lon ${lon} -> ${back.lon}`);
  }
});

test('toLv95Int liefert ganze Meter', () => {
  const p = toLv95Int(47.05, 8.3);
  assert.equal(p.E, Math.round(p.E));
  assert.equal(p.N, Math.round(p.N));
});
