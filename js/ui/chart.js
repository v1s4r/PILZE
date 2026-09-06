// Pilzwetter-Diagramm: drei gestapelte Panels mit gemeinsamer Zeitachse (Index, Niederschlag, Temperatur),
// Fadenkreuz-Tooltip, Tastaturbedienung und Tabellenansicht.

import { el, clear, fmtNum } from './dom.js';
import { formatDateDe, indexLabel } from '../model/rain.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, children = []) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, String(v));
  for (const c of [].concat(children)) if (c) n.append(c);
  return n;
}
function txt(x, y, text, cls, anchor = 'start') {
  const t = svg('text', { x, y, class: cls, 'text-anchor': anchor });
  t.textContent = text;
  return t;
}
function niceMax(v, step) { return Math.max(step, Math.ceil(v / step) * step); }

/**
 * @param {HTMLElement} container
 * @param {ReturnType<import('../model/rain.js').computeRainTiming>} timing
 */
export function renderWeatherChart(container, timing) {
  clear(container);
  const days = timing.daily;
  const n = days.length;
  if (!n) return;

  const W = Math.max(300, Math.floor(container.clientWidth || 360));
  const ml = 36; const mr = 10; const mt = 8;
  const panels = [
    { key: 'index', title: 'Pilz-Index (%)', h: 96 },
    { key: 'precip', title: 'Niederschlag (mm/Tag)', h: 76 },
    { key: 'temp', title: 'Temperatur °C (Tagesmittel, Band: Min–Max)', h: 86 },
  ];
  const gap = 22; const mb = 20;
  const H = mt + panels.reduce((s, p) => s + p.h + gap, 0) + mb;
  const innerW = W - ml - mr;
  const slot = innerW / n;
  const xc = (i) => ml + (i + 0.5) * slot;

  const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', tabindex: '0', 'aria-label': 'Pilzwetter-Diagramm' });

  // Prognosebereich
  const forecastStart = timing.todayIndex + 0.5;
  root.append(svg('rect', { class: 'forecast', x: ml + forecastStart * slot, y: mt, width: Math.max(0, innerW - forecastStart * slot), height: H - mt - mb }));

  let y0 = mt;
  const scales = {};
  for (const p of panels) {
    const top = y0 + 14; const bottom = y0 + p.h;
    root.append(txt(ml, y0 + 9, p.title, 'panel-title'));
    let ticks; let yOf;
    if (p.key === 'index') {
      ticks = [0, 50, 100];
      yOf = (v) => bottom - (v / 100) * (bottom - top);
    } else if (p.key === 'precip') {
      const maxP = Math.max(...days.map((d) => d.precip), 5);
      const max = maxP > 10 ? niceMax(maxP, 10) : 10;
      ticks = [0, max / 2, max];
      yOf = (v) => bottom - (v / max) * (bottom - top);
    } else {
      const lo = Math.floor(Math.min(...days.map((d) => d.tmin), 0) / 5) * 5;
      const hi = Math.ceil(Math.max(...days.map((d) => d.tmax), 10) / 5) * 5;
      ticks = [lo, (lo + hi) / 2, hi];
      yOf = (v) => bottom - ((v - lo) / (hi - lo)) * (bottom - top);
    }
    scales[p.key] = { top, bottom, yOf };
    for (const t of ticks) {
      root.append(svg('line', { class: 'grid', x1: ml, x2: W - mr, y1: yOf(t), y2: yOf(t) }));
      root.append(txt(ml - 4, yOf(t) + 3.5, fmtNum(t, 0), 'tick', 'end'));
    }

    if (p.key === 'index') {
      const pts = days.map((d, i) => `${xc(i).toFixed(1)},${yOf(d.index * 100).toFixed(1)}`);
      root.append(svg('path', { class: 'idx-area', d: `M${xc(0).toFixed(1)},${bottom} L${pts.join(' L')} L${xc(n - 1).toFixed(1)},${bottom} Z` }));
      root.append(svg('path', { class: 'idx-line', d: `M${pts.join(' L')}` }));
    } else if (p.key === 'precip') {
      const bw = Math.min(24, Math.max(1, slot - 2));
      days.forEach((d, i) => {
        if (d.precip <= 0) return;
        const y = yOf(d.precip);
        const h = Math.max(1, bottom - y);
        const r = Math.min(4, bw / 2, h);
        const x = xc(i) - bw / 2;
        // abgerundetes Datenende oben, gerade Kante an der Grundlinie
        const dPath = `M${x},${bottom} V${y + r} a${r},${r} 0 0 1 ${r},-${r} H${x + bw - r} a${r},${r} 0 0 1 ${r},${r} V${bottom} Z`;
        root.append(svg('path', { class: 'bar', d: dPath, 'data-i': i }));
      });
    } else {
      const upper = days.map((d, i) => `${xc(i).toFixed(1)},${yOf(d.tmax).toFixed(1)}`);
      const lower = [...days].reverse().map((d, k) => `${xc(n - 1 - k).toFixed(1)},${yOf(d.tmin).toFixed(1)}`);
      root.append(svg('path', { class: 't-band', d: `M${upper.join(' L')} L${lower.join(' L')} Z` }));
      root.append(svg('path', { class: 't-line', d: `M${days.map((d, i) => `${xc(i).toFixed(1)},${yOf(d.tmean).toFixed(1)}`).join(' L')}` }));
      if (yOf(0) <= bottom && yOf(0) >= top) root.append(svg('line', { class: 'zero', x1: ml, x2: W - mr, y1: yOf(0), y2: yOf(0) }));
    }
    root.append(svg('line', { class: 'axis', x1: ml, x2: W - mr, y1: bottom, y2: bottom }));
    y0 = bottom + gap;
  }

  // Zeitachse
  const step = n > 24 ? 5 : n > 12 ? 3 : 1;
  for (let i = 0; i < n; i += step) {
    if (Math.abs(i - timing.todayIndex) < 2) continue; // Platz für «heute»
    root.append(txt(xc(i), H - 6, formatDateDe(days[i].date).replace(/^\S+\s/, ''), 'tick', 'middle'));
  }
  // Heute
  root.append(svg('line', { class: 'today', x1: xc(timing.todayIndex), x2: xc(timing.todayIndex), y1: mt, y2: H - mb }));
  root.append(txt(xc(timing.todayIndex), H - 6, 'heute', 'tick', 'middle'));

  // Interaktion
  const cross = svg('line', { class: 'crosshair', x1: 0, x2: 0, y1: mt, y2: H - mb, visibility: 'hidden' });
  root.append(cross);
  const tip = el('div', { class: 'chart-tip', hidden: '' });
  container.append(root, tip);

  let active = -1;
  const show = (i, clientX) => {
    if (i < 0 || i >= n) return;
    active = i;
    const d = days[i];
    const x = xc(i);
    cross.setAttribute('x1', x); cross.setAttribute('x2', x); cross.setAttribute('visibility', 'visible');
    root.querySelectorAll('.bar.hover').forEach((b) => b.classList.remove('hover'));
    const bar = root.querySelector(`.bar[data-i="${i}"]`); if (bar) bar.classList.add('hover');
    clear(tip);
    const lab = indexLabel(d.index);
    tip.append(
      el('div', { class: 'd', text: `${formatDateDe(d.date)}${d.isForecast ? ' (Prognose)' : ''}` }),
      row('var(--red)', `${Math.round(d.index * 100)} %`, `Pilz-Index · ${lab.text}`),
      row('var(--blue)', `${fmtNum(d.precip, 1)} mm`, 'Niederschlag'),
      row('var(--orange)', `${fmtNum(d.tmean, 1)} °C`, `Temperatur (${fmtNum(d.tmin, 0)}–${fmtNum(d.tmax, 0)})`),
      d.soilT != null ? row('var(--muted)', `${fmtNum(d.soilT, 1)} °C`, 'Boden 6 cm') : null,
      row('var(--muted)', `${Math.round(d.moisture)} mm`, 'Bodenfeuchte'),
      d.limits.length ? el('div', { class: 'k', text: d.limits.join(', ') }) : null,
    );
    tip.hidden = false;
    const rect = container.getBoundingClientRect();
    const scale = rect.width / W;
    const px = x * scale;
    const left = px + 12 + 160 > rect.width ? px - 12 - 160 : px + 12;
    tip.style.left = `${Math.max(0, left)}px`;
    tip.style.top = `${mt * scale}px`;
  };
  const hide = () => { active = -1; cross.setAttribute('visibility', 'hidden'); tip.hidden = true; root.querySelectorAll('.bar.hover').forEach((b) => b.classList.remove('hover')); };
  root.addEventListener('pointermove', (e) => {
    const rect = root.getBoundingClientRect();
    const xr = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round((xr - ml) / slot - 0.5);
    show(Math.max(0, Math.min(n - 1, i)), e.clientX);
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focus', () => show(timing.todayIndex));
  root.addEventListener('blur', hide);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { show(Math.max(0, (active < 0 ? timing.todayIndex : active) - 1)); e.preventDefault(); }
    if (e.key === 'ArrowRight') { show(Math.min(n - 1, (active < 0 ? timing.todayIndex : active) + 1)); e.preventDefault(); }
  });
}

function row(color, value, label) {
  return el('div', {}, [
    el('span', { class: 'key', style: { background: color } }),
    el('span', { class: 'v', text: value }), ' ',
    el('span', { class: 'k', text: label }),
  ]);
}

export function renderWeatherTable(container, timing) {
  clear(container);
  const table = el('table', {}, [
    el('thead', {}, el('tr', {}, ['Datum', 'Regen mm', 'T mittel', 'T min', 'Boden °C', 'Index %', 'Hinweis'].map((h) => el('th', { text: h })))),
  ]);
  const body = el('tbody');
  timing.daily.forEach((d, i) => {
    body.append(el('tr', { class: i === timing.todayIndex ? 'today' : d.isForecast ? 'forecast' : '' }, [
      el('td', { text: formatDateDe(d.date) }),
      el('td', { text: fmtNum(d.precip, 1) }),
      el('td', { text: fmtNum(d.tmean, 1) }),
      el('td', { text: fmtNum(d.tmin, 1) }),
      el('td', { text: d.soilT == null ? '–' : fmtNum(d.soilT, 1) }),
      el('td', { text: String(Math.round(d.index * 100)) }),
      el('td', { text: d.limits.join(', ') }),
    ]));
  });
  table.append(body);
  container.append(table);
}
