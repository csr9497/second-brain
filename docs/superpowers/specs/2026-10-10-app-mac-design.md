# App de Mac (M1): ventana y barra de menús

La app de Mac le da a Cesar lo que la PWA en el Dock no da. Va en tres fases, cada una con su spec, plan y PR:

- **M1 (este spec):** ventana nativa con menús y atajos, y la barra de menús con los hábitos de la franja y los pasos de hoy, marcables con ✓ sin abrir la ventana.
- **M2:** avisos nativos locales a la hora de cada franja, solo si queda algo pendiente.
- **M3:** widgets de WidgetKit. Es la fase con más riesgo: hay que verificar si el Personal Team permite compartir la sesión con la extensión (App Group o grupo de Keychain).

La app es solo para la MacBook de Cesar. Se firma con la cuenta gratuita (Personal Team), sin notarizar ni distribuir.

## Idea central

La web sigue siendo el cerebro y Swift solo pinta y escribe. La app de Mac carga el mismo build de `apps/web` que la de iOS (`vite build --mode native`). La web calcula `estadoLiveActivity` y se lo manda a Swift, igual que a la card de iOS. Así no se duplica en Swift ninguna regla de dominio: jornada, turnos, `pasosDelPeriodo`, `minutos_dia`.

## Arquitectura

### Target `SecondBrainMac`

- Vive en el mismo `apps/mobile/ios/App/project.yml` (XcodeGen), con fuentes en `apps/mobile/ios/App/Mac/`.
- `platform: macOS`, con macOS 14 como mínimo (`inactiveSchedulingPolicy`, `@Observable`, `MenuBarExtra`).
- Bundle id `com.csr9497.secondbrain.mac` y el mismo `DEVELOPMENT_TEAM` que iOS.
- **No usa Capacitor**, porque Capacitor no tiene plataforma macOS.
- Compila los mismos archivos de iOS, sin copiarlos: `App/LiveActivity/Sesion.swift`, `App/LiveActivity/SupabaseREST.swift` y la lógica compartida de marcas (ver «Acciones compartidas»).
- **App Sandbox** activado, con red saliente (`com.apple.security.network.client`). La extensión de widgets de M3 lo exige y es mejor no cambiarlo después.
- La web va en `Mac/public/`, ignorado por git, copiado desde `apps/web/dist` por `pnpm mac:build` y añadido como carpeta de recursos.

### WebView que vive todo el tiempo que corre la app

- Un único `WKWebView`, creado al arrancar y retenido por la app (no por la ventana).
- ⌘W o el botón rojo ocultan la ventana sin destruir el WebView. ⌘Q sale. Al cerrar la última ventana, la app sigue en la barra de menús (`applicationShouldTerminateAfterLastWindowClosed` = false).
- La app tiene ícono en el Dock mientras la ventana está abierta y lo quita al cerrarla (`NSApp.setActivationPolicy(.regular / .accessory)`).
- Carga la web con un `WKURLSchemeHandler` propio, `app://localhost/`, que sirve los archivos de `Mac/public`. El origin es estable, así que `localStorage` y la sesión de supabase-js persisten. El enrutado por hash y `base: './'` funcionan sin cambios.
- `configuration.preferences.inactiveSchedulingPolicy = .none`, para que WebKit no congele la página oculta.
- Los enlaces externos (`target=_blank`, otros orígenes) se abren en el navegador (`NSWorkspace.open`).

### Puente JS ↔ Swift

**En la web (`apps/web/src/lib/nativo/`):**

- `plataformaNativa(): 'ios' | 'mac' | null`:
  - `'ios'` si `Capacitor.isNativePlatform()`;
  - `'mac'` si existe `window.webkit?.messageHandlers?.sbMac`;
  - `null` en otro caso.
- `esNativo()` pasa a ser `plataformaNativa() !== null`. La decisión vive en una función pura que recibe el `window` (o sus partes), con test.
- El objeto `LiveActivity` mantiene la interfaz `LiveActivityPlugin` y se elige por plataforma:
  - en iOS, el plugin de Capacitor, sin cambios;
  - en Mac, un adaptador que llama a `window.webkit.messageHandlers.sbMac.postMessage({ metodo, args })` y espera la respuesta.
- Así `useLiveActivity`, `sesionNativa` y `almacenNativo` funcionan sin cambios en Mac.
- `useLiveActivity` escucha `appStateChange` de Capacitor solo en iOS. En Mac, el equivalente es que Swift llame a `sbRefrescar()`.
- Lo que en la web dice «en la app nativa (Capacitor)» y es específico de iOS sigue dependiendo de `plataformaNativa() === 'ios'`. Lo común (sin service worker ni PWA, avisos por la PWA) vale para los dos.

