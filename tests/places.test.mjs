import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPlaces, placeName, kindOf, normalizeName, googleMapsRouteUrl, googleMapsShowUrl } from '../js/model/places.js';

// Realistische Antwort des SearchServers für «Siebnen» (Reihenfolge = Dienst-Sortierung nach rank ASC)
const SIEBNEN = [
  // PLZ-Fläche 8854: «Punkt auf der Fläche» liegt in den Hügeln, 3 km vom Dorf entfernt
  { origin: 'zipcode', rank: 1, label: '<b>8854 - Siebnen</b>', detail: '8854', lat: 47.1420, lon: 8.9300, zoomlevel: -1 },
  { origin: 'gg25', rank: 2, label: '<b>Schübelbach (SZ)</b>', detail: 'schuebelbach sz', lat: 47.1500, lon: 8.9350, zoomlevel: -1 },
  // Ortschaft aus swissNAMES3D: echter Dorfpunkt
  { origin: 'gazetteer', rank: 5, label: '<b>Siebnen</b> (SZ) - Schübelbach', detail: 'siebnen schuebelbach', objectclass: 'TLM_SIEDLUNGSNAME', lat: 47.1745, lon: 8.8965, zoomlevel: 9 },
  { origin: 'gazetteer', rank: 6, label: '<b>Siebnen-Wangen</b> (SZ) - Wangen (SZ)', detail: 'siebnen-wangen', objectclass: 'TLM_HALTESTELLE', lat: 47.1800, lon: 8.8900, zoomlevel: 9 },
  { origin: 'gazetteer', rank: 6, label: '<b>Siebnenbach</b> (SZ)', detail: 'siebnenbach', objectclass: 'TLM_GEWAESSER_NAME', lat: 47.1600, lon: 8.9100, zoomlevel: 9 },
  { origin: 'address', rank: 7, label: 'Siebnerstrasse 12 <b>8854 Siebnen</b>', detail: 'siebnerstrasse 12 8854 siebnen', lat: 47.1750, lon: 8.8970, zoomlevel: 10 },
];

test('Siebnen: die Ortschaft steht zuoberst – nicht der PLZ-Flächenpunkt', () => {
  const r = rankPlaces(SIEBNEN, 'Siebnen');
  assert.equal(r[0].kind, 'ort');
  assert.equal(r[0].name, 'Siebnen');
  assert.equal(r[0].lat, 47.1745);
  assert.equal(r[0].lon, 8.8965);
  assert.equal(r[0].zoom, 14);
});

test('PLZ-Treffer rastet auf die gleichnamige Ortschaft ein', () => {
  const r = rankPlaces(SIEBNEN, 'Siebnen');
  const plz = r.find((x) => x.kind === 'plz');
  assert.ok(plz, 'PLZ-Treffer vorhanden');
  assert.equal(plz.snapped, true);
  assert.equal(plz.lat, 47.1745);
  assert.equal(plz.lon, 8.8965);
  assert.equal(plz.context, '8854');
});

test('Gemeinde ohne gleichnamige Ortschaft behält ihre Koordinate, wird aber nicht bevorzugt', () => {
  const r = rankPlaces(SIEBNEN, 'Siebnen');
  const gem = r.find((x) => x.kind === 'gemeinde');
  assert.equal(gem.snapped, false);
  assert.ok(r.indexOf(gem) > 0);
});

test('Gemeinde mit gleichnamiger Ortschaft rastet ein', () => {
  const raw = [
    { origin: 'gg25', rank: 2, label: '<b>Einsiedeln (SZ)</b>', lat: 47.0500, lon: 8.7900 },
    { origin: 'gazetteer', rank: 5, label: '<b>Einsiedeln</b> (SZ) - Einsiedeln', objectclass: 'TLM_SIEDLUNGSNAME', lat: 47.1276, lon: 8.7443 },
  ];
  const r = rankPlaces(raw, 'Einsiedeln');
  assert.equal(r[0].kind, 'ort');
  const gem = r.find((x) => x.kind === 'gemeinde');
  assert.equal(gem.snapped, true);
  assert.equal(gem.lat, 47.1276);
});

test('Rangfolge: exakter Name vor Präfix, Adressen zuletzt', () => {
  const r = rankPlaces(SIEBNEN, 'Siebnen');
  const kinds = r.map((x) => x.kind);
  assert.equal(kinds[0], 'ort');
  assert.ok(kinds.indexOf('haltestelle') < kinds.indexOf('adresse'), kinds.join(','));
  // Schübelbach enthält den Suchbegriff nicht – die Gemeinde gehört ganz ans Ende
  assert.equal(kinds[kinds.length - 1], 'gemeinde');
  assert.ok(kinds.indexOf('adresse') < kinds.indexOf('gemeinde'));
  assert.equal(r.find((x) => x.kind === 'adresse').name, 'Siebnerstrasse 12 8854 Siebnen');
});

test('Tippt man die Strasse, gewinnt die Adresse', () => {
  const r = rankPlaces(SIEBNEN, 'Siebnerstrasse 12');
  assert.equal(r[0].kind, 'adresse');
});

test('Namen werden sauber extrahiert', () => {
  assert.equal(placeName({ label: '<b>8854 - Siebnen</b>' }), 'Siebnen');
  assert.equal(placeName({ label: '<b>Schübelbach (SZ)</b>' }), 'Schübelbach');
  assert.equal(placeName({ label: '<b>Siebnen</b> (SZ) - Schübelbach' }), 'Siebnen');
  assert.equal(placeName({ origin: 'address', label: 'Siebnerstrasse 12 <b>8854 Siebnen</b>' }), 'Siebnerstrasse 12 8854 Siebnen');
  assert.equal(normalizeName('Schübelbach (SZ)'), 'schubelbach sz');
});

test('Art des Treffers', () => {
  assert.equal(kindOf({ origin: 'zipcode' }), 'plz');
  assert.equal(kindOf({ origin: 'gg25' }), 'gemeinde');
  assert.equal(kindOf({ origin: 'gazetteer', rank: 5 }), 'ort');
  assert.equal(kindOf({ origin: 'gazetteer', rank: 6, objectclass: 'TLM_FLURNAME' }), 'flur');
  assert.equal(kindOf({ origin: 'gazetteer', rank: 6, objectclass: 'TLM_GIPFEL' }), 'gipfel');
  assert.equal(kindOf({ origin: 'address' }), 'adresse');
});

test('ungültige Koordinaten und Doppelte werden verworfen', () => {
  const raw = [
    { origin: 'gazetteer', rank: 5, label: '<b>Test</b>', lat: 'x', lon: 8 },
    { origin: 'gazetteer', rank: 5, label: '<b>Test</b>', lat: 47.1, lon: 8.1 },
    { origin: 'gazetteer', rank: 5, label: '<b>Test</b>', lat: 47.1, lon: 8.1 },
  ];
  assert.equal(rankPlaces(raw, 'test').length, 1);
});

test('Google-Maps-Links', () => {
  assert.equal(googleMapsRouteUrl(47.1745, 8.8965), 'https://www.google.com/maps/dir/?api=1&destination=47.174500%2C8.896500&travelmode=driving');
  assert.equal(googleMapsShowUrl(47.1745, 8.8965), 'https://www.google.com/maps/search/?api=1&query=47.174500%2C8.896500');
});
