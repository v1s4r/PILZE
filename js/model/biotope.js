// Biotop-Bewertung: kombiniert Wald, Baumarten, Höhe, Boden, Exposition und Hangneigung
// zu einem Potenzial-Score (0–1) pro Rasterzelle.
//
// Das Modell sagt "hier könnten die Bedingungen passen" – nicht "hier wachsen Pilze".

import { SPECIES_BY_ID } from './species.js';

export const WEIGHTS = { trees: 1.0, elevation: 1.0, soil: 0.7, aspect: 0.5, slope: 0.4 };

export const UNKNOWN = { forest: 0.6, trees: 0.7, soil: 0.75, elevation: 0.5 };

export function clamp(x, lo, hi) { return x < lo ? lo : x > hi ? hi : x; }

export function trapezoid(x, [a, b, c, d]) {
  if (!Number.isFinite(x) || x <= a || x >= d) return 0;
  if (x < b) return (x - a) / (b - a);
  if (x <= c) return 1;
  return (d - x) / (d - c);
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Waldanteil der Zelle (0–1) -> Faktor. 'edge' bevorzugt teilbewaldete Zellen (Waldrand). */
export function forestFactor(species, forestFrac) {
  if (forestFrac == null || !Number.isFinite(forestFrac)) return UNKNOWN.forest;
  if (species.forestPref === 'edge') {
    if (forestFrac < 0.03) return 0;
    return clamp(1 - Math.abs(forestFrac - 0.45) / 0.6, 0.35, 1);
  }
  return smoothstep(0.12, 0.65, forestFrac);
}

/** Laubholzanteil (0 = reiner Nadelwald, 1 = reiner Laubwald) -> Baumarten-Faktor. */
export function treeFactor(species, decidShare) {
  if (decidShare == null || !Number.isFinite(decidShare)) return UNKNOWN.trees;
  const d = clamp(decidShare, 0, 1);
  const t = species.trees;
  const base = t.conifer * (1 - d) + t.deciduous * d;
  const mixed = (t.mixedBonus || 0) * (1 - Math.abs(2 * d - 1));
  return clamp(base + mixed, 0, 1);
}

export function elevationFactor(species, elev) {
  if (!Number.isFinite(elev)) return UNKNOWN.elevation;
  return 0.03 + 0.97 * trapezoid(elev, species.elevation);
}

/** Säure-Index (0 sauer … 1 kalkreich) -> Faktor. */
export function soilFactor(species, soilIdx) {
  if (soilIdx == null || !Number.isFinite(soilIdx)) return UNKNOWN.soil;
  const z = (soilIdx - species.soil.pref) / species.soil.tol;
  return 0.12 + 0.88 * Math.exp(-z * z);
}

/** Hangneigung in Grad -> Faktor (flach ok, mässig ideal, steil schlecht). */
export function slopeFactor(_species, slopeDeg) {
  if (!Number.isFinite(slopeDeg)) return 0.9;
  if (slopeDeg < 3) return 0.85;
  if (slopeDeg <= 25) return 1;
  if (slopeDeg <= 40) return 1 - ((slopeDeg - 25) / 15) * 0.5;
  return 0.35;
}

/**
 * Exposition (Grad im Uhrzeigersinn ab Nord) -> Faktor, abhängig von der Jahreszeit:
 * im Hochsommer sind kühle, feuchte Nordlagen im Vorteil, im Spätherbst und Frühling
 * die wärmeren Südlagen.
 */
export function aspectFactor(species, aspectDeg, slopeDeg, month) {
  if (!Number.isFinite(aspectDeg) || !Number.isFinite(slopeDeg) || slopeDeg < 3) return 0.92;
  const northness = Math.cos((aspectDeg * Math.PI) / 180); // 1 = Nord, -1 = Süd
  const shade = species.shadePref ?? 0.5;
  const sun = species.sunPref ?? 0.4;
  // Gewichtung Sommer (1) … Winterhalbjahr/Frühling (0)
  const warm = warmSeasonWeight(month);
  const shadeTerm = 1 - shade * 0.45 * ((1 - northness) / 2);
  const sunTerm = 1 - sun * 0.45 * ((1 + northness) / 2);
  return clamp(warm * shadeTerm + (1 - warm) * sunTerm, 0.3, 1);
}

export function warmSeasonWeight(month) {
  // Jun–Aug: 1, Sep: 0.6, Okt: 0.3, Nov–Mrz: 0, Apr: 0.2, Mai: 0.6
  const table = { 1: 0, 2: 0, 3: 0, 4: 0.2, 5: 0.6, 6: 1, 7: 1, 8: 1, 9: 0.6, 10: 0.3, 11: 0, 12: 0 };
  return table[month] ?? 0.5;
}

export const MONTH_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function monthInRange(month, [a, b]) {
  return a <= b ? month >= a && month <= b : month >= a || month <= b;
}

/**
 * Saison-Gewicht einer Art im gegebenen Monat: 1 in der Saison, 0.45 im Randmonat, sonst 0.12.
 * Wird für die Sammelansicht und für den Pilz-Index verwendet – bei einer einzeln gewählten Art
 * bleibt die Karte bewusst zeitlos (sie zeigt das Standort-Potenzial, nicht die aktuelle Fruchtung).
 */
export function seasonFactor(species, month) {
  if (monthInRange(month, species.season)) return 1;
  const [a, b] = species.season;
  const before = (a - month + 12) % 12;
  const after = (month - b + 12) % 12;
  if (before === 1 || after === 1) return 0.45;
  return 0.12;
}

/** Saison-Status einer Art für die Anzeige. */
export function seasonInfo(species, month) {
  const factor = seasonFactor(species, month);
  const [a, b] = species.season;
  const range = `${MONTH_SHORT[a - 1]}–${MONTH_SHORT[b - 1]}`;
  const peak = species.peak ? `${MONTH_SHORT[species.peak[0] - 1]}–${MONTH_SHORT[species.peak[1] - 1]}` : null;
  let state = 'aus';
  if (factor === 1) state = species.peak && monthInRange(month, species.peak) ? 'hoch' : 'saison';
  else if (factor > 0.12) state = 'rand';
  const texts = {
    hoch: `Hauptsaison (${peak || range})`,
    saison: `In der Saison (${range})`,
    rand: `Randmonat – Saison ist ${range}`,
    aus: `Ausserhalb der Saison – Saison ist ${range}`,
  };
  return { factor, state, range, peak, text: texts[state] };
}

/**
 * Bewertet eine Zelle für eine Art.
 * @param {object} species Profil aus species.js (oder COMBINED)
 * @param {{elev:number, slope:number, aspect:number, forestFrac:number|null, decid:number|null, soil:number|null}} cell
 * @param {number} month 1–12
 */
export function scoreCell(species, cell, month) {
  if (species.combine) {
    // Sammelansicht: die je Zelle beste Art, gewichtet mit ihrer Saison-Passung.
    let best = null;
    for (const id of species.combine) {
      const sp = SPECIES_BY_ID[id];
      if (!sp) continue;
      const r = scoreCell(sp, cell, month);
      const season = species.seasonWeighted ? seasonFactor(sp, month) : 1;
      const weighted = r.score * season;
      if (!best || weighted > best.score) {
        best = { score: weighted, factors: r.factors, speciesId: id, biotopeScore: r.score, season };
      }
    }
    return best;
  }
  const f = {
    forest: forestFactor(species, cell.forestFrac),
    trees: treeFactor(species, cell.decid),
    elevation: elevationFactor(species, cell.elev),
    soil: soilFactor(species, cell.soil),
    aspect: aspectFactor(species, cell.aspect, cell.slope, month),
    slope: slopeFactor(species, cell.slope),
  };
  const score = clamp(f.forest *
    Math.pow(f.trees, WEIGHTS.trees) *
    Math.pow(f.elevation, WEIGHTS.elevation) *
    Math.pow(f.soil, WEIGHTS.soil) *
    Math.pow(f.aspect, WEIGHTS.aspect) *
    Math.pow(f.slope, WEIGHTS.slope), 0, 1);
  // Bei einer einzeln gewählten Art fliesst die Saison NICHT in den Score ein: die Karte zeigt das
  // Standort-Potenzial, damit man Plätze auch ausserhalb der Saison suchen kann. Die UI weist auf
  // die Saison hin, und der Pilz-Index im Tab «Pilzwetter» berücksichtigt sie.
  return { score, factors: f, speciesId: species.id, biotopeScore: score, season: seasonFactor(species, month) };
}

/**
 * Klassen, absteigend. Die Grenzen sind an Referenzfällen geeicht – der Score ist ein Produkt
 * aus sechs Teilfaktoren und liegt deshalb naturgemäss tiefer als die Einzelwerte:
 *
 *   alle Teilfaktoren 100          → 1.00   sehr hoch
 *   alle Teilfaktoren  90          → 0.62   sehr hoch
 *   Wald 100 / Bäume 85 / Höhe 100 / Boden 75 / Exposition 92 / Neigung 100 → 0.67  sehr hoch
 *   alle Teilfaktoren  80          → 0.36   mittel
 *   falsche Höhenlage (Höhe 40)    → 0.28   gering
 *   falsche Baumart (Bäume 35)     → 0.28   gering
 *
 * WICHTIG: Auf der Karte markiert wird genau dann, wenn die Klasse mindestens
 * CONFIG.heat.markFrom erreicht. Etikett im Standort-Check und rote Fläche sind damit
 * dieselbe Aussage – sie können nicht auseinanderlaufen.
 */
export const CLASSES = [
  { min: 0.6, key: 'sehr-hoch', label: 'Sehr hohes Potenzial', color: '#82060f' },
  { min: 0.45, key: 'hoch', label: 'Hohes Potenzial', color: '#b3121b' },
  { min: 0.3, key: 'mittel', label: 'Mittleres Potenzial', color: '#c98500' },
  { min: 0.15, key: 'gering', label: 'Geringes Potenzial', color: '#8a8780' },
  { min: 0, key: 'kein', label: 'Kein Potenzial', color: 'transparent' },
];

/** Score, ab dem eine Klasse beginnt. */
export function classMin(key) {
  const c = CLASSES.find((x) => x.key === key);
  if (!c) throw new Error(`Unbekannte Klasse: ${key}`);
  return c.min;
}

export function classify(score) {
  return CLASSES.find((c) => score >= c.min) || CLASSES[CLASSES.length - 1];
}

export function aspectLabel(deg) {
  if (!Number.isFinite(deg)) return '–';
  const names = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return names[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export function soilLabel(idx) {
  if (idx == null || !Number.isFinite(idx)) return 'unbekannt';
  if (idx < 0.3) return 'sauer / kalkarm';
  if (idx < 0.62) return 'neutral / gemischt';
  return 'kalkreich / basisch';
}

/**
 * Leitet aus Gesteinsbezeichnungen (GK500) einen Säure-Index ab.
 * 0 = silikatisch/sauer, 0.5 = neutral, 1 = karbonatisch/basisch.
 * @param {string[]} texts Attributtexte der Geologie-Layer
 * @returns {{index:number|null, matched:string[]}}
 */
export function soilIndexFromRockText(texts) {
  const rules = [
    { re: /kalk|calc|dolomit|karbonat|carbonat|rauwacke|gips|anhydrit|kreide|marmor/i, v: 1.0, w: 1.0, tag: 'Karbonat' },
    { re: /mergel|marn/i, v: 0.85, w: 0.9, tag: 'Mergel' },
    { re: /nagelfluh|konglomerat|conglom/i, v: 0.7, w: 0.6, tag: 'Konglomerat' },
    { re: /flysch/i, v: 0.7, w: 0.6, tag: 'Flysch' },
    { re: /molasse/i, v: 0.55, w: 0.6, tag: 'Molasse' },
    { re: /löss|loess|lehm/i, v: 0.55, w: 0.5, tag: 'Löss/Lehm' },
    { re: /schotter|kies|alluvi|fluss|bach|schwemm|aue/i, v: 0.62, w: 0.5, tag: 'Schotter' },
    { re: /moräne|morän|moraine|glazial/i, v: 0.5, w: 0.5, tag: 'Moräne' },
    { re: /sandstein|grès|arkose/i, v: 0.35, w: 0.7, tag: 'Sandstein' },
    { re: /tonschiefer|schiefer|phyllit/i, v: 0.35, w: 0.6, tag: 'Schiefer' },
    { re: /granit|gneis|gneiss|silikat|silicat|quarz|kristallin|cristallin|glimmer|amphibolit|gabbro|diorit|syenit|vulkanit|porphyr|rhyolith|basalt|migmatit|eklogit|serpentinit|peridotit|verrucano|radiolarit|hornfels|paragneis|orthogneis/i, v: 0.05, w: 1.0, tag: 'Silikat' },
    { re: /torf|moor|humus|sumpf/i, v: 0.1, w: 0.8, tag: 'Torf' },
    { re: /gehängeschutt|schutt|blockschutt|bergsturz|sackung|rutsch/i, v: 0.5, w: 0.2, tag: 'Schutt' },
    { re: /künstlich|auffüllung|deponie|siedlung/i, v: 0.5, w: 0.1, tag: 'Anthropogen' },
  ];
  let sum = 0; let wsum = 0; const matched = [];
  for (const t of texts) {
    if (!t) continue;
    for (const r of rules) {
      if (r.re.test(t)) { sum += r.v * r.w; wsum += r.w; matched.push(r.tag); }
    }
  }
  if (wsum === 0) return { index: null, matched: [] };
  return { index: clamp(sum / wsum, 0, 1), matched: [...new Set(matched)] };
}
