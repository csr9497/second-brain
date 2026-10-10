#!/usr/bin/env bash
# App de Mac (docs/APP-MAC.md). Uso: scripts/mac.sh build|run|install|test
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
proyecto="$raiz/apps/mobile/ios/App"
dd=/tmp/sb-mac-dd

web() {
  pnpm --filter @sb/web exec vite build --mode native
  rm -rf "$proyecto/Mac/public"
  cp -R "$raiz/apps/web/dist" "$proyecto/Mac/public"
}

xcb() {
  xcodebuild -project "$proyecto/App.xcodeproj" -scheme SecondBrainMac -destination 'platform=macOS' \
    -derivedDataPath "$dd" -allowProvisioningUpdates "$@"
}

case "${1:-}" in
  build) web ;;
  run)
    web
    xcb -configuration Debug build | tail -3
    open "$dd/Build/Products/Debug/Second Brain.app"
    ;;
  install)
    web
    xcb -configuration Release build | tail -3
    osascript -e 'quit app "Second Brain"' 2>/dev/null || true
    rm -rf "/Applications/Second Brain.app"
    ditto "$dd/Build/Products/Release/Second Brain.app" "/Applications/Second Brain.app"
    open "/Applications/Second Brain.app"
    ;;
  test) xcb test | tail -20 ;;
  *) echo "uso: scripts/mac.sh build|run|install|test" >&2; exit 1 ;;
esac
