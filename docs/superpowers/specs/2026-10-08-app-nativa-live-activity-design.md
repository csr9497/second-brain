# App nativa (Capacitor) con Live Activity: diseño del prototipo

El objetivo es validar en el iPhone la Live Activity elegida, la **Variante A · Burbujas** del lienzo https://claude.ai/artifact/5yGvdTDDEhpxYU2iLqkc74. El prototipo funciona con la **cuenta gratuita de Apple** (Personal Team). APNs llega en una segunda fase, cuando Cesar tenga la cuenta de Apple Developer. La PWA sigue publicada en Pages y es la que manda los avisos Web Push.

## Lo que el prototipo puede y no puede hacer (cuenta gratuita)

- **Puede:**
  - instalarse desde Xcode en el iPhone de Cesar;
  - mostrar la Live Activity en la pantalla de bloqueo y en la Dynamic Island cuando se abre la app;
  - marcar hábitos y pasos desde los botones de la card;
  - actualizarse al volver a la app.
- **No puede:**
  - aparecer sola a la hora de la franja: haría falta push-to-start, que va por APNs y pide la cuenta de pago;
  - actualizarse desde el servidor;
  - durar más de unas 8 h activa, por un límite de iOS;
  - instalarse más de 7 días seguidos: el perfil gratuito caduca y hay que reinstalar desde Xcode.

## Arquitectura

- **Paquete nuevo `apps/mobile`:** Capacitor 7 o la versión vigente compatible con Xcode 27.
  - `capacitor.config.ts` con `appId: 'com.csr9497.secondbrain'`, `appName: 'Second Brain'` y `webDir: '../web/dist'`.
  - El proyecto Xcode vive en `apps/mobile/ios/` y se commitea, salvo `Pods`, `build` y lo que Capacitor ignora.
- **Web dentro de la app:** el mismo build de `apps/web`, generado con `vite build --mode native`, que lee `apps/web/.env.native.local` (ignorado por git): la URL y la anon key de **producción**, las mismas de Pages. `base: './'` ya sirve para el esquema `capacitor://`.
- **Diferencias en nativo (`Capacitor.isNativePlatform()`):**
  - no se registra el service worker, porque WKWebView no admite Web Push;
  - en el modal 🔔 Avisos, «Este dispositivo» explica que en la app los avisos llegan por la PWA instalada.
- **Plugin local `LiveActivity`:** es Swift, vive en el target de la app y se expone a la web con `registerPlugin('LiveActivity')`. Tiene tres métodos:
  - `sincronizar(estado)`: arranca la actividad si no existe, o la actualiza si ya existe; con `estado` null la termina;
  - `guardarSesion({ url, anonKey, accessToken, refreshToken })`: guarda la sesión en el Keychain de la app, para que los botones de la card puedan escribir en Supabase;
  - `cerrarSesion()`: borra esa sesión del Keychain y termina la actividad.
- **Estado de la card** (`ActivityAttributes.ContentState`, Codable). Lo calcula la web a partir de `['today']` con una función pura en `@sb/shared`, `estadoLiveActivity(today, ahora)`, que lleva tests:
  - `franja` y `franjaCompleta: boolean`;
  - `pctDia: number`;
  - `habitos: { id, nombre, inicial, slot, turno: string[], hecho: boolean }[]`, con los turnos pendientes de la franja actual y como mucho 4;
  - `pasos: { id, titulo }[]`, los primeros 2 pasos pendientes de hoy (si una tarea no tiene pasos, cuenta la tarea), y `masPasos: number`;
  - `actualizado: fecha`.
  - Si no queda ni un hábito de la franja ni un pendiente de hoy, el estado es null y la actividad se termina.
- **Cuándo sincroniza la web:**
  - cada vez que cambia la query `['today']`, con un hook `useLiveActivity` montado en `Home` que solo actúa en nativo;
  - al volver la app a primer plano (`App.addListener('appStateChange')`);
  - al iniciar sesión o refrescar el token, que llama a `guardarSesion` (`sb.auth.onAuthStateChange`);
  - al cerrar sesión, que llama a `cerrarSesion`.
- **Widget Extension `SecondBrainLiveActivity`** (SwiftUI + ActivityKit + WidgetKit): dibuja la Variante A.
  - **Pantalla de bloqueo:**
    - cabecera con el glifo, «Second Brain» y, a la derecha, la franja (o «Tarde ✓ · 80 % del día» si está completa);
    - una fila de burbujas y, a su derecha, el anillo con el % del día;
    - hasta 2 pasos con su botón ✓;
    - un enlace «Ver N más», que abre la app (`widgetURL` / `Link` al deep link `secondbrain://hoy`).
  - **Dynamic Island:**
    - compacta: el anillo y el número de pendientes;
    - mínima: el anillo;
    - expandida: las burbujas y el primer paso.
  - Colores de la app: `--good` #7bc86c y acento #7c9cff sobre fondo oscuro. El alto se ajusta al límite de unos 160 pt.
- **Botones de la card (App Intents interactivos, iOS 17+):** `MarcarHabitoIntent(id, slot)` y `MarcarPasoIntent(id)` son `LiveActivityIntent` y corren en el proceso de la app. No hace falta App Group.
  1. Leen la sesión del Keychain y refrescan el token si caducó (`POST /auth/v1/token?grant_type=refresh_token`).
  2. Escriben en PostgREST igual que `api.ts`:
     - el hábito, con un upsert de `habit_logs` (`habit_id`, `fecha` del día local, `slot`, `done: true`) y `on_conflict=habit_id,fecha,slot`;
     - el paso, con un `PATCH steps?id=eq.{id}` y `done: true`;
     - todo con la cabecera `x-timezone`, para que los triggers usen el día local.
  3. Actualizan la card al momento:
     - un hábito pasa a `hecho: true`, se rellena, y el % sube de forma aproximada;
     - **unos 3 s después** (`Task.sleep` dentro del intent) se actualiza otra vez y desaparece;
     - un paso desaparece directamente y sube el siguiente, si estaba en el estado (el estado lleva hasta 5 pasos y la card muestra 2).
  4. Si la escritura falla, la card no cambia. Al abrir la app, la web vuelve a sincronizar con los datos reales.
- **Deep link `secondbrain://`:** se registra en el Info.plist. `secondbrain://hoy` abre la app en `#/`.

## Desarrollo y prueba

- **Scripts en la raíz:**
  - `pnpm ios:build`: `vite build --mode native` y `cap sync ios`;
  - `pnpm ios:open`: abre el proyecto en Xcode.
- **Simulador:** las Live Activities se ven en el simulador (iOS 27). Se verifica con `xcodebuild` + `simctl` y capturas.
- **iPhone:** con la cuenta gratuita.
  1. En Xcode, Signing → Personal Team en los dos targets.
  2. Conectar el iPhone y darle a Run.
  3. Al principio, en el teléfono: Ajustes → General → VPN y gestión de dispositivos → confiar en el desarrollador.
  4. Activar las Live Activities para la app: Ajustes → Second Brain.
- **Docs:** `docs/APP-NATIVA.md`, con los pasos, las limitaciones de la cuenta gratuita y qué cambia con APNs (fase 2).

## Fase 2 (con cuenta de Apple Developer, fuera de este spec)

- APNs con push-to-start desde la Edge Function `recordatorios` a la hora de cada franja, más las actualizaciones desde el servidor.
- TestFlight.
- Avisos nativos.

## Fuera de alcance

- Android.
- Publicar en la App Store.
- Notificaciones locales programadas.
- Desmarcar desde la card.
- Widgets de pantalla de inicio.
