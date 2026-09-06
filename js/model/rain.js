// Regen-Timing: wann nach einem Niederschlagsereignis Fruchtkörper zu erwarten sind.
//
// Modell (bewusst einfach und nachvollziehbar):
//  1. Bodenfeuchte als "Eimer": Regen füllt, Verdunstung (temperaturabhängig) leert.
//  2. Ein Regenereignis (>= eventMm an einem Tag oder ergiebiger 2-Tages-Regen) löst nach
//     lagMin … lagMax Tagen ein Fruchtungsfenster aus (Dreiecksgewicht, Maximum in der Mitte).
//  3. Tore: Bodenfeuchte, Lufttemperatur (Tagesmittel), Bodentemperatur (6 cm), Frost, Saison.
//  4. Ergebnis: Pilz-Index 0–1 pro Tag (Vergangenheit + Prognose) und eine Zusammenfassung.

import { clamp, trapezoid, smoothstep, seasonFactor } from './biotope.js';

export const BUCKET_CAP = 80; // mm pflanzenverfügbares Wasser im Oberboden (Waldboden)
export const BUCKET_START = 40; // Annahme zu Beginn der Datenreihe: halb gefüllt

export function evapotranspiration(tmean, precip) {
  // Waldboden verdunstet deutlich weniger als Freiland: ca. 0.6 mm/Tag bei 5 °C, 1.5 mm bei 15 °C, 2.5 mm bei 25 °C
  let et = clamp(0.2 + 0.09 * Math.max(tmean, 0), 0.2, 3.0);
  if (precip > 2) et *= 0.5; // Regentage verdunsten weniger
  return et;
}

/**
 * @param {Array<{date:string, precip:number, tmax:number, tmin:number, tmean:number, soilT?:number|null, isForecast:boolean}>} days
 * @param {object} species Profil mit .rain und .season
 * @returns {{daily:Array, todayIndex:number, today:object, lastEvent:object|null, next:object|null, best:object|null}}
 */
