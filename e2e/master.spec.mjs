// Mastertest: prüft die Webapp als Ganzes – alle Ansichten, alle Regeln, keine Fehler.
// Läuft gegen simulierte Dienste, damit er ohne Internet und ohne Last für die Bundes-Dienste läuft.

import { test, expect } from '@playwright/test';
import { installMocks, SEARCH_ORTE, terrain } from './mocks.mjs';
import { wgs84ToLv95 } from '../js/geo/lv95.js';

/** Sammelt Konsolen- und Seitenfehler; am Ende jedes Tests muss die Liste leer sein. */
function collectErrors(page) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
  page.on('requestfailed', (r) => {
    const u = r.url();
    if (!u.startsWith('data:') && !u.includes('google.com')) errors.push(`request failed: ${u}`);
  });
  return errors;
}

/** Klappt einen <details>-Block auf (Einstellungen, Tabellenansicht). */
async function aufklappen(page, selector) {
  await page.locator(selector).evaluate((el) => { el.open = true; });
}

async function analyseFertig(page) {
  await page.waitForFunction(() => {
    const s = window.__pilzkarte && window.__pilzkarte.state;
    return s && s.result && s.heatInfo;
  }, null, { timeout: 30_000 });
}

test.describe('Mastertest', () => {
  test('A – Grundlage: alle Ansichten erscheinen vollständig und fehlerfrei', async ({ page }) => {
    const errors = collectErrors(page);
    await installMocks(page);
    await page.goto('/#13/47.05000/8.30000/steinpilz');
    await analyseFertig(page);

    // Kopfzeile und Karte
    await expect(page.locator('#topbar .brand')).toContainText('Pilzkarte Schweiz');
    await expect(page.locator('#map .leaflet-tile-loaded').first()).toBeVisible();
    await expect(page.locator('img.heat-overlay')).toBeVisible();
    await expect(page.locator('#map-legend')).toBeVisible();

    // Tab «Karte»: alle 13 Artenknöpfe, Monatswähler, Datenquellen-Status
    await expect(page.locator('#species-list .chip')).toHaveCount(13);
    await expect(page.locator('#month-select')).toBeVisible();
    await expect(page.locator('#source-status li')).toHaveCount(3);
    await expect(page.locator('#source-status .fail')).toHaveCount(0);

    // Jede Registerkarte zeigt Inhalt
    const seiten = {
      wetter: ['#weather-status', '#weather-chart svg'],
      punkt: ['#inspector'],
      plaetze: ['#spots-list'],
      info: ['.tab-page[data-page="info"] h2'],
    };
    for (const [tab, sel] of Object.entries(seiten)) {
      await page.locator(`.tabs [data-tab="${tab}"]`).click();
      for (const s of sel) await expect(page.locator(s).first()).toBeVisible();
    }
    // Tabellenansicht ist bewusst zugeklappt – aufgeklappt muss sie die Wettertabelle zeigen
    await page.locator('.tabs [data-tab="wetter"]').click();
    await aufklappen(page, '.table-view');
    await expect(page.locator('#weather-table table')).toBeVisible();
    await expect(page.locator('#weather-table tbody tr')).toHaveCount(37);

    // Einstellungen aufklappen: alle Regler vorhanden
    await page.locator('.tabs [data-tab="karte"]').click();
    await aufklappen(page, 'details.settings');
    for (const s of ['#opacity', '#mark-from', '#include-soil', '#btn-clear-cache']) {
      await expect(page.locator(s)).toBeVisible();
    }

    // Versionsanzeige vorhanden
    await expect(page.locator('#app-version')).not.toBeEmpty();
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('B – Höhen stimmen mit dem Landeshöhenmodell überein', async ({ page }) => {
    const errors = collectErrors(page);
    const gesendet = [];
    await installMocks(page);
    // Höhenanfragen mitlesen: welche LV95-Koordinaten schickt die App?
    await page.route(/api3\.geo\.admin\.ch\/rest\/services\/height/, async (route) => {
      const u = new URL(route.request().url());
      gesendet.push({ E: Number(u.searchParams.get('easting')), N: Number(u.searchParams.get('northing')), sr: u.searchParams.get('sr') });
      await route.fallback();
    });
    await page.goto('/#14/47.05000/8.30000/steinpilz');
    await analyseFertig(page);

    // Ein Punkt ausserhalb des Rasters erzwingt eine Einzelabfrage der Höhe
    await page.evaluate(() => window.__pilzkarte.inspectPoint(window.L.latLng(46.5, 7.5)));
    await expect(page.locator('#inspector')).toContainText('m ü. M.');

    expect(gesendet.length).toBeGreaterThan(0);
    const q = gesendet[gesendet.length - 1];
    expect(q.sr).toBe('2056');
    // Die gesendete Koordinate muss der Referenzumrechnung entsprechen
    const soll = wgs84ToLv95(46.5, 7.5);
    expect(Math.abs(q.E - soll.E)).toBeLessThan(1);
    expect(Math.abs(q.N - soll.N)).toBeLessThan(1);
    // und in der Schweiz liegen (Ost 2.48–2.84 Mio, Nord 1.07–1.30 Mio)
    expect(q.E).toBeGreaterThan(2480000); expect(q.E).toBeLessThan(2840000);
    expect(q.N).toBeGreaterThan(1070000); expect(q.N).toBeLessThan(1300000);

    // Die angezeigte Höhe ist die vom Dienst gelieferte, nicht gerundet verfälscht
    const angezeigt = await page.locator('#inspector').textContent();
    const m = /([\d’']*\d+)\s*m ü\. M\./.exec(angezeigt);
    expect(m, 'Höhe im Standort-Check gefunden').not.toBeNull();
    const hoehe = Number(m[1].replace(/[^\d]/g, ''));
    expect(Math.abs(hoehe - terrain(soll.E, soll.N))).toBeLessThan(1);

    // Höhen im Raster: Batch-Abfrage liefert plausible Werte für alle Zellen
    const stats = await page.evaluate(() => {
      const e = window.__pilzkarte.state.result.cells.elev;
      let min = Infinity, max = -Infinity, nan = 0;
      for (const v of e) { if (!Number.isFinite(v)) { nan++; continue; } min = Math.min(min, v); max = Math.max(max, v); }
      return { min, max, nan, n: e.length };
    });
    expect(stats.nan).toBe(0);
    expect(stats.min).toBeGreaterThan(200);
    expect(stats.max).toBeLessThan(4700); // unter dem höchsten Punkt der Schweiz
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('C – Suche: jeder Ort landet im Dorfkern, nicht auf dem Flächenpunkt', async ({ page }) => {
    const errors = collectErrors(page);
    await installMocks(page);
    await page.goto('/#8/46.95000/8.10000/steinpilz');

    for (const [name, erwartet] of Object.entries(SEARCH_ORTE)) {
      await page.locator('#search-input').press('Escape').catch(() => {});
      await page.locator('#search-input').fill('');
      await page.locator('#search-input').fill(name);
      await expect(page.locator('#search-results')).toBeVisible();

      // Der erste Treffer muss die Ortschaft sein
      const erster = page.locator('#search-results li').first();
      await expect(erster.locator('.kind')).toHaveText('Ortschaft', { timeout: 5000 });

      await page.locator('#search-input').press('Enter');
      await expect(page.locator('#search-results')).toBeHidden();
      const c = await page.evaluate(() => { const x = window.__pilzkarte.map.getCenter(); return { lat: x.lat, lon: x.lng }; });

      const dOrt = Math.hypot((c.lat - erwartet.ort.lat) * 111, (c.lon - erwartet.ort.lon) * 76);
      const dWeit = Math.hypot((c.lat - erwartet.weit.lat) * 111, (c.lon - erwartet.weit.lon) * 76);
      expect(dOrt, `${name}: ${dOrt.toFixed(2)} km vom Dorfkern`).toBeLessThan(0.3);
      expect(dWeit, `${name}: läge beim Flächenpunkt`).toBeGreaterThan(1);

      // Zoom nah genug für eine Analyse
      expect(await page.evaluate(() => window.__pilzkarte.map.getZoom())).toBeGreaterThanOrEqual(12);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('D – Etikett und rote Markierung widersprechen sich nie', async ({ page }) => {
    const errors = collectErrors(page);
    await installMocks(page);
    await page.goto('/#13/47.05000/8.30000/steinpilz');
    await analyseFertig(page);

    // Der gemeldete Praxisfehler: eine Zelle mit «sehr hohem Potenzial» blieb unmarkiert.
    // Für JEDE Zelle muss gelten: markiert genau dann, wenn die Klasse die Schwelle erreicht.
    const pruefung = await page.evaluate(() => {
      const st = window.__pilzkarte.state;
      const { scores } = st.result;
      const t = st.heatInfo.threshold;
      let markiert = 0, sehrHoch = 0, sehrHochUnmarkiert = 0, hochUnmarkiert = 0, widerspruch = 0;
      for (const v of scores) {
        const m = v >= t;
        if (m) markiert++;
        if (v >= 0.6) { sehrHoch++; if (!m) sehrHochUnmarkiert++; }
        if (v >= 0.45 && v < 0.6 && !m) hochUnmarkiert++;
        if (v < 0.45 && m) widerspruch++;
      }
      return { markiert, sehrHoch, sehrHochUnmarkiert, hochUnmarkiert, widerspruch, info: st.heatInfo };
    });
    expect(pruefung.sehrHoch).toBeGreaterThan(0);
    expect(pruefung.sehrHochUnmarkiert, 'Zelle mit «sehr hohem Potenzial» blieb unmarkiert').toBe(0);
    expect(pruefung.hochUnmarkiert, 'Zelle mit «hohem Potenzial» blieb unmarkiert').toBe(0);
    expect(pruefung.widerspruch, 'Zelle unter der Schwelle wurde markiert').toBe(0);

    // Auch im Standort-Check: der angezeigte Text stimmt mit der Klasse überein
    const box = await page.locator('#map').boundingBox();
    for (const [fx, fy] of [[0.3, 0.5], [0.6, 0.3], [0.8, 0.7], [0.15, 0.2]]) {
      await page.mouse.click(box.x + box.width * fx, box.y + box.height * fy);
      await expect(page.locator('#inspector .score-badge')).toBeVisible();
      const text = await page.locator('#inspector').textContent();
      const klasse = /(Sehr hohes|Hohes|Mittleres|Geringes|Kein) Potenzial/.exec(text)[1];
      const markiert = text.includes('auf der Karte rot markiert');
      const sollte = klasse === 'Sehr hohes' || klasse === 'Hohes';
      expect(markiert, `«${klasse} Potenzial» → markiert=${markiert}`).toBe(sollte);
    }

    // Strengere Einstellung markiert weniger, grosszügigere mehr
    // (der Klick auf die Karte hat auf den Tab «Punkt» gewechselt – Einstellungen sind im Tab «Karte»)
    await page.locator('.tabs [data-tab="karte"]').click();
    await aufklappen(page, 'details.settings');
    const zahl = () => page.evaluate(() => window.__pilzkarte.state.heatInfo.marked);
    const normal = await zahl();
    await page.locator('#mark-from').selectOption('sehr-hoch');
    expect(await zahl()).toBeLessThan(normal);
    await page.locator('#mark-from').selectOption('mittel');
    // Im synthetischen Gelände liegt keine Zelle im Band 0.30–0.45, deshalb nicht zwingend mehr.
    // Die strikte Ordnung prüft tests/heat.test.mjs an einer gleichverteilten Reihe.
    expect(await zahl()).toBeGreaterThanOrEqual(normal);
    await page.locator('#mark-from').selectOption('hoch');
    expect(await zahl()).toBe(normal);

    // Gezeichnete Pixel decken sich mit den markierten Zellen
    const px = await page.evaluate(async () => {
      const img = document.querySelector('img.heat-overlay');
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let rot = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40) rot++;
      return { rot, gesamt: c.width * c.height };
    });
    const anteilZellen = pruefung.markiert / pruefung.info.total;
    expect(px.rot / px.gesamt).toBeGreaterThan(anteilZellen * 0.4);
    expect(px.rot / px.gesamt).toBeLessThan(anteilZellen * 2.5 + 0.05);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('E – alle Arten und alle Monate laufen ohne Fehler durch', async ({ page }) => {
    const errors = collectErrors(page);
    await installMocks(page);
    await page.goto('/#13/47.05000/8.30000/alle');
    await analyseFertig(page);

    const arten = await page.locator('#species-list .chip').evaluateAll((els) => els.map((e) => e.dataset.id));
    expect(arten.length).toBe(13);
    for (const id of arten) {
      await page.locator(`#species-list .chip[data-id="${id}"]`).click();
      const ok = await page.evaluate(() => {
        const st = window.__pilzkarte.state;
        return st.heatInfo && Number.isFinite(st.heatInfo.threshold)
          && Array.from(st.result.scores).every((v) => Number.isFinite(v) && v >= 0 && v <= 1);
      });
      expect(ok, `Art ${id} liefert ungültige Werte`).toBe(true);
    }
    for (let m = 1; m <= 12; m++) {
      await page.locator('#month-select').selectOption(String(m));
      const ok = await page.evaluate(() => Array.from(window.__pilzkarte.state.result.scores).every((v) => Number.isFinite(v)));
      expect(ok, `Monat ${m} liefert ungültige Werte`).toBe(true);
    }
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('F – Plätze und Navigation: speichern, anzeigen, Route, löschen', async ({ page }) => {
    const errors = collectErrors(page);
    await installMocks(page);
    await page.goto('/#13/47.05000/8.30000/steinpilz');
    await analyseFertig(page);

    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width * 0.35, box.y + box.height * 0.45);
    await expect(page.locator('#inspector .factor')).toHaveCount(6);
    await expect(page.locator('#inspector')).toContainText(/rot markiert|nicht rot markiert/);

    // Google-Maps-Ziel entspricht dem angeklickten Punkt
    const href = await page.locator('#link-google-route').getAttribute('href');
    const ziel = decodeURIComponent(new URL(href).searchParams.get('destination')).split(',').map(Number);
    const punkt = await page.evaluate(() => window.__pilzkarte.state.selected);
    expect(Math.abs(ziel[0] - punkt.lat)).toBeLessThan(1e-4);
    expect(Math.abs(ziel[1] - punkt.lon)).toBeLessThan(1e-4);

    page.once('dialog', (d) => d.accept('Mastertest-Platz'));
    await page.locator('#btn-save-spot').click();
    await page.locator('.tabs [data-tab="plaetze"]').click();
    await expect(page.locator('#spots-list li')).toHaveCount(1);
    await expect(page.locator('#spots-list a.btn-nav')).toHaveAttribute('href', /maps\/dir\/\?api=1&destination=/);

    // Überlebt einen Neuladen (localStorage)
    await page.reload();
    await page.locator('.tabs [data-tab="plaetze"]').click();
    await expect(page.locator('#spots-list li')).toHaveCount(1);
    await expect(page.locator('#spots-list')).toContainText('Mastertest-Platz');

    page.once('dialog', (d) => d.accept());
    await page.locator('#spots-list button[title="Löschen"]').click();
    await expect(page.locator('#spots-list li.muted')).toHaveCount(1);
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('G – Ausfall einer Datenquelle wird gemeldet, App läuft weiter', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await installMocks(page);
    await page.route(/wms\.geo\.admin\.ch/, (route) => route.abort());
    await page.goto('/#13/47.05000/8.30000/steinpilz');
    await analyseFertig(page);

    await expect(page.locator('#source-status .fail')).toHaveCount(1);
    await expect(page.locator('#source-status')).toContainText('Waldlayer nicht lesbar');
    // Trotzdem eine gültige Bewertung
    const ok = await page.evaluate(() => Array.from(window.__pilzkarte.state.result.scores).every((v) => Number.isFinite(v)));
    expect(ok).toBe(true);
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
