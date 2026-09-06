// Zentrale Konfiguration: Endpunkte, Layer-IDs, Rastergrössen.
// Alle Datenquellen sind öffentliche Dienste des Bundes (geo.admin.ch) bzw. Open-Meteo.

export const CONFIG = {
  api: {
    profile: 'https://api3.geo.admin.ch/rest/services/profile.json',
    height: 'https://api3.geo.admin.ch/rest/services/height',
    identify: 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify',
    search: 'https://api3.geo.admin.ch/rest/services/api/SearchServer',
    wms: 'https://wms.geo.admin.ch/',
    wmts: 'https://wmts.geo.admin.ch/1.0.0/{layer}/default/{time}/3857/{z}/{x}/{y}.{ext}',
    weather: 'https://api.open-meteo.com/v1/forecast',
  },

  layers: {
    // Hintergrundkarten (WMTS, EPSG:3857)
    base: {
      karte: { id: 'ch.swisstopo.pixelkarte-farbe', ext: 'jpeg', maxZoom: 18, name: 'Landeskarte' },
      grau: { id: 'ch.swisstopo.pixelkarte-grau', ext: 'jpeg', maxZoom: 18, name: 'Landeskarte grau' },
      luftbild: { id: 'ch.swisstopo.swissimage', ext: 'jpeg', maxZoom: 19, name: 'Luftbild' },
    },
    // Fach-Layer (WMTS zum Anzeigen, WMS/Identify zum Auswerten)
    forestMix: 'ch.bafu.landesforstinventar-waldmischungsgrad',
    vegHeight: 'ch.bafu.landesforstinventar-vegetationshoehenmodell_relief',
    hillshade: 'ch.swisstopo.swissalti3d-reliefschattierung',
    geology: 'ch.swisstopo.geologie-geologische_karte',
    rockClass: 'ch.swisstopo.geologie-geotechnik-gk500-gesteinsklassierung',
    lithology: 'ch.swisstopo.geologie-geotechnik-gk500-lithologie_hauptgruppen',
    hiking: 'ch.swisstopo.swisstlm3d-wanderwege',
  },

  // Analyse-Raster
  grid: {
    minZoom: 11,           // darunter keine Analyse (zu grob)
    cols: 48,              // Spalten des Bewertungsrasters
    maxRows: 48,
    minRows: 12,
    rasterOversample: 4,   // WMS-Bild wird 4x feiner geladen als das Raster (Waldanteil pro Zelle)
    geologySpacingM: 1000, // festes LV95-Gitter für Geologie-Abfragen (GK500 ist 1:500'000 – gröber als 1 km lohnt sich nicht)
    identifyConcurrency: 6,
  },

  // Schweiz-Ausschnitt
  swissBounds: { south: 45.7, west: 5.8, north: 47.9, east: 10.6 },
  defaultView: { lat: 46.95, lon: 8.1, zoom: 8 },

  // Heat-Overlay (rote Flächen)
  heat: {
    threshold: 0.3,   // ab diesem Score wird eine Zelle sichtbar
    opacity: 0.75,
    upscale: 8,       // Glättung: Zellen werden hochskaliert und bilinear interpoliert
  },

  weather: {
    pastDays: 30,
    forecastDays: 7,
    cacheMinutes: 30,
  },

  storageKeys: {
    settings: 'pilzkarte.settings.v1',
    spots: 'pilzkarte.spots.v1',
    geology: 'pilzkarte.geology.v2',
    weather: 'pilzkarte.weather.v1',
  },
};

export function wmtsUrl(layerId, ext = 'png', time = 'current') {
  return CONFIG.api.wmts.replace('{layer}', layerId).replace('{time}', time).replace('{ext}', ext);
}
