# App nativa con Live Activity (prototipo): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que Second Brain funcione como app iOS (Capacitor) con la Live Activity de la Variante A, que se pueda probar en el simulador y en el iPhone con la cuenta gratuita.

**Arquitectura:**
- **Contenido de la card:** lo calcula la web con `estadoLiveActivity` (función pura en `@sb/shared`, con tests).
- **Plugin Swift local:** recibe ese estado y arranca, actualiza o termina la actividad.
- **Extensión WidgetKit:** dibuja la card.
- **Botones de la card:** App Intents que escriben en Supabase (PostgREST) con la sesión guardada en el Keychain.

**Stack:**
- Capacitor 8 (SPM);
- Xcode 27 con el simulador iPhone 18 Pro (iOS 27);
- XcodeGen (`brew install xcodegen`), para describir el proyecto en `project.yml` y no editar `project.pbxproj` a mano;
- Swift 6 con SwiftUI, ActivityKit, WidgetKit y AppIntents.

**Spec:** `docs/superpowers/specs/2026-10-08-app-nativa-live-activity-design.md` · **Rama:** `feat/app-nativa`

**Reglas para todas las tareas:**
- Nada de cuentas, secretos ni firma de pago.
- El simulador no necesita firma.
- `.env.native.local` y cualquier secreto quedan fuera de git.
- No se toca producción.

---

### Task 1: `estadoLiveActivity` en `@sb/shared` (TDD)

**Archivos:**
- nuevo: `packages/shared/src/domain/liveActivity.ts`;
- test: `packages/shared/src/domain/liveActivity.test.ts`;
- modificado: `packages/shared/src/index.ts` (export).

- [ ] **Tipo:**

```ts
export interface EstadoLiveActivity {
  franja: HabitSlot;
  franjaCompleta: boolean;
  pctDia: number;
  habitos: { id: string; nombre: string; inicial: string; slot: HabitSlot; turno: HabitSlot[]; hecho: boolean }[];
  pasos: { id: string; titulo: string; tipo: 'paso' | 'tarea' }[];
  masPasos: number;
  actualizado: string;
}
```

- [ ] **`estadoLiveActivity(today: TodayPayload, ahoraISO: string): EstadoLiveActivity | null`:**
  - `franja = today.habits.slotActual`;
  - `habitos`: las fichas de `porFranja[franja]` con `done === false`, como mucho 4, con `inicial = Array.from(nombre)[0]`;
  - `franjaCompleta`: la franja tiene fichas y ninguna está pendiente;
  - `pctDia = today.habits.pctDia`;
  - `pasos`, recorriendo `today.tasks.hoy` en orden: de cada tarea no hecha sale su primer paso pendiente del periodo (`pasos` de la Task: revisar cómo `buildToday` adjunta los pasos de hoy) o, si no tiene pasos, la tarea misma (`tipo: 'tarea'`). Como mucho 5 en el estado;
  - `masPasos = total − min(total, 2)`, porque la card muestra 2;
  - devuelve null si no hay hábitos pendientes en la franja ni pasos.
- [ ] **Tests:**
  - franja con pendientes;
  - franja completa con pasos;
  - nada pendiente → null;
  - tope de 4 hábitos y de 5 pasos, con `masPasos` bien calculado;
  - tarea sin pasos que cuenta como tarea;
  - tareas hechas excluidas;
  - inicial con emoji.
- [ ] Correr `pnpm test && pnpm typecheck`.
- [ ] Commit: `shared: estado de la Live Activity a partir de Hoy`.

### Task 2: Proyecto Capacitor + iOS (XcodeGen) que compila en el simulador

**Archivos:**
- nuevo `apps/mobile/` con:
  - `package.json` (`@sb/mobile`, dependencias `@capacitor/core`, `@capacitor/ios`, `@capacitor/app` y `@capacitor/cli` 8.x);
  - `capacitor.config.ts`;
  - `ios/` (generado por `cap add ios`, luego adaptado);
  - `ios/project.yml` (XcodeGen);
- modificados: `apps/web/vite.config.ts` (sin service worker en el modo `native`), `apps/web/src/main.tsx` si hace falta, `apps/web/.env.example`, la raíz de `package.json` (scripts `ios:build`, `ios:open`) y `.gitignore`.

