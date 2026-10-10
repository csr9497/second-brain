# App de Mac: runbook

App de macOS con la web completa en una ventana, una **barra de menús** y **widgets** con los hábitos de la franja y los pasos de hoy, que se marcan con ✓ sin abrir la ventana. Es solo para la MacBook de Cesar: se firma con la cuenta gratuita (Personal Team) y no se notariza. Diseño: `docs/superpowers/specs/2026-10-10-app-mac-design.md`.

Fases: **M1** (ventana y barra), **M2** (avisos nativos, `docs/superpowers/specs/2026-10-10-mac-avisos-design.md`) y **M3** (widgets, `docs/superpowers/specs/2026-10-10-mac-widgets-design.md`).

## 1. Requisitos

- macOS 14 o posterior y **Xcode 27**; XcodeGen (`brew install xcodegen`).
- `pnpm install` en la raíz.
- Un certificado «Apple Development» del Personal Team en el llavero (lo crea Xcode al iniciar sesión con el Apple ID en Settings → Accounts).

## 2. Variables

La app usa el mismo build que iOS (`vite build --mode native`), que lee `apps/web/.env.native.local`. Hoy ese archivo apunta a **producción**, que es lo que quieres en la app instalada.

Para probar contra Supabase **dev** sin tocar ese archivo, añade `dev` al final del comando. Se compila **«Second Brain Dev»**, una app aparte con su propio bundle id (`….mac.dev`), widget, App Group y Keychain. Así nunca mezcla sus datos con los de la app de producción, y en la galería de widgets aparecen las dos por separado. Toma las variables de `apps/web/.env.dev.local`, que en Vite tienen prioridad sobre los archivos `.env`. Usuario: `dev@local.test` / `devpassword`.

## 3. Comandos (desde la raíz)

