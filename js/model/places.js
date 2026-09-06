// Ortssuche: Aufbereitung und Rangfolge der Treffer des geo.admin.ch-SearchServers.
//
// Hintergrund: Der Dienst sortiert nach seinem internen Rang (1 = PLZ, 2 = Gemeinde, 5 = Ortschaft
// aus swissNAMES3D, 6 = übrige Namen, 7 = Adresse). Die Koordinate von PLZ- und Gemeinde-Treffern ist
// aber nur ein «Punkt auf der Fläche» – bei grossen oder unregelmässigen Flächen liegt er weit
// ausserhalb des Dorfs. Die Ortschaft (Rang 5) hat dagegen einen Punkt im Siedlungsgebiet.
//
// Deshalb: Ortschaften nach vorne, und PLZ-/Gemeinde-Treffer auf die gleichnamige Ortschaft einrasten.

export const KINDS = {
  ort: { label: 'Ortschaft', priority: 0, zoom: 14 },
  siedlung: { label: 'Siedlung', priority: 1, zoom: 15 },
  gemeinde: { label: 'Gemeinde', priority: 2, zoom: 13 },
  plz: { label: 'PLZ', priority: 3, zoom: 14 },
  adresse: { label: 'Adresse', priority: 4, zoom: 16 },
  gebaeude: { label: 'Gebäude', priority: 5, zoom: 16 },
  flur: { label: 'Flurname', priority: 6, zoom: 15 },
  gipfel: { label: 'Gipfel', priority: 6, zoom: 15 },
  gewaesser: { label: 'Gewässer', priority: 7, zoom: 14 },
  haltestelle: { label: 'Haltestelle', priority: 7, zoom: 16 },
  name: { label: 'Name', priority: 8, zoom: 15 },
  bezirk: { label: 'Bezirk', priority: 9, zoom: 11 },
  kanton: { label: 'Kanton', priority: 10, zoom: 10 },
};

