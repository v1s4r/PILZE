import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPECIES, SPECIES_BY_ID, COMBINED, getSpecies, seasonLeader } from '../js/model/species.js';
import {
  scoreCell, classify, CLASSES, trapezoid, treeFactor, forestFactor, aspectFactor, soilIndexFromRockText, aspectLabel, seasonFactor, seasonInfo,
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

test('Standard-Anzeigeschwelle entspricht der Klasse «hoch»', async () => {
  const { CONFIG } = await import('../js/config.js');
  assert.equal(CONFIG.heat.threshold, 0.65);
  assert.equal(classify(CONFIG.heat.threshold).key, 'hoch');
  assert.equal(classify(CONFIG.heat.threshold - 0.01).key, 'mittel');
  // alles unterhalb der Schwelle bleibt unmarkiert
  for (const k of ['mittel', 'gering', 'kein']) {
    const c = CLASSES.find((x) => x.key === k);
    assert.ok(c.min < CONFIG.heat.threshold, `${k} läge über der Schwelle`);
  }
});

test('idealer Steinpilz-Standort erreicht hohes Potenzial', () => {
  const r = scoreCell(steinpilz, good, 9);
  assert.ok(r.score >= 0.65, `score=${r.score}`);
  assert.ok(['hoch', 'sehr-hoch'].includes(classify(r.score).key), classify(r.score).key);
});

test('Kalibrierung: gute Standorte werden markiert, mangelhafte nicht', async () => {
  const { CONFIG } = await import('../js/config.js');
  const T = CONFIG.heat.threshold;
  const base = { elev: 1000, slope: 12, aspect: 20, forestFrac: 0.95, decid: 0.4, soil: 0.3 };
  // guter Standort: jeder Teilfaktor 70–90 → muss rot werden
  const gut = scoreCell(steinpilz, { ...base, decid: 0.55, soil: 0.5 }, 9);
  assert.ok(gut.score >= T, `guter Standort nicht markiert: ${gut.score}`);
  // mangelhafte Standorte dürfen nicht rot werden
  for (const [name, art, cell] of [
    ['falsche Höhe', steinpilz, { ...base, elev: 2100 }],
    ['kaum Wald', steinpilz, { ...base, forestFrac: 0.15 }],
    // Der Steinpilz nimmt Nadel- wie Laubwald; für «falsche Baumart» braucht es eine
    // nadelholzgebundene Art im reinen Laubwald.
    ['falsche Baumart', SPECIES_BY_ID.maronen, { ...base, decid: 1 }],
  ]) {
    const r = scoreCell(art, cell, 9);
    assert.ok(r.score < T, `${name} wäre markiert worden: ${r.score}`);
  }
  // dieselbe Zelle ist für den Steinpilz sehr wohl geeignet (Buche/Eiche sind Partner)
  assert.ok(scoreCell(steinpilz, { ...base, decid: 1 }, 9).score >= T);
});

test('Kalibrierung ändert die Rangfolge nicht (streng monoton)', () => {
  const cells = [
    { elev: 1000, slope: 12, aspect: 20, forestFrac: 0.95, decid: 0.4, soil: 0.3 },
    { elev: 700, slope: 25, aspect: 180, forestFrac: 0.6, decid: 0.8, soil: 0.6 },
    { elev: 1600, slope: 5, aspect: 90, forestFrac: 0.4, decid: 0.1, soil: 0.9 },
    { elev: 400, slope: 35, aspect: 270, forestFrac: 0.8, decid: 0.5, soil: 0.15 },
  ];
  const scored = cells.map((c) => scoreCell(steinpilz, c, 9));
  const byRaw = [...scored].sort((a, b) => b.rawScore - a.rawScore).map((r) => r.rawScore);
  const byScore = [...scored].sort((a, b) => b.score - a.score).map((r) => r.rawScore);
  assert.deepEqual(byScore, byRaw);
});

test('ohne Wald kein Potenzial', () => {
  const r = scoreCell(steinpilz, { ...good, forestFrac: 0 }, 9);
  assert.equal(r.score, 0);
  assert.equal(classify(r.score).key, 'kein');
});

test('Höhe ausserhalb des Bereichs drückt den Score stark', () => {
  const r = scoreCell(steinpilz, { ...good, elev: 2400 }, 9);
  const ideal = scoreCell(steinpilz, good, 9);
  assert.ok(r.score < ideal.score / 3, `score=${r.score} vs ideal=${ideal.score}`);
  assert.equal(classify(r.score).key, 'kein');
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

test('Kombinierte Ansicht enthält alle Arten – auch die Morchel', () => {
  assert.equal(COMBINED.combine.length, SPECIES.length);
  for (const s of SPECIES) assert.ok(COMBINED.combine.includes(s.id), `${s.id} fehlt in der Sammelansicht`);
  assert.ok(COMBINED.combine.includes('morchel'));
});

test('Kombinierte Ansicht nimmt das saisongewichtete Maximum', () => {
  const r = scoreCell(COMBINED, good, 9);
  const weighted = COMBINED.combine.map((id) => scoreCell(SPECIES_BY_ID[id], good, 9).score * seasonFactor(SPECIES_BY_ID[id], 9));
  assert.ok(Math.abs(r.score - Math.max(...weighted)) < 1e-9);
  assert.ok(COMBINED.combine.includes(r.speciesId));
  assert.equal(r.season, seasonFactor(SPECIES_BY_ID[r.speciesId], 9));
});

test('Sammelansicht: im April gewinnt die Morchel, im September nicht', () => {
  // kalkreicher, halboffener Laubwald in tiefer Lage: klassisches Morchel-Biotop
  const auenwald = { elev: 500, slope: 10, aspect: 200, forestFrac: 0.5, decid: 0.9, soil: 0.85 };
  assert.equal(scoreCell(COMBINED, auenwald, 4).speciesId, 'morchel');
  assert.notEqual(scoreCell(COMBINED, auenwald, 9).speciesId, 'morchel');
});

test('Sammelansicht stuft Arten ausserhalb ihrer Saison zurück', () => {
  const auenwald = { elev: 500, slope: 10, aspect: 200, forestFrac: 0.5, decid: 0.9, soil: 0.85 };
  const april = scoreCell(COMBINED, auenwald, 4);
  const januar = scoreCell(COMBINED, auenwald, 1);
  assert.ok(april.score > januar.score * 2, `April ${april.score} vs Januar ${januar.score}`);
});

test('Einzelne Art: die Karte bleibt zeitlos, meldet die Saison aber separat', () => {
  const morchel = SPECIES_BY_ID.morchel;
  const auenwald = { elev: 500, slope: 10, aspect: 200, forestFrac: 0.5, decid: 0.9, soil: 0.85 };
  const april = scoreCell(morchel, auenwald, 4);
  const september = scoreCell(morchel, auenwald, 9);
  // Standort-Potenzial ändert sich höchstens über die Exposition, nicht über die Saison
  assert.ok(Math.abs(april.score - september.score) < 0.25, `${april.score} vs ${september.score}`);
  assert.ok(september.score > 0.3, 'Morchel-Biotope bleiben auch im September sichtbar');
  assert.equal(september.season, 0.12);
  assert.equal(april.season, 1);
});

test('seasonInfo beschreibt den Saison-Status', () => {
  assert.equal(seasonInfo(SPECIES_BY_ID.morchel, 4).state, 'hoch');
  assert.equal(seasonInfo(SPECIES_BY_ID.morchel, 9).state, 'aus');
  assert.equal(seasonInfo(SPECIES_BY_ID.steinpilz, 5).state, 'rand');
  assert.equal(seasonInfo(SPECIES_BY_ID.steinpilz, 9).state, 'hoch');
  assert.equal(seasonInfo(SPECIES_BY_ID.steinpilz, 6).state, 'saison');
  assert.match(seasonInfo(SPECIES_BY_ID.morchel, 9).text, /Mär–Mai/);
});

test('seasonLeader liefert je Monat eine plausible Leitart', () => {
  assert.equal(seasonLeader(4).id, 'morchel');
  const herbst = seasonLeader(10);
  assert.ok(herbst.season[0] <= 10 && herbst.season[1] >= 10, `${herbst.id} passt nicht in den Oktober`);
  for (let m = 1; m <= 12; m++) assert.ok(seasonLeader(m).id, `Monat ${m} ohne Leitart`);
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
