import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeRainTiming, describeTiming, formatDateDe } from '../js/model/rain.js';
import { SPECIES_BY_ID } from '../js/model/species.js';

const steinpilz = SPECIES_BY_ID.steinpilz;

function makeDays({ n = 37, past = 30, precipAt = {}, tmean = 15, tmin = 9, tmax = 21, month = 9 }) {
  const days = [];
  for (let i = 0; i < n; i++) {
    const day = String(1 + (i % 28)).padStart(2, '0');
    const m = String(month + Math.floor(i / 28)).padStart(2, '0');
    days.push({ date: `2026-${m}-${day}`, precip: precipAt[i] || 0, tmean, tmin, tmax, soilT: null, isForecast: i > past });
  }
  return days;
}

test('ergiebiger Regen vor 9 Tagen -> günstiger Index heute', () => {
  const days = makeDays({ precipAt: { 21: 22, 24: 4 } });
  const r = computeRainTiming(days, steinpilz);
  assert.equal(r.todayIndex, 30);
  assert.ok(r.today.index >= 0.45, `index=${r.today.index} limits=${r.today.limits}`);
  assert.equal(r.lastEvent.daysAgo, 9);
  assert.equal(r.lastEvent.mm, 22);
  assert.ok(describeTiming(r).includes('vor 9 Tagen'));
});

test('kein Regen -> ungünstig, Boden trocken', () => {
  const days = makeDays({});
  const r = computeRainTiming(days, steinpilz);
  assert.ok(r.today.index < 0.25, `index=${r.today.index}`);
  assert.equal(r.lastEvent, null);
  assert.ok(r.today.limits.includes('Boden zu trocken') || r.today.limits.includes('kein auslösender Regen im Zeitfenster'));
});

test('Regen gestern -> Fenster noch nicht offen, Prognose zeigt kommende Phase', () => {
  const days = makeDays({ precipAt: { 29: 25 } });
  const r = computeRainTiming(days, steinpilz);
  assert.ok(r.today.index < 0.3, `index=${r.today.index}`);
  assert.ok(r.best, 'Prognose vorhanden');
  assert.ok(r.best.date > r.today.date);
  assert.ok(r.best.index > r.today.index + 0.1, `best=${r.best.index} today=${r.today.index}`);
  assert.ok(describeTiming(r).includes('Tendenz steigend') || describeTiming(r).includes('Nächste günstige Phase'));
});

test('Frost drückt den Index bei frostempfindlichen Arten', () => {
  const days = makeDays({ precipAt: { 21: 22 }, tmin: -3, tmean: 4 });
  const r = computeRainTiming(days, steinpilz);
  assert.ok(r.today.index < 0.2, `index=${r.today.index}`);
  assert.ok(r.today.limits.includes('Frost') || r.today.limits.includes('zu kalt'));
});

test('Saison ausserhalb -> stark reduziert', () => {
  const days = makeDays({ precipAt: { 21: 22 }, month: 1 });
  const r = computeRainTiming(days, steinpilz);
  assert.ok(r.today.index < 0.2);
  assert.ok(r.today.limits.includes('ausserhalb der Saison'));
});

test('Zwei-Tages-Regen zählt als Ereignis', () => {
  const days = makeDays({ precipAt: { 20: 7, 21: 8 } });
  const r = computeRainTiming(days, steinpilz);
  assert.ok(r.lastEvent && r.lastEvent.mm >= 14, JSON.stringify(r.lastEvent));
});

test('formatDateDe', () => {
  assert.equal(formatDateDe('2026-09-06'), 'So 6.9.');
});
