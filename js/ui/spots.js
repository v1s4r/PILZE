// Gespeicherte Plätze (localStorage) und deren Liste im Panel.

import { CONFIG } from '../config.js';
import { el, clear } from './dom.js';
import { googleMapsRouteUrl } from '../model/places.js';

export function loadSpots() {
  try {
    const arr = JSON.parse(localStorage.getItem(CONFIG.storageKeys.spots) || '[]');
    return Array.isArray(arr) ? arr.filter(validSpot) : [];
  } catch (_) { return []; }
}

export function saveSpots(spots) {
  try { localStorage.setItem(CONFIG.storageKeys.spots, JSON.stringify(spots)); } catch (_) { /* ignore */ }
}

export function validSpot(s) {
  return s && typeof s === 'object' && Number.isFinite(Number(s.lat)) && Number.isFinite(Number(s.lon)) && typeof s.name === 'string';
}

export function newSpot({ name, lat, lon, speciesId, note = '', elev = null, score = null }) {
  return {
    id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name, lat: Number(lat), lon: Number(lon), speciesId, note, elev, score,
    createdAt: new Date().toISOString(),
  };
}

/**
 * @param {HTMLElement} container
 * @param {Array} spots
 * @param {{onGoto:(s)=>void, onDelete:(s)=>void, speciesName:(id)=>string}} handlers
 */
export function renderSpots(container, spots, handlers) {
  clear(container);
  if (spots.length === 0) {
    container.append(el('li', { class: 'muted', text: 'Noch keine Plätze gespeichert. Wähle einen Punkt auf der Karte und speichere ihn im Tab «Punkt».' }));
    return;
  }
  for (const s of [...spots].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))) {
    const meta = [
      handlers.speciesName(s.speciesId),
      s.elev != null ? `${Math.round(s.elev)} m` : null,
      s.score != null ? `Score ${Math.round(s.score * 100)}` : null,
      s.createdAt ? new Date(s.createdAt).toLocaleDateString('de-CH') : null,
    ].filter(Boolean).join(' · ');
    container.append(el('li', {}, [
      el('span', { text: '🍄', 'aria-hidden': 'true' }),
      el('div', { class: 'name' }, [el('span', { text: s.name }), el('small', { text: meta }), s.note ? el('small', { text: s.note }) : null]),
      el('button', { type: 'button', text: 'Zeigen', onclick: () => handlers.onGoto(s) }),
      el('a', { class: 'btn btn-nav', href: googleMapsRouteUrl(s.lat, s.lon), target: '_blank', rel: 'noopener', title: 'Route mit Google Maps', 'aria-label': `Route zu ${s.name} mit Google Maps`, text: '🧭' }),
      el('button', { type: 'button', text: '✕', title: 'Löschen', 'aria-label': `${s.name} löschen`, onclick: () => handlers.onDelete(s) }),
    ]));
  }
}

export function exportSpots(spots) {
  const blob = new Blob([JSON.stringify(spots, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `pilzplaetze-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function importSpotsFromFile(file) {
  return file.text().then((txt) => {
    const arr = JSON.parse(txt);
    if (!Array.isArray(arr)) throw new Error('Datei enthält keine Liste');
    return arr.filter(validSpot).map((s) => ({ ...newSpot(s), id: s.id || newSpot(s).id, createdAt: s.createdAt || new Date().toISOString() }));
  });
}
