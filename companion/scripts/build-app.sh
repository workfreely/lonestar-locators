#!/usr/bin/env bash
# Assemble "Beast Sync.app" — a real macOS menu-bar app bundle around the existing
# Swift engine. This is what removes `swift run` from normal use: the result is
# double-clickable, installs to /Applications, and can register as a login item.
#
#   ./scripts/build-app.sh            debug build, bundle into ./dist
#   ./scripts/build-app.sh --release  optimized + symbol-stripped
#   ./scripts/build-app.sh --install  also copy into /Applications
#
# NOT notarized. Gatekeeper will need one right-click → Open on first launch
# (see the note printed at the end). Signing + notarization are the next step and
# are blocked on an Apple Developer account, not on this script.
#
# WHY IT IS AD-HOC SIGNED. macOS TCC (the thing that grants Full Disk Access)
# identifies an app by its code signature, not its path. A completely unsigned
# bundle gets a fresh identity on every rebuild, so a granted FDA permission would
# silently stop applying. Ad-hoc (`codesign -s -`) gives the bundle a real, stable
# identifier; the grant still has to be re-made if the binary itself changes, but it
# survives relaunches and reboots, which is what matters day to day.
set -euo pipefail
cd "$(dirname "$0")/.."

CONFIG="debug"
INSTALL=0
for arg in "$@"; do
  case "$arg" in
    --release) CONFIG="release" ;;
    --install) INSTALL=1 ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

APP_NAME="Beast Sync"
EXEC_NAME="BeastSync"
BUNDLE_ID="app.locatorbeast.companion"   # same identifier AppLog already uses
DIST="dist"
APP="$DIST/$APP_NAME.app"

# Version comes from the ONE place the app already defines it, so the bundle can
# never disagree with what the app reports to the server as app_version.
VERSION="$(grep -o 'appVersion = "[^"]*"' Sources/LocatorBeastCompanion/Core/Config.swift | sed 's/.*"\(.*\)"/\1/')"
if [ -z "$VERSION" ]; then echo "could not read appVersion from Config.swift" >&2; exit 1; fi

echo "▸ Building $CONFIG…"
swift build -c "$CONFIG"
BIN="$(swift build -c "$CONFIG" --show-bin-path)/LocatorBeastCompanion"
[ -f "$BIN" ] || { echo "binary not found at $BIN" >&2; exit 1; }

if [ "$CONFIG" = "release" ]; then
  echo "▸ Stripping symbols…"
  cp "$BIN" "$BIN.stripped"
  strip -rSTx "$BIN.stripped" 2>/dev/null || strip -x "$BIN.stripped" || true
  BIN="$BIN.stripped"
fi

echo "▸ Assembling $APP…"
rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
cp "$BIN" "$APP/Contents/MacOS/$EXEC_NAME"
chmod +x "$APP/Contents/MacOS/$EXEC_NAME"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>$APP_NAME</string>
  <key>CFBundleDisplayName</key><string>$APP_NAME</string>
  <key>CFBundleIdentifier</key><string>$BUNDLE_ID</string>
  <key>CFBundleExecutable</key><string>$EXEC_NAME</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>$VERSION</string>
  <key>CFBundleVersion</key><string>$VERSION</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <!-- Menu-bar only: no Dock icon, no app switcher entry. The code also calls
       setActivationPolicy(.accessory) so the dev path behaves the same.
       NOTE: no backticks anywhere in this heredoc. The delimiter is unquoted so
       that $APP_NAME / $VERSION expand, which means backticks would be command
       substitution — a backticked "swift run" in this comment previously made the
       build launch the GUI app and hang forever. -->
  <key>LSUIElement</key><true/>
  <key>NSHumanReadableCopyright</key><string>Locator Beast</string>
  <!-- Beast Sync reads the local Messages database; it never sends anything from
       Messages on its own. Shown by macOS if it ever prompts for Automation. -->
  <key>NSAppleEventsUsageDescription</key>
  <string>Beast Sync uses Messages to send texts you have approved in Locator Beast.</string>
</dict>
</plist>
PLIST

# PkgInfo is legacy but cheap, and some Finder/launch paths still read it.
printf 'APPL????' > "$APP/Contents/PkgInfo"

echo "▸ Ad-hoc signing (stable TCC identity — see header)…"
codesign --force --sign - --identifier "$BUNDLE_ID" "$APP" >/dev/null 2>&1 || {
  echo "  codesign failed; the bundle still runs but Full Disk Access may not persist across rebuilds" >&2
}
codesign --verify --verbose=1 "$APP" 2>&1 | sed 's/^/  /' || true

if [ "$INSTALL" = "1" ]; then
  echo "▸ Installing to /Applications…"
  # Quit a running copy first, or the replace fails while the binary is mapped.
  pkill -x "$EXEC_NAME" 2>/dev/null || true
  sleep 1
  rm -rf "/Applications/$APP_NAME.app"
  cp -R "$APP" "/Applications/$APP_NAME.app"
  echo "  installed: /Applications/$APP_NAME.app"
fi

echo ""
echo "▸ Done: $APP  (v$VERSION, $CONFIG)"
echo ""
echo "FIRST LAUNCH — the bundle is ad-hoc signed, not notarized, so Gatekeeper will"
echo "block a normal double-click. Once only:"
echo "   right-click \"$APP_NAME.app\" → Open → Open"
echo "After that it double-clicks normally, and \"Launch at Login\" in its menu keeps"
echo "it running without any Terminal."
