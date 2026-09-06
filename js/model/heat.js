// Bestimmt, welche Zellen rot markiert werden.
//
// Warum nicht einfach eine feste Punkte-Schwelle? In einem typischen Schweizer Waldgebiet liegen
// fast alle Waldzellen in einem schmalen Punkteband – eine feste Schwelle markiert deshalb
// entweder beinahe den ganzen Wald oder gar nichts. Für die Suche nach guten Plätzen ist aber
// genau die Spitze interessant.
//
// Deshalb zwei Bedingungen, die beide erfüllt sein müssen:
//   1. relativ  – die Zelle gehört zu den besten `topFraction` des Ausschnitts
//   2. absolut  – die Zelle erreicht mindestens `minScore` («hohes Potenzial»)
//
// Damit ist die markierte Fläche nach oben begrenzt (nie mehr als topFraction), und in einem
// schwachen Gebiet bleibt die Karte leer, statt die «besten der schlechten» zu markieren.

/** Quantil eines Zahlenfelds (q = 0.9 → Wert, den 90 % unterschreiten). */
export function quantile(values, q) {
  const arr = Array.from(values).filter(Number.isFinite).sort((a, b) => a - b);
  if (arr.length === 0) return 0;
  const pos = (arr.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos); const hi = Math.ceil(pos);
  return lo === hi ? arr[lo] : arr[lo] + (arr[hi] - arr[lo]) * (pos - lo);
}

/**
 * @param {ArrayLike<number>} scores
 * @param {{topFraction:number, minScore:number}} opts
 * @returns {{threshold:number, marked:number, total:number, fraction:number, limitedBy:'relativ'|'absolut'}}
 */
export function selectThreshold(scores, { topFraction, minScore }) {
  const total = scores.length;
  const relative = quantile(scores, 1 - topFraction);
  const threshold = Math.max(minScore, relative);
  let marked = 0;
  for (let i = 0; i < total; i++) if (scores[i] >= threshold) marked++;
  return {
    threshold,
    marked,
    total,
    fraction: total ? marked / total : 0,
    limitedBy: threshold > relative ? 'absolut' : 'relativ',
  };
}
