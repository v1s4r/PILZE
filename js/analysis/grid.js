// Analyse-Pipeline: Raster über den Kartenausschnitt legen, Daten laden, Zellen bewerten.
//
//  Höhen     -> api3 Profil-Dienst (eine Anfrage für das ganze Raster, swissALTI3D)
//  Wald      -> WMS Waldmischungsgrad LFI (Pixelanalyse: Waldanteil, Laubholzanteil)
//  Boden     -> Identify GK500 auf einem groben Gitter (Kalk/Silikat -> Säure-Index)
//  Neigung/Exposition -> aus dem Höhenraster

import { CONFIG } from '../config.js';
import * as M from '../geo/mercator.js';
import { toLv95Int, isInSwitzerlandLv95 } from '../geo/lv95.js';
import { fetchElevationBatch, wmsUrl, loadImage } from '../api/geoadmin.js';
import { forestStats, imageDataOf } from './raster.js';
import { slopeAspect } from './terrain.js';
import { soilNodes, nodeOf } from './geology.js';
import { scoreCell, clamp } from '../model/biotope.js';

/** Legt ein Mercator-ausgerichtetes Raster über die Bounding-Box. */
export function buildGrid(bounds) {
  const merc = M.bboxToMercator(bounds);
  const cols = CONFIG.grid.cols;
  const ratio = (merc.maxY - merc.minY) / (merc.maxX - merc.minX);
  const rows = clamp(Math.round(cols * ratio), CONFIG.grid.minRows, CONFIG.grid.maxRows);
  const dx = (merc.maxX - merc.minX) / cols;
  const dy = (merc.maxY - merc.minY) / rows;
  const lats = Array.from({ length: rows }, (_, j) => M.yToLat(merc.maxY - (j + 0.5) * dy));
  const lons = Array.from({ length: cols }, (_, i) => M.xToLon(merc.minX + (i + 0.5) * dx));
  const cellM = dx * M.groundScale(lats[Math.floor(rows / 2)]);
  return { bounds, merc, cols, rows, dx, dy, lats, lons, cellM };
}

async function loadForest(grid, signal) {
  const os = CONFIG.grid.rasterOversample;
  const url = wmsUrl(CONFIG.layers.forestMix, grid.merc, grid.cols * os, grid.rows * os);
  const img = await loadImage(url, { signal });
  const data = imageDataOf(img); // wirft SecurityError ohne CORS-Freigabe
  return forestStats(data, grid.cols, grid.rows);
}

async function loadSoil(grid, pts, signal, onProgress) {
  // Gitterknoten (schweizweit fest) bestimmen, die von Zellen benötigt werden
  const needed = new Map();
  const cellNode = new Array(pts.length);
  for (let k = 0; k < pts.length; k++) {
    const p = pts[k];
    if (!isInSwitzerlandLv95(p.E, p.N)) { cellNode[k] = null; continue; }
    const n = nodeOf(p.E, p.N);
    const key = `${n.kE}_${n.kN}`;
    cellNode[k] = key;
    if (!needed.has(key)) needed.set(key, n);
  }
  const nodes = [...needed.values()];
  const res = await soilNodes(nodes, { signal, onProgress });
  const byKey = new Map();
  nodes.forEach((n, i) => byKey.set(`${n.kE}_${n.kN}`, res[i]));

  const soil = new Float32Array(pts.length).fill(NaN);
  const labels = new Array(pts.length).fill('');
  for (let k = 0; k < pts.length; k++) {
    const r = cellNode[k] ? byKey.get(cellNode[k]) : null;
    if (r && r.index != null) soil[k] = r.index;
    if (r && r.label) labels[k] = r.label;
  }
  return { soil, labels, nodes: nodes.length };
}

/**
 * Führt die Analyse aus.
 * @param {ReturnType<typeof buildGrid>} grid
 * @param {object} species Profil
 * @param {number} month 1–12
 * @param {{onProgress?:(text:string, frac:number)=>void, signal?:AbortSignal, includeSoil?:boolean}} opts
 */
