#!/usr/bin/env python3
"""Kostenzeile für Claude Code: liest das Sitzungsprotokoll und gibt eine kurze Zeile aus.

Aufruf:  python3 tools/kosten.py [-v] [--ttl5]
  -v      zusätzlich Summen je Tag und je Modell
  --ttl5  Cache-Schreibpreis für 5-Minuten-Cache statt 1 Stunde

Korrekturen gegenüber der Erstfassung (September 2026):
 1. Modellnamen werden per Präfix gematcht. Im Protokoll steht z. B.
    'claude-haiku-4-5-20251001'; exaktes .get() greift dort nicht und fällt auf
    den Opus-Preis zurück – Faktor 5 zu teuer.
 2. Zeitzone über zoneinfo statt fester UTC+2, damit die Tagesgrenze auch nach
    der Zeitumstellung stimmt.
 3. Kein Absturz, wenn kein Protokoll gefunden wird – stattdessen ein Hinweis.

Unverändert wichtig:
 - Jede Nachricht wird EINMAL gezählt (nach message.id entdoppeln).
 - „Letzte Frage" = alle Antworten ab dem letzten ECHTEN Nutzerbeitrag;
   Werkzeugergebnisse stehen im Protokoll ebenfalls als `user`.

Korrektur vom 16.09.2026 (gefunden von Lutz):
 4. Nicht jeder `user`-Eintrag mit Text ist eine Frage von Lutz. Hintergrund-
    Benachrichtigungen (`<task-notification>`), System-Erinnerungen und die
    Meldung beim Zusammenfassen der Sitzung („This session is being
    continued…") sehen im Protokoll genauso aus und setzten den Zähler
    „Frage" zurück. Gemessen am 16.09.2026: um 08:49 Uhr stand „Frage 0,79 ·
    heute 12,14", obwohl die 12,14 zur selben Antwort gehörten – die
    Benachrichtigung dazwischen hatte den Schnitt gesetzt. Deshalb zählt ein
    Eintrag nur, wenn mindestens ein Textblock nicht mit `<` oder `[`
    beginnt.
"""
import json, os, glob, collections, datetime, sys

try:
    from zoneinfo import ZoneInfo
    ZONE = ZoneInfo("Europe/Berlin")
except Exception:                                # sehr alte Python-Version
    ZONE = datetime.timezone(datetime.timedelta(hours=2))

# $ je Million Token: Eingabe, Ausgabe, Cache schreiben (1 h / 5 min), Cache lesen
PREISE = {
    'claude-fable-5-1': (10, 50, 20.0, 12.5, 0.25),
    'claude-opus-5':    (5,  25, 10.0,  6.25, 0.5),
    'claude-sonnet-5':  (2,  10,  4.0,  2.5,  0.2),
    'claude-haiku-4-5': (1,   5,  2.0,  1.25, 0.1),
}
STD = (5, 25, 10.0, 6.25, 0.5)                   # Rückfall für unbekannte Modelle
TTL5 = '--ttl5' in sys.argv                      # Standard: 1-Stunden-Cache

base = os.path.expanduser('~/.claude/projects')
slug = os.getcwd().replace('/', '-')
files = glob.glob(f'{base}/{slug}/*.jsonl') or glob.glob(f'{base}/*/*.jsonl')
if not files:
    print("Kein Sitzungsprotokoll unter ~/.claude/projects gefunden – "
          "keine Kostenzeile möglich (falsches Verzeichnis oder andere Umgebung).")
    sys.exit(1)
f = max(files, key=os.path.getmtime)

def echt(text):
    """Wahr, wenn der Textblock von Lutz stammt und nicht vom Gerüst.

    Benachrichtigungen und Erinnerungen beginnen mit `<` (`<task-notification>`,
    `<system-reminder>`, `<wake …>`) oder mit `[` (`[SYSTEM NOTIFICATION …]`);
    die Meldung beim Zusammenfassen beginnt mit ihrem eigenen Satz."""
    t = (text or '').strip()
    return bool(t) and t[0] not in '<[' and not t.startswith(
        'This session is being continued')


