# Navegación y vista Calendario — diseño

Entregable 2, pieza 4 de 6.

## Objetivo

Añadir una segunda vista, **Calendario**, accesible desde unas pestañas **Hoy · Calendario**. Muestra un mes con las tareas que vencen, los pasos programados y el cumplimiento de hábitos de cada día, y un panel con el detalle del día elegido. Los días pasados son de **solo lectura** en hábitos; las tareas se editan con el modal de siempre.

## Navegación

- Las pestañas usan el hash de la URL: `#/` es Hoy y `#/calendario` es el Calendario. Un hook `useVista()` escucha `hashchange`, sin añadir ningún router.
- Las pestañas son enlaces (`<a href>`) con `aria-current="page"`. Están debajo del encabezado y encima de las acciones rápidas, que solo aparecen en Hoy.
- Los modales siguen viviendo en `App`: el calendario abre el mismo `TaskModal` para editar una tarea.
- La pestaña Gantt llega en la pieza 5.

## Datos

### `Task.projectColor`
- `Task` gana `projectColor: PaletteColor | null`.
- Todas las consultas de tareas pasan a seleccionar `project:projects(nombre, color)`.

### `api.calendar(mes)`, query `['calendar', 'YYYY-MM']`
- La rejilla va del lunes en o antes del día 1 al domingo en o después del último día (`calendarGrid`).
- Se cargan:
  1. Las tareas con `deadline` dentro de la rejilla, con sus pasos.
  2. Los `task_id` de pasos con `start_date` entre un año antes del inicio de la rejilla y su fin. Las tareas que falten se cargan aparte con `in('id', …)`.
  3. Todos los hábitos con sus periodos, con el mismo mapeo que `loadDashboard`, extraído a `toHabitRow`.
  4. Los registros hechos (`done = true`) de la rejilla, con `fetchAll`.
- **Invalidación:** el modal de tarea, el de proyecto y cualquier cambio de hábitos invalidan además `['calendar']`.

## Dominio (`packages/shared`)

- **`fichasDelDia(habits, logs, fecha)`**, en `dashboard.ts`, extraída de `buildToday`. Devuelve `{ porFranja, turnos, hechos }` con exactamente la misma regla de turnos. `buildToday` pasa a usarla y su comportamiento no cambia.
- **`domain/calendar.ts`:**
  - `mesDe(iso)` devuelve `'YYYY-MM'`, y `sumarMeses(mes, n)` cruza años.
  - `calendarGrid(mes)` devuelve `{ start, end }`.
  - `buildCalendar({ mes, hoy, tasks, habits, doneLogs })` devuelve `{ mes, semanas: CalendarDay[][] }`.
- **`CalendarDay`:**
  - `fecha`, `enMes`, `esHoy` y `esFuturo`.
  - `vencen: Task[]`: las tareas con `deadline` ese día, por `position`.
  - `pasos: { paso, tarea }[]`: los pasos con `startDate <= fecha <= finPaso`.
  - `habitos: { porFranja, turnos, hechos, pct }`: `pct` es `null` en días futuros o sin turnos.

## UI

### `CalendarView`
- **Cabecera:** el nombre del mes ("octubre 2026") con los botones `‹`, "Hoy" y `›`.
- **Selección:**
  - Por defecto, hoy.
  - Al cambiar de mes se selecciona el día 1, o hoy si es el mes actual.
- **Rejilla:** de lunes a domingo, con el encabezado `Lun … Dom`. Los días de otros meses aparecen atenuados.
- **Celda:** es un `<button>` con `aria-pressed` y un `aria-label` que resume el día. Contiene:
  - El número del día, con hoy resaltado en círculo `accent`.
  - Un **mini anillo** de hábitos cuando `pct` no es `null`.
  - **Marcas** con el color del proyecto (`gris` si no tiene), hasta 3, y "+n" si hay más:
    - un **punto** por cada tarea que vence, con un `!` rojo si está vencida sin hacer;
    - una **barra** por cada paso.
- **Panel del día** (a la derecha en `md:` y debajo en móvil), con tres secciones:
  - **Vencen:** cada tarea con su punto y el estado "vencida"; al tocarla se abre el modal.
  - **Pasos:** el título del paso, su tarea y el rango; al tocarlo se abre la tarea.
  - **Hábitos · N%:** las fichas de solo lectura, con ✓, ○ o ◦ ("programado" en días futuros) y la anotación "hecho por la tarde".
  - Cada sección tiene su texto para cuando está vacía.

## Pruebas

### vitest
- `mesDe` y `sumarMeses`, incluido el cambio de año.
- La rejilla de octubre de 2026 va del 28 de septiembre al 1 de noviembre: 5 semanas.
- Las tareas aparecen por deadline.
- Un paso del 30 de septiembre al 2 de octubre aparece en cada día de su rango.
- El % por turnos es 50 un día pasado, y `null` en días futuros y en días sin hábitos.
- En un día futuro se ven las fichas programadas.
- Los tests existentes de `buildToday` siguen pasando.

### Chrome
- Cambiar de pestañas y recargar en `#/calendario`.
- Navegar entre meses.
- Ver puntos, barras y anillo.
- Abrir un día y editar una tarea desde el panel.
- Revisar el ancho de 375 px, los dos temas y que no haya errores en consola.
