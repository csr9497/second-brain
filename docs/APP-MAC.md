# App de Mac: runbook

App de macOS con la web completa en una ventana, una **barra de menús** y **widgets** con los hábitos de la franja y los pasos de hoy, que se marcan con ✓ sin abrir la ventana. Es solo para la MacBook de Cesar: se firma con la cuenta gratuita (Personal Team) y no se notariza. Diseño: `docs/superpowers/specs/2026-10-10-app-mac-design.md`.

Fases: **M1** (ventana y barra), **M3** (widgets, `docs/superpowers/specs/2026-10-10-mac-widgets-design.md`) y M2 (avisos nativos por franja, pendiente).

## 1. Requisitos

- macOS 14 o posterior y **Xcode 27**; XcodeGen (`brew install xcodegen`).
- `pnpm install` en la raíz.
- Un certificado «Apple Development» del Personal Team en el llavero (lo crea Xcode al iniciar sesión con el Apple ID en Settings → Accounts).

## 2. Variables

La app usa el mismo build que iOS (`vite build --mode native`), que lee `apps/web/.env.native.local`. Hoy ese archivo apunta a **producción**, que es lo que quieres en la app instalada.

Para probar contra Supabase **dev** sin tocar ese archivo, añade `dev` al final del comando. Toma las variables de `apps/web/.env.dev.local`, que en Vite tienen prioridad sobre los archivos `.env`. Usuario: `dev@local.test` / `devpassword`.

## 3. Comandos (desde la raíz)

```bash
pnpm mac:run            # build de la web + xcodebuild Debug y abre la app (/tmp/sb-mac-dd)
scripts/mac.sh run dev  # lo mismo contra Supabase dev
pnpm mac:install        # build Release y la copia a /Applications/Second Brain.app (cierra la anterior)
pnpm mac:test           # tests de Swift (SecondBrainMacTests)
pnpm mac:build          # solo la web: apps/web/dist → apps/mobile/ios/App/Mac/public
pnpm ios:gen            # regenera App.xcodeproj (iOS y Mac) tras tocar project.yml
```

Para la app de todos los días: `pnpm mac:install` y, en el panel de la barra, marca **«Abrir al iniciar sesión»**.

## 4. Firma

Comprobado el 2026-10-10:

- Con `DEVELOPMENT_TEAM` del Personal Team y firma automática, `xcodebuild -allowProvisioningUpdates` firma con «Apple Development» **sin perfil de aprovisionamiento**: sandbox y red saliente no lo necesitan.
- **No caduca a los 7 días** como en iOS: dura lo que el certificado de desarrollo (hoy, hasta octubre de 2027). Al renovarlo, vuelve a ejecutar `pnpm mac:install`.
- El Keychain funciona dentro del sandbox sin pedir permisos.
- El App Group `3WL76C24SA.com.csr9497.secondbrain` (con el prefijo del Team ID) también firma sin perfil y se usa sin avisos.

## 5. Cómo se comporta

- **Ventana:** la app completa. Cerrarla (⌘W o el botón rojo) **no** cierra la app: queda en la barra de menús y el ícono del Dock desaparece. ⌘Q sale.
- **La web sigue viva con la ventana cerrada.** Así, Realtime trae los cambios de otros dispositivos y la barra se actualiza sola. En la Mac, `supabase.ts` vuelve a encender la renovación del token cuando la página se oculta.
- **Barra de menús:**
  - El ícono 🧠 lleva el % del día, o ✓ si no queda nada pendiente.
  - El panel muestra la franja y el %, las burbujas de los hábitos pendientes de la franja, hasta 5 pasos de hoy y «N más en Hoy».
  - Tocar una burbuja o un ✓ escribe en Supabase con el mismo ciclo que la card de iOS: «enviando», luego hecho o «fallo» durante 2,5 s.
- **Cuándo vuelve a pedir Hoy:**
  - al abrir el panel;
  - al despertar la Mac;
  - en cada cambio de franja (`proximaFranja`, que manda la web según la jornada);
  - sin estado, cada 15 min;
  - tras cada ✓.
- **Menús:**
  - Archivo: Nueva tarea ⌘N, Crear… ⇧⌘N.
  - Ver: Hoy ⌘1, Calendario ⌘2, Gantt ⌘3, Resumen ⌘4, Actualizar ⌘R.
  - No abren nada si hay un modal abierto, y cambiar de vista respeta los cambios sin guardar.
- **Enlaces externos:** se abren en el navegador.
- **Sesión:** la web la copia al Keychain (`guardarSesion`) y la barra escribe con ella. Si la barra renueva el token, la web toma los tokens nuevos al cargar la sesión (`almacenNativo`), igual que en iOS.

### Widgets

- Para añadirlos: clic derecho en el escritorio → «Editar widgets» → **Second Brain → Hoy**, en tamaño pequeño o mediano.
- **Pequeño:** la franja, el % del día y cuántos pendientes quedan. Tocarlo abre la app.
- **Mediano:** además, las burbujas de los hábitos de la franja y los pasos de hoy, con ✓.
- **Los pinta y los marca la app.** La app guarda lo que muestra la barra en el App Group y recarga los widgets. Un ✓ en el widget se encola y la app lo escribe con la misma lógica que la barra. Si la app está cerrada, el toque queda «enviando» hasta que la abres. Por eso conviene «Abrir al iniciar sesión».

## 6. Checklist de prueba

Probado el 2026-10-10 contra dev, con un gancho temporal que ejecutaba JS en la página y capturaba el WebView y el panel. No hay acceso a la pantalla desde la terminal.

- [x] Login en la ventana: la barra recibe el estado (franja, hábitos, %, `proximaFranja`).
- [x] ⌘1–4 y ⌘N (`sbAccion`): cambia de vista y abre el modal de tarea.
- [x] Cerrar la ventana: el ícono del Dock desaparece (`.accessory`) y la barra sigue.
- [x] Marcar un hábito desde la barra con la ventana cerrada: se escribe en Supabase y el % se actualiza.
- [x] Marcar desde otro dispositivo con la ventana cerrada: la barra se actualiza sola en unos segundos (Realtime).
- [ ] Más de una hora con la ventana cerrada y luego un cambio desde otro dispositivo (renovación del token).
- [ ] Marcar un **paso** desde la barra (en dev no había pasos hoy; lo cubren los tests de `Marcas`).
- [ ] Reposo y despertar.
- [ ] Cambio de franja con la app abierta.
- [ ] Cerrar sesión: la barra pasa a «Inicia sesión».
- [ ] Abrir al iniciar sesión (`SMAppService`).
- [ ] Mirar el panel real: hasta ahora solo se vio renderizado fuera de la barra.
- [x] Widgets: la extensión queda registrada (`pluginkit`) y la app escribe la instantánea en el App Group.
- [x] Un toque del widget (cola + aviso Darwin) lo marca la app y la instantánea se actualiza.
- [ ] Añadir los widgets en el escritorio y verlos pintar (pequeño y mediano).
- [ ] Tocar un ✓ en el widget mediano.
- [ ] Tocar el widget pequeño abre la ventana.

## 7. Limitaciones

- Todavía no hay avisos nativos (M2). Los avisos siguen llegando por la PWA, porque WKWebView no tiene Web Push.
- Si la Mac está en reposo, nada se actualiza hasta que despierta.
- `pnpm ios:build` (Capacitor) y `pnpm mac:build` comparten `apps/web/dist`: cada uno copia su build a su carpeta (`App/public` o `Mac/public`).
