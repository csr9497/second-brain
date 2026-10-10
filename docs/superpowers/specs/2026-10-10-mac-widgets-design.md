# App de Mac (M3): widgets

Widgets de WidgetKit para el escritorio y el Centro de notificaciones con lo pendiente de hoy. Se construye sobre M1 (`2026-10-10-app-mac-design.md`).

## Factibilidad (comprobado el 2026-10-10)

- Un App Group con el prefijo del Team ID (`3WL76C24SA.com.csr9497.secondbrain`) firma **sin perfil de aprovisionamiento** con el Personal Team, en la app y en la extensión.
- En macOS 27, la app y la extensión leen y escriben el contenedor del grupo sin avisos de permisos.
- `pluginkit` registra la extensión (`com.csr9497.secondbrain.mac.widget`).
- No hace falta compartir el Keychain (`keychain-access-groups` pediría un perfil): el widget nunca usa la sesión.

## Diseño

- **La app es la única que escribe en Supabase.** El widget solo pinta y encola toques. Así no se duplican la sesión, la rotación del refresh token ni las `Marcas`.
- **`Mac/Compartido.swift`**, que compilan la app, la extensión y los tests, maneja dos archivos JSON en el contenedor del grupo, coordinados con `NSFileCoordinator` porque son dos procesos:
  - `instantanea.json`: `EstadoCard?`, `conSesion`, `recibido` y `escrita`. La app la escribe en cada cambio de lo que pinta la barra (`EstadoMac.compartir`) y llama a `WidgetCenter.reloadTimelines(ofKind: "SecondBrainHoy")`.
  - `toques.json`: la cola de ✓ del widget, `{ tipo: habito|paso, id, detalle }`, sin repetidos.
- **Toque en el widget** (`MarcarDesdeWidget`, un `AppIntent` que corre en la extensión):
  1. Marca «enviando» en la instantánea; WidgetKit recarga el widget tras el intent.
  2. Encola el toque.
  3. Avisa a la app con una notificación Darwin (`com.csr9497.secondbrain.toque`).
  4. La app saca la cola y marca cada toque con `EstadoMac.marcarHabito/marcarPaso`, como la barra. La instantánea pasa a hecho o «fallo» y luego al estado real.
- **Con la app cerrada,** los toques esperan en la cola y se procesan en el primer `sincronizar` al abrirla. Por eso conviene «Abrir al iniciar sesión».
- **Línea de tiempo** `.never`: el widget no se programa solo. Lo recarga la app, que ya vuelve a pedir Hoy en cada cambio de franja, al despertar y con Realtime.
- **Tamaños:**
  - **Pequeño:** franja, anillo del % y «N pendientes», sin botones; tocarlo abre la app.
  - **Mediano:** franja y anillo a la izquierda; a la derecha, hasta 4 burbujas de hábitos y 2 pasos con ✓ (4 pasos si la franja ya está completa).
  - Sin sesión: «Abre Second Brain e inicia sesión». Nada pendiente: «Día completo».

## Pruebas

- **XCTest:** `CompartidoTests`, con la instantánea de ida y vuelta y la cola sin repetidos que se vacía al tomarla. `Compartido.carpetaDePrueba` usa una carpeta temporal.
- **En vivo** contra dev, con el gancho temporal de depuración: la instantánea refleja el estado, y un toque encolado más el aviso Darwin hacen que la app escriba el hábito y actualice la instantánea (0 % → 13 %).
- **Manual** (Cesar): añadir los widgets desde la galería, ver que pintan, tocar un ✓ en el mediano y tocar el pequeño para abrir la app.
