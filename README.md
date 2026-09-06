# Pilzkarte Schweiz 🍄

Interaktive Webapp, die potenzielle **Pilzbiotope in der Schweiz als rote Flächen** auf einer Karte markiert
und dazu das **Regen-Timing** auswertet – ähnlich wie pilzsucher.com, aber vollständig auf offenen Daten
des Bundes (map.geo.admin.ch) und Open-Meteo aufgebaut. Keine Server, kein API-Schlüssel: die App läuft
komplett im Browser.

> Das Modell sagt «hier könnten die Bedingungen passen» – nicht «hier hat jemand letzte Woche Steinpilze gefunden».

## Funktionen

- **Biotop-Analyse** des sichtbaren Kartenausschnitts (ab Zoomstufe 11), automatisch nach jeder Kartenbewegung oder per Knopf.
- **12 Pilzarten** mit eigenem Biotop-Profil (Steinpilz, Eierschwämmli, Maronenröhrling, Trompetenpfifferling, Herbsttrompete, Semmelstoppelpilz, Hexenröhrling, Fichtenreizker, Birkenpilz/Rotkappe, Krause Glucke, Morcheln, Parasol) plus «Alle Speisepilze», das je Zelle die im gewählten Monat passendste Art zeigt.
- **Rote Flächen** nur für die **besten Wälder im Ausschnitt**: markiert wird, was zu den besten 10 % der Fläche gehört *und* mindestens «hohes Potenzial» erreicht. In schwachen Gebieten bleibt die Karte leer. Der Anteil ist in den Einstellungen einstellbar (2–30 %).
- **Standort-Check**: Klick auf die Karte zeigt Höhe, Hangneigung, Exposition, Waldanteil, Laub-/Nadelholzanteil, Gestein/Bodensäure und den Beitrag jedes Faktors.
- **Pilzwetter / Regen-Timing**: Niederschlag und Temperaturen der letzten 30 Tage plus 7 Tage Prognose, daraus ein täglicher Pilz-Index mit Erklärung («Letzter ergiebiger Regen vor 9 Tagen … nächste günstige Phase ab Do»).
- **Ortssuche** (Ortschaften, Gemeinden, PLZ, Flurnamen, Adressen) mit Typ-Kennzeichnung und Pfeiltasten-Bedienung, **GPS-Standort**, **eigene Plätze** speichern (lokal im Browser, Export/Import als JSON).
- **Google-Maps-Navigation** zu jedem Punkt und jedem gespeicherten Platz: ein Klick öffnet die Route (auf dem Handy direkt in der Google-Maps-App) bis zur nächsten befahrbaren Strasse.
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

Rohwert = Wald × Baumarten¹·⁰ × Höhe¹·⁰ × Boden⁰·⁷ × Exposition⁰·⁵ × Neigung⁰·⁴ (`js/model/biotope.js`).
Wald und Höhe wirken als Ausschlusskriterien, die übrigen Faktoren verfeinern.

Das Produkt sechs kleiner Faktoren fällt zwangsläufig tief aus: ein Platz mit Wald 100, Baumarten 85, Höhe 100,
Boden 75, Exposition 93 und Neigung 100 käme roh nur auf 0.67 – die Klasse «hoch» wäre kaum erreichbar. Der
Rohwert wird deshalb mit `SCORE_GAMMA` (0.5, also die Wurzel) auf die Skala gehoben, welche die Klassen
annehmen. Die Transformation ist streng monoton, die Rangfolge der Zellen bleibt also exakt gleich. Geprüft an
Referenzfällen: guter Standort (alle Teilfaktoren 70–90) → «hoch»; falsche Höhenlage oder falsche Baumart →
«mittel».

**Welche Zellen rot werden** (`js/model/heat.js`): In einem typischen Waldgebiet liegen fast alle Waldzellen in
einem schmalen Punkteband – eine feste Schwelle markiert deshalb entweder beinahe den ganzen Wald oder gar
nichts. Markiert wird darum, was **beide** Bedingungen erfüllt:

1. **relativ** – die Zelle gehört zu den besten `topFraction` des Ausschnitts (Standard 10 %),
2. **absolut** – die Zelle erreicht mindestens Score 0.65 («hohes Potenzial»).

