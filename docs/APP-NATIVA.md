# App nativa (iOS) con Live Activity: runbook

Prototipo con Capacitor que carga la web dentro de una app iOS y muestra en la pantalla de bloqueo y en la Dynamic Island una Live Activity (Variante A · Burbujas) con los hábitos de la franja y los pasos de hoy, con botones para marcarlos. Funciona con la **cuenta gratuita de Apple** (Personal Team). La PWA de Pages sigue siendo la que recibe los avisos Web Push. Diseño: `docs/superpowers/specs/2026-10-08-app-nativa-live-activity-design.md`.

## 1. Requisitos

- macOS con **Xcode 27** (iOS 17+ en el iPhone; el simulador trae iOS 27).
- XcodeGen: `brew install xcodegen`.
- Las dependencias del monorepo (`pnpm install`). Capacitor 8 entra por Swift Package Manager: no hay CocoaPods.

## 2. Variables: `apps/web/.env.native.local`

`pnpm ios:build` compila la web con `vite build --mode native`, que lee `apps/web/.env.native.local` (ignorado por git):

```bash
VITE_SUPABASE_URL=https://<ref>.supabase.co
VITE_SUPABASE_ANON_KEY=…
```

- **Simulador:** el proyecto **dev** (`lvaeqltfbbixbpwogeul`), usuario `dev@local.test` / `devpassword`.
- **iPhone:** la URL y la anon key de **producción** (`cwmqgjeqtpilhcagotmn`), las mismas variables públicas del repo que usa Pages. Recompila con `pnpm ios:build` cada vez que cambies de uno a otro.

En modo `native` no se genera el service worker ni la PWA (WKWebView no admite Web Push).

## 3. Comandos (desde la raíz)

```bash
pnpm ios:build   # vite build --mode native + cap sync ios (copia apps/web/dist a la app)
pnpm ios:gen     # xcodegen generate: regenera App.xcodeproj desde apps/mobile/ios/App/project.yml
pnpm ios:open    # abre el proyecto en Xcode
```

`App.xcodeproj` se commitea, pero se genera desde `project.yml`: si cambias targets, archivos o ajustes, edita `project.yml` y ejecuta `pnpm ios:gen`.

## 4. Simulador

```bash
pnpm ios:build
cd apps/mobile/ios/App
xcodebuild -project App.xcodeproj -scheme App \
  -destination 'platform=iOS Simulator,name=iPhone 18 Pro' \
  -derivedDataPath /tmp/sb-dd build
xcrun simctl boot 'iPhone 18 Pro'; open -a Simulator
xcrun simctl install booted /tmp/sb-dd/Build/Products/Debug-iphonesimulator/App.app
xcrun simctl launch --console booted com.csr9497.secondbrain   # logs [LiveActivity] en la consola
xcrun simctl io booted screenshot captura.png
```

Para ver la card, bloquea el simulador (Device → Lock, o ⌘L) después de abrir la app con sesión iniciada.

## 5. iPhone con la cuenta gratuita (Personal Team)

1. `.env.native.local` con los valores de producción y `pnpm ios:build`.
2. `pnpm ios:open`. En Xcode, añade tu Apple ID si hace falta (Settings → Accounts).
3. En **Signing & Capabilities**, elige **Team = (tu nombre) (Personal Team)** en los **dos** targets: `App` y `SecondBrainLiveActivity`.
4. Si Xcode dice que el bundle id no está disponible, cámbialo por uno único, p. ej. `com.<tunombre>.secondbrain` en `App` y `com.<tunombre>.secondbrain.LiveActivity` en la extensión (la extensión debe empezar por el id de la app). Para que dure, cámbialo en `project.yml` y en `apps/mobile/capacitor.config.ts` (`appId`) y ejecuta `pnpm ios:gen`.
5. Conecta el iPhone por cable y acepta «Confiar en este ordenador».
6. Activa el **Modo de desarrollador** en el iPhone: Ajustes → Privacidad y seguridad → Modo de desarrollador (el iPhone se reinicia).
7. Elige el iPhone como destino y dale a **Run** (⌘R).
8. La primera vez iOS no la abre: Ajustes → General → VPN y gestión de dispositivos → tu Apple ID → **Confiar**.
9. Activa las Live Activities: Ajustes → Second Brain → Actividades en vivo.
10. **Caduca a los 7 días**: el perfil gratuito vence y la app deja de abrir. Conecta el iPhone y dale a Run otra vez (los datos se conservan).

## 6. Cómo se comporta la card

- **Aparece al abrir la app** con sesión iniciada y algo pendiente (hábitos de la franja actual o pasos de hoy). La web la calcula desde `['today']` con `estadoLiveActivity` (`@sb/shared`).
- **Se actualiza** cuando marcas en la app, al volver la app a primer plano y al tocar los botones ✓ de la card: el botón escribe en Supabase sin abrir la app (App Intents con la sesión guardada en el Keychain) y la card cambia al momento.
- **Termina sola** cuando no queda nada pendiente, y al cerrar sesión.
- iOS la mantiene unas **8 h** como máximo; luego se queda en la pantalla de bloqueo sin actualizarse hasta que la descartes o vuelvas a abrir la app.
- «Ver N más» y tocar la card abren la app en Hoy (`secondbrain://hoy`).
- Si un botón falla (sin red, sesión caducada), la card no cambia; al abrir la app se corrige con los datos reales.
- Sesión: la web copia sus tokens al Keychain (`guardarSesion`) y, si un botón renovó la sesión, la web toma los tokens del Keychain al cargarla (`almacenNativo` en `apps/web/src/lib/nativo/sesion.ts`), porque Supabase rota el refresh token.

## 6 bis. Reglas de dominio que la app nativa debe respetar

La app carga el build de `apps/web`, así que usa la misma lógica de `@sb/shared`. Las
escrituras **nativas** no pasan por ella: los App Intents de la card escriben por
PostgREST con `SupabaseREST.swift`. Si una escritura nativa crea o reprograma pasos o
cambia las fechas de una tarea, debe aplicar el contrato de `docs/DATA-MODEL.md`
(«Duración de la tarea y de sus pasos»):
- un paso solo con tiempo toma el inicio de la tarea;
- un paso con fecha y sin días dura hasta el deadline;
- los pasos por tiempo se miden contra `tasks.minutos_dia` (8 h si es null).

Hoy la card solo marca hábitos, tareas y pasos, y no le afecta.

## 7. Limitaciones de la cuenta gratuita

- La card **no aparece sola** a la hora de cada franja: solo cuando abres la app (eso pide push-to-start por APNs).
- **No se actualiza desde el servidor**: si marcas en otro dispositivo, la card cambia cuando vuelves a abrir la app.
- La instalación caduca a los **7 días** y hay un máximo de 3 apps de desarrollo por dispositivo.
- Sin TestFlight ni App Store; los avisos siguen llegando por la PWA instalada.

## 8. Fase 2 (con Apple Developer, de pago)

- **APNs push-to-start** desde la Edge Function `recordatorios`: a la hora de cada franja arranca la Live Activity aunque la app esté cerrada (el token de push-to-start se registra desde la app y se guarda en Supabase).
- **Actualizaciones desde el servidor**: los cambios hechos en otro dispositivo llegan a la card por APNs (push token de cada actividad).
- **TestFlight** para instalar sin cable ni caducidad de 7 días, y avisos nativos.
