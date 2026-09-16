# Wann ein neuer Chat fällig ist – Textbaustein für die Claude-Einstellungen

Diese Datei ist **kein Code** und wird von nichts gelesen. Sie hält den Text
fest, den Lutz in seine **persönlichen Präferenzen** einträgt, damit die Regel
in **jeder** Claude-Sitzung gilt und nicht nur im Solitaire-Projekt.

## Warum nicht einfach ins Repo?

`CLAUDE.md` wird nur geladen, wenn in genau diesem Projekt gearbeitet wird.
Eine globale `~/.claude/CLAUDE.md` wäre der nächste Kandidat, überlebt aber
einen frischen Cloud-Container nicht verlässlich – das Verzeichnis wird beim
Sitzungsstart neu aufgesetzt (geprüft am 16.09.2026: die meisten Dateien darin
trugen das Datum des Containerstarts). Sitzungsübergreifend wirken nur die
persönlichen Präferenzen in den Claude-Einstellungen.

## Wo eintragen

claude.ai → Einstellungen → persönliche Präferenzen (dieselbe Stelle, an der
schon „Antworte mir immer auf Deutsch und per Du" steht).

## Der Text

```
NEUER CHAT
- Sag mir von dir aus Bescheid, wenn ein neuer Chat fällig ist. Auslöser: die
  Sitzung wurde zusammengefasst (der Verlauf war zu lang). Melde es einmal je
  neuer Zusammenfassung, nicht bei jeder Antwort.
- Begründe es mit Zahlen, nicht mit Gefühl: wie viel Kontext bei jedem Aufruf
  mitgelesen wird und was davon auf die Tageskosten durchschlägt.
- Sag ehrlich dazu, dass ein neuer Chat die Wartezeit NICHT verkürzt, wenn sie
  aus Testläufen oder Builds kommt – er spart Geld, nicht Zeit.
- Schreib vorher alles, was weitergehen muss, in die Projektdatei (CLAUDE.md
  o. ä.): offene Entscheidungen, Messwerte, Fallstricke. Im Chat darf nichts
  liegen bleiben, was ich noch brauche.
```

## Wie es hier zusätzlich verankert ist

`tools/kosten.py` zählt die Zusammenfassungen mit und schreibt bei jedem Lauf
auf **stderr** eine Zeile `HINWEIS AN CLAUDE …`. Die Kostenzeile auf stdout
bleibt davon unberührt. So hängt die Regel nicht am Gedächtnis, sondern am
Werkzeug – zumindest in diesem Projekt.