So ist die rote Fläche nach oben begrenzt, und in einem schwachen Gebiet bleibt die Karte leer, statt die
«besten der schlechten» zu markieren. Die Statuszeile nennt jeweils die effektiv verwendete Schwelle und
welche der beiden Bedingungen gebunden hat. Fehlt eine Datenquelle
(z. B. Geologie ausserhalb der Schweiz), geht sie neutral ein und wird im Panel als «nicht verfügbar» angezeigt.

Alle Modellparameter (Höhenbereiche, Baumpartner, Säure-Präferenz, Regen-Verzögerung, Temperaturfenster) sind
bewusst als einfache Zahlenprofile hinterlegt und lassen sich in `js/model/species.js` anpassen.

### Saison: Karte gegen Pilzwetter

Standort und Zeitpunkt sind zwei verschiedene Fragen, deshalb behandelt die App sie getrennt:

- **Einzelne Art gewählt** – die Karte zeigt das zeitlose *Standort-Potenzial*. Morchel-Biotope sind also auch
  im Oktober sichtbar, was zum Plätze-Suchen für den nächsten Frühling nützlich ist. Ein Banner über der Karte
  und eine Zeile im Standort-Check weisen darauf hin, wenn die Art gerade nicht fruchtet.
- **«Alle Speisepilze» gewählt** – hier fliesst die Saison in den Score ein (`seasonFactor` in `js/model/biotope.js`):
  die Karte zeigt je Zelle die Art, die im gewählten Monat am besten passt. Im April gewinnen die Morcheln,
  im Oktober die Herbsttrompete, im Januar bleibt alles blass.
- **Tab «Pilzwetter»** – die Saison zählt immer mit. Für die Sammelansicht wird die Leitart des Monats
  (`seasonLeader`) verwendet, weil die Fruchtungsfenster je Art verschieden lang sind.

Der Monatswähler neben der Artauswahl erlaubt es, jede Jahreszeit durchzuspielen; standardmässig steht er
auf dem aktuellen Monat.

## Starten

Die App besteht nur aus statischen Dateien (ES-Module), braucht aber einen HTTP-Server (kein `file://`):

```bash
npm start            # python3 -m http.server 8080  → http://localhost:8080
# oder: npx serve .
```

### Cache und Version

GitHub Pages liefert Dateien mit zehn Minuten Cache aus. Der Workflow ersetzt beim Deploy den Platzhalter
`__BUILD__` in `index.html` durch den Commit-Hash, sodass CSS und JavaScript bei jeder Version neu geladen
werden; die laufende Version steht unten im Tab «Info».

### Als Website veröffentlichen

Ein GitHub-Pages-Workflow liegt unter `.github/workflows/pages.yml` und läuft bei jedem Push auf `main`,
`master` oder den Arbeitsbranch. Einmalig nötig: **Repository → Settings → Pages → Source auf «GitHub Actions»
stellen.** Danach ist die App unter `https://<user>.github.io/PILZE/` erreichbar; jeder weitere Push
aktualisiert sie automatisch. (GitHub Pages ist im Gratis-Tarif nur für öffentliche Repositories verfügbar.)

Sonst funktioniert jeder statische Host – die App besteht ausschliesslich aus statischen Dateien, es gibt
keinen Build-Schritt und keinen Server.

## Tests

```bash
npm test             # Unit-Tests (Koordinaten, Biotop-Modell, Regen-Timing, Gelände, Schwellenwahl)
npm run e2e          # alle Browser-Tests (Smoke + Mastertest), gemockte Dienste
npm run master       # nur der Mastertest
```

Alle externen Dienste (Höhen, WMS, Identify, Suche, Wetter) werden simuliert, die Tests laufen also ohne
Internetverbindung und ohne Last für die Bundes-Dienste.

**Mastertest** (`e2e/master.spec.mjs`) prüft die App als Ganzes:

| Test | Prüft |
|---|---|
| A | Alle Ansichten erscheinen vollständig, keine Konsolen- oder Netzwerkfehler |
| B | Höhen: gesendete LV95-Koordinate stimmt mit der Referenz, Rasterhöhen plausibel |
| C | Suche: fünf Orte landen im Dorfkern statt auf dem PLZ-Flächenpunkt |
| D | Nur die besten Wälder sind rot; Regler wirkt; gezeichnete Pixel passen zu den Zellen |
| E | Alle 13 Arten × 12 Monate liefern gültige Werte |
| F | Plätze speichern, überleben Neuladen, Google-Maps-Ziel stimmt, löschen |
| G | Ausfall einer Datenquelle wird gemeldet, die App läuft weiter |

