// Bodensäure aus der Geologie: Identify-Abfrage der GK500-Layer (Gesteinsklassierung, Lithologie),
// Schlüsselwort-Zuordnung zu einem Säure-Index, Zwischenspeicher im Browser (Geologie ändert sich nicht).
//
// Für die Flächenanalyse werden Knoten eines festen, schweizweiten Gitters (LV95, Abstand
// CONFIG.grid.geologySpacingM) abgefragt. Beim Verschieben der Karte kommen bereits bekannte Knoten
// aus dem Cache – die Geologiekarte 1:500'000 ist ohnehin nicht feiner aufgelöst.

import { CONFIG } from '../config.js';
import { identify } from '../api/geoadmin.js';
import { soilIndexFromRockText } from '../model/biotope.js';

const SPACING = CONFIG.grid.geologySpacingM;
const EXACT_CELL_M = 100;
const mem = new Map();
let loaded = false;
let saveTimer = null;

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = JSON.parse(localStorage.getItem(CONFIG.storageKeys.geology) || '{}');
    for (const [k, v] of Object.entries(raw)) mem.set(k, v);
  } catch (_) { /* ignore */ }
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const entries = [...mem.entries()].slice(-6000);
      localStorage.setItem(CONFIG.storageKeys.geology, JSON.stringify(Object.fromEntries(entries)));
    } catch (_) { /* Speicher voll – egal */ }
  }, 1500);
}

/** Gitterknoten (Index-Paar) für eine LV95-Koordinate. */
export function nodeOf(E, N) {
  return { kE: Math.round(E / SPACING), kN: Math.round(N / SPACING) };
}

function pickLabel(features) {
  const order = [
    [CONFIG.layers.rockClass, 'gestkl_de'],
    [CONFIG.layers.lithology, 'bgdi_tooltip_de'],
    [CONFIG.layers.geology, 'leg_geol_d'],
  ];
  for (const [layer, attr] of order) {
    const f = features.find((x) => x.layerBodId === layer && x.attributes && x.attributes[attr]);
    if (f) return String(f.attributes[attr]);
  }
  for (const f of features) {
    const s = Object.values(f.attributes || {}).find((v) => typeof v === 'string' && v.length > 2);
    if (s) return s;
  }
  return '';
}

async function query(E, N, signal) {
  let features = await identify(E, N, [CONFIG.layers.rockClass, CONFIG.layers.lithology], { tolerance: 0, signal });
  if (features.length === 0) {
    features = await identify(E, N, [CONFIG.layers.geology], { tolerance: 0, signal });
  }
  const texts = [];
  for (const f of features) {
    for (const v of Object.values(f.attributes || {})) if (typeof v === 'string') texts.push(v);
  }
  const { index, matched } = soilIndexFromRockText(texts);
  return { index, label: pickLabel(features), matched };
}

async function cached(key, E, N, signal) {
  load();
  const hit = mem.get(key);
  if (hit) return hit;
  const result = await query(E, N, signal);
  mem.set(key, result);
  scheduleSave();
  return result;
}

/**
 * Säure-Index (0 sauer … 1 kalkreich) und Gesteinsbezeichnung genau an diesem Punkt.
 * @returns {Promise<{index:number|null, label:string, matched:string[]}>}
 */
export function soilAt(E, N, { signal } = {}) {
  const key = `p${Math.round(E / EXACT_CELL_M)}_${Math.round(N / EXACT_CELL_M)}`;
  return cached(key, Math.round(E), Math.round(N), signal);
}

/** Säure-Index am Gitterknoten (kE, kN). */
export function soilAtNode(kE, kN, { signal } = {}) {
  return cached(`n${kE}_${kN}`, kE * SPACING, kN * SPACING, signal);
}

/**
 * Fragt viele Gitterknoten mit begrenzter Parallelität ab; Fehler einzelner Knoten ergeben null.
 * @param {Array<{kE:number,kN:number}>} nodes
 */
export async function soilNodes(nodes, { concurrency = CONFIG.grid.identifyConcurrency, signal, onProgress } = {}) {
  const out = new Array(nodes.length).fill(null);
  let next = 0; let done = 0;
  async function worker() {
    while (next < nodes.length) {
      if (signal && signal.aborted) throw new DOMException('abgebrochen', 'AbortError');
      const i = next++;
      try {
        out[i] = await soilAtNode(nodes[i].kE, nodes[i].kN, { signal });
      } catch (e) {
        if (e && e.name === 'AbortError') throw e;
        out[i] = null;
      }
      done++;
      if (onProgress) onProgress(done / nodes.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, nodes.length) }, worker));
  return out;
}
