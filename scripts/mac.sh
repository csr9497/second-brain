#!/usr/bin/env bash
# App de Mac (docs/APP-MAC.md). Uso: scripts/mac.sh build|run|install|test [dev]
# Sin `dev`: «Second Brain», con apps/web/.env.native.local (producción).
# Con `dev`: «Second Brain Dev», con apps/web/.env.dev.local (Supabase dev) y otro bundle id, widget, App Group y
# Keychain (SB_SUFIJO=.dev), para que nunca toque los datos de la app de producción.
set -euo pipefail
raiz="$(cd "$(dirname "$0")/.." && pwd)"
proyecto="$raiz/apps/mobile/ios/App"
dd=/tmp/sb-mac-dd
app="Second Brain"
extra=()
if [ "${2:-}" = dev ]; then
  # Las variables del entorno tienen prioridad sobre los archivos .env de Vite
  set -a; . "$raiz/apps/web/.env.dev.local"; set +a
  dd=/tmp/sb-mac-dd-dev
  app="Second Brain Dev"
  extra=(SB_SUFIJO=.dev "SB_NOMBRE= Dev")
fi

web() {
  pnpm --filter @sb/web exec vite build --mode native
  rm -rf "$proyecto/Mac/public"
  cp -R "$raiz/apps/web/dist" "$proyecto/Mac/public"
}

xcb() {
  xcodebuild -project "$proyecto/App.xcodeproj" -scheme SecondBrainMac -destination 'platform=macOS' \
    -derivedDataPath "$dd" -allowProvisioningUpdates "$@" ${extra[@]+"${extra[@]}"}
}

case "${1:-}" in
  build) web ;;
  run)
    web
    xcb -configuration Debug build | tail -3
    open "$dd/Build/Products/Debug/$app.app"
    ;;
  install)
    web
    xcb -configuration Release build | tail -3
    osascript -e "quit app \"$app\"" 2>/dev/null || true
    rm -rf "/Applications/$app.app"
    ditto "$dd/Build/Products/Release/$app.app" "/Applications/$app.app"
    open "/Applications/$app.app"
    ;;
  test) xcb test 2>&1 | grep -E "error:|Test Case.*failed|Executed|TEST (SUCCEEDED|FAILED)" ;;
  *) echo "uso: scripts/mac.sh build|run|install|test [dev]" >&2; exit 1 ;;
esac
