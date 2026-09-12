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
- Rendering: SVG, Overlay-Layer für Auswahl/Tipp/Spul-Markierung/Lektionsringe; Brettgröße aus `fitStage` (nutzbare Höhe ohne Schutzränder). `ensureStatusFits()` misst nach jeder Meldung im Gerät nach und gibt Brettfläche nur ab, wenn die Zeile sonst hinter der Fußleiste läge – nur nach unten, damit das Brett im Spiel nicht springt.

## Gesicherte Fakten (nicht neu diskutieren)
- Europäisch mit leerer Mitte ist nie auf 1 lösbar (Parität); Raute (41) hat keine gefundene Lösung → weggelassen.
- „L-Purge" mit zurückkehrendem Hilfsstein existiert nicht (alle Varianten mit 1–2 Katalysatoren durchprobiert).
- Zählung der Suche = verschiedene Stellungen (Spiegelungen/Drehungen zusammengefasst), nicht Besuche. iPhone: ≈0,4–0,5 Mio. Stellungen/s.
- Erreichbare Stellungen zweier Beispielstellungen mit 27 Steinen: 5.717.512 und 5.965.349 (exakt, BFS = DFS).

## Konventionen von Lutz
- Eine ausgelieferte Datei: `index.html`. Version in `APP_VERSION` und im Menü; jeder Stand bekommt zusätzlich ein Git-Tag (`v1.1`). Keine versionierte Zweitkopie im Repo – Git hält die Stände.
- Weitere Dateien durchnummeriert (`1-sw.js`, `2-icon.png`).
- Nie „Budget" in Nutzertexten. Statuszeile: links eine **Ampel mit drei Lichtern** (24 × 60 px; rot = nicht mehr erreichbar, gelb = nicht bewertbar, grün = 1 Stein erreichbar; ohne Bewertung alle gedimmt; beim Rechnen läuft das Licht von oben nach unten durch und bleibt danach auf der zutreffenden Farbe stehen – `zeigeRechnet()` hängt daran, dass gerechnet wird, **nicht** an der Trainer-Einstellung), in der Mitte zwei Zeilen – oben fest die Steinzahl (`ankerText()`, wird von `render()` nachgezogen), darunter die Meldung in Kurzfassung –, rechts der Knopf zum Blatt (34 px, Winkel nach oben als eigenes SVG – das Zeichen ℹ wird von iOS als blaues Emoji gerendert und ist deshalb unbrauchbar). Ampelpunkt und Knopf stehen auf Höhe der **unteren** Zeile, nicht mittig über beiden. Eine Meldung, die nur die Steinzahl wiederholt, lässt die untere Zeile leer, damit dort nichts flackert. Die untere Zeile ist **hart einzeilig** (`white-space:nowrap` mit Auslassungspunkten) – sonst wandert die Steinzahl beim Wechsel der Meldungen nach oben, und genau diese Unruhe soll die Zeile nicht haben. Schriftgröße 15 px (Steinzahl 16 px) – mehr passt nicht, die Textsäule hat zwischen Ampel und Knopf nur rund 244 px. Kein Wort *Fehler* in Kurzfassungen – das liest sich wie eine Störungsmeldung des Programms; `KURZ_KLASSE` sagt stattdessen, was im Spiel passiert ist (Zu früh – erst etwas anderes / Andere Richtung wäre richtig / Ein Stein strandet / Lücke an wichtiger Stelle). Kurzfassungen höchstens 32 Zeichen; für die häufigen Meldungen als letztes Argument von `setStatus` explizit gesetzt („1 Stein bleibt erreichbar", „Bestenfalls N Steine", „Fehler: <Klasse>", „Noch nicht bewertbar"). Zusätzlich zur Ampel läuft unter der Zeile ein Band durch (`#rechenband`), damit auch ein kurzer Rechenschritt sichtbar ist; der Text bleibt dabei stehen. Begründung, Zusatzzeile und Aktionen stehen im Blatt `#detail`, das ein Tippen auf die Zeile öffnet; `statusFullText()` liefert den vollen Wortlaut. So bleibt das Brett so groß, wie die Bildschirmbreite erlaubt (iPhone 14 Pro: 369 px).
- Nichts raten, was Lutz in wenigen Handgriffen prüfen kann; Diagnosen in die Ausgabe schreiben; Tests dürfen nicht dieselbe Annahme treffen wie der Code (Literaturwerte, unabhängige BFS).
- Keine Zustimmungsfloskeln; Widerspruch mit Grund.

## Tests (headless Chromium via Puppeteer, einmal `npm install`)
- `npm test` – alle sieben Suiten nacheinander; jede meldet Fehler über den Exit-Code. Einzeln z. B. `npm run test:browser`.
- `node tests/test_browser.js` – 76 Prüfungen (Spiel, Tipp, Trainer, Markierung, Strategie, Fehlersuche, Spulen, Textbreiten).
- `node tests/test_lessons.js`, `node tests/test_worker.js` (Worker-Ausfallszenarien), `node tests/test_full.js` (everEmpty gegen BFS), `node tests/test_table.js` (Exaktheit gegen Stellungszählung), `node tests/test_motion.js` (Animationsdauern: Zug 230 ms, Spulen 400 ms Vorlauf + 650 ms), `node tests/test_layout.js` (nichts verschwindet hinter der Fußleiste, über sechs Geräte- und Schriftgrößen; Brett springt nicht; Ampel ≥ 20 px, Knopf ≥ 30 px, keine Zeichenreste im sichtbaren Text, Steinzahl steht fest und wandert beim Wechsel der Meldungen nicht, untere Zeile bleibt einzeilig, Laufband kommt und geht).
- Werkzeuge: `tools/gen_book2.js` (Eröffnungsbuch neu rechnen), `tools/purge_find.js`/`purge_find2.js`/`purge_plan2.js` (Purge-Muster und Partie-Plan), `tools/count_pos2.js` (Stellungen zählen), `tools/exp_parity.js` (Paritätsschranke prüfen). Ergebnisse liegen als `tools/patterns.json` (Purge-Muster) und `tools/plan.json` (Partie als Purge-Folge) daneben.

## Offene Ideen
- Service Worker `1-sw.js` für Offline-Betrieb; Splash-Bild aus dem Walnuss-Icon.
- Purge-Sprache in den Strategie-Hinweisen („Hilfsstein für den Sechser verbraucht") – erfordert Purge-Erkennung in beliebigen Stellungen.
- Fehlersuche für Stellungen > 26 Steine (Speicher: Tabelle größer als 2^24 nötig).