seen, last_user, faltungen = {}, None, 0
for line in open(f):
    try: d = json.loads(line)
    except: continue
    t, m = d.get('type'), d.get('message', {})
    if t == 'user':                              # Zusammenfassungen mitzählen
        cc = m.get('content')
        for b in ([cc] if isinstance(cc, str) else
                  [x.get('text', '') for x in cc
                   if isinstance(x, dict) and x.get('type') == 'text']
                  if isinstance(cc, list) else []):
            if (b or '').strip().startswith('This session is being continued'):
                faltungen += 1
    if t == 'user':                              # nur echte Nutzerfragen
        c = m.get('content')
        bloecke = ([c] if isinstance(c, str) else
                   [b.get('text', '') for b in c if isinstance(b, dict) and b.get('type') == 'text']
                   if isinstance(c, list) else [])
        werkzeug = isinstance(c, list) and any(
            b.get('type') == 'tool_result' for b in c if isinstance(b, dict))
        if bloecke and not werkzeug and any(echt(b) for b in bloecke):
            last_user = d.get('timestamp')
    if t == 'assistant' and m.get('usage'):      # je Nachricht nur die letzte Fassung
        seen[m.get('id') or d.get('uuid')] = (d.get('timestamp', ''), m.get('model'), m['usage'])

def preise(model):
    model = model or ''
    for key, p in PREISE.items():
        if model.startswith(key):
            return p
    return STD

def cost(model, u):
    p = preise(model)
    cw = p[3] if TTL5 else p[2]
    return ((u.get('input_tokens', 0) or 0) * p[0]
            + (u.get('output_tokens', 0) or 0) * p[1]
            + (u.get('cache_creation_input_tokens', 0) or 0) * cw
            + (u.get('cache_read_input_tokens', 0) or 0) * p[4]) / 1e6

jetzt = datetime.datetime.now(ZONE)
heute_lokal = jetzt.strftime('%Y-%m-%d')
def lokal(ts):
    try: return (datetime.datetime.fromisoformat(ts.replace('Z', '+00:00'))
                 .astimezone(ZONE).strftime('%Y-%m-%d'))
    except: return ''

tot   = sum(cost(mo, u) for _, mo, u in seen.values())
heute = sum(cost(mo, u) for ts, mo, u in seen.values() if lokal(ts) == heute_lokal)
frage = sum(cost(mo, u) for ts, mo, u in seen.values() if last_user and ts >= last_user)
de = lambda x: f'{x:.2f}'.replace('.', ',')
print(f"<sub>{jetzt.strftime('%d.%m. %H:%M')} Uhr · Frage {de(frage)} · "
      f"heute {de(heute)} · ges. {de(tot)} $</sub>")

# Wann ein neuer Chat fällig ist. Die Zusammenfassung ist das harte Signal:
# ab da ist der Kontext voll, sie wiederholt sich und kostet jedes Mal erneut
# (am 16.09.2026 gemessen: 5,77 $ für eine einzige Faltung). Der Hinweis geht
# auf stderr, damit die Kostenzeile auf stdout die eine Zeile bleibt, die
# unter die Antwort gehört.
GRENZE_GESAMT = 50.0
if faltungen or tot > GRENZE_GESAMT:
    grund = (f'{faltungen}. Zusammenfassung der Sitzung' if faltungen
             else f'Sitzung über {GRENZE_GESAMT:.0f} $')
    print(f'HINWEIS AN CLAUDE (nicht an die Antwort anhängen): {grund}, '
          f'bisher {de(tot)} $ gesamt. Neuen Chat empfehlen – aber nur, wenn '
          f'die Zahl der Zusammenfassungen seit der letzten Empfehlung '
          f'gestiegen ist. Faltungen={faltungen}', file=sys.stderr)

if '-v' in sys.argv:
    days, mods = collections.Counter(), collections.Counter()
    for ts, mo, u in seen.values():
        days[lokal(ts)] += cost(mo, u); mods[mo] += cost(mo, u)
    print('Tage:   ', {d: round(c, 2) for d, c in sorted(days.items())})
    print('Modelle:', {m: round(c, 2) for m, c in mods.items()})