export async function analyze(grid, species, month, { onProgress = () => {}, signal, includeSoil = true } = {}) {
  const n = grid.cols * grid.rows;
  const pts = new Array(n);
  for (let j = 0; j < grid.rows; j++) for (let i = 0; i < grid.cols; i++) pts[j * grid.cols + i] = toLv95Int(grid.lats[j], grid.lons[i]);

  const status = { elevation: 'ok', forest: 'ok', soil: includeSoil ? 'ok' : 'aus', errors: [] };
  let soilProgress = 0;
  const report = () => onProgress('Höhen, Wald und Geologie werden geladen…', 0.15 + 0.7 * soilProgress);
  report();

  const elevP = fetchElevationBatch(pts, { signal });
  const forestP = loadForest(grid, signal).catch((e) => {
    if (e && e.name === 'AbortError') throw e;
    status.forest = 'fehlt';
    status.errors.push(`Waldlayer: ${e.message || e}`);
    return null;
  });
  const soilP = includeSoil
    ? loadSoil(grid, pts, signal, (f) => { soilProgress = f; report(); }).catch((e) => {
      if (e && e.name === 'AbortError') throw e;
      status.soil = 'fehlt';
      status.errors.push(`Geologie: ${e.message || e}`);
      return null;
    })
    : Promise.resolve(null);

  const [elev, forest, soilRes] = await Promise.all([elevP, forestP, soilP]);
  onProgress('Bewertung…', 0.9);

  let missing = 0;
  for (let k = 0; k < n; k++) if (!Number.isFinite(elev[k])) missing++;
  if (missing === n) status.elevation = 'fehlt';

  const { slope, aspect } = slopeAspect(
    elev, grid.cols, grid.rows,
    (j) => grid.dx * M.groundScale(grid.lats[j]),
    (j) => grid.dy * M.groundScale(grid.lats[j]),
  );

  const cells = {
    elev, slope, aspect,
    forestFrac: forest ? forest.forestFrac : null,
    decid: forest ? forest.decid : null,
    soil: soilRes ? soilRes.soil : null,
    soilLabels: soilRes ? soilRes.labels : null,
  };
  const result = { grid, cells, status, species, month, scores: null, createdAt: Date.now() };
  result.scores = rescore(result, species, month);
  onProgress('Fertig', 1);
  return result;
}

/** Bewertet ein bestehendes Ergebnis neu (z. B. nach Artwechsel) – ohne Daten nachzuladen. */
export function rescore(result, species, month) {
  const n = result.grid.cols * result.grid.rows;
  const scores = new Float32Array(n);
  for (let k = 0; k < n; k++) scores[k] = scoreCell(species, cellAt(result, k), month).score;
  result.species = species;
  result.month = month;
  result.scores = scores;
  return scores;
}

const nz = (v) => (v == null || !Number.isFinite(v) ? null : v);

/** Zelleninhalt als einfaches Objekt (NaN -> null). */
export function cellAt(result, k) {
  const c = result.cells;
  return {
    elev: nz(c.elev[k]),
    slope: nz(c.slope[k]),
    aspect: nz(c.aspect[k]),
    forestFrac: c.forestFrac ? nz(c.forestFrac[k]) : null,
    decid: c.decid ? nz(c.decid[k]) : null,
    soil: c.soil ? nz(c.soil[k]) : null,
    soilLabel: c.soilLabels ? c.soilLabels[k] : '',
  };
}

/** Index der Zelle, die eine Koordinate enthält, oder -1. */
export function cellIndexAt(result, lat, lon) {
  const g = result.grid;
  const x = M.lonToX(lon); const y = M.latToY(lat);
  const i = Math.floor((x - g.merc.minX) / g.dx);
  const j = Math.floor((g.merc.maxY - y) / g.dy);
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return -1;
  return j * g.cols + i;
}
