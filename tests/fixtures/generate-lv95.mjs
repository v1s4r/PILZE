import proj4 from 'proj4';
proj4.defs('EPSG:2056', '+proj=somerc +lat_0=46.9524055555556 +lon_0=7.43958333333333 '
  + '+k_0=1 +x_0=2600000 +y_0=1200000 +ellps=bessel '
  + '+towgs84=674.374,15.056,405.346,0,0,0,0 +units=m +no_defs');
const fwd = proj4('EPSG:4326', 'EPSG:2056');
const pts = [
  ['Bern, alte Sternwarte (LV95-Ursprung)', 46.9510811, 7.4386372],
  ['Zürich HB', 47.3779, 8.5403],
  ['Genf', 46.2044, 6.1432],
  ['Basel', 47.5596, 7.5886],
  ['Lugano', 46.0037, 8.9511],
  ['St. Moritz', 46.4908, 9.8355],
  ['Sion', 46.2331, 7.3606],
  ['Siebnen SZ', 47.1745, 8.8965],
  ['Jungfraujoch', 46.5475, 7.9855],
  ['Nordrand (Schaffhausen)', 47.696, 8.63],
  ['Südrand (Chiasso)', 45.8317, 9.0246],
  ['Westrand (Genf)', 46.132, 5.967],
  ['Ostrand (Müstair)', 46.629, 10.448],
];
console.log(JSON.stringify(pts.map(([n, lat, lon]) => {
  const [E, N] = fwd.forward([lon, lat]);
  return { n, lat, lon, E: +E.toFixed(2), N: +N.toFixed(2) };
}), null, 2));