- [ ] Correr `brew install xcodegen`, si falta.
- [ ] **`capacitor.config.ts`:** `{ appId: 'com.csr9497.secondbrain', appName: 'Second Brain', webDir: '../web/dist', ios: { scheme: 'Second Brain' } }`. Revisar las opciones válidas de Capacitor 8.
- [ ] **Modo `native` de Vite:**
  - `vite build --mode native` lee `apps/web/.env.native.local` (ignorado por `*.local`);
  - en ese modo, `VitePWA` no registra el SW: `injectRegister: mode === 'native' ? false : 'auto'` (o `disable: true`);
  - documentar `.env.native.local` en `.env.example`;
  - para el simulador, ese archivo puede apuntar a **Supabase dev** (copiar de `.env.dev.local`); en el iPhone, Cesar pondrá producción.
- [ ] **`cap add ios`** (SPM): reemplazar el `.xcodeproj` generado por uno descrito en `ios/project.yml`, con XcodeGen:
  - target `App` (el de Capacitor, con `CapApp-SPM` como paquete local);
  - Info.plist con `NSSupportsLiveActivities = YES` y el URL scheme `secondbrain`;
  - deployment target iOS 17.0.
  - **Commitear** `project.yml` y el `.xcodeproj` generado, para que Xcode lo abra sin XcodeGen; o solo `project.yml` más un script `ios:gen`. Elegir y documentar.
- [ ] **Scripts en la raíz:**
  - `"ios:build": "pnpm --filter @sb/web exec vite build --mode native && pnpm --filter @sb/mobile exec cap sync ios"`;
  - `"ios:open": "pnpm --filter @sb/mobile exec cap open ios"`.
- [ ] **Verificar:** `pnpm ios:build` y luego `xcodebuild -project apps/mobile/ios/App/App.xcodeproj -scheme App -destination 'platform=iOS Simulator,name=iPhone 18 Pro' build` (o la ruta que quede). Después, arrancar el simulador, instalar y lanzar la app (`xcrun simctl boot`, `install`, `launch`) y tomar una captura (`xcrun simctl io booted screenshot`). La app debe mostrar el Login y poder iniciar sesión.
- [ ] Commit: `mobile: app iOS con Capacitor (SPM, XcodeGen) que carga la web en modo native`.

### Task 3: Plugin `LiveActivity` y sincronización desde la web

**Archivos:**
- nuevos:
  - `apps/mobile/ios/App/App/LiveActivity/LiveActivityPlugin.swift`;
  - `Atributos.swift`, compartido con la extensión: `SecondBrainAttributes: ActivityAttributes` con `ContentState` igual a `EstadoLiveActivity`;
  - `Sesion.swift` (Keychain);
  - `apps/web/src/lib/nativo/liveActivity.ts` (`registerPlugin`);
  - `apps/web/src/lib/nativo/useLiveActivity.ts`;
- modificados: `App.tsx` (montar el hook) y `lib/useSession.ts` o `supabase.ts` (`onAuthStateChange` → `guardarSesion` / `cerrarSesion`).

- [ ] **Plugin Capacitor 8 local** (en el target App; registrarlo según la documentación de Capacitor 8 para plugins locales, con un `CAPBridgeViewController` propio si hace falta). Métodos:
  - `sincronizar({ estado })`: con `estado` null termina todas las actividades; si no, actualiza la existente o la crea con `Activity.request(attributes:content:pushType: nil)`;
  - `guardarSesion({ url, anonKey, accessToken, refreshToken })`: la guarda en el Keychain;
  - `cerrarSesion()`: la borra y termina la actividad.
- [ ] **Web:**
  - `useLiveActivity(data)` solo actúa si `Capacitor.isNativePlatform()`;
  - con cada `data` de `['today']` llama a `sincronizar` con `estadoLiveActivity(data, now)`, con un debounce de 300 ms y sin llamadas si el estado no cambió;
  - al volver a primer plano (`App.addListener('appStateChange')`) invalida `['today']`.
- [ ] **Sesión:** en `onAuthStateChange`, para `SIGNED_IN` y `TOKEN_REFRESHED` llama a `guardarSesion` con la URL y la anon key de `import.meta.env` y los tokens de la sesión; para `SIGNED_OUT` llama a `cerrarSesion`.
- [ ] **Verificar:** typecheck, `pnpm ios:build`, xcodebuild y el simulador. Iniciar sesión con el usuario dev, ir a la pantalla de bloqueo del simulador (`xcrun simctl` no bloquea la pantalla: usar Device → Lock con AppleScript, o comprobar con `Activity.activities` en los logs) y comprobar que la actividad existe. Una vista mínima basta, porque la UI real va en la Task 4.
- [ ] Commit: `mobile: plugin LiveActivity y sincronización desde Hoy`.

