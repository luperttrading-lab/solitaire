#!/usr/bin/env python3
"""Kostentabelle für Claude Code: Claude neben jedem weiteren Dienst, Datum und Uhrzeit in der Kopfzeile.

Aufruf:  python3 tools/kostentabelle.py [-v] [--ttl5]
  -v      zusätzlich Summen je Tag und je Modell
  --ttl5  Cache-Schreibpreis für 5-Minuten-Cache statt 1 Stunde

Fremdkosten (Bildgenerierung, Hosting, fremde APIs) kommen aus tools/fremdkosten.json:
  [{"ts": "2026-09-08T17:20:00Z", "usd": 0.34, "dienst": "RouteLLM", "was": "gpt_image2 Panda"}, ...]
Für jeden Namen unter "dienst" entsteht automatisch eine Spalte. Fehlt die Datei, bleibt es bei
der Claude-Spalte.

Korrekturen gegenüber der Erstfassung (September 2026):
 1. Modellnamen per Präfix. Im Protokoll steht z. B. 'claude-haiku-4-5-20251001'; exaktes .get()
    greift dort nicht und fällt auf den Opus-Preis zurück – Faktor 5 zu teuer.
 2. Zeitzone über zoneinfo statt fester UTC+2 (Zeitumstellung).
 3. Kein Absturz ohne Protokoll, ohne lesbare fremdkosten.json und bei kaputten Beträgen.
 4. Dienste ohne Betrag ("usd": null) werden VOR dem Kürzen auf drei Spalten einsortiert. Vorher
    konnte ein Dienst gleichzeitig in „Sonstige" stecken und als leere Spalte auftauchen – und die
    Tabelle wurde breiter als die erlaubten drei Zusatzspalten.
 5. Zeitstempel werden als Datum verglichen, nicht als Zeichenkette. Ein Eintrag mit '+02:00'
    statt 'Z' wurde vorher stillschweigend der falschen Frage zugeordnet.

Unverändert wichtig:
 1. Jede Nachricht EINMAL zählen (nach message.id entdoppeln) – sonst etwa das Dreifache.
 2. „diese Frage" = alle Antworten ab dem letzten ECHTEN Nutzerbeitrag; Werkzeugergebnisse
    stehen im Protokoll ebenfalls als `user`, zählen aber nicht als Frage.
"""
import json, os, glob, collections, datetime, sys

try:
    from zoneinfo import ZoneInfo
    ZONE = ZoneInfo("Europe/Berlin")
except Exception:
    ZONE = datetime.timezone(datetime.timedelta(hours=2))

# $ je Million Token: Eingabe, Ausgabe, Cache schreiben (1 h / 5 min), Cache lesen
PREISE = {
    'claude-fable-5-1': (10, 50, 20.0, 12.5, 0.25),
    'claude-opus-5':    (5,  25, 10.0,  6.25, 0.5),
    'claude-sonnet-5':  (2,  10,  4.0,  2.5,  0.2),
    'claude-haiku-4-5': (1,   5,  2.0,  1.25, 0.1),
}
STD  = (5, 25, 10.0, 6.25, 0.5)                 # Rückfall für unbekannte Modelle
TTL5 = '--ttl5' in sys.argv                     # Standard: 1-Stunden-Cache

base = os.path.expanduser('~/.claude/projects')
slug = os.getcwd().replace('/', '-')
files = glob.glob(f'{base}/{slug}/*.jsonl') or glob.glob(f'{base}/*/*.jsonl')
if not files:
    print("Kein Sitzungsprotokoll unter ~/.claude/projects gefunden – "
          "keine Kostentabelle möglich (falsches Verzeichnis oder andere Umgebung).")
    sys.exit(1)
f = max(files, key=os.path.getmtime)

def zeit(ts):
    """ISO-Zeitstempel -> aware datetime, egal ob 'Z' oder '+02:00'. None bei Müll."""
    try:
        d = datetime.datetime.fromisoformat((ts or '').replace('Z', '+00:00'))
        return d if d.tzinfo else d.replace(tzinfo=datetime.timezone.utc)
    except Exception:
        return None

