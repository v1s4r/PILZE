// Zugriff auf die öffentlichen REST-Dienste von geo.admin.ch (api3 / wms).
// Alle Dienste liefern CORS-Header, die App kann sie direkt aus dem Browser aufrufen.

import { CONFIG } from '../config.js';

async function getJson(url, init) {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 200); } catch (_) { /* ignore */ }
    throw new Error(`HTTP ${res.status} bei ${url.split('?')[0]} ${detail}`);
  }
  return res.json();
}

/**
 * Höhen (swissALTI3D) für viele Punkte in EINER Anfrage.
 * Nutzt den Profil-Dienst mit only_requested_points=true: die LineString-Vertices werden
 * unverändert abgefragt (max. 5000 Punkte). Punkte ausserhalb des Höhenmodells fehlen in
 * der Antwort, daher wird über Koordinaten-Schlüssel zugeordnet.
 * @param {Array<{E:number,N:number}>} points ganzzahlige LV95-Koordinaten
 * @returns {Promise<Float64Array>} Höhen in m ü. M. (NaN wenn unbekannt)
 */
export async function fetchElevationBatch(points, { signal } = {}) {
  const out = new Float64Array(points.length).fill(NaN);
  if (points.length === 0) return out;
  if (points.length === 1) {
    out[0] = await fetchHeight(points[0].E, points[0].N, { signal });
    return out;
  }
  const geom = { type: 'LineString', coordinates: points.map((p) => [p.E, p.N]) };
  // Formular-POST ohne Preflight. Der Content-Type wird exakt gesetzt (ohne charset), weil der Dienst
  // den Header wörtlich vergleicht. Falls das dennoch abgelehnt wird: JSON-Body als Rückfallebene.
  const form = new URLSearchParams({ geom: JSON.stringify(geom), sr: '2056', only_requested_points: 'true' }).toString();
  let res = await fetch(CONFIG.api.profile, {
    method: 'POST', body: form, signal,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  if (res.status === 415 || res.status === 400) {
    res = await fetch(`${CONFIG.api.profile}?sr=2056&only_requested_points=true`, {
      method: 'POST', body: JSON.stringify(geom), signal,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!res.ok) throw new Error(`Höhen-Dienst antwortet mit HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error('Unerwartete Antwort des Profil-Dienstes');

  if (data.length === points.length) {
    for (let i = 0; i < data.length; i++) out[i] = altOf(data[i]);
    return out;
  }
  const byKey = new Map();
  for (const p of data) byKey.set(`${Math.round(p.easting)}|${Math.round(p.northing)}`, altOf(p));
  for (let i = 0; i < points.length; i++) {
    const v = byKey.get(`${points[i].E}|${points[i].N}`);
    if (v !== undefined) out[i] = v;
  }
  return out;
}

function altOf(p) {
  const a = p && p.alts ? (p.alts.COMB ?? p.alts.DTM2 ?? p.alts.DTM25) : null;
  return a == null ? NaN : Number(a);
}

/** Einzelne Höhe (m ü. M.) für einen LV95-Punkt. */
export async function fetchHeight(E, N, { signal } = {}) {
  const url = `${CONFIG.api.height}?easting=${E}&northing=${N}&sr=2056`;
  const data = await getJson(url, { signal });
  return Number(data.height);
}

/**
 * Identify: Attribute der Vektor-Layer an einem Punkt.
 * @returns {Promise<Array<{layerBodId:string, attributes:object}>>}
 */
export async function identify(E, N, layerIds, { tolerance = 0, lang = 'de', signal } = {}) {
  const params = new URLSearchParams({
    geometry: `${E},${N}`,
    geometryType: 'esriGeometryPoint',
    layers: `all:${layerIds.join(',')}`,
    tolerance: String(tolerance),
    sr: '2056',
    returnGeometry: 'false',
    geometryFormat: 'geojson',
    lang,
  });
  if (tolerance > 0) {
    // Toleranz wird in Pixeln relativ zu mapExtent/imageDisplay interpretiert: 1 px = 10 m
    params.set('mapExtent', `${E - 500},${N - 500},${E + 500},${N + 500}`);
    params.set('imageDisplay', '100,100,96');
  }
  const data = await getJson(`${CONFIG.api.identify}?${params}`, { signal });
  const results = Array.isArray(data.results) ? data.results : [];
  return results.map((f) => ({
    layerBodId: f.layerBodId,
    attributes: f.properties || f.attributes || {},
  }));
}

/** Ortssuche (Gemeinden, Flurnamen, Adressen, PLZ). */
export async function searchLocations(text, { limit = 8, lang = 'de', signal } = {}) {
  const params = new URLSearchParams({ searchText: text, type: 'locations', sr: '4326', limit: String(limit), lang });
  const data = await getJson(`${CONFIG.api.search}?${params}`, { signal });
  const results = Array.isArray(data.results) ? data.results : [];
  return results
    .map((r) => r.attrs || {})
    .filter((a) => Number.isFinite(Number(a.lat)) && Number.isFinite(Number(a.lon)))
    .map((a) => ({
      label: stripTags(String(a.label || '')),
      detail: String(a.detail || ''),
      lat: Number(a.lat),
      lon: Number(a.lon),
      zoom: Number.isFinite(Number(a.zoomlevel)) ? Math.min(16, Math.max(11, Number(a.zoomlevel))) : 13,
      origin: a.origin,
    }));
}

function stripTags(s) {
  return s.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** WMS-GetMap-URL (EPSG:3857) für einen Layer und eine Mercator-Bounding-Box. */
export function wmsUrl(layerId, bbox, width, height) {
  const params = new URLSearchParams({
    SERVICE: 'WMS',
    VERSION: '1.3.0',
    REQUEST: 'GetMap',
    FORMAT: 'image/png',
    TRANSPARENT: 'true',
    LAYERS: layerId,
    STYLES: '',
    CRS: 'EPSG:3857',
    WIDTH: String(width),
    HEIGHT: String(height),
    BBOX: `${bbox.minX},${bbox.minY},${bbox.maxX},${bbox.maxY}`,
    LANG: 'de',
  });
  return `${CONFIG.api.wms}?${params}`;
}

/** Lädt ein Bild mit CORS-Freigabe, damit die Pixel per Canvas ausgelesen werden dürfen. */
export function loadImage(url, { signal } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    const onAbort = () => { img.src = ''; reject(new DOMException('abgebrochen', 'AbortError')); };
    if (signal) {
      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
    }
    img.onload = () => { signal && signal.removeEventListener('abort', onAbort); resolve(img); };
    img.onerror = () => { signal && signal.removeEventListener('abort', onAbort); reject(new Error(`Bild konnte nicht geladen werden: ${url.split('?')[0]}`)); };
    img.src = url;
  });
}