### Task 4: Extensión WidgetKit (Variante A) e intents interactivos

**Archivos:**
- nuevo target `SecondBrainLiveActivity` en `project.yml` (`app-extension`, `com.apple.widgetkit-extension`), con:
  - `LiveActivityWidget.swift` (`ActivityConfiguration`);
  - `Vistas/` (Bloqueo, Isla);
  - `Intents.swift`;
- compartido con la app: `Atributos.swift` y `Sesion.swift`;
- en el target App: `SupabaseREST.swift`.

- [ ] **Pantalla de bloqueo**, con la Variante A elegida (ver el lienzo y `project/VarA.dc.html`):
  - cabecera con el glifo, «Second Brain» y la franja a la derecha (o «{Franja} ✓ · {pct} % del día» si está completa);
  - si la franja no está completa, una fila de burbujas de 46 pt (pendiente: borde gris con la inicial; hecha: relleno `#7bc86c` con un ✓) y el anillo de 56 pt con el % del día a la derecha;
  - hasta 2 filas de pasos con su botón ✓ circular (`Button(intent:)`);
  - «Ver N más» como `Link(destination: secondbrain://hoy)`;
  - fondo `#232221` con `activityBackgroundTint` y textos `#f3f1ec` / `#a8a39a`;
  - alto contenido (unos 160 pt).
- [ ] **Dynamic Island:**
  - compacta: a la izquierda el anillo pequeño, a la derecha el número de pendientes;
  - mínima: el anillo;
  - expandida: la franja y el %, las burbujas y el primer paso.
- [ ] **Intents** (`LiveActivityIntent`, en los dos targets o según lo que exija iOS 27 para que corran en el proceso de la app):
  - `MarcarHabitoIntent(id, slot)`: el upsert de `habit_logs` vía `SupabaseREST` (cabeceras `apikey`, `Authorization: Bearer`, `x-timezone`, `Prefer: resolution=merge-duplicates`), con `fecha` del día local `yyyy-MM-dd` en la zona del dispositivo. Luego actualiza el estado: `hecho = true` y `pctDia` aproximado; espera unos 3 s (`Task.sleep`) y quita el hábito. Si ya no queda ninguno, `franjaCompleta = true`.
  - `MarcarPasoIntent(id, tipo)`: si `tipo == 'tarea'`, hace `PATCH tasks?id=eq.{id}` con `{ status: 'hecha' }`; si es un paso, `PATCH steps?id=eq.{id}` con `{ done: true }`. Luego quita el paso del estado y recalcula `masPasos`.
  - Antes de escribir se refresca el token si caducó; si el refresco falla, no se cambia nada.
  - Si no queda nada pendiente, se termina la actividad (`end` con un estado final «Día completo», `dismissalPolicy: .after(+5 min)`).
- [ ] **Verificar:**
  - `xcodebuild` de los dos targets en el simulador;
  - instalar e iniciar sesión, bloquear el simulador y tomar capturas de la pantalla de bloqueo y de la isla (en un dispositivo con isla, el iPhone 18 Pro);
  - pulsar el ✓ de un hábito y comprobar en Supabase dev (`supabase db query`) que se escribió el `habit_logs`; luego desmarcarlo desde la web para dejar los datos como estaban.
- [ ] Commit: `mobile: Live Activity (Variante A) en bloqueo e isla con botones para marcar hábitos y pasos`.

### Task 5: Docs y verificación final

- [ ] **`docs/APP-NATIVA.md`:**
  - requisitos (Xcode 27 e iOS 17+);
  - `apps/web/.env.native.local`;
  - `pnpm ios:build` / `ios:open`;
  - simulador;
  - iPhone con Personal Team (Signing en los dos targets, confiar en el desarrollador y caducidad de 7 días);
  - activar las Live Activities;
  - limitaciones;
  - fase 2 (APNs, push-to-start desde `recordatorios` y TestFlight).
- [ ] **`CLAUDE.md`:** un punto sobre `apps/mobile` (Capacitor, XcodeGen, plugin, extensión, `estadoLiveActivity` y que en nativo no hay service worker).
- [ ] **`docs/ROADMAP.md`:** la app nativa como prototipo.
- [ ] Correr `pnpm typecheck && pnpm test && pnpm build` (web normal) y `pnpm ios:build` + xcodebuild.
- [ ] Commit: `docs: app nativa con Live Activity (prototipo)`.
