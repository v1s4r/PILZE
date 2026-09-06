import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slopeAspect } from '../js/analysis/terrain.js';
import { deciduousShareFromColor, forestStats } from '../js/analysis/raster.js';

test('Südhang: Höhe nimmt nach Süden ab -> Exposition 180°, Neigung 45°', () => {
  const cols = 3, rows = 3;
  // Zeile 0 = Norden (hoch), Zeile 2 = Süden (tief), 100 m Abstand, 100 m Höhendifferenz
  const elev = Float64Array.from([1200, 1200, 1200, 1100, 1100, 1100, 1000, 1000, 1000]);
  const { slope, aspect } = slopeAspect(elev, cols, rows, () => 100, () => 100);
  assert.ok(Math.abs(slope[4] - 45) < 0.01);
  assert.ok(Math.abs(aspect[4] - 180) < 0.01);
});

test('Westhang: Höhe nimmt nach Westen ab -> Exposition 270°', () => {
  const elev = Float64Array.from([1000, 1100, 1200, 1000, 1100, 1200, 1000, 1100, 1200]);
  const { aspect } = slopeAspect(elev, 3, 3, () => 100, () => 100);
  assert.ok(Math.abs(aspect[4] - 270) < 0.01);
});

test('flach -> Exposition unbekannt, Neigung 0', () => {
  const elev = new Float64Array(9).fill(500);
  const { slope, aspect } = slopeAspect(elev, 3, 3, () => 100, () => 100);
  assert.equal(slope[4], 0);
  assert.ok(Number.isNaN(aspect[4]));
});

test('Farbton -> Laubholzanteil', () => {
  assert.equal(deciduousShareFromColor(20, 90, 30), 0);        // dunkelgrün = Nadelholz
  assert.equal(deciduousShareFromColor(230, 120, 30), 1);      // orange = Laubholz
  const mid = deciduousShareFromColor(230, 230, 40);           // gelb = gemischt
  assert.ok(mid > 0.5 && mid < 0.9, String(mid));
  assert.equal(deciduousShareFromColor(128, 128, 128), null);  // grau = unbekannt
});

test('forestStats: Deckkraft -> Waldanteil, Farbe -> Laubholz', () => {
  const cols = 2, rows = 1, w = 4, h = 2;
  const data = new Uint8ClampedArray(w * h * 4);
  // linke Zelle: alle 4 Pixel grün und deckend; rechte Zelle: 2 von 4 Pixel orange, Rest transparent
  const px = (x, y, r, g, b, a) => { const k = (y * w + x) * 4; data[k] = r; data[k + 1] = g; data[k + 2] = b; data[k + 3] = a; };
  for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) px(x, y, 20, 90, 30, 255);
  px(2, 0, 230, 120, 30, 255); px(3, 1, 230, 120, 30, 255);
  const { forestFrac, decid } = forestStats({ width: w, height: h, data }, cols, rows);
  assert.equal(forestFrac[0], 1);
  assert.equal(decid[0], 0);
  assert.equal(forestFrac[1], 0.5);
  assert.equal(decid[1], 1);
});