**Koordinatengenauigkeit**: `tests/fixtures/lv95-proj4.mjs` enthält mit proj4 erzeugte Referenzkoordinaten
(offizielle EPSG:2056-Definition). Die Näherungsformeln in `js/geo/lv95.js` müssen auf **unter 0.5 m** daran
liegen – feiner als das 0.5-m-Raster von swissALTI3D, damit die Höhenabfrage denselben Wert trifft wie
map.geo.admin.ch. Gemessen: grösste Abweichung 0.37 m (Chiasso).

## Datenquellen & Dienste

- `api3.geo.admin.ch/rest/services/profile.json` – Höhen für das ganze Raster in einer Anfrage (`only_requested_points=true`)
- `api3.geo.admin.ch/rest/services/height` – Höhe eines Punkts
- `api3.geo.admin.ch/rest/services/all/MapServer/identify` – Gesteinsklassierung / Lithologie GK500 am Punkt
- `api3.geo.admin.ch/rest/services/api/SearchServer` – Ortssuche
- `wms.geo.admin.ch` – Waldmischungsgrad LFI als Bild für die Pixelanalyse
- `wmts.geo.admin.ch` – Landeskarte, Luftbild und Fach-Layer als Kacheln (EPSG:3857)
- `api.open-meteo.com` – Niederschlag, Temperatur, Bodentemperatur (6 cm)

Geodaten © swisstopo, BAFU, WSL (Open Government Data). Wetter © Open-Meteo.com (CC BY 4.0). Karte: Leaflet (BSD-2).

## Ortssuche: warum ein eigenes Ranking?

Der SearchServer von geo.admin.ch sortiert Treffer nach seinem internen Rang – Postleitzahl und Gemeinde
zuerst. Deren Koordinate ist aber nur ein «Punkt auf der Fläche» (`ST_PointOnSurface`), der bei grossen
oder unregelmässigen Flächen kilometerweit vom Dorf entfernt liegen kann (Beispiel Siebnen SZ: die PLZ-Fläche
8854 reicht weit ins Hügelland). Die eigentliche Ortschaft aus swissNAMES3D (Rang 5) hat dagegen einen Punkt
im Siedlungsgebiet, kommt aber erst weiter hinten – oder fällt bei kleinem Limit ganz weg.

Die App stellt deshalb zwei Abfragen parallel (alle Herkunftsarten sowie nur Namen aus swissNAMES3D) und
ordnet in `js/model/places.js` neu: exakte Namenstreffer zuerst, Ortschaften vor Gemeinden, PLZ und Adressen;
PLZ- und Gemeinde-Treffer rasten auf die gleichnamige Ortschaft ein (in der Liste als «→ Ortszentrum»
gekennzeichnet). Enter wählt den besten Treffer, die Pfeiltasten wechseln die Auswahl.

## Wie aktuell sind die Daten?

Die App speichert keine Wald- und Höhendaten zwischen: bei jeder Analyse werden sie frisch von geo.admin.ch
geladen (`current`-Zeitstempel in WMTS/WMS). Neue Bundesdaten sind also automatisch drin, ohne Codeänderung.
Die Datensätze selbst werden aber in Zyklen nachgeführt, nicht laufend:

| Datensatz | Nachführung |
|---|---|
| Waldmischungsgrad LFI | aus Sentinel-Bildstapeln der Vorjahre modelliert, Datenstand 2023 |
| swissALTI3D | Sechsjahreszyklus, pro Jahr wird ein Sechstel der Schweiz neu erfasst |
| Geologie GK500 | Übersichtskarte 1:500'000, praktisch unveränderlich (lokal zwischengespeichert) |
| Wetter (Open-Meteo) | stündlich, in der App 30 Minuten zwischengespeichert |

**Konkret:** Eine Abholzung, ein Sturmschaden oder ein Borkenkäferbefall aus den letzten Monaten steckt noch
nicht in den Walddaten – der Kahlschlag erscheint erst mit dem nächsten Datenupdate des Bundes. Zur Kontrolle
lassen sich das Luftbild und die Vegetationshöhe als Layer einblenden. Über «Zwischenspeicher leeren» in den
Einstellungen werden die lokal gespeicherten Geologie- und Wetterdaten verworfen.

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
