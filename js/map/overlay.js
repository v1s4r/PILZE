// Rendert die Bewertung als rotes Heat-Overlay (wie farbige Flächen auf einer Navi-Karte).

import { CONFIG } from '../config.js';

const LIGHT = [220, 45, 55];   // Score an der Schwelle: bereits deutlich rot
const DARK = [130, 6, 16];     // Score 1.0: dunkelrot

export function scoreColor(s, threshold) {
  const t = Math.max(0, Math.min(1, (s - threshold) / (1 - threshold)));
  const r = Math.round(LIGHT[0] + (DARK[0] - LIGHT[0]) * t);
  const g = Math.round(LIGHT[1] + (DARK[1] - LIGHT[1]) * t);
  const b = Math.round(LIGHT[2] + (DARK[2] - LIGHT[2]) * t);
  const a = Math.round(255 * (0.6 + 0.35 * t));
  return [r, g, b, a];
}

/** Erzeugt ein geglättetes Canvas (cols*upscale x rows*upscale) aus den Zell-Scores. */
export function renderHeatCanvas(result, { threshold = CONFIG.heat.threshold, upscale = CONFIG.heat.upscale } = {}) {
  const { cols, rows } = result.grid;
  const small = document.createElement('canvas');
  small.width = cols; small.height = rows;
  const sctx = small.getContext('2d');
  const img = sctx.createImageData(cols, rows);
  for (let k = 0; k < cols * rows; k++) {
    const s = result.scores[k];
    if (!(s >= threshold)) continue;
    const [r, g, b, a] = scoreColor(s, threshold);
    img.data[k * 4] = r; img.data[k * 4 + 1] = g; img.data[k * 4 + 2] = b; img.data[k * 4 + 3] = a;
  }
  sctx.putImageData(img, 0, 0);

  const big = document.createElement('canvas');
  big.width = cols * upscale; big.height = rows * upscale;
  const bctx = big.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(small, 0, 0, big.width, big.height);
  return big;
}

/** Leaflet-Wrapper: hält genau ein ImageOverlay und tauscht es bei Bedarf aus. */
export class HeatLayer {
  constructor(map, L) {
    this.map = map; this.L = L; this.overlay = null; this.opacity = CONFIG.heat.opacity;
  }
  update(result, opts = {}) {
    const canvas = renderHeatCanvas(result, opts);
    const b = result.grid.bounds;
    const bounds = this.L.latLngBounds([b.south, b.west], [b.north, b.east]);
    const url = canvas.toDataURL('image/png');
    if (this.overlay) {
      this.overlay.setUrl(url);
      this.overlay.setBounds(bounds);
    } else {
      this.overlay = this.L.imageOverlay(url, bounds, { opacity: this.opacity, interactive: false, className: 'heat-overlay', zIndex: 450 }).addTo(this.map);
    }
    this.overlay.setOpacity(this.opacity);
  }
  setOpacity(o) { this.opacity = o; if (this.overlay) this.overlay.setOpacity(o); }
  clear() { if (this.overlay) { this.overlay.remove(); this.overlay = null; } }
}
