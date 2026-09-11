#!/bin/bash
# Richtet die Testumgebung einer frischen Sitzung ein: Abhaengigkeiten
# installieren, ohne dass puppeteer sein eigenes Chromium herunterlaedt, und
# den bereits vorhandenen Browser fuer die Suiten bekannt machen.
set -euo pipefail

# Nur in der Cloud-Sitzung. Lokal bringt jeder seine eigene Umgebung mit.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

# Vorinstallierten Chromium suchen: erst der stabile Symlink, dann eine
# konkrete Version, zuletzt ein Browser aus dem Systempfad.
chrom=""
for p in "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}/chromium" \
         "${PLAYWRIGHT_BROWSERS_PATH:-/opt/pw-browsers}"/chromium-*/chrome-linux/chrome; do
  if [ -x "$p" ]; then chrom="$p"; break; fi
done
if [ -z "$chrom" ]; then
  chrom="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
fi

# Ohne Download installieren; der Browser ist bereits da.
export PUPPETEER_SKIP_DOWNLOAD=1
npm install --no-audit --no-fund

if [ -n "$chrom" ]; then
  echo "Chromium: $chrom"
  if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
    {
      echo "export PUPPETEER_SKIP_DOWNLOAD=1"
      echo "export PUPPETEER_EXECUTABLE_PATH=\"$chrom\""
    } >> "$CLAUDE_ENV_FILE"
  fi
else
  echo "WARNUNG: kein Chromium gefunden – die Browser-Suiten werden scheitern." >&2
fi

echo "Bereit: npm test startet alle sechs Suiten."
