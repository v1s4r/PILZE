// Einstiegspunkt: verdrahtet Karte, Analyse, Wetter und Panel.

import { CONFIG, wmtsUrl } from './config.js';
import { SPECIES, COMBINED, getSpecies, seasonLeader } from './model/species.js';
import { scoreCell, classify, seasonInfo } from './model/biotope.js';
import { selectThreshold } from './model/heat.js';
import { computeRainTiming, describeTiming, indexLabel } from './model/rain.js';
import { buildGrid, analyze, rescore, cellAt, cellIndexAt } from './analysis/grid.js';
import { soilAt } from './analysis/geology.js';
import { HeatLayer } from './map/overlay.js';
import { fetchHeight, searchLocations } from './api/geoadmin.js';
import { fetchWeather } from './api/weather.js';
import { toLv95Int } from './geo/lv95.js';
import { googleMapsRouteUrl, googleMapsShowUrl } from './model/places.js';
import { el, clear, toast, debounce } from './ui/dom.js';
import { renderWeatherChart, renderWeatherTable } from './ui/chart.js';
import { renderInspector } from './ui/inspector.js';
import { loadSpots, saveSpots, newSpot, renderSpots, exportSpots, importSpotsFromFile } from './ui/spots.js';

const L = window.L;
const $ = (id) => document.getElementById(id);
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

const state = {
  speciesId: 'steinpilz',
  month: new Date().getMonth() + 1,
  auto: true,
  includeSoil: true,
  opacity: CONFIG.heat.opacity,
  topFraction: CONFIG.heat.topFraction,
  heatInfo: null,
  result: null,
  analyzing: null,
  selected: null,
  weather: null,
  weatherReq: null,
  spots: [],
};

// ---------- Einstellungen ----------
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(CONFIG.storageKeys.settings) || '{}');
    if (s.speciesId && (s.speciesId === COMBINED.id || SPECIES.some((x) => x.id === s.speciesId))) state.speciesId = s.speciesId;
    if (typeof s.auto === 'boolean') state.auto = s.auto;
    if (typeof s.includeSoil === 'boolean') state.includeSoil = s.includeSoil;
    if (Number.isFinite(s.opacity)) state.opacity = s.opacity;
    if (Number.isFinite(s.topFraction)) state.topFraction = s.topFraction;
  } catch (_) { /* ignore */ }
}
function saveSettings() {
  try {
    const { speciesId, auto, includeSoil, opacity, topFraction } = state;
    localStorage.setItem(CONFIG.storageKeys.settings, JSON.stringify({ speciesId, auto, includeSoil, opacity, topFraction }));
  } catch (_) { /* ignore */ }
}

// ---------- Karte ----------
loadSettings();
const hash = parseHash();
if (hash && hash.species) state.speciesId = hash.species;