export function stripTags(s) {
  return String(s || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

/** Kleinschreibung, ohne Akzente, ohne Sonderzeichen – zum Vergleichen von Namen. */
export function normalizeName(s) {
  return stripTags(s)
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Der eigentliche Name eines Treffers (ohne PLZ, Kantonskürzel und Gemeindezusatz). */
export function placeName(attrs) {
  const label = String(attrs.label || '');
  const origin = String(attrs.origin || '');
  if (origin === 'address' || origin === 'address_metaphone') return stripTags(label); // ganze Adresse
  const bold = /<b>(.*?)<\/b>/i.exec(label);
  let name = stripTags(bold ? bold[1] : label);
  name = name.replace(/^\d{4}\s*-\s*/, '');         // «8854 - Siebnen»
  name = name.replace(/\s*\([A-Z]{2}\)\s*$/, '');     // «Schübelbach (SZ)»
  name = name.replace(/\s+-\s+.*$/, '');             // «Siebnen - Schübelbach»
  return name.trim();
}

/** Art des Treffers aus origin, rank und objectclass. */
export function kindOf(attrs) {
  const origin = String(attrs.origin || '');
  const rank = Number(attrs.rank);
  const oc = String(attrs.objectclass || '').toUpperCase();
  if (origin === 'zipcode') return 'plz';
  if (origin === 'gg25') return 'gemeinde';
  if (origin === 'district') return 'bezirk';
  if (origin === 'kantone') return 'kanton';
  if (origin === 'address' || origin === 'address_metaphone') return 'adresse';
  if (origin === 'haltestellen') return 'haltestelle';
  if (origin === 'parcel') return 'name';
  if (rank === 5) return 'ort';
  if (oc.includes('SIEDLUNG')) return 'siedlung';
  if (oc.includes('FLUR')) return 'flur';
  if (oc.includes('GIPFEL') || oc.includes('BERG')) return 'gipfel';
  if (oc.includes('GEWAESSER') || oc.includes('SEE') || oc.includes('FLUSS')) return 'gewaesser';
  if (oc.includes('GEBAEUDE')) return 'gebaeude';
  if (oc.includes('HALTESTELLE')) return 'haltestelle';
  return 'name';
}

function matchQuality(nameNorm, queryNorm) {
  if (!queryNorm) return 3;
  if (nameNorm === queryNorm) return 0;
  if (nameNorm.startsWith(queryNorm)) return 1;
  if (nameNorm.split(' ').some((w) => w.startsWith(queryNorm))) return 2;
  if (nameNorm.includes(queryNorm)) return 3;
  return 4;
}

/**
 * Ordnet Rohtreffer (attrs-Objekte des SearchServers) nach Nützlichkeit für Pilzsammler:
 * exakte Ortschaften zuerst, PLZ/Gemeinde auf die Ortschaft eingerastet, Adressen danach.
 * @param {Array<object>} attrsList
 * @param {string} query
 * @returns {Array<{name:string,label:string,kind:string,kindLabel:string,lat:number,lon:number,zoom:number,origin:string,snapped:boolean,context:string}>}
 */
export function rankPlaces(attrsList, query) {
  const q = normalizeName(query);
  const items = [];
  for (const a of attrsList || []) {
    const lat = Number(a.lat); const lon = Number(a.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const kind = kindOf(a);
    const name = placeName(a);
    if (!name) continue;
    const labelText = stripTags(a.label);
    items.push({
      name, nameNorm: normalizeName(name), label: labelText, kind, kindLabel: KINDS[kind].label,
      lat, lon, zoom: KINDS[kind].zoom, origin: String(a.origin || ''), snapped: false,
      context: contextOf(labelText, name, kind),
      quality: matchQuality(normalizeName(name), q),
    });
  }

  // Ortschaften als Ankerpunkte: gleichnamige PLZ-/Gemeinde-Treffer erhalten deren Koordinate
  const anchors = new Map();
  for (const it of items) if (it.kind === 'ort' && !anchors.has(it.nameNorm)) anchors.set(it.nameNorm, it);
  for (const it of items) if (it.kind === 'siedlung' && !anchors.has(it.nameNorm)) anchors.set(it.nameNorm, it);
  for (const it of items) {
    if (it.kind !== 'plz' && it.kind !== 'gemeinde') continue;
    const anchor = anchors.get(it.nameNorm);
    if (anchor) { it.lat = anchor.lat; it.lon = anchor.lon; it.snapped = true; it.zoom = Math.max(it.zoom, 14); }
  }

  items.sort((x, y) => (x.quality - y.quality) || (KINDS[x.kind].priority - KINDS[y.kind].priority) || x.label.localeCompare(y.label, 'de'));

  // Doppelte entfernen: gleiche Art + gleicher Name, oder gleiche Art am praktisch gleichen Punkt.
  // (Eine eingerastete PLZ zeigt bewusst auf denselben Punkt wie die Ortschaft – die bleibt erhalten.)
  const seen = new Set();
  const out = [];
  for (const it of items) {
    const k1 = `${it.kind}|${it.nameNorm}`;
    const k2 = `${it.kind}|${it.lat.toFixed(3)},${it.lon.toFixed(3)}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1); seen.add(k2);
    const { nameNorm, quality, ...pub } = it;
    out.push(pub);
  }
  return out;
}

function contextOf(labelText, name, kind) {
  if (kind === 'adresse') return '';
  const idx = labelText.indexOf(' - ');
  if (kind === 'plz') {
    const plz = /^(\d{4})/.exec(labelText);
    return plz ? plz[1] : '';
  }
  if (idx >= 0) return labelText.slice(idx + 3).trim();
  const kt = /\(([A-Z]{2})\)/.exec(labelText);
  return kt ? kt[1] : '';
}

/** Google-Maps-Navigation zum Punkt: routet bis zur nächsten befahrbaren Strasse. */
export function googleMapsRouteUrl(lat, lon) {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)}%2C${lon.toFixed(6)}&travelmode=driving`;
}

/** Punkt in Google Maps anzeigen (ohne Route). */
export function googleMapsShowUrl(lat, lon) {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)}%2C${lon.toFixed(6)}`;
}
