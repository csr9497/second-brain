#!/usr/bin/env bash
# App de Mac (docs/APP-MAC.md). Uso: scripts/mac.sh build|run|install|test [dev]
# Por defecto la web usa apps/web/.env.native.local; con `dev`, las variables de apps/web/.env.dev.local (Supabase dev).
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
if [ "${2:-}" = dev ]; then
  # Las variables del entorno tienen prioridad sobre los archivos .env de Vite
  set -a; . "$raiz/apps/web/.env.dev.local"; set +a
fi
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
  test) xcb test 2>&1 | grep -E "error:|Test Case.*failed|Executed|TEST (SUCCEEDED|FAILED)" ;;
  *) echo "uso: scripts/mac.sh build|run|install|test [dev]" >&2; exit 1 ;;
esac
