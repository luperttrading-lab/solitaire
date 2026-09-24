# Ideenlager

Geparkte Prototypen: gebaut, am Gerät angesehen und bewusst **nicht** in die App eingebaut.
Jede Seite läuft eigenständig und liest nur die Bilder der App (`../3-holz.jpg`, `../3-brett.jpg`).
`index.html` hängt an nichts von hier ab.

Aufruf auf dem iPhone: `https://luperttrading-lab.github.io/solitaire/ideenlager/<name>.html`

---

## Flüssigkeit unter dem Brett – `fluessigkeit.html`

**Geparkt am 24.09.2026.** Lutz: „Das hast du sehr gut umgesetzt mit der Flüssigkeit … als Untergrund
wird es zu unruhig. Finde den ganzen Effekt aber gut. Vielleicht brauchen wir das später.“

### Was sie tut
- Eine zähe grüne Flüssigkeit (wahlweise Honig oder Quecksilber) liegt in einer Wanne unter der ganzen
  quadratischen Spielfläche. Das Foto-Brett liegt darüber, und seine Löcher sind die Gucklöcher.
- Die Neigung des Handys (`deviceorientation`) lässt sie fließen. Bei kräftigem Kippen teilt sie sich
  und fließt danach wieder zusammen.
- Unter iOS braucht der Sensor eine Freigabe per Tipp („Neigung einschalten“) und https. Ohne Sensor
  gibt es zwei Schieberegler als Ersatz.

### Technik
- **Physik:** Teilchenflüssigkeit nach Clavet, Beaudoin, Poulin (2005), „Particle-based Viscoelastic
  Fluid Simulation“.
  - Doppel-Dichte-Relaxation: Druck + Nahdruck. Der Nahdruck hält die Masse zusammen und wirkt wie
    Oberflächenspannung.
  - Viskositätsimpulse und leichte Dämpfung.
  - Nachbarsuche über ein Raster.
  - Grundwerte: 1300 Teilchen, Wechselwirkungsradius `h` = 34 Einheiten, Wanne 72…768 in
    Brettkoordinaten (viewBox 840).
- **Zeichnen:**
  - Ein Metaball-Feld von 210 × 210 Punkten mit dem Kern (1 − r²/R²)², R = 30, Schwelle 1,1.
  - Die Höhe steigt über dem Feld als **Viertelkreis**: innen flach, am Rand rund gewölbt. Mit linearer
    Höhe stand das Teilchenraster als Punktmuster in der Oberfläche.
  - Licht kommt von oben links, diffus + Glanzpunkt (Exponent 24).
  - Das Brett liegt als `<mask>` mit ausgeschnittenen Löchern darüber, mit einem radialen
    Tiefenschatten je Loch.
- **Kosten** (gemessen): 1,8 ms Physik + 3,0 ms Zeichnen je Bild. Offen ist der Akku, denn die Rechnung
  läuft in jedem Bild.

### Stellschrauben
| Größe | Wert | Wirkung |
|---|---|---|
| `G` | 0,6 je Schritt bei voller Neigung | 0,12 war fünfmal zu träge (15° über 2,5 s ergaben nur 58 Einheiten Weg) |
| Empfindlichkeit | Sanft 0,3 · Stark 0,7 | Faktor auf `G` |
| Zähigkeit `sig`/`beta`/`damp` | zäh 0,3/0,05/0,014 · **mittel 0,1/0,02/0,006** · weich 0,05/0,01/0,003 | zäh teilt sich nie; mittel teilt sich bei kräftigem Kippen in 2–3 Teile; weich schon bei sanftem in bis zu 5 |
| `VMAX` | 14 Einheiten je Schritt | Sicherung gegen Explodieren |
| Bezug | „ab deiner Haltung“ (Standard) / „echte Schwerkraft“ | Die Haltung beim Einschalten gilt als waagerecht |

### Fallstricke, einmal erlebt
- **Im Browser explodierte die Rechnung, ohne Browser nicht.**
  - Ursache: Hinkt der Browser nach, wird ein Schritt zwei Bilder lang. Die Relaxation wächst mit dt²
    und verträgt das nicht; nach 0,8 s stand NaN.
  - Jetzt: Teilschritte von höchstens einem Bild, dazu die Geschwindigkeitsgrenze. Ungültige Teilchen
    werden zurückgesetzt.
- **Headless-Screenshots zeigten ein veraltetes Canvas.** Gemessen wird deshalb über `toDataURL`/`getImageData`.
- **Eine quadratische Startform blieb stehen.** Die Flüssigkeit startet deshalb als runder Tropfen
  (Sonnenblumen-Anordnung).
- Für Tests ist die Neigung von außen setzbar: `window.neigung(gx, gy)`.

### Werkzeug – `fluessigkeit-werkzeug/`
Dieselbe Physik in Node, zum Abstimmen ohne Browser:
- `sim.js` enthält den Kern (`neueFluessigkeit(opt)`, `schritt(gx, gy, dt)`).
- `teil.js` zählt Klumpen bei schnellem Wechsel der Neigung. So sind die drei Zähigkeiten eingestellt.
  Aufruf: `node teil.js`.
- `tune.js` ist ein älterer Lauf (Fläche, Schwerpunkt, Klumpen) aus der Anfangsphase.

Achtung: `sim.js` ist der Stand beim Abstimmen. Die Seite hat danach noch Teilschritte, `VMAX` und den
NaN-Schutz bekommen. Maßgeblich ist die Physik in `fluessigkeit.html`.

### Wiederbeleben
Denkbare Verwendungen, keine davon entschieden:
- ein ruhigerer Untergrund (zäh, wenig Teilchen, nur leichtes Wogen);
- ein Effekt nur beim Sieg oder im Startbild statt dauerhaft;
- ein eigenes Thema.

Beim Einbau zu klären:
1. Im Spiel zeigen nur **leere** Löcher etwas; die Murmeln decken den Rest.
2. Der Akku: nur rechnen, solange sich etwas bewegt, oder die Bildrate senken.
3. Die Sensorfreigabe braucht eine Berührung, also einen Schalter im Menü.
4. Die Lochmitten: Der Prototyp nutzt die korrigierten Werte `x0` 164,4 / `y0` 157,8. In `index.html`
   stehen noch 153,3 / 145,8 (siehe CLAUDE.md, „Lochversatz im Foto-Brett“).

### Vorgeschichte
- **Fassung 1:** eine Rinne unter dem Brett. Nicht gemeint.
- **Fassung 2:** 2-D-Flachwasser im kreuzförmigen Hohlraum. Die Flüssigkeit war nur als kleine Scheibe
  je Loch zu sehen, und Flachwasser kann sich nicht teilen.
- **Fassung 3:** die Teilchen, wie oben beschrieben.

Frühere Stände sind in Git zu finden: `297e05d`, `3d0c62b`, `ae90f2a`.
