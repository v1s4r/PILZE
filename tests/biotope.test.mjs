import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, SPECIES_BY_ID, COMBINED, getSpecies } from '../js/model/species.js';
import {
  scoreCell, classify, trapezoid, treeFactor, forestFactor, aspectFactor, soilIndexFromRockText, aspectLabel, seasonFactor,
} from '../js/model/biotope.js';

const steinpilz = SPECIES_BY_ID.steinpilz;
const good = { elev: 1000, slope: 12, aspect: 20, forestFrac: 0.95, decid: 0.4, soil: 0.3 };

test('alle Profile sind vollständig', () => {
  for (const s of SPECIES) {
    assert.ok(s.id && s.name && s.trees && s.soil && s.elevation.length === 4 && s.rain && s.season, s.id);
    assert.ok(s.elevation[0] < s.elevation[1] && s.elevation[1] <= s.elevation[2] && s.elevation[2] < s.elevation[3], s.id);
    assert.ok(s.rain.lagMin < s.rain.lagMax, s.id);
  }
  assert.equal(getSpecies('alle'), COMBINED);
  assert.equal(getSpecies('gibtsnicht'), SPECIES[0]);
});

test('trapezoid', () => {
  assert.equal(trapezoid(500, [300, 600, 1400, 1900]), 2 / 3);
  assert.equal(trapezoid(1000, [300, 600, 1400, 1900]), 1);
  assert.equal(trapezoid(2000, [300, 600, 1400, 1900]), 0);
  assert.equal(trapezoid(NaN, [300, 600, 1400, 1900]), 0);
});

test('idealer Steinpilz-Standort erreicht hohes Potenzial', () => {
  const r = scoreCell(steinpilz, good, 9);
  assert.ok(r.score >= 0.65, `score=${r.score}`);
  assert.equal(classify(r.score).key, 'hoch');
});

test('ohne Wald kein Potenzial', () => {
  const r = scoreCell(steinpilz, { ...good, forestFrac: 0 }, 9);
  assert.equal(r.score, 0);
  assert.equal(classify(r.score).key, 'kein');
});

test('Höhe ausserhalb des Bereichs drückt den Score stark', () => {
  const r = scoreCell(steinpilz, { ...good, elev: 2400 }, 9);
  assert.ok(r.score < 0.1, `score=${r.score}`);
});

test('Kalkboden ist für Eierschwämmli schlechter als saurer Boden', () => {
  const es = SPECIES_BY_ID.eierschwaemmli;
  const acid = scoreCell(es, { ...good, soil: 0.1 }, 8).score;
  const calc = scoreCell(es, { ...good, soil: 0.95 }, 8).score;
  assert.ok(acid > calc * 1.5, `${acid} vs ${calc}`);
});

test('Nadelwald bevorzugt bei Maronen, Laubwald bei Herbsttrompete', () => {
  assert.ok(treeFactor(SPECIES_BY_ID.maronen, 0.05) > treeFactor(SPECIES_BY_ID.maronen, 0.95));
  assert.ok(treeFactor(SPECIES_BY_ID.herbsttrompete, 0.95) > treeFactor(SPECIES_BY_ID.herbsttrompete, 0.05));
  assert.equal(treeFactor(steinpilz, null), 0.7);
});

test('Waldrand-Arten mögen teilbewaldete Zellen', () => {
  const parasol = SPECIES_BY_ID.parasol;
  assert.ok(forestFactor(parasol, 0.45) > forestFactor(parasol, 1.0));
  assert.equal(forestFactor(parasol, 0), 0);
  assert.ok(forestFactor(steinpilz, 1.0) > forestFactor(steinpilz, 0.3));
});

test('im Hochsommer sind Nordhänge besser, im Frühling Südhänge', () => {
  assert.ok(aspectFactor(steinpilz, 0, 15, 7) > aspectFactor(steinpilz, 180, 15, 7));
  const morchel = SPECIES_BY_ID.morchel;
  assert.ok(aspectFactor(morchel, 180, 15, 4) > aspectFactor(morchel, 0, 15, 4));
  assert.equal(aspectFactor(steinpilz, 90, 1, 7), 0.92); // flach: neutral
});

test('Kombinierte Ansicht nimmt das Maximum', () => {
  const r = scoreCell(COMBINED, good, 9);
  const singles = COMBINED.combine.map((id) => scoreCell(SPECIES_BY_ID[id], good, 9).score);
  assert.equal(r.score, Math.max(...singles));
  assert.ok(COMBINED.combine.includes(r.speciesId));
});

test('Gesteinstexte -> Säure-Index', () => {
  assert.ok(soilIndexFromRockText(['Kalkstein, Dolomit']).index > 0.9);
  assert.ok(soilIndexFromRockText(['Granit, Gneis']).index < 0.1);
  const mixed = soilIndexFromRockText(['Moräne', 'Kalk']);
  assert.ok(mixed.index > 0.5 && mixed.index < 1);
  assert.equal(soilIndexFromRockText(['Irgendwas']).index, null);
  assert.deepEqual(soilIndexFromRockText(['Mergel und Sandstein']).matched, ['Mergel', 'Sandstein']);
});

test('Hilfsfunktionen', () => {
  assert.equal(aspectLabel(0), 'N');
  assert.equal(aspectLabel(135), 'SO');
  assert.equal(aspectLabel(359), 'N');
  assert.equal(seasonFactor(steinpilz, 8), 1);
  assert.equal(seasonFactor(steinpilz, 5), 0.45);
  assert.equal(seasonFactor(steinpilz, 2), 0.12);
});