export function computeRainTiming(days, species) {
  const r = species.rain;
  const n = days.length;
  const daily = new Array(n);
  const eventStrength = new Float64Array(n);
  const eventMm = new Float64Array(n);
  let moisture = BUCKET_START;
  let frostDays = 0;
  let wetStreak = 0;

  for (let i = 0; i < n; i++) {
    const d = days[i];
    const et = evapotranspiration(d.tmean, d.precip);
    moisture = clamp(moisture + d.precip - et, 0, BUCKET_CAP);

    // Ereignis-Erkennung
    const prev = i > 0 ? days[i - 1].precip : 0;
    let mm = 0;
    if (d.precip >= r.eventMm) mm = d.precip;
    else if (d.precip >= 3 && d.precip + prev >= r.eventMm * 1.4) mm = d.precip + prev;
    eventMm[i] = mm;
    eventStrength[i] = mm > 0 ? clamp((mm - r.eventMm * 0.5) / (28 - r.eventMm * 0.5), 0.2, 1) : 0;

    wetStreak = moisture / BUCKET_CAP > 0.5 ? wetStreak + 1 : 0;

    // Fruchtungsreiz aus zurückliegenden Ereignissen
    let stim = 0;
    const mid = (r.lagMin + r.lagMax) / 2;
    for (let k = r.lagMin; k <= r.lagMax; k++) {
      const j = i - k;
      if (j < 0) break;
      if (eventStrength[j] === 0) continue;
      const w = 0.55 + 0.45 * (1 - Math.abs(k - mid) / (mid - r.lagMin + 0.5));
      stim = Math.max(stim, eventStrength[j] * clamp(w, 0.4, 1));
    }
    if (wetStreak >= r.lagMin) stim = Math.max(stim, 0.45); // anhaltend feuchte Witterung

    // Tore
    const tGateAir = trapezoid(d.tmean, [r.tMin, r.tOptLo, r.tOptHi, r.tMax]);
    const tGateSoil = d.soilT == null ? null : trapezoid(d.soilT, [r.tMin - 1, r.tOptLo - 1, r.tOptHi + 2, r.tMax + 2]);
    const tGate = tGateSoil == null ? tGateAir : 0.5 * tGateAir + 0.5 * tGateSoil;
    const moistGate = smoothstep(0.08, 0.25, moisture / BUCKET_CAP); // ab ~6 mm Reserve, voll ab ~20 mm
    if (d.tmin < -1) frostDays = r.frost === 'tolerant' ? 1 : 3;
    const frostGate = frostDays > 0 ? (r.frost === 'tolerant' ? 0.6 : 0.15) : 1;
    if (frostDays > 0) frostDays--;
    const month = Number(d.date.slice(5, 7));
    const sGate = seasonFactor(species, month);

    const index = clamp(stim * tGate * moistGate * frostGate * sGate, 0, 1);
    const limits = [];
    if (stim < 0.2) limits.push('kein auslösender Regen im Zeitfenster');
    if (moistGate < 0.5) limits.push('Boden zu trocken');
    if (tGate < 0.5) limits.push(d.tmean < r.tOptLo ? 'zu kalt' : 'zu warm');
    if (frostGate < 1) limits.push('Frost');
    if (sGate < 0.5) limits.push('ausserhalb der Saison');

    daily[i] = {
      date: d.date, precip: d.precip, tmean: d.tmean, tmin: d.tmin, tmax: d.tmax, soilT: d.soilT ?? null,
      isForecast: !!d.isForecast, moisture, eventMm: mm, stim, tGate, moistGate, frostGate, sGate, index, limits,
    };
  }

  let todayIndex = -1;
  for (let i = n - 1; i >= 0; i--) if (!days[i].isForecast) { todayIndex = i; break; }
  if (todayIndex < 0) todayIndex = n - 1;

  let lastEvent = null;
  for (let i = todayIndex; i >= 0; i--) {
    if (eventMm[i] > 0) { lastEvent = { date: days[i].date, mm: eventMm[i], daysAgo: todayIndex - i }; break; }
  }
  let next = null; let best = null;
  for (let i = todayIndex + 1; i < n; i++) {
    if (!next && daily[i].index >= 0.45) next = daily[i];
    if (!best || daily[i].index > best.index) best = daily[i];
  }
  const today = daily[todayIndex] || null;
  return {
    daily, todayIndex, today, lastEvent, next, best,
    label: today ? indexLabel(today.index) : null,
    window: { lagMin: r.lagMin, lagMax: r.lagMax, eventMm: r.eventMm },
  };
}

export function indexLabel(index) {
  if (index >= 0.7) return { key: 'sehr-gut', text: 'Sehr gut', emoji: '🟢' };
  if (index >= 0.45) return { key: 'gut', text: 'Gut', emoji: '🟢' };
  if (index >= 0.25) return { key: 'maessig', text: 'Mässig', emoji: '🟡' };
  return { key: 'schlecht', text: 'Ungünstig', emoji: '🔴' };
}

/** Kurzer, menschenlesbarer Statustext für heute. */
export function describeTiming(result) {
  if (!result || !result.today) return 'Keine Wetterdaten.';
  const t = result.today;
  const parts = [];
  if (result.lastEvent) {
    const ago = result.lastEvent.daysAgo === 0 ? 'heute' : result.lastEvent.daysAgo === 1 ? 'gestern' : `vor ${result.lastEvent.daysAgo} Tagen`;
    parts.push(`Letzter ergiebiger Regen ${ago} (${result.lastEvent.mm.toFixed(0)} mm).`);
  } else {
    parts.push('In den letzten Wochen kein ergiebiger Regen.');
  }
  parts.push(`Fruchtkörper erscheinen typischerweise ${result.window.lagMin}–${result.window.lagMax} Tage nach dem Regen.`);
  if (t.limits.length) parts.push(`Aktuell limitierend: ${t.limits.join(', ')}.`);
  if (result.next) parts.push(`Nächste günstige Phase voraussichtlich ab ${formatDateDe(result.next.date)}.`);
  else if (result.best && result.best.index > t.index + 0.1) parts.push(`Tendenz steigend, bester Prognosetag: ${formatDateDe(result.best.date)}.`);
  return parts.join(' ');
}

export function formatDateDe(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const wd = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'][dt.getDay()];
  return `${wd} ${d}.${m}.`;
}
