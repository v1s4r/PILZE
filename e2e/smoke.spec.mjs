import { test, expect } from '@playwright/test';
import { installMocks, SIEBNEN_ORT, SIEBNEN_PLZ_PUNKT } from './mocks.mjs';

test.describe('Pilzkarte Schweiz – Smoke', () => {
  test('Analyse, Overlay, Standort-Check, Wetter, Suche, Plätze', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text()}`); });
    const counters = {};
    await installMocks(page, counters);

    await page.goto('/#13/47.05000/8.30000/steinpilz');
    await expect(page.locator('#species-list .chip.active')).toContainText('Steinpilz');

    // Automatische Analyse nach dem Laden
    await expect(page.locator('#status-text')).toContainText('Zellen', { timeout: 30_000 });
    await expect(page.locator('img.heat-overlay')).toHaveAttribute('src', /^data:image\/png/);
    await expect(page.locator('#source-status li')).toHaveCount(3);
    await expect(page.locator('#source-status .ok')).toHaveCount(3);
    expect(counters.profile).toBe(1);
    expect(counters.wms).toBeGreaterThanOrEqual(1);
    expect(counters.identify).toBeGreaterThan(5);

    await page.screenshot({ path: 'e2e/screenshots/karte.png' });
    const status = await page.locator('#status-text').textContent();
    const pct = Number(/(\d+) % der Fläche/.exec(status)[1]);
    expect(pct).toBeGreaterThan(5);

    // Overlay enthält rote Pixel
    const hasRed = await page.evaluate(async () => {
      const img = document.querySelector('img.heat-overlay');
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      let red = 0; for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 40 && d[i] > 100) red++;
      return red > 50;
    });
    expect(hasRed).toBe(true);

    // Artwechsel bewertet neu ohne Nachladen
    await page.locator('#species-list .chip', { hasText: 'Eierschwämmli' }).click();
    await expect(page.locator('#status-text')).toContainText('Eierschwämmli');
    expect(counters.profile).toBe(1);

    // Standort-Check per Klick auf die Karte
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await expect(page.locator('.tabs [data-tab="punkt"]')).toHaveClass(/active/);
    await expect(page.locator('#inspector')).toContainText('Höhe');
    await expect(page.locator('#inspector')).toContainText('Nadelwald');
    await expect(page.locator('#inspector .factor')).toHaveCount(6);
    await page.screenshot({ path: 'e2e/screenshots/punkt.png' });

    // Platz speichern
    page.once('dialog', (d) => d.accept('Testplatz'));
    await page.locator('#btn-save-spot').click();
    await page.locator('.tabs [data-tab="plaetze"]').click();
    await expect(page.locator('#spots-list li')).toHaveCount(1);
    await expect(page.locator('#spots-list')).toContainText('Testplatz');
    await expect(page.locator('.spot-icon')).toHaveCount(1);

    // Pilzwetter
    await page.locator('.tabs [data-tab="wetter"]').click();
    await expect(page.locator('#weather-status .big')).toContainText('%');
    await expect(page.locator('#weather-text')).toContainText('vor 9 Tagen');
    await expect(page.locator('#weather-chart svg')).toHaveCount(1);
    await expect(page.locator('#weather-chart .bar').first()).toBeVisible();
    await expect(page.locator('#weather-table tr')).toHaveCount(38);
    const chart = page.locator('#weather-chart svg');
    const cb = await chart.boundingBox();
    await page.mouse.move(cb.x + cb.width * 0.5, cb.y + 40);
    await expect(page.locator('#weather-chart .chart-tip')).toBeVisible();
    await expect(page.locator('#weather-chart .chart-tip')).toContainText('Niederschlag');

    // Google-Maps-Buttons im Standort-Check und in der Platzliste
    await page.locator('.tabs [data-tab="punkt"]').click();
    await expect(page.locator('#link-google-route')).toBeVisible();
    await expect(page.locator('#link-google-route')).toHaveAttribute('href', /^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&destination=47\.\d+%2C8\.\d+&travelmode=driving$/);
    await expect(page.locator('#link-google-show')).toHaveAttribute('href', /maps\/search\/\?api=1&query=47\./);
    await expect(page.locator('#nav-hint')).toBeVisible();
    await page.locator('.tabs [data-tab="plaetze"]').click();
    await expect(page.locator('#spots-list a.btn-nav')).toHaveCount(1);
    await expect(page.locator('#spots-list a.btn-nav')).toHaveAttribute('href', /maps\/dir\/\?api=1&destination=/);
    await expect(page.locator('#spots-list a.btn-nav')).toHaveAttribute('target', '_blank');
    // Marker-Popup: Route-Link vorhanden und lesbar (weisse Schrift trotz Leaflets Link-Farbe)
    await page.locator('.spot-icon').first().click();
    const popupLink = page.locator('.leaflet-popup a.btn-nav');
    await expect(popupLink).toBeVisible();
    await expect(popupLink).toHaveAttribute('href', /maps\/dir\/\?api=1&destination=/);
    await expect(popupLink).toHaveCSS('color', 'rgb(255, 255, 255)');
    await page.keyboard.press('Escape');

    // Suche: Ortschaft zuoberst, Enter nimmt den besten Treffer
    await page.locator('#search-input').fill('Luz');
    await expect(page.locator('#search-results li').first()).toContainText('Luzern');
    await expect(page.locator('#search-results li').first().locator('.kind')).toHaveText('Ortschaft');
    await page.locator('#search-results li').first().click();
    await expect(page.locator('#search-results')).toBeHidden();
    expect(page.url()).toMatch(/#1[2-9]\/47\.05/);

    await page.screenshot({ path: 'e2e/screenshots/desktop.png' });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Morcheln: Saison-Hinweis, Monatswechsel und Sammelansicht', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    await installMocks(page);
    await page.goto('/#13/47.05000/8.30000/morchel');
    await expect(page.locator('#status-text')).toContainText('Zellen', { timeout: 30_000 });

    // Morcheln sind wählbar und werden angezeigt – im September mit deutlichem Saison-Hinweis
    await expect(page.locator('#species-list .chip.active')).toContainText('Morcheln');
    await page.locator('#month-select').selectOption('9');
    await expect(page.locator('#season-banner')).toBeVisible();
    await expect(page.locator('#season-banner')).toContainText('ausserhalb der Saison');
    await expect(page.locator('#season-banner')).toContainText('März–Mai');
    // Die roten Flächen bleiben trotzdem sichtbar (Standort-Potenzial)
    await expect(page.locator('img.heat-overlay')).toHaveAttribute('src', /^data:image\/png/);

    // Im April verschwindet der Hinweis
    await page.locator('#month-select').selectOption('4');
    await expect(page.locator('#season-banner')).toBeHidden();

    // Sammelansicht im April führt die Morchel als Leitart
    await page.locator('#species-list .chip', { hasText: 'Alle Speisepilze' }).click();
    await expect(page.locator('#species-tip')).toContainText('April');
    await page.locator('.tabs [data-tab="wetter"]').click();
    await expect(page.locator('#weather-status')).toContainText('Morcheln');
    await expect(page.locator('#weather-status')).toContainText('Leitart');
    await page.screenshot({ path: 'e2e/screenshots/saison-april.png' });

    // Standort-Check nennt die Saison
    await page.locator('.tabs [data-tab="karte"]').click();
    await page.locator('#month-select').selectOption('10');
    await page.locator('#species-list .chip', { hasText: 'Morcheln' }).click();
    const box = await page.locator('#map').boundingBox();
    await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.5);
    await expect(page.locator('#inspector')).toContainText('Ausserhalb der Saison');
    await expect(page.locator('#inspector .season-note')).toBeVisible();

    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Suche Siebnen: landet im Dorf, nicht auf dem PLZ-Flächenpunkt', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
    const counters = {};
    await installMocks(page, counters);
    await page.goto('/#8/46.95000/8.10000/steinpilz');

    await page.locator('#search-input').fill('Siebnen');
    const items = page.locator('#search-results li');
    await expect(items.first()).toContainText('Siebnen');
    await expect(items.first().locator('.kind')).toHaveText('Ortschaft');
    // Die PLZ ist eingerastet und zeigt das an
    const plz = items.filter({ has: page.locator('.kind', { hasText: 'PLZ' }) });
    await expect(plz).toHaveCount(1);
    await expect(plz.locator('.snapped')).toHaveText('→ Ortszentrum');
    // zwei parallele Abfragen (alle Herkünfte + nur Namen)
    expect(counters.search).toBe(2);

    // Enter wählt den besten Treffer
    await page.locator('#search-input').press('Enter');
    await expect(page.locator('#search-results')).toBeHidden();
    const center = await page.evaluate(() => { const c = window.__pilzkarte.map.getCenter(); return { lat: c.lat, lon: c.lng }; });
    expect(Math.abs(center.lat - SIEBNEN_ORT.lat)).toBeLessThan(0.001);
    expect(Math.abs(center.lon - SIEBNEN_ORT.lon)).toBeLessThan(0.001);
    expect(Math.abs(center.lat - SIEBNEN_PLZ_PUNKT.lat)).toBeGreaterThan(0.02);
    expect(await page.evaluate(() => window.__pilzkarte.map.getZoom())).toBeGreaterThanOrEqual(14);

    // Auch der PLZ-Treffer führt ins Dorf
    await page.locator('#search-input').fill('Siebnen');
    await page.locator('#search-results li').filter({ has: page.locator('.kind', { hasText: 'PLZ' }) }).click();
    const c2 = await page.evaluate(() => { const c = window.__pilzkarte.map.getCenter(); return { lat: c.lat, lon: c.lng }; });
    expect(Math.abs(c2.lat - SIEBNEN_ORT.lat)).toBeLessThan(0.001);

    // Pfeiltasten wechseln die Auswahl (alte Liste erst schliessen, damit die neue sicher da ist)
    await page.locator('#search-input').press('Escape');
    await expect(page.locator('#search-results')).toBeHidden();
    await page.locator('#search-input').fill('Sieb');
    await expect(page.locator('#search-results')).toBeVisible();
    await expect(page.locator('#search-results li').first()).toHaveAttribute('aria-selected', 'true');
    await page.locator('#search-input').press('ArrowDown');
    await expect(page.locator('#search-results li').nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.screenshot({ path: 'e2e/screenshots/suche-siebnen.png' });
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('Mobile Layout', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 780 });
    const counters = {};
    await installMocks(page, counters);
    await page.goto('/#13/47.05000/8.30000/alle');
    await expect(page.locator('#status-text')).toContainText('Zellen', { timeout: 30_000 });
    await expect(page.locator('#btn-panel-toggle')).toBeVisible();
    await page.locator('#btn-panel-toggle').click();
    await expect(page.locator('#panel')).toHaveClass(/expanded/);
    await page.screenshot({ path: 'e2e/screenshots/mobile.png' });
  });

  test('Zu weit herausgezoomt: keine Analyse, Hinweis sichtbar', async ({ page }) => {
    await installMocks(page);
    await page.goto('/#8/46.95000/8.10000/steinpilz');
    await expect(page.locator('#fab-analyze')).toBeDisabled();
    await expect(page.locator('#fab-analyze')).toContainText('Näher zoomen');
    // hidden-Attribut muss auch bei Flex-Containern greifen
    await expect(page.locator('#map-legend')).toBeHidden();
    await expect(page.locator('#season-banner')).toBeHidden();
  });
});
