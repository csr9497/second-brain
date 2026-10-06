# Gantt con modo edición — diseño

Entregable 2, pieza 5 de 6.

## Objetivo

Una vista **Gantt** con las tareas agrupadas por proyecto y sus pasos programados. En **modo edición** se pueden aplazar barras (arrastrar) y alargarlas (arrastrar el borde derecho), con ratón, táctil o teclado. Nada se guarda hasta pulsar **Guardar**, que abre un **modal con el detalle de los cambios**. Al confirmar, todo se aplica en una sola transacción.

## Decisiones

- **Filas:**
  - Un grupo plegable por proyecto, con su color. "Sin proyecto" va al final.
  - Dentro de cada grupo van las tareas; debajo de cada tarea, sus pasos programados.
  - Las tareas sin ninguna fecha no aparecen. Las hechas se ocultan salvo con "Incluir hechas".
- **Barra de tarea:**
  - Va del primer al último día entre su inicio, su deadline y sus pasos (`spanTarea`), con un tope en el deadline.
  - Si algún paso queda fuera de plazo, la barra lleva un anillo rojo.
- **Barra de paso:** del inicio al fin del paso. Si está fuera de plazo, también lleva anillo rojo.
- **Gestos (solo en modo edición):**
  - **Mover una tarea** desplaza N días su inicio, su deadline y todos sus pasos programados.
  - **Estirar una tarea** cambia solo su deadline, que nunca queda antes del inicio. Si no tiene deadline, se crea a partir del fin de su rango.
  - **Mover un paso** cambia su inicio. **Estirar un paso** cambia su duración, con un mínimo de 1 día.
- **Teclado:** con una barra enfocada, ←/→ la mueve un día y Shift+←/→ la estira o la encoge.
- **Borrador:**
  - Los cambios viven en un `GanttDraft { tasks, steps }` y se ven al instante.
  - Las barras modificadas llevan un contorno punteado `accent`.
  - La barra de herramientas muestra "N cambios · Descartar · Guardar".
- **Resumen:**
  - El modal "Revisar cambios" lista cada tarea (inicio y deadline, antes → después, con ±días) y cada paso (rango antes → después, ±días y cambio de duración).
  - Incluye la etiqueta "fuera de plazo" y un aviso global. Botones: "Volver a editar" y "Confirmar y guardar".
- **Guardado atómico:**
  - La función `public.aplicar_plan(cambios jsonb)` es `security invoker`, de modo que la RLS limita los cambios a las filas propias.
  - Si alguna fila no existe o no es del usuario, o si se viola un CHECK, aborta todo.
  - Si falla, el borrador se conserva.
- **Salir con cambios pendientes:**
  - Al pulsar "Descartar" o al cambiar de pestaña, se pide confirmación.
  - Al cerrar o recargar, el navegador muestra su aviso (`beforeunload`).
  - El botón "atrás" del navegador no está cubierto (limitación aceptada).

## Navegación (refactor previo)

- `useVista` declara las vistas en `VISTAS` (`hash`, `label` y `ancho` del contenedor): Hoy, Calendario y Gantt (`#/gantt`).
- La guardia de salida es `useGuardiaSalida(activa, mensaje)`, y `puedeSalir()` se consulta desde los enlaces de la navegación.
- El contenido de Hoy se extrae a `components/HoyView.tsx`, que llama a su propio `useToday`, y `ModalState` pasa a `lib/modal.ts`.
- La fecha del encabezado sale de `todayISO()`.

## Datos

### `api.gantt(incluirHechas)`, query `['gantt', incluirHechas]`
- Carga las tareas con `start_date` o `deadline`, más las tareas que tienen pasos programados. Sin "Incluir hechas" se filtra `status <> 'hecha'`.
- Carga también los proyectos (`id`, `nombre` y `color`).

### `api.aplicarPlan(cambios)`
- Construye `{ tasks: [{ id, start_date, deadline }], steps: [{ id, start_date, duracion_dias }] }` y llama a `rpc('aplicar_plan')`.

### Invalidación
- Las mutaciones de Hoy (`useTodayMutation`), `TaskModal` y `ProjectModal` invalidan además `['gantt']`.
- Al guardar el plan se invalidan `['gantt']`, `['today']` y `['calendar']`.

## Dominio (`packages/shared/src/domain/gantt.ts`)

- Tipos `TaskPlan`, `StepPlan` y `GanttDraft`, y `borradorVacio()`.
- `spanTarea(t)` y `aplicarBorrador(tasks, draft)`.
- `moverTarea`, `estirarTarea`, `moverPaso` y `estirarPaso`. Son puras: reciben el borrador y la entidad *con el borrador aplicado*, y devuelven el borrador nuevo.
- `cambiosDelBorrador(tasks, draft): Cambio[]`:
  - Omite lo que vuelve a su valor original.
  - Cada `CambioPaso` lleva `fueraDePlazo`, calculado con la tarea ya modificada.
- `ventanaGantt(tasks, hoy)` cubre de hoy −7 a hoy +56 días, y se amplía para incluir todos los rangos (con 2 días de margen al inicio y 7 al final).

## Pruebas

### vitest
- `spanTarea`: completo, sin fechas y solo con deadline.
- `moverTarea` arrastra los pasos programados y no toca los que no lo están.
- Ida y vuelta (+3 y luego −3) no deja cambios.
- `estirarTarea` respeta el inicio como mínimo, y `estirarPaso` el mínimo de 1 día.
- `cambiosDelBorrador` marca "fuera de plazo".
- `ventanaGantt`.

### pgTAP
- `aplicar_plan` aplica tareas y pasos.
- Un plan con un paso inválido no aplica nada.
- Otro usuario recibe `P0002`.
- `anon` no puede ejecutarla.

### Chrome
- Activar la edición.
- Arrastrar una tarea (se mueven sus pasos) y el borde de un paso.
- Teclado.
- Contador de cambios, resumen, "Volver a editar", confirmar y comprobar que persiste.
- Descartar con confirmación.
- Guardia al cambiar de pestaña.
- Ancho de 375 px con scroll horizontal.
- Sin errores de consola.