```bash
pnpm mac:run            # build de la web + xcodebuild Debug y abre la app (/tmp/sb-mac-dd)
scripts/mac.sh run dev  # «Second Brain Dev» contra Supabase dev (/tmp/sb-mac-dd-dev)
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
  - El ícono 🧠 lleva el % del día, ✓ si no queda nada pendiente, o «…» justo al cambiar de franja hasta que llega la nueva.
  - El panel tiene, de arriba abajo:
    - un campo **«Capturar…»**: Enter guarda una idea en la bandeja;
    - la franja y el %;
    - las burbujas de los hábitos pendientes de la franja;
    - hasta 5 pasos de hoy y «N más en Hoy»;
    - los **semanales**, con su progreso hechas/meta;
    - y, cuando aplica, «Sin conexión · datos de las HH:MM» o «Avisos desactivados en macOS → Activar».
  - Tocar una burbuja o un ✓ escribe en Supabase con el mismo ciclo que la card de iOS: «enviando», luego hecho o «fallo» durante 2,5 s.
- **Captura rápida desde cualquier app: ⌃⌥Espacio.** Abre un panel flotante; Enter guarda en la bandeja y Esc cierra.
- **Sin conexión:** al arrancar sin red, la barra y los widgets muestran lo último guardado (si es de las últimas 18 h). La ventana arranca con el último Hoy guardado en el navegador y avisa «📴 Sin conexión».
- **Atajos de teclado en la ventana:** `n` nueva tarea, `c` crear, `1`–`4` vistas, `j`/`k` moverse por hábitos y tareas, `x` marcar, `e` editar y `?` la lista.
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

- **Para añadirlos:** clic derecho en el escritorio → «Editar widgets» → **Second Brain**.
- **«Hoy»** es configurable (clic derecho → «Editar widget» → Mostrar: hábitos y pasos, solo hábitos o solo pasos):
  - **Pequeño:** la franja, el %, lo siguiente que toca («Sigue: Lectura») y cuántos pendientes quedan. Tocarlo abre la app.
  - **Mediano:** a la izquierda, lo mismo que el pequeño; a la derecha, los hábitos de la franja (burbuja con su nombre, hasta 4) y los pasos de hoy (hasta 2 con ✓, «+N más», o «Sin pasos para hoy»).
  - **Grande:** el día completo:
    - las tres franjas con el nombre de cada hábito (la actual resaltada);
    - los semanales con su progreso;
    - la racha;
    - hasta 5 pasos de hoy con su proyecto (8 con «Solo pasos»).
- **«Racha»** (pequeño): días seguidos, el % de hoy y los puntos de tus metas semanales.
- **Qué cuenta como «paso de hoy»:** solo los pasos que caen hoy. Una tarea con pasos en otros días no aparece aunque hoy esté dentro de su rango; una tarea sin pasos programados aparece ella misma. Es la misma regla que la lista Hoy.
- **Respetan las franjas:** al llegar el cambio de franja (según la jornada), el widget deja de mostrar los hábitos de la franja anterior y pone «Actualizando…» hasta que la app trae los de la nueva, normalmente en segundos. Tras la noche tampoco muestra los pasos del día anterior. El panel de la barra hace lo mismo.
- **Los pinta y los marca la app.** La app guarda lo que muestra la barra en el App Group y recarga los widgets. Un ✓ en el widget se encola y la app lo escribe con la misma lógica que la barra. Si la app está cerrada, el widget la abre en segundo plano (sin ventana). Si aun así no responde, la marca «enviando» se quita sola a los 20 s.

### Avisos

- **Mismas horas que 🔔 Avisos.** A la hora de cada franja, si te quedan hábitos de esa franja, llega una notificación del sistema con el mismo texto que la Web Push («Tarde · te faltan 2» / «Agua, Leer»).
- **Los programa la app con lo que sabe en ese momento.** Marcar los hábitos de una franja quita su aviso, y llegan aunque cierres la app. Tocar el aviso abre la ventana en Hoy.
- **Botones del aviso:** «Marcar todos» marca los hábitos que faltaban de esa franja sin abrir la app; «En 30 min» lo repite media hora después.
- **Tareas y proyectos:** a la hora de la mañana (o a las 09:00 si no hay), un aviso con lo que vence hoy, lo vencido y los proyectos en curso sin avance hace 7 días o más.
- **Si las notificaciones están desactivadas**, el modal 🔔 y la barra lo dicen y llevan a Ajustes.
- **La primera vez macOS pide permiso.** Si lo negaste: Ajustes del Sistema → Notificaciones → Second Brain → Permitir notificaciones.
- Si también activaste los avisos de Safari en esta Mac, desactívalos ahí (🔔 en Safari → «Desactivar aquí») para no recibirlos dos veces.

## 6. Checklist de prueba

Probado el 2026-10-10 contra dev, con un gancho temporal que ejecutaba JS en la página y capturaba el WebView y el panel. No hay acceso a la pantalla desde la terminal.

- [x] Login en la ventana: la barra recibe el estado (franja, hábitos, %, `proximaFranja`).
- [x] ⌘1–4 y ⌘N (`sbAccion`): cambia de vista y abre el modal de tarea.
- [x] Cerrar la ventana: el ícono del Dock desaparece (`.accessory`) y la barra sigue.
- [x] Marcar un hábito desde la barra con la ventana cerrada: se escribe en Supabase y el % se actualiza.
- [x] Marcar desde otro dispositivo con la ventana cerrada: la barra se actualiza sola en unos segundos (Realtime).
- [ ] Más de una hora con la ventana cerrada y luego un cambio desde otro dispositivo (renovación del token): en curso con «Second Brain Dev».
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
- [ ] Cambio de franja con el widget a la vista: «Actualizando…» y luego los hábitos de la franja nueva.
- [x] Avisos: con horas configuradas, la app programa uno por franja con pendientes y los quita al borrar la configuración.
- [x] Datos extra (tres franjas, semanales, racha) en la barra; un semanal tocado en el widget se marca (1/3 → 2/3).
- [x] Captura rápida guarda en `ideas`; la caché sin conexión guarda `today` y `jornada`.
- [ ] ⌃⌥Espacio desde otra app abre el panel de captura.
- [ ] «Marcar todos» y «En 30 min» en un aviso real.
- [ ] Widgets grande, Racha y «Editar widget» → Mostrar.
- [ ] Cerrar la app y tocar un ✓ en el widget: se abre sin ventana y lo marca.
- [ ] Atajos de teclado en la ventana (`?` muestra la lista).
- [ ] Permitir las notificaciones (estaban denegadas) y ver llegar un aviso; tocarlo abre Hoy.

## 7. Limitaciones

- Los avisos de la app de Mac son locales: si la app no corrió ese día (ni «Abrir al iniciar sesión»), no hay avisos de ese día en la Mac.
- Si la Mac está en reposo, nada se actualiza hasta que despierta.
- Sin conexión se puede mirar, pero no guardar: los cambios fallan y lo avisan como siempre.
- `pnpm ios:build` (Capacitor) y `pnpm mac:build` comparten `apps/web/dist`: cada uno copia su build a su carpeta (`App/public` o `Mac/public`).
