// Umrechnung WGS84 <-> LV95 (CH1903+) nach den Näherungsformeln von swisstopo
// ("Näherungsformeln für die Transformation zwischen Schweizer Projektionskoordinaten und WGS84").
// Genauigkeit ca. 1 m – für die Biotop-Analyse mehr als ausreichend.

export function wgs84ToLv95(lat, lon) {
  const phi = (lat * 3600 - 169028.66) / 10000;
  const lam = (lon * 3600 - 26782.5) / 10000;
  const phi2 = phi * phi;
  const lam2 = lam * lam;
  const E = 2600072.37 + 211455.93 * lam - 10938.51 * lam * phi - 0.36 * lam * phi2 - 44.54 * lam * lam2;
  const N = 1200147.07 + 308807.95 * phi + 3745.25 * lam2 + 76.63 * phi2 - 194.56 * lam2 * phi + 119.79 * phi * phi2;
  return { E, N };
}

export function lv95ToWgs84(E, N) {
  const y = (E - 2600000) / 1000000;
  const x = (N - 1200000) / 1000000;
  const lam = 2.6779094 + 4.728982 * y + 0.791484 * y * x + 0.1306 * y * x * x - 0.0436 * y * y * y;
  const phi = 16.9023892 + 3.238272 * x - 0.270978 * y * y - 0.002528 * x * x - 0.0447 * y * y * x - 0.0140 * x * x * x;
  return { lat: (phi * 100) / 36, lon: (lam * 100) / 36 };
}

/** Ganzzahlige LV95-Koordinaten (Meter) – so bleiben Schlüssel für Caches stabil. */
export function toLv95Int(lat, lon) {
  const { E, N } = wgs84ToLv95(lat, lon);
  return { E: Math.round(E), N: Math.round(N) };
}

export function isInSwitzerlandLv95(E, N) {
  return E > 2480000 && E < 2840000 && N > 1070000 && N < 1300000;
}