const map = L.map('map', { zoomControl: false, attributionControl: false, minZoom: 7, maxZoom: 19, maxBounds: [[45.4, 5.2], [48.2, 11.2]], maxBoundsViscosity: 0.6 });
L.control.attribution({ prefix: '<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>', position: 'bottomright' }).addTo(map);
L.control.zoom({ position: 'topright' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomright' }).addTo(map);

const attribution = '© <a href="https://www.swisstopo.admin.ch" target="_blank" rel="noopener">swisstopo</a>, BAFU · Wetter: <a href="https://open-meteo.com" target="_blank" rel="noopener">Open-Meteo</a>';
const baseLayers = {};
for (const [key, b] of Object.entries(CONFIG.layers.base)) {
  baseLayers[b.name] = L.tileLayer(wmtsUrl(b.id, b.ext), { maxNativeZoom: b.maxZoom, maxZoom: 19, attribution, crossOrigin: false });
  if (key === 'karte') baseLayers[b.name].addTo(map);
}
const overlayTile = (id, opacity) => L.tileLayer(wmtsUrl(id, 'png'), { maxNativeZoom: 18, maxZoom: 19, opacity, zIndex: 300 });
const overlays = {
  'Waldmischungsgrad (Laub/Nadel)': overlayTile(CONFIG.layers.forestMix, 0.8),
  'Vegetationshöhe': overlayTile(CONFIG.layers.vegHeight, 0.8),
  'Relief': overlayTile(CONFIG.layers.hillshade, 0.5),
  'Geologie (GK500)': overlayTile(CONFIG.layers.geology, 0.6),
  'Wanderwege': overlayTile(CONFIG.layers.hiking, 1),
};
L.control.layers(baseLayers, overlays, { position: 'topright', collapsed: true }).addTo(map);

if (hash) map.setView([hash.lat, hash.lon], hash.zoom);
else map.setView([CONFIG.defaultView.lat, CONFIG.defaultView.lon], CONFIG.defaultView.zoom);

const heat = new HeatLayer(map, L);
heat.setOpacity(state.opacity);
const spotLayer = L.layerGroup().addTo(map);
let selectedMarker = null;
let locateMarker = null;

function parseHash() {
  const m = /^#(\d{1,2})\/(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)(?:\/([a-z]+))?$/.exec(location.hash || '');
  if (!m) return null;
  const zoom = Number(m[1]); const lat = Number(m[2]); const lon = Number(m[3]);
  if (!(zoom >= 7 && zoom <= 19 && lat > 44 && lat < 49 && lon > 4 && lon < 12)) return null;
  const species = m[4] && (m[4] === COMBINED.id || SPECIES.some((s) => s.id === m[4])) ? m[4] : null;
  return { zoom, lat, lon, species };
}
function updateHash() {
  const c = map.getCenter();
  const h = `#${map.getZoom()}/${c.lat.toFixed(5)}/${c.lng.toFixed(5)}/${state.speciesId}`;
  if (location.hash !== h) history.replaceState(null, '', h);
}

// ---------- Panel: Tabs & Mobile ----------
const panel = $('panel');
function activateTab(name) {
  document.querySelectorAll('.tabs [role="tab"]').forEach((b) => {
    const on = b.dataset.tab === name;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', on ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-page').forEach((p) => p.classList.toggle('active', p.dataset.page === name));
  if (name === 'wetter') renderWeather();
  if (panel.classList.contains('collapsed')) { panel.classList.remove('collapsed'); setTimeout(() => map.invalidateSize(), 250); }
}
document.querySelectorAll('.tabs [role="tab"]').forEach((b) => b.addEventListener('click', () => activateTab(b.dataset.tab)));
$('btn-panel-toggle').addEventListener('click', () => {
  if (panel.classList.contains('collapsed')) panel.classList.remove('collapsed');
  else if (panel.classList.contains('expanded')) { panel.classList.remove('expanded'); panel.classList.add('collapsed'); }
  else panel.classList.add('expanded');
  setTimeout(() => map.invalidateSize(), 250);
});
$('sheet-handle').addEventListener('click', () => { panel.classList.toggle('expanded'); panel.classList.remove('collapsed'); setTimeout(() => map.invalidateSize(), 250); });

// ---------- Pilzarten ----------
function renderSpeciesChips() {
  const box = $('species-list');
  clear(box);
  for (const s of [COMBINED, ...SPECIES]) {
    box.append(el('button', {
      type: 'button', class: `chip${s.id === state.speciesId ? ' active' : ''}`, role: 'radio',
      'aria-checked': s.id === state.speciesId ? 'true' : 'false', 'data-id': s.id, title: s.latin,
      onclick: () => setSpecies(s.id),
    }, [el('span', { text: s.icon, 'aria-hidden': 'true' }), el('span', { text: s.name })]));
  }
  const sp = getSpecies(state.speciesId);
  const leader = seasonLeader(state.month);
  $('species-tip').textContent = sp.combine
    ? `Zeigt je Zelle die Art mit dem besten Potenzial im ${MONTHS[state.month - 1]} – aktuell meist ${leader.name}. Arten ausserhalb ihrer Saison werden zurückgestuft.`
    : `${sp.latin} · Baumpartner: ${sp.partners} · Höhe ${sp.elevation[1]}–${sp.elevation[2]} m (max. ${sp.elevation[3]} m) · Saison ${MONTHS[sp.season[0] - 1]}–${MONTHS[sp.season[1] - 1]}.`;
  renderSeasonBanner(sp);
}

/** Weist darauf hin, wenn die gewählte Art im gewählten Monat nicht fruchtet. */
function renderSeasonBanner(sp) {
  const box = $('season-banner');
  clear(box);
  box.className = 'season-banner';
  if (sp.combine) { box.hidden = true; return; }
  const info = seasonInfo(sp, state.month);
  if (info.state === 'saison' || info.state === 'hoch') { box.hidden = true; return; }
  box.hidden = false;
  box.className = `season-banner ${info.state}`;
  box.append(
    el('span', { class: 'icon', text: info.state === 'aus' ? '🚫' : '⏳', 'aria-hidden': 'true' }),
    el('span', {}, [
      el('strong', { text: `${sp.name}: ${info.state === 'aus' ? 'ausserhalb der Saison' : 'Randmonat'} im ${MONTHS[state.month - 1]}. ` }),
      el('span', { text: `Saison ${MONTHS[sp.season[0] - 1]}–${MONTHS[sp.season[1] - 1]}. Die roten Flächen zeigen weiterhin das Standort-Potenzial – gut zum Plätze-Suchen, aber jetzt ist keine Fruchtung zu erwarten.` }),
    ]),
  );
}
function setSpecies(id) {
  state.speciesId = id;
  saveSettings();
  renderSpeciesChips();
  updateHash();
  if (state.result) {
    rescore(state.result, getSpecies(id), state.month);
    drawHeat();
  }
  if (state.selected) inspectPoint(L.latLng(state.selected.lat, state.selected.lon), { silent: true });
  renderWeather();
}

// ---------- Einstellungen-UI ----------
const monthSel = $('month-select');
MONTHS.forEach((m, i) => monthSel.append(el('option', { value: String(i + 1), text: m })));
monthSel.value = String(state.month);
monthSel.addEventListener('change', () => { state.month = Number(monthSel.value); setSpecies(state.speciesId); });

$('auto-analyze').checked = state.auto;
$('auto-analyze').addEventListener('change', (e) => { state.auto = e.target.checked; saveSettings(); if (state.auto) scheduleAutoAnalysis(); });
$('include-soil').checked = state.includeSoil;
$('include-soil').addEventListener('change', (e) => { state.includeSoil = e.target.checked; saveSettings(); });
const opacityInput = $('opacity'); opacityInput.value = String(state.opacity);
const topInput = $('top-fraction'); topInput.value = String(Math.round(state.topFraction * 100));
const showSliderValues = () => {
  $('opacity-value').textContent = `${Math.round(state.opacity * 100)} %`;
  $('top-fraction-value').textContent = `beste ${Math.round(state.topFraction * 100)} %`;
};
showSliderValues();
opacityInput.addEventListener('input', () => { state.opacity = Number(opacityInput.value); heat.setOpacity(state.opacity); showSliderValues(); saveSettings(); });
topInput.addEventListener('change', () => { state.topFraction = Number(topInput.value) / 100; showSliderValues(); saveSettings(); drawHeat(); });
topInput.addEventListener('input', () => { state.topFraction = Number(topInput.value) / 100; showSliderValues(); });
$('btn-clear-cache').addEventListener('click', () => {
  try {
    localStorage.removeItem(CONFIG.storageKeys.geology);
    localStorage.removeItem(CONFIG.storageKeys.weather);
  } catch (_) { /* ignore */ }
  toast('Zwischenspeicher geleert. Die nächste Analyse lädt alles neu.');
});

// ---------- Analyse ----------
const fab = $('fab-analyze');
const progress = $('progress'); const progressBar = $('progress-bar');
const statusText = $('status-text');

function zoomOk() { return map.getZoom() >= CONFIG.grid.minZoom; }
function updateFab() {
  const busy = !!state.analyzing;
  fab.disabled = !zoomOk() && !busy;
  fab.classList.toggle('busy', busy);
  fab.textContent = busy ? '⏳ Analyse läuft…' : zoomOk() ? '🍄 Hier analysieren' : `🔍 Näher zoomen (Zoom ≥ ${CONFIG.grid.minZoom})`;
}

async function runAnalysis() {
  if (!zoomOk()) { toast(`Bitte näher heranzoomen (mindestens Zoomstufe ${CONFIG.grid.minZoom}).`); return; }
  if (state.analyzing) state.analyzing.abort();
  const ctrl = new AbortController();
  state.analyzing = ctrl;
  updateFab();
  progress.hidden = false; progressBar.style.width = '5%';
  statusText.textContent = 'Analyse gestartet…';

  const b = map.getBounds();
  const bounds = { north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() };
  const grid = buildGrid(bounds);
  const species = getSpecies(state.speciesId);
  try {
    const result = await analyze(grid, species, state.month, {
      signal: ctrl.signal,
      includeSoil: state.includeSoil,
      onProgress: (text, frac) => { if (state.analyzing === ctrl) { statusText.textContent = text; progressBar.style.width = `${Math.round(frac * 100)}%`; } },
    });
    if (ctrl.signal.aborted) return;
    state.result = result;
    drawHeat();
    $('map-legend').hidden = false;
    if (result.status.errors.length) console.warn('Datenquellen mit Problemen:', result.status.errors);
    if (result.status.forest !== 'ok') toast('Waldlayer konnte nicht ausgewertet werden – die roten Flächen berücksichtigen Wald und Baumarten nicht.', { type: 'error', ms: 7000 });
    if (state.selected) inspectPoint(L.latLng(state.selected.lat, state.selected.lon), { silent: true });
    if (!state.selected) scheduleWeatherForCenter();
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    console.error(e);
    statusText.textContent = `Analyse fehlgeschlagen: ${e.message || e}`;
    toast(`Analyse fehlgeschlagen: ${e.message || e}`, { type: 'error', ms: 6000 });
  } finally {
    if (state.analyzing === ctrl) { state.analyzing = null; progress.hidden = true; updateFab(); }
  }
}

/** Wählt die Schwelle für den aktuellen Ausschnitt, zeichnet das Overlay und aktualisiert den Text. */
function drawHeat() {
  const r = state.result;
  if (!r) return;
  state.heatInfo = selectThreshold(r.scores, { topFraction: state.topFraction, minScore: CONFIG.heat.minScore });
  heat.update(r, { threshold: state.heatInfo.threshold });
  updateStatus();
}

function updateStatus() {
  const r = state.result;
  const info = state.heatInfo;
  if (!r || !info) return;
  const sp = getSpecies(state.speciesId);
  const pct = info.fraction * 100;
  const flaeche = info.marked === 0
    ? 'nichts markiert – im Ausschnitt erreicht keine Zelle hohes Potenzial'
    : `${pct < 1 ? 'unter 1' : Math.round(pct)} % der Fläche markiert (${info.marked} von ${info.total} Zellen, Score ab ${info.threshold.toFixed(2)})`;
  const grund = info.marked === 0 ? ''
    : info.limitedBy === 'relativ'
      ? ` · begrenzt auf die besten ${Math.round(state.topFraction * 100)} %`
      : ' · begrenzt durch die Untergrenze «hohes Potenzial»';
  statusText.textContent = `${sp.name}: ${r.grid.cols}×${r.grid.rows} Zellen à ca. ${Math.round(r.grid.cellM)} m · ${flaeche}${grund}.`;

  const list = $('source-status');
  clear(list);
  const item = (ok, text) => el('li', {}, [el('span', { class: ok === 'ok' ? 'ok' : ok === 'aus' ? 'off' : 'fail', text: ok === 'ok' ? '✓' : ok === 'aus' ? '○' : '✗' }), el('span', { text })]);
  list.append(
    item(r.status.elevation, 'Höhenmodell swissALTI3D (Höhe, Neigung, Exposition)'),
    item(r.status.forest, r.status.forest === 'ok' ? 'Waldmischungsgrad LFI (Wald, Laub-/Nadelholz)' : 'Waldlayer nicht lesbar – Wald wird als unbekannt gewertet'),
    item(r.status.soil, r.status.soil === 'ok' ? 'Geologie GK500 (Bodensäure)' : r.status.soil === 'aus' ? 'Geologie deaktiviert' : 'Geologie nicht verfügbar'),
  );
}

const scheduleAutoAnalysis = debounce(() => { if (state.auto && zoomOk()) runAnalysis(); }, 900);
fab.addEventListener('click', runAnalysis);
$('btn-analyze').addEventListener('click', runAnalysis);

map.on('moveend zoomend', () => { updateHash(); updateFab(); scheduleAutoAnalysis(); if (!state.selected) scheduleWeatherForCenter(); });
updateFab();

// ---------- Standort-Check ----------
async function inspectPoint(latlng, { silent = false } = {}) {
  const lat = latlng.lat; const lon = latlng.lng;
  if (selectedMarker) selectedMarker.setLatLng(latlng);
  else selectedMarker = L.circleMarker(latlng, { radius: 8, color: '#fff', weight: 2, fillColor: '#b3121b', fillOpacity: 1 }).addTo(map);
  if (!silent) activateTab('punkt');
  const species = getSpecies(state.speciesId);
  const box = $('inspector');
  let cell; let partial = false;
  const k = state.result ? cellIndexAt(state.result, lat, lon) : -1;
  if (k >= 0) {
    cell = cellAt(state.result, k);
  } else {
    partial = true;
    clear(box); box.append(el('p', { class: 'muted', text: 'Höhe und Geologie werden abgefragt…' }));
    const p = toLv95Int(lat, lon);
    const [elev, soil] = await Promise.all([
      fetchHeight(p.E, p.N).catch(() => NaN),
      state.includeSoil ? soilAt(p.E, p.N).catch(() => null) : Promise.resolve(null),
    ]);
    cell = { elev: Number.isFinite(elev) ? elev : null, slope: null, aspect: null, forestFrac: null, decid: null, soil: soil ? soil.index : null, soilLabel: soil ? soil.label : '' };
  }
  const r = scoreCell(species, cell, state.month);
  state.selected = { lat, lon, cell, result: r, partial };
  const marked = state.heatInfo ? r.score >= state.heatInfo.threshold : r.score >= CONFIG.heat.minScore;
  renderInspector(box, { lat, lon, cell, result: r, species, month: state.month, partial, marked });
  $('btn-save-spot').disabled = false;
  const route = $('link-google-route'); route.href = googleMapsRouteUrl(lat, lon); route.hidden = false;
  const show = $('link-google-show'); show.href = googleMapsShowUrl(lat, lon); show.hidden = false;
  $('nav-hint').hidden = false;
  updateWeather(lat, lon, `für den gewählten Punkt (${lat.toFixed(4)}, ${lon.toFixed(4)})`, cell.elev);
}
map.on('click', (e) => inspectPoint(e.latlng));

// ---------- Wetter ----------
const scheduleWeatherForCenter = debounce(() => {
  if (state.selected || map.getZoom() < 10) return;
  const c = map.getCenter();
  updateWeather(c.lat, c.lng, 'für die Kartenmitte', null);
}, 1500);

async function updateWeather(lat, lon, label, elevation) {
  const req = { lat, lon };
  state.weatherReq = req;
  $('weather-location').textContent = label;
  try {
    const data = await fetchWeather(lat, lon, { elevation: elevation == null ? undefined : elevation });
    if (state.weatherReq !== req) return;
    state.weather = { data, lat, lon, label };
    renderWeather();
  } catch (e) {
    if (state.weatherReq !== req) return;
    console.error(e);
    const card = $('weather-status');
    clear(card); card.className = 'status-card';
    card.append(el('span', { class: 'big', text: '–' }), el('span', { text: `Wetterdaten konnten nicht geladen werden (${e.message || e}).` }));
  }
}

function renderWeather() {
  if (!state.weather) return;
  const selected = getSpecies(state.speciesId);
  // Die Fruchtungsfenster unterscheiden sich je Art. Für die Sammelansicht rechnen wir deshalb mit
  // der Leitart des gewählten Monats (im April die Morchel, im Oktober die Herbsttrompete).
  const species = selected.combine ? seasonLeader(state.month) : selected;
  const timing = computeRainTiming(state.weather.data.days, species);
  state.weather.timing = timing;
  const card = $('weather-status');
  clear(card);
  if (!timing.today) { card.className = 'status-card'; card.append(el('span', { text: 'Keine Daten.' })); return; }
  const lab = indexLabel(timing.today.index);
  card.className = `status-card ${lab.key}`;
  card.append(
    el('span', { class: 'big', text: `${Math.round(timing.today.index * 100)} %` }),
    el('span', {}, [el('strong', { text: `${lab.emoji} ${lab.text}` }), el('br'), el('span', { class: 'small', text: selected.combine ? `Pilz-Index heute für ${species.name} (Leitart im ${MONTHS[state.month - 1]})` : `Pilz-Index heute für ${species.name}` })]),
  );
  $('weather-text').textContent = describeTiming(timing);
  if (document.querySelector('.tab-page[data-page="wetter"]').classList.contains('active')) {
    renderWeatherChart($('weather-chart'), timing);
  }
  renderWeatherTable($('weather-table'), timing);
}
$('btn-weather-refresh').addEventListener('click', () => {
  try { localStorage.removeItem(CONFIG.storageKeys.weather); } catch (_) { /* ignore */ }
  if (state.weather) updateWeather(state.weather.lat, state.weather.lon, state.weather.label, state.selected ? state.selected.cell.elev : null);
  else scheduleWeatherForCenter();
});
window.addEventListener('resize', debounce(() => { map.invalidateSize(); if (state.weather) renderWeather(); }, 250));

// ---------- Suche ----------
const searchInput = $('search-input'); const searchResults = $('search-results');
let searchAbort = null; let searchItems = []; let searchActive = -1;
function renderSearchResults() {
  clear(searchResults);
  if (searchItems.length === 0) { searchResults.append(el('li', { class: 'muted', text: 'Nichts gefunden.' })); return; }
  searchItems.forEach((it, i) => {
    searchResults.append(el('li', {
      role: 'option', id: `search-opt-${i}`, 'aria-selected': i === searchActive ? 'true' : 'false',
      onclick: () => goToResult(it),
    }, [
      el('span', { text: it.name }),
      el('span', { class: `kind ${it.kind}`, text: it.kindLabel }),
      it.snapped ? el('span', { class: 'snapped', text: '→ Ortszentrum' }) : null,
      it.context ? el('span', { class: 'detail', text: it.context }) : null,
    ]));
  });
}
const doSearch = debounce(async () => {
  const q = searchInput.value.trim();
  if (q.length < 2) { searchResults.hidden = true; return; }
  if (searchAbort) searchAbort.abort();
  searchAbort = new AbortController();
  try {
    searchItems = await searchLocations(q, { signal: searchAbort.signal });
    searchActive = searchItems.length ? 0 : -1;
    renderSearchResults();
    searchResults.hidden = false;
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    toast(`Suche fehlgeschlagen: ${e.message || e}`, { type: 'error' });
  }
}, 300);
function goToResult(it) {
  searchResults.hidden = true;
  searchInput.value = it.name;
  map.setView([it.lat, it.lon], Math.max(it.zoom, CONFIG.grid.minZoom + 1));
}
searchInput.addEventListener('input', doSearch);
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { searchResults.hidden = true; return; }
  if (searchResults.hidden || searchItems.length === 0) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const d = e.key === 'ArrowDown' ? 1 : -1;
    searchActive = (searchActive + d + searchItems.length) % searchItems.length;
    renderSearchResults();
    const opt = document.getElementById(`search-opt-${searchActive}`);
    if (opt) opt.scrollIntoView({ block: 'nearest' });
  }
  if (e.key === 'Enter') { e.preventDefault(); goToResult(searchItems[Math.max(0, searchActive)]); }
});
$('search-form').addEventListener('submit', (e) => { e.preventDefault(); if (searchItems.length) goToResult(searchItems[Math.max(0, searchActive)]); });
document.addEventListener('click', (e) => { if (!e.target.closest('.search')) searchResults.hidden = true; });

