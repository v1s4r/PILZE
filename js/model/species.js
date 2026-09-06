// Biotop-Profile der wichtigsten Schweizer Speisepilze.
//
// Jedes Profil beschreibt, unter welchen Standortbedingungen die Art typischerweise fruchtet:
//  - trees:      Eignung reiner Nadel-/Laubbestände (0–1) + Bonus für Mischwald
//  - forestPref: 'interior' (geschlossener Wald) oder 'edge' (Waldrand, lichte Stellen)
//  - soil:       bevorzugter Säure-Index (0 = sauer/silikatisch, 0.5 = neutral, 1 = kalkreich) + Toleranz
//  - elevation:  Trapez [min, optimal von, optimal bis, max] in m ü. M.
//  - shadePref:  wie stark im Hochsommer schattige Nord-Lagen bevorzugt werden (0–1)
//  - sunPref:    wie stark in kühlen Monaten sonnige Süd-Lagen bevorzugt werden (0–1)
//  - season:     Hauptsaison [von Monat, bis Monat]
//  - rain:       Regen-Timing: Tage nach ergiebigem Regen (lagMin–lagMax), Temperaturfenster (Tagesmittel)
//
// Die Werte sind aus der mykologischen Literatur und Sammlererfahrung abgeleitet und bewusst
// konservativ gewählt. Es sind Modellannahmen – kein Ersatz für Artenkenntnis.

