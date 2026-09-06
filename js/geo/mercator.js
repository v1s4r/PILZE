// Web-Mercator-Hilfsfunktionen (EPSG:3857). Das Analyse-Raster ist am Mercator-Bild ausgerichtet,
// damit WMS-Bilder und Kartenkacheln pixelgenau übereinanderliegen.

export const R = 6378137;
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function lonToX(lon) { return R * lon * D2R; }
export function latToY(lat) { return R * Math.log(Math.tan(Math.PI / 4 + (lat * D2R) / 2)); }
export function xToLon(x) { return (x / R) * R2D; }
export function yToLat(y) { return (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) * R2D; }

/** Bodenmeter pro Mercator-Meter auf gegebener Breite. */
export function groundScale(lat) { return Math.cos(lat * D2R); }

/** Bounding-Box {west,south,east,north} (Grad) -> Mercator-Meter. */
export function bboxToMercator(b) {
  return { minX: lonToX(b.west), minY: latToY(b.south), maxX: lonToX(b.east), maxY: latToY(b.north) };
}
