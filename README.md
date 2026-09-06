# Pilzkarte Schweiz 🍄

Interaktive Webapp, die potenzielle **Pilzbiotope in der Schweiz als rote Flächen** auf einer Karte markiert
und dazu das **Regen-Timing** auswertet – ähnlich wie pilzsucher.com, aber vollständig auf offenen Daten
des Bundes (map.geo.admin.ch) und Open-Meteo aufgebaut. Keine Server, kein API-Schlüssel: die App läuft
komplett im Browser.

> Das Modell sagt «hier könnten die Bedingungen passen» – nicht «hier hat jemand letzte Woche Steinpilze gefunden».

## Funktionen

- **Biotop-Analyse** des sichtbaren Kartenausschnitts (ab Zoomstufe 11), automatisch nach jeder Kartenbewegung oder per Knopf.
- **12 Pilzarten** mit eigenem Biotop-Profil (Steinpilz, Eierschwämmli, Maronenröhrling, Trompetenpfifferling, Herbsttrompete, Semmelstoppelpilz, Hexenröhrling, Fichtenreizker, Birkenpilz/Rotkappe, Krause Glucke, Morcheln, Parasol) plus «Alle Speisepilze».
- **Rote Flächen** (drei Stufen: gering / mittel / hoch) als geglättetes Overlay über der Landeskarte oder dem Luftbild.
- **Standort-Check**: Klick auf die Karte zeigt Höhe, Hangneigung, Exposition, Waldanteil, Laub-/Nadelholzanteil, Gestein/Bodensäure und den Beitrag jedes Faktors.
- **Pilzwetter / Regen-Timing**: Niederschlag und Temperaturen der letzten 30 Tage plus 7 Tage Prognose, daraus ein täglicher Pilz-Index mit Erklärung («Letzter ergiebiger Regen vor 9 Tagen … nächste günstige Phase ab Do»).
- **Ortssuche** (Gemeinden, Flurnamen, Adressen), **GPS-Standort**, **eigene Plätze** speichern (lokal im Browser, Export/Import als JSON).
- Zusätzliche Karten-Layer zum Nachprüfen: Waldmischungsgrad, Vegetationshöhe, Relief, Geologie, Wanderwege.
- Teilbare Links: Position, Zoom und Pilzart stehen in der URL (`#13/47.05/8.30/steinpilz`).

## So funktioniert das Modell

Der Kartenausschnitt wird in ein Raster von 48 × (12–48) Zellen unterteilt. Für jede Zelle werden fünf Standortfaktoren
bestimmt und mit dem Profil der gewählten Art verglichen (`js/model/species.js`):

| Faktor | Datenquelle | Umsetzung |
|---|---|---|
| Wald & Baumarten | Waldmischungsgrad LFI (BAFU/WSL, 10 m), via WMS | Deckkraft = Waldanteil; Farbton = Laubholzanteil (grün → Nadelholz, gelb/orange → Laubholz) |
| Höhenlage | swissALTI3D via Höhenprofil-Dienst | Trapez-Funktion [min, optimal von, optimal bis, max] |
| Exposition & Neigung | aus dem Höhenraster berechnet | Hochsommer: Nordlagen bevorzugt; Spätherbst/Frühling: Südlagen; ideal 3–25° |
| Bodensäure | Geotechnische Karte GK500 (Gesteinsklassierung, Lithologie) via Identify | Kalk/Mergel → basisch, Granit/Gneis/Silikat → sauer; Index 0–1 |
| Regen-Timing | Open-Meteo (ICON-CH von MeteoSchweiz) | Bodenfeuchte-Bilanz + Fruchtungsfenster 5–21 Tage nach ergiebigem Regen, Temperatur-/Frost-/Saison-Tore |

Score = Wald × Baumarten¹·⁰ × Höhe¹·⁰ × Boden⁰·⁷ × Exposition⁰·⁵ × Neigung⁰·⁴ (`js/model/biotope.js`).
Wald und Höhe wirken als Ausschlusskriterien, die übrigen Faktoren verfeinern. Fehlt eine Datenquelle
(z. B. Geologie ausserhalb der Schweiz), geht sie neutral ein und wird im Panel als «nicht verfügbar» angezeigt.

Alle Modellparameter (Höhenbereiche, Baumpartner, Säure-Präferenz, Regen-Verzögerung, Temperaturfenster) sind
bewusst als einfache Zahlenprofile hinterlegt und lassen sich in `js/model/species.js` anpassen.

## Starten

Die App besteht nur aus statischen Dateien (ES-Module), braucht aber einen HTTP-Server (kein `file://`):

```bash
npm start            # python3 -m http.server 8080  → http://localhost:8080
# oder: npx serve .
```

Deployment: jeder statische Host funktioniert. Ein GitHub-Pages-Workflow liegt unter `.github/workflows/pages.yml`
(Repository-Einstellungen → Pages → Source «GitHub Actions»).

## Tests

```bash
npm test             # Unit-Tests (Koordinaten, Biotop-Modell, Regen-Timing, Geländeanalyse)
npm run e2e          # Playwright-Smoke-Test mit gemockten Diensten (npm install vorausgesetzt)
```

Der Smoke-Test simuliert alle externen Dienste (Höhen, WMS, Identify, Suche, Wetter) und prüft Analyse,
Overlay, Standort-Check, Wetterdiagramm, Suche und Plätze ohne Internetverbindung.

## Datenquellen & Dienste

- `api3.geo.admin.ch/rest/services/profile.json` – Höhen für das ganze Raster in einer Anfrage (`only_requested_points=true`)
- `api3.geo.admin.ch/rest/services/height` – Höhe eines Punkts
- `api3.geo.admin.ch/rest/services/all/MapServer/identify` – Gesteinsklassierung / Lithologie GK500 am Punkt
- `api3.geo.admin.ch/rest/services/api/SearchServer` – Ortssuche
- `wms.geo.admin.ch` – Waldmischungsgrad LFI als Bild für die Pixelanalyse
- `wmts.geo.admin.ch` – Landeskarte, Luftbild und Fach-Layer als Kacheln (EPSG:3857)
- `api.open-meteo.com` – Niederschlag, Temperatur, Bodentemperatur (6 cm)

Geodaten © swisstopo, BAFU, WSL (Open Government Data). Wetter © Open-Meteo.com (CC BY 4.0). Karte: Leaflet (BSD-2).

## Bekannte Grenzen

- Der Laubholzanteil wird aus den Farben des Waldmischungsgrad-Layers abgeleitet (`js/analysis/raster.js`,
  `deciduousShareFromColor`). Sollte swisstopo/BAFU die Legende ändern, muss die Farbton-Zuordnung angepasst werden.
  Zum Nachprüfen kann der Layer «Waldmischungsgrad» eingeblendet und mit dem Standort-Check verglichen werden.
- Die Bodensäure stammt aus der Geologie 1:500'000 (Gesteinsart, nicht gemessener pH) und wird für die Flächenanalyse
  auf einem 1-km-Gitter abgefragt; der Standort-Check fragt den exakten Punkt ab.
- Die Fach-Dienste des Bundes sind Fair-Use-Dienste ohne Garantie. Bei vielen Nutzern gleichzeitig kann die Analyse
  langsamer werden; Geologie- und Wetterdaten werden deshalb im Browser zwischengespeichert.
- Pilze wachsen, wo sie wollen. Sammle nur, was du sicher bestimmen kannst, und beachte die kantonalen Schonzeiten
  und Mengenbeschränkungen.