export const SPECIES = [
  {
    id: 'steinpilz', name: 'Steinpilz', latin: 'Boletus edulis', icon: '🍄',
    partners: 'Fichte, Tanne, Buche, Eiche',
    trees: { conifer: 0.85, deciduous: 0.9, mixedBonus: 0.15 },
    forestPref: 'interior',
    soil: { pref: 0.3, tol: 0.35 },
    elevation: [300, 650, 1450, 1950],
    shadePref: 0.7, sunPref: 0.4,
    season: [6, 11], peak: [8, 10],
    rain: { lagMin: 6, lagMax: 14, eventMm: 10, tMin: 6, tOptLo: 11, tOptHi: 20, tMax: 26, frost: 'sensitiv' },
    tips: 'Lichte Stellen in älteren Fichten- und Buchenbeständen, oft an Wegrändern und Böschungen. Meidet nasse, verdichtete Böden.',
  },
  {
    id: 'eierschwaemmli', name: 'Eierschwämmli', latin: 'Cantharellus cibarius', icon: '🌼',
    partners: 'Fichte, Tanne, Buche, Eiche (Moosböden)',
    trees: { conifer: 0.95, deciduous: 0.75, mixedBonus: 0.1 },
    forestPref: 'interior',
    soil: { pref: 0.15, tol: 0.3 },
    elevation: [350, 600, 1600, 2000],
    shadePref: 0.6, sunPref: 0.3,
    season: [6, 10], peak: [7, 9],
    rain: { lagMin: 10, lagMax: 21, eventMm: 10, tMin: 6, tOptLo: 10, tOptHi: 22, tMax: 27, frost: 'tolerant' },
    tips: 'Saure, moosige Nadelwaldböden, oft in Gruppen. Wächst langsam – gute Plätze tragen wochenlang.',
  },
  {
    id: 'maronen', name: 'Maronenröhrling', latin: 'Imleria badia', icon: '🌰',
    partners: 'Fichte, Kiefer, Tanne',
    trees: { conifer: 1.0, deciduous: 0.35, mixedBonus: 0.05 },
    forestPref: 'interior',
    soil: { pref: 0.15, tol: 0.3 },
    elevation: [250, 450, 1400, 1700],
    shadePref: 0.5, sunPref: 0.3,
    season: [7, 11], peak: [9, 10],
    rain: { lagMin: 5, lagMax: 12, eventMm: 8, tMin: 5, tOptLo: 9, tOptHi: 19, tMax: 25, frost: 'sensitiv' },
    tips: 'Typischer Nadelwaldpilz auf saurem Boden, gern in Nadelstreu und an moosigen Stubben.',
  },
  {
    id: 'trompeten', name: 'Trompetenpfifferling', latin: 'Craterellus tubaeformis', icon: '🎺',
    partners: 'Fichte, Tanne (Moos, Totholz)',
    trees: { conifer: 1.0, deciduous: 0.4, mixedBonus: 0.05 },
    forestPref: 'interior',
    soil: { pref: 0.1, tol: 0.28 },
    elevation: [450, 700, 1700, 2000],
    shadePref: 0.8, sunPref: 0.2,
    season: [8, 12], peak: [9, 11],
    rain: { lagMin: 10, lagMax: 21, eventMm: 10, tMin: 2, tOptLo: 6, tOptHi: 16, tMax: 22, frost: 'tolerant' },
    tips: 'Feuchte, moosige Nadelwälder, oft massenhaft im Spätherbst. Verträgt leichte Fröste.',
  },
  {
    id: 'herbsttrompete', name: 'Herbsttrompete', latin: 'Craterellus cornucopioides', icon: '🖤',
    partners: 'Buche, Eiche, Hainbuche',
    trees: { conifer: 0.2, deciduous: 1.0, mixedBonus: 0.05 },
    forestPref: 'interior',
    soil: { pref: 0.65, tol: 0.35 },
    elevation: [250, 400, 1100, 1400],
    shadePref: 0.6, sunPref: 0.3,
    season: [8, 11], peak: [9, 10],
    rain: { lagMin: 8, lagMax: 18, eventMm: 10, tMin: 5, tOptLo: 9, tOptHi: 19, tMax: 25, frost: 'tolerant' },
    tips: 'Buchenwälder auf kalkhaltigem bis neutralem Boden, gern an Hängen und in Mulden mit Laubstreu.',
  },
  {
    id: 'semmelstoppel', name: 'Semmelstoppelpilz', latin: 'Hydnum repandum', icon: '🥖',
    partners: 'Buche, Fichte, Tanne',
    trees: { conifer: 0.8, deciduous: 0.85, mixedBonus: 0.1 },
    forestPref: 'interior',
    soil: { pref: 0.55, tol: 0.4 },
    elevation: [350, 550, 1500, 1900],
    shadePref: 0.6, sunPref: 0.3,
    season: [8, 11], peak: [9, 10],
    rain: { lagMin: 10, lagMax: 20, eventMm: 10, tMin: 3, tOptLo: 7, tOptHi: 18, tMax: 24, frost: 'tolerant' },
    tips: 'Moosreiche Misch- und Nadelwälder, häufig in Hexenringen. Robust gegen Kälte.',
  },
  {
    id: 'hexenroehrling', name: 'Flockenstieliger Hexenröhrling', latin: 'Neoboletus erythropus', icon: '🔥',
    partners: 'Fichte, Buche, Tanne',
    trees: { conifer: 0.85, deciduous: 0.85, mixedBonus: 0.1 },
    forestPref: 'interior',
    soil: { pref: 0.2, tol: 0.3 },
    elevation: [350, 600, 1500, 1900],
    shadePref: 0.5, sunPref: 0.4,
    season: [6, 10], peak: [7, 9],
    rain: { lagMin: 5, lagMax: 12, eventMm: 8, tMin: 6, tOptLo: 10, tOptHi: 21, tMax: 27, frost: 'sensitiv' },
    tips: 'Saure Böden in Fichten- und Buchenwäldern, oft schon im Frühsommer. Nur gut durchgegart essbar.',
  },
  {
    id: 'reizker', name: 'Fichtenreizker', latin: 'Lactarius deterrimus', icon: '🟠',
    partners: 'Fichte (jung bis mittelalt)',
    trees: { conifer: 1.0, deciduous: 0.1, mixedBonus: 0.0 },
    forestPref: 'edge',
    soil: { pref: 0.5, tol: 0.45 },
    elevation: [400, 700, 1800, 2100],
    shadePref: 0.3, sunPref: 0.5,
    season: [7, 10], peak: [8, 9],
    rain: { lagMin: 5, lagMax: 12, eventMm: 8, tMin: 5, tOptLo: 9, tOptHi: 20, tMax: 26, frost: 'sensitiv' },
    tips: 'Unter jungen Fichten an Waldrändern, Wegen und Aufforstungen – auch auf Kalk.',
  },
  {
    id: 'birkenpilz', name: 'Birkenpilz / Rotkappe', latin: 'Leccinum scabrum / L. versipelle', icon: '🌳',
    partners: 'Birke, Espe (Pionierwald, Moorränder)',
    trees: { conifer: 0.25, deciduous: 0.9, mixedBonus: 0.15 },
    forestPref: 'edge',
    soil: { pref: 0.2, tol: 0.3 },
    elevation: [350, 600, 1700, 2100],
    shadePref: 0.4, sunPref: 0.4,
    season: [6, 10], peak: [7, 9],
    rain: { lagMin: 5, lagMax: 12, eventMm: 8, tMin: 6, tOptLo: 10, tOptHi: 20, tMax: 26, frost: 'sensitiv' },
    tips: 'Streng an Birken gebunden: lichte Mischwälder, Moorränder, Kiesgruben-Aufwuchs.',
  },
  {
    id: 'krauseglucke', name: 'Krause Glucke', latin: 'Sparassis crispa', icon: '🥦',
    partners: 'Kiefer (Föhre), selten Fichte',
    trees: { conifer: 1.0, deciduous: 0.05, mixedBonus: 0.0 },
    forestPref: 'interior',
    soil: { pref: 0.15, tol: 0.3 },
    elevation: [250, 450, 1300, 1600],
    shadePref: 0.4, sunPref: 0.5,
    season: [8, 11], peak: [9, 10],
    rain: { lagMin: 8, lagMax: 18, eventMm: 10, tMin: 5, tOptLo: 9, tOptHi: 20, tMax: 26, frost: 'tolerant' },
    tips: 'Am Stammfuss älterer Föhren auf sandig-saurem Boden. Erscheint über Jahre am selben Baum.',
  },
  {
    id: 'morchel', name: 'Morcheln', latin: 'Morchella esculenta / M. elata', icon: '🧽',
    partners: 'Esche, Pappel, Ulme (Auenwald, Waldränder)',
    trees: { conifer: 0.3, deciduous: 1.0, mixedBonus: 0.05 },
    forestPref: 'edge',
    soil: { pref: 0.85, tol: 0.3 },
    elevation: [250, 400, 1100, 1500],
    shadePref: 0.0, sunPref: 0.8,
    season: [3, 5], peak: [4, 4],
    rain: { lagMin: 4, lagMax: 12, eventMm: 8, tMin: 5, tOptLo: 8, tOptHi: 16, tMax: 22, frost: 'tolerant' },
    tips: 'Frühjahrspilz auf kalkreichen, feuchten Böden entlang von Flüssen, in Auenwäldern und Gärten.',
  },
  {
    id: 'parasol', name: 'Parasol', latin: 'Macrolepiota procera', icon: '☂️',
    partners: 'Waldränder, Lichtungen, Weiden',
    trees: { conifer: 0.7, deciduous: 0.8, mixedBonus: 0.1 },
    forestPref: 'edge',
    soil: { pref: 0.5, tol: 0.5 },
    elevation: [250, 450, 1400, 1800],
    shadePref: 0.0, sunPref: 0.7,
    season: [7, 10], peak: [8, 9],
    rain: { lagMin: 4, lagMax: 10, eventMm: 8, tMin: 7, tOptLo: 11, tOptHi: 22, tMax: 28, frost: 'sensitiv' },
    tips: 'Sonnige Waldränder, Waldwiesen und Weiden – kein eigentlicher Waldpilz.',
  },
];

