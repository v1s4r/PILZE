// Referenzkoordinaten, erzeugt mit proj4 (EPSG:4326 → EPSG:2056, offizielle CH1903+/LV95-Definition
// mit Datumsverschiebung towgs84=674.374,15.056,405.346). Sie sind die unabhängige Kontrolle für die
// Näherungsformeln in js/geo/lv95.js: jene brauchen keine Abhängigkeit und sind schnell, müssen aber
// genau genug bleiben, damit die Höhenabfrage im swissALTI3D-Raster (0.5 m) denselben Wert trifft wie
// map.geo.admin.ch.
//
// Neu erzeugen:
//   npm i proj4 && node tests/fixtures/generate-lv95.mjs > /tmp/f.json
export const LV95_REFERENZ = [
  { name: "Bern, alte Sternwarte (LV95-Ursprung)", lat: 46.9510811, lon: 7.4386372, E: 2600000.36, N: 1199999.82 },
  { name: "Zürich HB", lat: 47.3779, lon: 8.5403, E: 2683196.61, N: 1248035.31 },
  { name: "Genf", lat: 46.2044, lon: 6.1432, E: 2500016.02, N: 1117821.07 },
  { name: "Basel", lat: 47.5596, lon: 7.5886, E: 2611287.84, N: 1267664.85 },
  { name: "Lugano", lat: 46.0037, lon: 8.9511, E: 2717161.19, N: 1095811.55 },
  { name: "St. Moritz", lat: 46.4908, lon: 9.8355, E: 2783998.69, N: 1151641.97 },
  { name: "Sion", lat: 46.2331, lon: 7.3606, E: 2593979.3, N: 1120187.32 },
  { name: "Siebnen SZ", lat: 47.1745, lon: 8.8965, E: 2710513.7, N: 1225864.15 },
  { name: "Jungfraujoch", lat: 46.5475, lon: 7.9855, E: 2641942.89, N: 1155280.39 },
  { name: "Nordrand (Schaffhausen)", lat: 47.696, lon: 8.63, E: 2689433.1, N: 1283499.18 },
  { name: "Südrand (Chiasso)", lat: 45.8317, lon: 9.0246, E: 2723240.63, N: 1076806.96 },
  { name: "Westrand (Genf)", lat: 46.132, lon: 5.967, E: 2486267.05, N: 1110014.25 },
  { name: "Ostrand (Müstair)", lat: 46.629, lon: 10.448, E: 2830408.09, N: 1168613.92 },
];
