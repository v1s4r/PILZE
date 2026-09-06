import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wgs84ToLv95, lv95ToWgs84, toLv95Int } from '../js/geo/lv95.js';
import { LV95_REFERENZ } from './fixtures/lv95-proj4.mjs';

// Die Höhe selbst liefert der Bund (swissALTI3D über den Profil-/Höhendienst). Falsch werden kann
// auf unserer Seite nur die Koordinate, mit der wir fragen. swissALTI3D hat 0.5 m Auflösung – bleibt
// die Umrechnung deutlich darunter, treffen wir denselben Rasterwert wie map.geo.admin.ch.
const MAX_ABWEICHUNG_M = 0.5;

test('Koordinaten treffen die proj4-Referenz auf unter 0.5 m genau (Höhenabfrage)', () => {
  let schlimmste = 0; let ort = '';
  for (const p of LV95_REFERENZ) {
    const mine = wgs84ToLv95(p.lat, p.lon);
    const d = Math.hypot(mine.E - p.E, mine.N - p.N);
    if (d > schlimmste) { schlimmste = d; ort = p.name; }
    assert.ok(d < MAX_ABWEICHUNG_M, `${p.name}: ${d.toFixed(2)} m Abweichung`);
  }
  assert.ok(schlimmste < MAX_ABWEICHUNG_M, `grösste Abweichung ${schlimmste.toFixed(2)} m bei ${ort}`);
});

test('Ostwert und Nordwert werden nicht vertauscht', () => {
  // In LV95 ist der Ostwert immer ~2.6 Mio, der Nordwert ~1.2 Mio – ein vertauschtes Paar
  // würde die Höhenabfrage an einen völlig falschen Ort schicken.
  for (const p of LV95_REFERENZ) {
    const { E, N } = wgs84ToLv95(p.lat, p.lon);
    assert.ok(E > 2400000 && E < 2900000, `${p.name}: Ostwert ${E}`);
    assert.ok(N > 1000000 && N < 1350000, `${p.name}: Nordwert ${N}`);
    assert.ok(E > N, `${p.name}: Ostwert muss grösser als Nordwert sein`);
  }
});

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
