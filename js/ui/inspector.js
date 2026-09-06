// Standort-Check: zeigt die Faktoren einer Zelle bzw. eines Punkts.

import { el, clear, fmtNum, fmtPct } from './dom.js';
import { classify, aspectLabel, soilLabel, seasonInfo, WEIGHTS } from '../model/biotope.js';
import { SPECIES_BY_ID } from '../model/species.js';

const FACTOR_LABELS = {
  forest: 'Wald',
  trees: 'Baumarten',
  elevation: 'Höhenlage',
  soil: 'Bodensäure',
  aspect: 'Exposition',
  slope: 'Hangneigung',
};

/**
 * @param {HTMLElement} container
 * @param {{lat:number, lon:number, cell:object, result:{score:number, factors:object, speciesId:string}, species:object, month:number, partial?:boolean, elevSource?:string}} data
 */
export function renderInspector(container, data) {
  clear(container);
  const { lat, lon, cell, result, species } = data;
  const cls = classify(result.score);
  const shownSpecies = species.combine ? SPECIES_BY_ID[result.speciesId] : species;
  const season = seasonInfo(shownSpecies, data.month);

  container.append(el('div', { class: 'row' }, [
    el('span', { class: 'score-badge', text: `${cls.label} · ${Math.round(result.score * 100)}`, style: { background: cls.color === 'transparent' ? 'var(--muted)' : cls.color } }),
    el('span', { class: 'muted small', text: data.marked ? 'auf der Karte rot markiert' : 'nicht rot markiert' }),
    el('span', { class: 'muted small', text: species.combine ? `beste Art: ${shownSpecies.name}` : shownSpecies.name }),
  ]));
  if (season.state === 'aus' || season.state === 'rand') {
    container.append(el('p', { class: `season-note ${season.state}` }, [
      el('strong', { text: season.state === 'aus' ? 'Ausserhalb der Saison. ' : 'Randmonat. ' }),
      el('span', { text: `${shownSpecies.name}: Saison ${season.range}. Die Bewertung oben zeigt das Standort-Potenzial – jetzt ist keine Fruchtung zu erwarten.` }),
    ]));
  }
  if (data.partial) {
    container.append(el('p', { class: 'tip', text: 'Punkt liegt ausserhalb der letzten Analyse – es wurden nur Höhe und Geologie abgefragt. Starte die Analyse für diesen Ausschnitt, um Wald, Neigung und Exposition zu sehen.' }));
  }

  const dl = el('dl', { class: 'kv' });
  const kv = (k, v) => { dl.append(el('dt', { text: k }), el('dd', { text: v })); };
  kv('Koordinaten', `${lat.toFixed(5)}, ${lon.toFixed(5)}`);
  kv('Höhe', fmtNum(cell.elev, 0, ' m ü. M.'));
  kv('Hangneigung', cell.slope == null ? '–' : `${fmtNum(cell.slope, 0, '°')}${cell.slope < 3 ? ' (flach)' : ''}`);
  kv('Exposition', cell.aspect == null ? (cell.slope != null && cell.slope < 3 ? 'flach' : '–') : `${aspectLabel(cell.aspect)} (${Math.round(cell.aspect)}°)`);
  kv('Waldanteil', fmtPct(cell.forestFrac));
  kv('Laubholzanteil', cell.decid == null ? '–' : `${fmtPct(cell.decid)} ${treeMixLabel(cell.decid)}`);
  kv('Boden', `${soilLabel(cell.soil)}${cell.soilLabel ? ` – ${cell.soilLabel}` : ''}`);
  kv('Baumpartner', shownSpecies.partners || '–');
  kv('Saison', season.text);
  container.append(dl);

  container.append(el('h2', { text: 'Faktoren' }));
  for (const [key, val] of Object.entries(result.factors)) {
    const w = key === 'forest' ? 'Ausschluss' : `Gewicht ${WEIGHTS[key]}`;
    container.append(el('div', { class: 'factor', title: w }, [
      el('span', { text: FACTOR_LABELS[key] || key }),
      el('div', { class: 'bar' }, [el('i', { style: { width: `${Math.round(val * 100)}%` } })]),
      el('span', { class: 'val', text: fmtNum(val * 100, 0) }),
    ]));
  }
  if (shownSpecies.tips) container.append(el('p', { class: 'tip', text: shownSpecies.tips }));
}

export function treeMixLabel(decid) {
  if (decid < 0.2) return '(Nadelwald)';
  if (decid < 0.5) return '(Nadelmischwald)';
  if (decid < 0.8) return '(Laubmischwald)';
  return '(Laubwald)';
}
