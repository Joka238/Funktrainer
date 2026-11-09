#!/bin/bash
# BOS Funktrainer – Installation für macOS
# Aufruf im Terminal:
#   curl -fsSL https://github.com/Joka238/Funktrainer/releases/latest/download/install-mac.sh | bash
#
# Lädt die neueste Version, installiert sie in "Programme" und startet sie.
# Da die Datei nicht über den Browser geladen wird, erscheint keine Apple-Warnung.
set -euo pipefail

APP_NAME="BOS Funktrainer"
DMG_URL="https://github.com/Joka238/Funktrainer/releases/latest/download/BOS-Funktrainer.dmg"

echo ""
echo "📻  BOS Funktrainer wird installiert …"
echo ""

TMP="$(mktemp -d)"
MOUNT="$TMP/mnt"
cleanup() {
  hdiutil detach "$MOUNT" -quiet >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT

echo "→ Lade herunter (ca. 270 MB, bitte etwas Geduld) …"
curl -fL --progress-bar -o "$TMP/app.dmg" "$DMG_URL"

echo "→ Entpacke …"
mkdir -p "$MOUNT"
hdiutil attach "$TMP/app.dmg" -nobrowse -readonly -quiet -mountpoint "$MOUNT"

# Ziel: /Programme, ohne Schreibrechte ~/Programme
DEST="/Applications"
if [ ! -w "$DEST" ]; then
  DEST="$HOME/Applications"
  mkdir -p "$DEST"
fi

# Laufende alte Version beenden und ersetzen
if pgrep -xq "$APP_NAME"; then
  pkill -x "$APP_NAME" || true
  sleep 1
fi
rm -rf "$DEST/$APP_NAME.app"

echo "→ Installiere nach $DEST …"
ditto "$MOUNT/$APP_NAME.app" "$DEST/$APP_NAME.app"
xattr -dr com.apple.quarantine "$DEST/$APP_NAME.app" 2>/dev/null || true

echo ""
echo "✅  Fertig! Der Funktrainer startet jetzt."
echo "    Später findest du ihn im Ordner „$( [ "$DEST" = "/Applications" ] && echo Programme || echo "Programme (Benutzer)" )“ oder über Spotlight (⌘ + Leertaste, „Funktrainer“)."
echo ""
open "$DEST/$APP_NAME.app"