**En Swift (`Mac/Puente.swift`):**

- Un `WKScriptMessageHandlerWithReply` registrado como `sbMac` en el mundo de la página. Métodos:

| Método | Qué hace en Mac |
|---|---|
| `sincronizar({ estado })` | Guarda el estado en `EstadoMac` (lo que pinta la barra). Responde `{ activa: estado != null, id: null }`. |
| `guardarSesion(sesion)` | `Sesion.guardar` (Keychain), igual que iOS. |
| `leerSesion()` | `Sesion.leer`; `{}` si no hay. |
| `cerrarSesion()` | `Sesion.borrar` y deja el estado en nil (sin sesión). |

- Un método desconocido o con argumentos inválidos responde con error. La web lo trata como hoy trata un fallo del plugin: `console.warn` y reintento con el próximo cambio.

**De Swift hacia la web**, con `evaluateJavaScript` / `callAsyncJavaScript`:

- `window.sbRefrescar()`, que ya existe (`useRefresco`): vuelve a pedir las queries activas. En Mac también se registra.
- `window.sbAccion(nombre)`, nuevo (`useAccionesNativas`): reutiliza el `PuenteUI` de WebMCP (`nuevaTarea`, `irA`) y el `setModal` de `App`, así que respeta un modal abierto y `puedeSalir`. Acciones: `nueva-tarea`, `crear`, `ir:hoy`, `ir:calendario`, `ir:gantt`, `ir:resumen`. Devuelve false si no se pudo (modal abierto, el usuario se quedó en la página).

**Que la página oculta no se quede sin sesión.** Con la ventana oculta, la página queda `hidden` y supabase-js deja de renovar el token solo. Medidas:

1. En Mac, la web llama a `supabase.auth.startAutoRefresh()` al cargar y cada vez que la página pasa a `hidden`.
2. Swift llama a `sbRefrescar()`:
   - al abrir el panel de la barra;
   - al despertar del reposo (`NSWorkspace.didWakeNotification`);
   - en cada cambio de franja: un timer a la próxima de las horas de la jornada (`fin_dia`, `hora_tarde`, `hora_noche`). Swift no las conoce, así que la web las manda en el estado (ver abajo); sin ellas (estado null, sin sesión), cada 15 min.
3. El primer paso del plan es una prueba que lo confirme: la app oculta más de una hora, marcar algo desde el iPhone y verlo en la barra.

### Estado que pinta la barra

- Es `EstadoLiveActivity` (`@sb/shared`), el mismo de la card, decodificado en Swift con el mismo struct `EstadoCard` (`SecondBrainAttributes.ContentState`). `Atributos.swift` importa `ActivityKit`, que no existe en macOS. Se separa: el `ContentState` pasa a `App/LiveActivity/EstadoCard.swift` (sin ActivityKit, compartido) y `Atributos.swift` se queda con el `ActivityAttributes` de iOS.
- Campo nuevo opcional en `EstadoLiveActivity`: `proximaFranja: string | null`, el ISO de la próxima frontera de franja según la jornada. La card de iOS lo ignora; la Mac programa con él su timer. Se calcula en `@sb/shared` con la jornada fijada (`fijarJornada`), con test.
- `null` del lado web («nada pendiente») se muestra como «Día completo ✓». Sin sesión, como «Inicia sesión».

### Acciones compartidas (`AccionesCard`)

Hoy `AccionesCard.editar` aplica el cambio y lo manda a la Live Activity. Se separa:

- `App/LiveActivity/Marcas.swift` (compartido iOS + Mac): el ciclo «enviando» → escribir → hecho o «fallo» con sus pausas, `pctTrasMarcar` y la serialización de ediciones sobre `ultimo`. Recibe un `DestinoEstado`:

```swift
@MainActor protocol DestinoEstado: AnyObject {
    /// Estado actual (nil si no hay nada que editar).
    var estadoActual: EstadoCard? { get }
    /// Publica el estado editado. Si `diaCompleto`, el destino decide qué hacer (iOS termina la actividad).
    func publicar(_ estado: EstadoCard) async
}
```

- iOS: `DestinoLiveActivity`, con la lógica de hoy (`Activity.update` / `end`).
- Mac: `EstadoMac` (`@Observable`), que guarda el estado para la barra y, tras una escritura correcta, pide `sbRefrescar()` para que la web mande el estado real.
- La escritura sigue siendo `SupabaseREST` (marcar hábito con la `fecha` del estado, marcar paso o tarea), sin cambios. Esto no crea ni reprograma pasos, así que no le afecta el contrato de duración de `docs/DATA-MODEL.md`.

