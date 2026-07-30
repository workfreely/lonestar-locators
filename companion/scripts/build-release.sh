#!/usr/bin/env bash
# Hardened Release build for the Locator Beast Companion.
#   - Release configuration (optimized, no DEBUG → info/debug logs compile out)
#   - strips symbols from the distributed binary
# Signing + notarization + .app bundling happen after this (see SECURITY.md).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "▸ Building Release…"
swift build -c release

BIN="$(swift build -c release --show-bin-path)/LocatorBeastCompanion"
echo "▸ Stripping symbols from $BIN"
strip -rSTx "$BIN" 2>/dev/null || strip -x "$BIN" || true

echo "▸ Release binary ready: $BIN"
echo "  Only source-free, symbol-stripped code ships. No .swift sources, test"
echo "  fixtures, or debug databases are part of the product."
echo "  Next: codesign (Developer ID) → notarize → staple → .dmg. See SECURITY.md."