export const SPECIES_BY_ID = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

/**
 * Kombinierte Ansicht: alle Arten, gewichtet mit der Saison.
 * Im April gewinnen so die Morcheln, im Oktober die Herbsttrompete, im Januar bleibt alles blass.
 */
export const COMBINED = {
  id: 'alle',
  name: 'Alle Speisepilze',
  latin: 'Beste Art je Zelle für den gewählten Monat',
  icon: '🧺',
  combine: SPECIES.map((s) => s.id),
  seasonWeighted: true,
  season: [3, 11],
  rain: { lagMin: 6, lagMax: 16, eventMm: 10, tMin: 5, tOptLo: 10, tOptHi: 20, tMax: 26, frost: 'sensitiv' },
};

/**
 * Leitart eines Monats: die Art mit der besten Saison-Passung (bei Gleichstand die erste).
 * Wird für das Regen-Timing der Sammelansicht verwendet, weil die Fruchtungsfenster je Art variieren.
 */
export function seasonLeader(month) {
  let best = SPECIES[0]; let bestF = -1;
  for (const s of SPECIES) {
    const [a, b] = s.season;
    const inSeason = a <= b ? month >= a && month <= b : month >= a || month <= b;
    const [pa, pb] = s.peak || s.season;
    const inPeak = pa <= pb ? month >= pa && month <= pb : month >= pa || month <= pb;
    const f = inPeak ? 2 : inSeason ? 1 : 0;
    if (f > bestF) { bestF = f; best = s; }
  }
  return best;
}

export function getSpecies(id) {
  if (id === COMBINED.id) return COMBINED;
  return SPECIES_BY_ID[id] || SPECIES[0];
}