### Barra de menús

- `MenuBarExtra` con `.menuBarExtraStyle(.window)`, de unos 320 pt de ancho.
- **Ícono:** el símbolo de la app con el % del día al lado (por ejemplo «60 %»), o «✓» si no queda nada pendiente.
- **Panel:**
  - cabecera: «Second Brain» y la franja («Tarde», o «Tarde ✓» si está completa), con el % del día en un anillo;
  - las burbujas de hábitos de la franja (inicial, nombre en el tooltip). Tocar una marca la franja: «enviando» (pulsa) → rellena 1 s → desaparece; si falla, «fallo» 2,5 s y vuelve, igual que la card;
  - hasta 5 pasos de hoy con ✓ (paso o tarea, título), y «N más» que abre la ventana en Hoy;
  - pie: «Abrir Second Brain», «Actualizar», «Abrir al iniciar sesión» (casilla, `SMAppService.mainApp`) y «Salir».
- Colores de la card: verde `#7bc86c` y acento `#7c9cff`. Sigue el modo claro u oscuro del sistema.
- Sin sesión: «Inicia sesión en Second Brain» y un botón que abre la ventana.

### Ventana y menús

- La ventana muestra la web completa, con un tamaño mínimo de 900 × 600 que se recuerda entre aperturas.
- Menús:
  - **Archivo:** «Nueva tarea» ⌘N (`nueva-tarea`), «Crear…» ⇧⌘N (`crear`);
  - **Ver:** «Hoy» ⌘1, «Calendario» ⌘2, «Gantt» ⌘3, «Resumen» ⌘4, «Actualizar» ⌘R (`sbRefrescar`).
- Edición estándar (copiar, pegar, deshacer en los campos) con el menú Edición por defecto.
- Si el menú pide una acción y la ventana está oculta, primero la muestra.

## Build y comandos

`apps/mobile/package.json` y la raíz suman:

```bash
pnpm mac:build    # vite build --mode native (lee .env.native.local) + copia apps/web/dist a Mac/public
pnpm mac:run      # xcodebuild Debug del target SecondBrainMac y abre la app
pnpm mac:install  # build Release y copia a /Applications/Second Brain.app
```

- `pnpm ios:gen` regenera el proyecto con los dos targets.
- `.env.native.local` es el mismo de iOS: recompilar si se cambia entre dev y producción.
- `pnpm ios:build` (cap sync) no toca nada de Mac.

## Firma con el Personal Team

Dos cosas se verifican en el primer paso del plan; no se dan por hechas:

1. Si la firma gratuita de una app de Mac caduca, como los 7 días de iOS. Si caduca, el runbook dice cómo reinstalar (`pnpm mac:install`).
2. Que el sandbox y el Keychain funcionen sin pedir permisos extra.

## Pruebas

- **TypeScript (vitest):** `plataformaNativa` (pura); el adaptador de Mac sobre un `messageHandlers` falso (método, argumentos, respuesta, error); `proximaFranja` en `estadoLiveActivity` con varias jornadas (incluida la noche pasada la medianoche con `fin_dia`). `pnpm typecheck` y `pnpm test` siguen verdes.
- **Swift (XCTest, target `SecondBrainTests` en macOS):** `Marcas` sobre un `DestinoEstado` falso con un escritor inyectado: «enviando» → hecho → quitado; «fallo» → vuelve; dos toques seguidos no se pisan; `pctTrasMarcar`; decodificar un `EstadoLiveActivity` real (JSON de la web, con y sin `proximaFranja`).
- **iOS no se rompe:** `xcodebuild` del target `App` para el simulador tras el refactor.
- **Manual** (checklist en `docs/APP-MAC.md`): login en la ventana; ⌘W y marcar un hábito y un paso desde la barra; marcar desde el iPhone y verlo en la barra sin abrir la ventana; la app oculta más de una hora; reposo y despertar; cambio de franja; cerrar sesión; ⌘N y ⌘1–4; enlaces externos.

## Docs

- `docs/APP-MAC.md`: runbook (requisitos, comandos, firma, cómo se comporta, checklist).
- `CLAUDE.md`: la app de Mac en la sección `apps/mobile` y los comandos nuevos.
- `docs/MINUTA.md` al terminar.

## Fuera de M1

Avisos (M2), widgets (M3), badge del Dock con el %, actualizaciones automáticas, notarizar y distribuir.
