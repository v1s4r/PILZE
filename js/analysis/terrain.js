// Hangneigung und Exposition aus einem Höhenraster (zentrale Differenzen).

/**
 * @param {Float64Array|Float32Array} elev Höhen (m), row-major, Zeile 0 = Norden
 * @param {number} cols
 * @param {number} rows
 * @param {(row:number)=>number} dxAt Bodenabstand der Spalten in m auf Zeile row
 * @param {(row:number)=>number} dyAt Bodenabstand der Zeilen in m auf Zeile row
 * @returns {{slope: Float32Array, aspect: Float32Array}} Neigung in Grad, Exposition in Grad ab Nord (NaN wenn flach/unbekannt)
 */
export function slopeAspect(elev, cols, rows, dxAt, dyAt) {
  const slope = new Float32Array(cols * rows).fill(NaN);
  const aspect = new Float32Array(cols * rows).fill(NaN);
  const at = (i, j) => {
    const ii = i < 0 ? 0 : i >= cols ? cols - 1 : i;
    const jj = j < 0 ? 0 : j >= rows ? rows - 1 : j;
    return elev[jj * cols + ii];
  };
  for (let j = 0; j < rows; j++) {
    const dx = dxAt(j); const dy = dyAt(j);
    for (let i = 0; i < cols; i++) {
      const zc = at(i, j);
      if (!Number.isFinite(zc)) continue;
      let zw = at(i - 1, j); let ze = at(i + 1, j); let zn = at(i, j - 1); let zs = at(i, j + 1);
      let spanX = 2 * dx; let spanY = 2 * dy;
      if (!Number.isFinite(zw)) { zw = zc; spanX = dx; }
      if (!Number.isFinite(ze)) { ze = zc; spanX = dx; }
      if (!Number.isFinite(zn)) { zn = zc; spanY = dy; }
      if (!Number.isFinite(zs)) { zs = zc; spanY = dy; }
      const gx = (ze - zw) / spanX;   // Anstieg nach Osten
      const gy = (zn - zs) / spanY;   // Anstieg nach Norden
      const grad = Math.hypot(gx, gy);
      const idx = j * cols + i;
      slope[idx] = (Math.atan(grad) * 180) / Math.PI;
      if (grad > 0.02) {
        // Exposition = Richtung des Gefälles (bergab): -Gradient, als Azimut ab Nord im Uhrzeigersinn
        let a = (Math.atan2(-gx, -gy) * 180) / Math.PI;
        if (a < 0) a += 360;
        aspect[idx] = a;
      }
    }
  }
  return { slope, aspect };
}