// ---------- Standort ----------
$('btn-locate').addEventListener('click', () => {
  if (!navigator.geolocation) { toast('Standortbestimmung wird nicht unterstützt.', { type: 'error' }); return; }
  navigator.geolocation.getCurrentPosition((pos) => {
    const ll = L.latLng(pos.coords.latitude, pos.coords.longitude);
    if (locateMarker) locateMarker.setLatLng(ll);
    else locateMarker = L.circleMarker(ll, { radius: 7, color: '#fff', weight: 2, fillColor: '#2a78d6', fillOpacity: 1 }).addTo(map).bindPopup('Dein Standort');
    map.setView(ll, Math.max(map.getZoom(), 13));
  }, (err) => toast(`Standort nicht verfügbar: ${err.message}`, { type: 'error' }), { enableHighAccuracy: true, timeout: 10000 });
});

// ---------- Plätze ----------
function speciesName(id) { const s = id ? getSpecies(id) : null; return s ? s.name : ''; }
function refreshSpots() {
  renderSpots($('spots-list'), state.spots, {
    speciesName,
    onGoto: (s) => { map.setView([s.lat, s.lon], Math.max(map.getZoom(), 14)); inspectPoint(L.latLng(s.lat, s.lon)); },
    onDelete: (s) => { if (confirm(`«${s.name}» löschen?`)) { state.spots = state.spots.filter((x) => x.id !== s.id); saveSpots(state.spots); refreshSpots(); } },
  });
  spotLayer.clearLayers();
  for (const s of state.spots) {
    L.marker([s.lat, s.lon], { icon: L.divIcon({ className: 'spot-icon', html: '🍄', iconSize: [24, 24], iconAnchor: [12, 12] }), title: s.name })
      .bindPopup(() => {
        const d = el('div', { class: 'spot-popup' });
        d.append(
          el('strong', { text: s.name }), el('br'),
          el('span', { text: speciesName(s.speciesId) }), el('br'),
          el('a', { class: 'btn btn-nav', href: googleMapsRouteUrl(s.lat, s.lon), target: '_blank', rel: 'noopener', text: '🧭 Route mit Google Maps' }),
        );
        return d;
      })
      .addTo(spotLayer);
  }
}
$('btn-save-spot').addEventListener('click', () => {
  if (!state.selected) return;
  const sel = state.selected;
  const name = prompt('Name des Platzes:', `${speciesName(state.speciesId)} ${sel.lat.toFixed(4)}, ${sel.lon.toFixed(4)}`);
  if (!name) return;
  state.spots.push(newSpot({ name: name.trim(), lat: sel.lat, lon: sel.lon, speciesId: state.speciesId, elev: sel.cell.elev, score: sel.result.score }));
  saveSpots(state.spots);
  refreshSpots();
  toast('Platz gespeichert.');
});
$('btn-export-spots').addEventListener('click', () => { if (state.spots.length) exportSpots(state.spots); else toast('Keine Plätze vorhanden.'); });
$('file-import-spots').addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  try {
    const imported = await importSpotsFromFile(file);
    const ids = new Set(state.spots.map((s) => s.id));
    let added = 0;
    for (const s of imported) if (!ids.has(s.id)) { state.spots.push(s); added++; }
    saveSpots(state.spots); refreshSpots();
    toast(`${added} Plätze importiert.`);
  } catch (err) { toast(`Import fehlgeschlagen: ${err.message || err}`, { type: 'error' }); }
  e.target.value = '';
});

// ---------- Version ----------
{
  const meta = document.querySelector('meta[name="app-version"]');
  const v = meta && meta.content && !meta.content.startsWith('__') ? meta.content : 'lokal';
  $('app-version').textContent = v;
}

// ---------- Start ----------
renderSpeciesChips();
state.spots = loadSpots();
refreshSpots();
updateHash();
if (zoomOk() && state.auto) scheduleAutoAnalysis();
scheduleWeatherForCenter();
window.__pilzkarte = { state, map, runAnalysis, inspectPoint, setSpecies };
