# Solitaire – Steckbrett-Solitär als Spiel- und Lernapp (iPhone, GitHub Pages)

Stand: v1.1 (11.09.2026). Eine einzige Datei `index.html`, kein Build, keine Abhängigkeiten.
Autor/Product Owner: Lutz („Neo"). Sprache im Chat und in der App: Deutsch, per Du.

## Was die App kann
- 6 Bretter (Englisch 33, Europäisch 37 mit Start (0,2), Wiegleb 45, Dreieck 15/21, Quadrat 25), alle mit verifizierter 1-Stein-Lösung (Eröffnungsbuch `OPENING_BOOK`).
- Regelkonforme Züge, Auto-Sprung bei eindeutigem Zug, Wischen/Zielfeld tippen, Zurück/Vor mit animiertem Spulen (650 ms, erst Markierung, 400 ms später der Sprung), Zeit/Zähler, Bestleistungen, Startbild 2 s.
- Tipp: exakte Suche (Bitboard-DFS mit explizitem Stapel, Symmetrie-Kanonisierung, offene Hash-Tabelle 2^24 Float64 = 134 MB). Auf dem Englischen Brett endet „ohne Limit" immer mit Beweis (Raum 23.475.688 Stellungen). Europäisch/Wiegleb: Suche bis Fund oder Abbruch.
- Trainer (Menü): bewertet nach jedem Zug, „Der letzte Zug hat das gekostet".
- Markierung (Menü): Steine, die in jeder bestmöglichen Fortsetzung stehen bleiben (aus vollständiger Absuche ohne Symmetrie, `optFinal`). Nur ≤ 24 Steine.
- Strategie-Hinweise (Knopf unter den Zählern): Fehlerklassen Reihenfolge / Falsche Richtung / Stein gestrandet / Struktur, besserer Zug, „Zurück & Zug zeigen", „Fehler suchen" (rückwärts durch die Partie bis zum ersten verlorenen Zug).
- Lektionen (Menü › Lernen): Dreier-, Sechser-, Neuner-Purge, die fünf Endfelder, Partie als Purge-Folge (`plan.json`: 2× Dreier, 3× Sechser, Endspiel 7 Züge).

## Architektur in einer Datei
- `coreFactory()` – Bretter, Züge, Symmetrien, 3-Färbungs-Parität (`parityLowerBound`, `allowedEndCells`), `createTable`, `createDFS`, `createSearch` (Neustart-Portfolio + erschöpfende Phase, `full:true` = ohne Symmetrie mit `everEmpty`/`optFinal`), `solveSmart`. Derselbe Code läuft im Web Worker (Blob-URL); scheitert der Worker (Claude-Vorschau, `data:`-URL), fällt alles auf den Hauptthread in Häppchen zurück (`runSearch`).
- Zustand `game` (pegAt mit Stein-IDs, history/future mit `jumped`), `settings` in localStorage (fehlt in `data:`-Kontexten – abgefangen).
- Rendering: SVG, Overlay-Layer für Auswahl/Tipp/Spul-Markierung/Lektionsringe; Brettgröße wird einmal berechnet (`fitStage`) und nicht vom Text darunter gequetscht.

## Gesicherte Fakten (nicht neu diskutieren)
- Europäisch mit leerer Mitte ist nie auf 1 lösbar (Parität); Raute (41) hat keine gefundene Lösung → weggelassen.
- „L-Purge" mit zurückkehrendem Hilfsstein existiert nicht (alle Varianten mit 1–2 Katalysatoren durchprobiert).
- Zählung der Suche = verschiedene Stellungen (Spiegelungen/Drehungen zusammengefasst), nicht Besuche. iPhone: ≈0,4–0,5 Mio. Stellungen/s.
- Erreichbare Stellungen zweier Beispielstellungen mit 27 Steinen: 5.717.512 und 5.965.349 (exakt, BFS = DFS).

## Konventionen von Lutz
- Lieferung immer als `index.html` UND `Solitaire_v<Version>.html` (identisch); Version in `APP_VERSION` und im Menü.
- Weitere Dateien durchnummeriert (`1-sw.js`, `2-icon.png`).
- Nie „Budget" in Nutzertexten. Statuszeile: Hauptsatz, Messwerte/Zähler in eigener Zeile darunter, einzeilig auch mit längsten Farbnamen (Bernstein/Aquamarin) – Test misst das.
- Nichts raten, was Lutz in wenigen Handgriffen prüfen kann; Diagnosen in die Ausgabe schreiben; Tests dürfen nicht dieselbe Annahme treffen wie der Code (Literaturwerte, unabhängige BFS).
- Keine Zustimmungsfloskeln; Widerspruch mit Grund.

## Tests (headless Chromium via Puppeteer, `npm i puppeteer`)
- `node tests/test_browser.js` – 76 Prüfungen (Spiel, Tipp, Trainer, Markierung, Strategie, Fehlersuche, Spulen, Textbreiten).
- `node tests/test_lessons.js`, `node tests/test_worker.js` (Worker-Ausfallszenarien), `node tests/test_full.js` (everEmpty gegen BFS), `node tests/test_table.js` (Exaktheit gegen Stellungszählung), `node tests/test_motion.js` (Animationsdauern).
- Werkzeuge: `tools/gen_book2.js` (Eröffnungsbuch neu rechnen), `tools/purge_find.js`/`purge_find2.js`/`purge_plan2.js` (Purge-Muster und Partie-Plan), `tools/count_pos2.js` (Stellungen zählen).

## Offene Ideen
- Service Worker `1-sw.js` für Offline-Betrieb; Splash-Bild aus dem Walnuss-Icon.
- Purge-Sprache in den Strategie-Hinweisen („Hilfsstein für den Sechser verbraucht") – erfordert Purge-Erkennung in beliebigen Stellungen.
- Fehlersuche für Stellungen > 26 Steine (Speicher: Tabelle größer als 2^24 nötig).
