// Bestimmt, welche Zellen rot markiert werden.
//
// GRUNDREGEL: Markiert wird genau dann, wenn die Zelle mindestens die eingestellte Klasse
// erreicht. Das Etikett im Standort-Check und die rote Fläche auf der Karte sind damit
// dieselbe Aussage und können nicht auseinanderlaufen.
//
// (Frühere Fassung begrenzte zusätzlich auf die «besten x % im Ausschnitt». Das führte zum
// Widerspruch, dass eine Zelle mit «sehr hohem Potenzial» unmarkiert blieb, weil andere Zellen
// im Ausschnitt noch besser waren. Zwei Massstäbe für dieselbe Frage – deshalb entfernt.)

import { CLASSES, classMin } from './biotope.js';

/** Klassen, die als Markierungsgrenze wählbar sind – von streng nach grosszügig. */
export const MARK_OPTIONS = ['sehr-hoch', 'hoch', 'mittel'];

export function isMarkOption(key) {
  return MARK_OPTIONS.includes(key);
}

/**
 * @param {ArrayLike<number>} scores
 * @param {string} markFrom Klassenschlüssel, ab dem markiert wird
 * @returns {{threshold:number, markFrom:string, label:string, marked:number, total:number, fraction:number}}
 */
export function heatInfo(scores, markFrom) {
  const key = isMarkOption(markFrom) ? markFrom : 'hoch';
  const threshold = classMin(key);
  const total = scores.length;
  let marked = 0;
  for (let i = 0; i < total; i++) if (scores[i] >= threshold) marked++;
  return {
    threshold,
    markFrom: key,
    label: CLASSES.find((c) => c.key === key).label,
    marked,
    total,
    fraction: total ? marked / total : 0,
  };
}

/** Wird diese Zelle markiert? Einzige Wahrheitsquelle für Karte und Standort-Check. */
export function isMarked(score, markFrom) {
  return Number.isFinite(score) && score >= classMin(isMarkOption(markFrom) ? markFrom : 'hoch');
}
