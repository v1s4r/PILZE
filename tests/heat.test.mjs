import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatInfo, isMarked, MARK_OPTIONS, isMarkOption } from '../js/model/heat.js';
import { CLASSES, classify, classMin } from '../js/model/biotope.js';
import { CONFIG } from '../js/config.js';

test('Voreinstellung markiert ab «hohem Potenzial»', () => {
  assert.equal(CONFIG.heat.markFrom, 'hoch');
  assert.ok(isMarkOption(CONFIG.heat.markFrom));
  assert.equal(heatInfo([], 'hoch').threshold, classMin('hoch'));
});

// Das ist der Fehler, den die Praxis gefunden hat: eine Zelle mit «sehr hohem Potenzial»
// blieb unmarkiert, weil eine zweite, relative Regel dagegen entschied.
test('Etikett und Markierung sagen immer dasselbe', () => {
  const rang = (key) => CLASSES.findIndex((c) => c.key === key);
  for (const markFrom of MARK_OPTIONS) {
    for (let score = 0; score <= 1.0001; score += 0.005) {
      const s = Math.min(1, score);
      const klasse = classify(s).key;
      const markiert = isMarked(s, markFrom);
      // markiert genau dann, wenn die Klasse mindestens so gut ist wie die Grenze
      assert.equal(markiert, rang(klasse) <= rang(markFrom),
        `score=${s.toFixed(3)} Klasse=${klasse} markFrom=${markFrom} markiert=${markiert}`);
    }
  }
});

test('«sehr hoch» wird bei Voreinstellung immer markiert', () => {
  for (let s = classMin('sehr-hoch'); s <= 1; s += 0.01) {
    assert.equal(classify(s).key, 'sehr-hoch');
    assert.ok(isMarked(s, 'hoch'), `score ${s.toFixed(2)} wäre nicht markiert`);
  }
});

test('mittleres und geringes Potenzial bleiben unmarkiert', () => {
  for (const s of [0.0, 0.1, 0.2, 0.3, 0.4, 0.449]) {
    assert.ok(!isMarked(s, 'hoch'), `score ${s} wäre markiert`);
  }
});

test('strengere Einstellung markiert weniger', () => {
  const scores = Array.from({ length: 1000 }, (_, i) => i / 999);
  const streng = heatInfo(scores, 'sehr-hoch');
  const normal = heatInfo(scores, 'hoch');
  const grosszuegig = heatInfo(scores, 'mittel');
  assert.ok(streng.marked < normal.marked);
  assert.ok(normal.marked < grosszuegig.marked);
  assert.equal(normal.label, 'Hohes Potenzial');
});

test('unbekannte Einstellung fällt auf «hoch» zurück', () => {
  assert.equal(heatInfo([0.5], 'quatsch').markFrom, 'hoch');
  assert.equal(isMarked(0.5, 'quatsch'), true);
});

test('Referenzfälle: Klassengrenzen sind an echten Zellen geeicht', () => {
  // Werte aus js/model/biotope.js dokumentiert
  assert.equal(classify(1.0).key, 'sehr-hoch');
  assert.equal(classify(0.667).key, 'sehr-hoch'); // gemeldeter Praxisfall – muss markiert sein
  assert.ok(isMarked(0.667, 'hoch'));
  assert.equal(classify(0.616).key, 'sehr-hoch'); // alle Teilfaktoren 90
  assert.equal(classify(0.358).key, 'mittel');    // alle Teilfaktoren 80
  assert.equal(classify(0.278).key, 'gering');    // falsche Höhenlage
  assert.ok(!isMarked(0.278, 'hoch'));
});