seen, last_user = {}, None
for line in open(f):
    try: d = json.loads(line)
    except: continue
    t, m = d.get('type'), d.get('message', {})
    if t == 'user':                             # nur echte Nutzerfragen, keine Werkzeugergebnisse
        c = m.get('content')
        if isinstance(c, str) or (isinstance(c, list)
                and any(b.get('type') == 'text' for b in c if isinstance(b, dict))
                and not any(b.get('type') == 'tool_result' for b in c if isinstance(b, dict))):
            last_user = zeit(d.get('timestamp'))
    if t == 'assistant' and m.get('usage'):     # je Nachricht nur die letzte Fassung zählen
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

def lokal(ts):                                  # Tagesgrenze in Ortszeit, nicht in UTC
    d = zeit(ts)
    return d.astimezone(ZONE).strftime('%Y-%m-%d') if d else ''

def ab_frage(ts):
    d = zeit(ts)
    return bool(last_user and d and d >= last_user)

c_ges   = sum(cost(mo, u) for _, mo, u in seen.values())
c_heute = sum(cost(mo, u) for ts, mo, u in seen.values() if lokal(ts) == heute_lokal)
c_frage = sum(cost(mo, u) for ts, mo, u in seen.values() if ab_frage(ts))

# Weitere Spalten aus selbst gepflegten Fremdkosten
fremd = collections.defaultdict(lambda: [0.0, 0.0, 0.0])   # Dienst -> [Frage, heute, gesamt]
offen = set()                                              # Dienste mit Einträgen ohne Betrag
for datei, standard in (('fremdkosten.json', None), ('routellm.json', 'RouteLLM')):
    try: eintraege = json.load(open(os.path.join('tools', datei)))
    except Exception: continue
    if not isinstance(eintraege, list): continue
    for e in eintraege:
        if not isinstance(e, dict): continue
        name = e.get('dienst') or standard or 'Sonstige'
        ts = e.get('ts', '')
        try:
            usd = float(e['usd'])
        except (KeyError, TypeError, ValueError):
            offen.add(name); fremd[name]       # Spalte anlegen, Betrag fehlt
            continue
        d = fremd[name]
        d[2] += usd
        if lokal(ts) == heute_lokal: d[1] += usd
        if ab_frage(ts): d[0] += usd

# Höchstens drei Zusatzspalten; der Rest wird zu „Sonstige" zusammengefasst.
# Dienste ohne Betrag sind hier bereits enthalten, damit sie mitgekürzt werden.
dienste = sorted(fremd, key=lambda k: (-fremd[k][2], k))
if len(dienste) > 3:
    for k in dienste[3:]:
        for i in range(3): fremd['Sonstige'][i] += fremd[k][i]
        if k in offen: offen.discard(k); offen.add('Sonstige')
        del fremd[k]
    dienste = dienste[:3] + ['Sonstige']

de = lambda x: f'{x:.2f}'.replace('.', ',')
ct = lambda x: f'{x*100:.1f}'.replace('.', ',')
# Einheit je Spalte: Dollar, sobald der Gesamtwert der Spalte einen Dollar erreicht, sonst Cent
def zelle(wert, gesamt): return f'{de(wert)} $' if gesamt >= 1 else f'{ct(wert)} ct'

kopf  = [jetzt.strftime('%d.%m. %H:%M'), 'Claude'] + [d + ' ?' if d in offen else d for d in dienste]
zeile = ['diese Frage', 'heute', 'dieser Chat']
werte = [[c_frage, c_heute, c_ges]] + [fremd[d] for d in dienste]
print('| ' + ' | '.join(kopf) + ' |')
print('|---' + '|---:' * (len(kopf) - 1) + '|')
for r in range(3):
    zellen = [zelle(werte[s][r], werte[s][2]) for s in range(len(werte))]
    print(f'| {zeile[r]} | ' + ' | '.join(zellen) + ' |')

if '-v' in sys.argv:
    days, mods = collections.Counter(), collections.Counter()
    for ts, mo, u in seen.values():
        days[lokal(ts)] += cost(mo, u); mods[mo] += cost(mo, u)
    print()
    print('Tage:   ', {d: round(c, 2) for d, c in sorted(days.items())})
    print('Modelle:', {m: round(c, 2) for m, c in mods.items()})
