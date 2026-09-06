// Wetterdaten von Open-Meteo (kostenlos, ohne API-Schlüssel). Für die Schweiz kommen
// die hochaufgelösten ICON-CH-Modelle von MeteoSchweiz zum Einsatz.

import { CONFIG } from '../config.js';

const memCache = new Map();

/**
 * @param {number} lat
 * @param {number} lon
 * @param {{elevation?:number, signal?:AbortSignal}} opts
 * @returns {Promise<{days:Array<{date:string,precip:number,tmax:number,tmin:number,tmean:number,soilT:number|null,isForecast:boolean}>, fetchedAt:number, lat:number, lon:number}>}
 */
export async function fetchWeather(lat, lon, { elevation, signal } = {}) {
  const key = `${lat.toFixed(2)}|${lon.toFixed(2)}`;
  const now = Date.now();
  const ttl = CONFIG.weather.cacheMinutes * 60 * 1000;
  const cached = memCache.get(key) || readStorage(key);
  if (cached && now - cached.fetchedAt < ttl) {
    memCache.set(key, cached);
    return cached;
  }

  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    daily: 'precipitation_sum,temperature_2m_max,temperature_2m_min,temperature_2m_mean',
    hourly: 'soil_temperature_6cm',
    past_days: String(CONFIG.weather.pastDays),
    forecast_days: String(CONFIG.weather.forecastDays),
    timezone: 'Europe/Zurich',
  });
  if (Number.isFinite(elevation)) params.set('elevation', String(Math.round(elevation)));

  const res = await fetch(`${CONFIG.api.weather}?${params}`, { signal });
  if (!res.ok) throw new Error(`Wetterdienst antwortet mit HTTP ${res.status}`);
  const raw = await res.json();
  const data = normalize(raw, lat, lon);
  memCache.set(key, data);
  writeStorage(key, data);
  return data;
}

export function normalize(raw, lat, lon) {
  const d = raw.daily || {};
  const dates = d.time || [];
  const soilByDay = dailyMean(raw.hourly && raw.hourly.time, raw.hourly && raw.hourly.soil_temperature_6cm);
  const today = localDateString(new Date());
  const days = dates.map((date, i) => ({
    date,
    precip: num(d.precipitation_sum && d.precipitation_sum[i]),
    tmax: num(d.temperature_2m_max && d.temperature_2m_max[i]),
    tmin: num(d.temperature_2m_min && d.temperature_2m_min[i]),
    tmean: num(d.temperature_2m_mean && d.temperature_2m_mean[i]),
    soilT: soilByDay.has(date) ? soilByDay.get(date) : null,
    isForecast: date > today,
  }));
  return { days, fetchedAt: Date.now(), lat, lon, elevation: raw.elevation };
}

function dailyMean(times, values) {
  const sums = new Map();
  if (!Array.isArray(times) || !Array.isArray(values)) return new Map();
  for (let i = 0; i < times.length; i++) {
    const v = values[i];
    if (v == null || !Number.isFinite(v)) continue;
    const day = String(times[i]).slice(0, 10);
    const s = sums.get(day) || { sum: 0, n: 0 };
    s.sum += v; s.n += 1;
    sums.set(day, s);
  }
  const out = new Map();
  for (const [day, s] of sums) out.set(day, s.sum / s.n);
  return out;
}

function num(v) { return v == null || !Number.isFinite(Number(v)) ? 0 : Number(v); }

export function localDateString(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function readStorage(key) {
  try {
    const all = JSON.parse(localStorage.getItem(CONFIG.storageKeys.weather) || '{}');
    return all[key] || null;
  } catch (_) { return null; }
}

function writeStorage(key, data) {
  try {
    const all = JSON.parse(localStorage.getItem(CONFIG.storageKeys.weather) || '{}');
    const keys = Object.keys(all);
    if (keys.length > 20) for (const k of keys.slice(0, keys.length - 20)) delete all[k];
    all[key] = data;
    localStorage.setItem(CONFIG.storageKeys.weather, JSON.stringify(all));
  } catch (_) { /* Speicher voll oder blockiert – egal */ }
}
