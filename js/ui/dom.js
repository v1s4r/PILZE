// Kleine DOM-Helfer. Texte werden immer als textContent gesetzt (nie innerHTML mit Daten).

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

export function fmtNum(v, digits = 0, unit = '') {
  if (v == null || !Number.isFinite(v)) return '–';
  return `${v.toLocaleString('de-CH', { minimumFractionDigits: digits, maximumFractionDigits: digits })}${unit}`;
}

export function fmtPct(v) { return v == null || !Number.isFinite(v) ? '–' : `${Math.round(v * 100)} %`; }

let toastTimer = null;
export function toast(message, { type = 'info', ms = 4000 } = {}) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = message;
  t.className = `toast${type === 'error' ? ' error' : ''}`;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, ms);
}

export function debounce(fn, ms) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
