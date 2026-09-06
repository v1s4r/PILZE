// Synthetische Antworten für alle externen Dienste, damit der Smoke-Test ohne Internet läuft.
import zlib from 'node:zlib';

// --- Mini-PNG-Encoder (RGBA, ohne Filter) ---
function crc32(buf) {
  let c; const table = [];
  for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
export function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0;
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Waldmischungsgrad-Bild: links Nadelwald (grün), Mitte Laubwald (orange), rechts kein Wald. */
export function forestPng(width, height) {
  const px = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const k = (y * width + x) * 4;
      const fx = x / width;
      if (fx < 0.45) { px[k] = 30; px[k + 1] = 100; px[k + 2] = 40; px[k + 3] = 255; }
      else if (fx < 0.75) { px[k] = 225; px[k + 1] = 130; px[k + 2] = 40; px[k + 3] = 255; }
      else { px[k + 3] = 0; }
    }
  }
  return encodePng(width, height, px);
}

export function flatPng(width, height, [r, g, b, a]) {
  const px = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) { px[i * 4] = r; px[i * 4 + 1] = g; px[i * 4 + 2] = b; px[i * 4 + 3] = a; }
  return encodePng(width, height, px);
}

/** Synthetisches Gelände: sanfte Hügel zwischen 700 und 1300 m. */
export function terrain(E, N) {
  return 1000 + 250 * Math.sin(E / 900) + 150 * Math.cos(N / 700);
}

export function weatherJson() {
  const time = []; const precip = []; const tmax = []; const tmin = []; const tmean = [];
  const htime = []; const soil = [];
  const today = new Date();
  for (let i = -30; i <= 6; i++) {
    const d = new Date(today); d.setDate(today.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    time.push(iso);
    precip.push(i === -9 ? 22 : i === -3 ? 6 : i % 5 === 0 ? 3 : 0);
    tmean.push(14); tmin.push(9); tmax.push(20);
    for (let h = 0; h < 24; h++) { htime.push(`${iso}T${String(h).padStart(2, '0')}:00`); soil.push(13); }
  }
  return {
    latitude: 47.05, longitude: 8.3, elevation: 900, timezone: 'Europe/Zurich',
    daily: { time, precipitation_sum: precip, temperature_2m_max: tmax, temperature_2m_min: tmin, temperature_2m_mean: tmean },
    hourly: { time: htime, soil_temperature_6cm: soil },
  };
}

/** Registriert alle Routen-Mocks auf einer Playwright-Page. */
export async function installMocks(page, counters = {}) {
  const count = (k) => { counters[k] = (counters[k] || 0) + 1; };

  await page.route(/api3\.geo\.admin\.ch\/rest\/services\/profile\.json/, async (route) => {
    count('profile');
    const body = route.request().postData() || '';
    const geom = JSON.parse(new URLSearchParams(body).get('geom'));
    const pts = geom.coordinates.map(([E, N]) => ({ alts: { COMB: terrain(E, N), DTM2: terrain(E, N), DTM25: terrain(E, N) }, dist: 0, easting: E, northing: N }));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(pts) });
  });
  await page.route(/api3\.geo\.admin\.ch\/rest\/services\/height/, async (route) => {
    count('height');
    const u = new URL(route.request().url());
    const h = terrain(Number(u.searchParams.get('easting')), Number(u.searchParams.get('northing')));
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ height: String(h.toFixed(1)) }) });
  });
  await page.route(/api3\.geo\.admin\.ch\/rest\/services\/all\/MapServer\/identify/, async (route) => {
    count('identify');
    const u = new URL(route.request().url());
    const [E] = (u.searchParams.get('geometry') || '0,0').split(',').map(Number);
    const rock = Math.floor(E / 1000) % 2 === 0 ? 'Kalkstein, Mergel' : 'Granit, Gneis';
    const body = { results: [{ type: 'Feature', id: 1, layerBodId: 'ch.swisstopo.geologie-geotechnik-gk500-gesteinsklassierung', layerName: 'Gesteinsklassierung', properties: { gestkl_de: rock, label: rock } }] };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route(/api3\.geo\.admin\.ch\/rest\/services\/api\/SearchServer/, async (route) => {
    count('search');
    const body = { results: [{ id: 1, weight: 1, attrs: { label: '<b>Luzern</b> (LU)', detail: 'luzern', lat: 47.0502, lon: 8.3093, zoomlevel: 12, origin: 'gg25' } }] };
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await page.route(/wms\.geo\.admin\.ch/, async (route) => {
    count('wms');
    const u = new URL(route.request().url());
    const w = Number(u.searchParams.get('WIDTH') || 64); const h = Number(u.searchParams.get('HEIGHT') || 64);
    await route.fulfill({ status: 200, contentType: 'image/png', headers: { 'access-control-allow-origin': '*' }, body: forestPng(w, h) });
  });
  await page.route(/wmts\.geo\.admin\.ch/, async (route) => {
    count('wmts');
    await route.fulfill({ status: 200, contentType: 'image/png', body: flatPng(256, 256, [222, 230, 214, 255]) });
  });
  await page.route(/api\.open-meteo\.com/, async (route) => {
    count('weather');
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(weatherJson()) });
  });
}
