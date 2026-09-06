// Auswertung von WMS-Bildern: Pixelfarben -> Waldanteil und Laubholzanteil pro Rasterzelle.
//
// Der Layer "Waldmischungsgrad LFI" ist nur innerhalb des Waldes gezeichnet (sonst transparent),
// deshalb liefert die Deckkraft direkt die Waldmaske. Die Farbe kodiert den Laubholzanteil:
// Nadelholz-dominierte Bestände erscheinen (dunkel)grün, Laubholz-dominierte gelb bis orange/braun.
// Die Zuordnung erfolgt über den Farbton (Hue) und ist damit robust gegenüber kleinen Legendenänderungen.

export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

/**
 * Laubholzanteil (0–1) aus einer Pixelfarbe des Waldmischungsgrad-Layers.
 * Grün (Hue ~120°) = Nadelholz, Gelb (~55°) = gemischt, Orange/Braun/Rot (< 35°) = Laubholz.
 * Graue Pixel (geringe Sättigung) gelten als unbekannt.
 */
export function deciduousShareFromColor(r, g, b) {
  const { h, s, l } = rgbToHsl(r, g, b);
  if (s < 0.12 || l < 0.06 || l > 0.97) return null;
  let hue = h;
  if (hue > 300) hue -= 360; // Rottöne um 0° herum
  if (hue >= 125) return 0;
  if (hue <= 30) return 1;
  return (125 - hue) / 95;
}

/**
 * Berechnet pro Zelle den Anteil deckender Pixel (Waldanteil) und den mittleren Laubholzanteil.
 * @param {ImageData} imageData WMS-Bild, Breite = cols*ox, Höhe = rows*oy
 * @param {number} cols
 * @param {number} rows
 * @returns {{forestFrac: Float32Array, decid: Float32Array}} decid = NaN wenn unbekannt
 */
export function forestStats(imageData, cols, rows) {
  const { width, height, data } = imageData;
  const ox = width / cols; const oy = height / rows;
  const forestFrac = new Float32Array(cols * rows);
  const decid = new Float32Array(cols * rows).fill(NaN);
  for (let j = 0; j < rows; j++) {
    const y0 = Math.floor(j * oy); const y1 = Math.floor((j + 1) * oy);
    for (let i = 0; i < cols; i++) {
      const x0 = Math.floor(i * ox); const x1 = Math.floor((i + 1) * ox);
      let n = 0; let forest = 0; let dsum = 0; let dn = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const k = (y * width + x) * 4;
          n++;
          if (data[k + 3] < 64) continue;
          forest++;
          const ds = deciduousShareFromColor(data[k], data[k + 1], data[k + 2]);
          if (ds != null) { dsum += ds; dn++; }
        }
      }
      const idx = j * cols + i;
      forestFrac[idx] = n ? forest / n : 0;
      if (dn > 0) decid[idx] = dsum / dn;
    }
  }
  return { forestFrac, decid };
}

/** Zeichnet ein Bild auf ein Canvas und liest die Pixel aus (wirft bei fehlender CORS-Freigabe). */
export function imageDataOf(img) {
  const canvas = document.createElement('canvas');
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
