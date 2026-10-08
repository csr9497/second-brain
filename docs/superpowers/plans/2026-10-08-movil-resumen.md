# Móvil, burbujas, Resumen, Crear + y detalle de paso: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que la app funcione bien en el iPhone, con burbujas de hábitos en Hoy, la vista Resumen (semana y mes con mapa de calor), el botón Crear + y el detalle de un paso en el Gantt.

**Arquitectura:**
- La lógica nueva va en `@sb/shared` (`buildReport` y `buildMonthlyReport`) y lleva tests.
- La interfaz va en `apps/web`.
- No hay cambios en la base de datos.

**Stack:** React 19, Tailwind v4, TanStack Query, Vitest y Playwright (Chromium ya instalado en `~/Library/Caches/ms-playwright`) para medir a 390 px.

**Spec:** `docs/superpowers/specs/2026-10-08-movil-resumen-design.md` · **Rama:** `feat/movil-resumen`

**Medición a 390 px (sirve para las tareas 1 y 7):**
- Hace falta Supabase local (`pnpm db:start`) y `pnpm dev:local` en segundo plano.
- Un script de Playwright, en el scratchpad y no en el repo:
  1. abre `http://localhost:5173/` con viewport 390×844;
  2. inicia sesión con `dev@local.test` / `devpassword`;
  3. visita `#/`, `#/calendario`, `#/gantt` y, más adelante, `#/resumen`;
  4. en cada vista imprime `document.documentElement.scrollWidth` frente a `innerWidth` y los elementos cuyo `getBoundingClientRect().right > innerWidth`;
  5. guarda una captura de cada vista.

---

### Task 1: Responsive en iPhone

**Archivos:** los que la medición señale (probablemente `App.tsx`, `CalendarView.tsx` y `gantt/GanttView.tsx`).

- [ ] Medir a 390 px y anotar qué elementos desbordan en cada vista.
- [ ] Corregir cada desborde en su origen: `min-w-0`, `flex-wrap` o `truncate` donde falte, y anchos fijos convertidos en fluidos. **Nada de `overflow-x: hidden` en `body`/`html`.**
  - Si el Gantt necesita su desplazamiento lateral, debe ocurrir dentro de su caja (`overflow-x-auto` en el contenedor del Gantt).
- [ ] **Calendario en el teléfono:**
  - las 7 columnas caben;
  - el panel del día va debajo, a todo el ancho;
  - las filas del panel miden al menos 44 px de alto (`min-h-11`).
- [ ] Volver a medir: en las 3 vistas, `scrollWidth === innerWidth`. Revisar las capturas.
- [ ] Correr `pnpm typecheck && pnpm build`.
- [ ] Commit: `web: la app cabe en el iPhone (sin desborde horizontal en Hoy, Calendario y Gantt)`.

### Task 2: Burbujas de hábitos en Hoy

**Archivos:** `apps/web/src/components/Habits.tsx` y `HoyView.tsx` (título).

- [ ] En `HoyView.tsx`, cambiar el `h2` «Hábitos de hoy» por «Hábitos».
- [ ] En `Habits.tsx`, sustituir las fichas (píldoras con casilla) por burbujas, sin tocar `toggle`, `toggleSemanal`, `contarTurnos` ni las pestañas:
  - Cada ficha es un `<button aria-pressed>` en columna, de 64 px de ancho:
    - un círculo de 48 px; pendiente lleva `border-2 border-line`, la inicial en `text-faint` y fondo transparente; hecho lleva `bg-good` y un ✓ (SVG en trazo, `text-good-ink`);
    - debajo, el nombre a 12 px con `truncate`.
  - **`aria-label`:** «{nombre}, {hecho|pendiente}» más «, hecho por {franja}» si `doneIn !== slot`. En ese caso, además, un punto de 8 px en la esquina del círculo.
  - **Contenedor:** `flex flex-wrap gap-3`.
- [ ] **Semanales:** la misma burbuja, con un anillo de progreso SVG alrededor (r ≈ 27, `stroke-dasharray` según `hechas/meta`, `--good`) y el texto `{hechas}/{meta}` bajo el nombre. `aria-label`: «{nombre}: {hechas} de {meta} esta semana{, hecho hoy}».
- [ ] Correr `pnpm typecheck && pnpm build`.
- [ ] Commit: `Hoy: hábitos como burbujas (las marcadas se quedan rellenas) y título «Hábitos»`.

### Task 3: Reportes por rango y mes (`@sb/shared`, TDD)

**Archivos:** `packages/shared/src/domain/dashboard.ts`, `packages/shared/src/index.ts` (tipo `MonthlyReport`) y su test (junto a los tests existentes de `buildWeeklyReport`).

- [ ] Leer `buildWeeklyReport` y sus tests.
- [ ] **Tests primero:**
  - `buildReport(input, { start, end }, false)` con el rango de la semana actual da lo mismo que `buildWeeklyReport(input, false)`.
  - `buildMonthlyReport(input)`:
    - `monthStart`/`monthEnd` son el primer y el último día del mes de `now`;
    - `habitsPct` solo cuenta los días transcurridos;
    - `dias` tiene un elemento por día del mes con `{ fecha, pct, futuro }`;
    - `pct` es null en un día sin hábitos vigentes y también en un día futuro (con `futuro: true`);
    - `perProject` y `perHabit` cubren el mes.
- [ ] Confirmar que fallan.
- [ ] **Implementación:** extraer `buildReport(input, rango, archived)` del cuerpo de `buildWeeklyReport`, cambiando `weekRange(today)` por el rango recibido.
  - `buildWeeklyReport` llama a `buildReport` con `weekRange`.
  - `buildMonthlyReport` llama a `buildReport` con el mes y añade `dias`. El % de cada día sale de la misma lógica que `habitsPct` (hechos / turnos vigentes ese día). Si existe en `calendar.ts`, se reutiliza.
- [ ] **Tipos:** `MonthlyReport = Omit<WeeklyReport, 'weekStart' | 'weekEnd' | 'archived'> & { monthStart; monthEnd; dias }`, y se exporta.
- [ ] Correr `pnpm test && pnpm typecheck`.
- [ ] Commit: `shared: reporte por rango y reporte mensual con % por día`.

### Task 4: Vista Resumen

**Archivos:**
- nuevos: `apps/web/src/components/resumen/ResumenView.tsx`, `ReporteTabs.tsx` y `MapaCalor.tsx`;
- modificados: `lib/useVista.ts`, `lib/api.ts`, `lib/modal.ts`, `App.tsx` y `HoyView.tsx`;
- se elimina `ReviewModal.tsx`, porque su contenido pasa a `ReporteTabs` y `ResumenView`.

- [ ] `VISTAS.resumen = { hash: '#/resumen', label: '📈 Resumen', ancho: 'max-w-[880px]' }`.
- [ ] `api.monthlyReport()` hace `loadDashboard()` y luego `buildMonthlyReport`. Query `['resumen', 'mes']`; la semana usa la query existente (`['review']` o la que use hoy el modal).
- [ ] **ResumenView:**
  - selector Semana | Mes (`role="tablist"`);
  - en **Semana**, lo que mostraba `ReviewModal` (Proyectos/Hábitos, nota y «Archivar semana») sin el `Modal`;
  - en **Mes**, el `MapaCalor` encima y luego `ReporteTabs` con el reporte del mes, sin nota ni archivo.
- [ ] **ReporteTabs:** reutiliza `ProyectosTab` y `HabitosTab` del modal. Si tipan `WeeklyReport`, se amplían a la parte común.
- [ ] **MapaCalor:**
  - cabecera Lun–Dom y una rejilla de 7 columnas con huecos antes del día 1;
  - cuadros `aspect-square` y redondeados;
  - color por tramos (null o futuro → `bg-surface2`; 0 → `bg-line`; 1–49, 50–99 y 100 → `--good` con opacidad creciente);
  - `aria-label` «{fecha}: {pct}%», o «sin hábitos» / «por venir»;
  - una leyenda corta debajo.
- [ ] **Limpieza:** quitar `{ kind: 'revision' }` de `ModalState` y su render en `App`, y quitar la acción `revision` de `HoyView`.
- [ ] Correr `pnpm typecheck && pnpm build`.
- [ ] Commit: `web: vista Resumen con la revisión semanal y la mensual con mapa de calor`.

### Task 5: Crear +

**Archivos:**
- nuevo: `apps/web/src/components/CrearModal.tsx`;
- modificados: `App.tsx`, `HoyView.tsx` y `lib/modal.ts`.

- [ ] `ModalState` gana `{ kind: 'crear' }`, y `habito` gana `volver?: boolean`, que vale `true` cuando se abre desde Gestionar.
  - `HabitModal` vuelve a Gestionar solo si `volver`; si no, cierra.
  - Ajustar `backToHabits` y las llamadas `onNew`/`onEdit` de `HabitsManager`.
- [ ] **CrearModal:** `Modal` con título «Crear» y una rejilla de 2×2 botones grandes de al menos 72 px de alto:
  - 📝 Tarea → `{ kind: 'tarea' }`;
  - ⚡ Captura → `idea`;
  - 🔁 Hábito → `habito`;
  - 📁 Proyecto → `proyecto`.
  - Cada uno sustituye el modal actual (sin apilarlo).
- [ ] **En `App`:**
  - en la fila del `<nav>`, a partir de `sm:`, un botón «＋ Crear» con `ml-auto` y estilo primario;
  - en el teléfono, un botón flotante `fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] size-14 rounded-full` primario con `aria-label="Crear"` y la clase `sm:hidden`;
  - el contenedor reserva espacio abajo para que el botón no tape contenido (`pb-28 sm:pb-[72px]`).
  - El `<nav>` lleva `overflow-x-auto` y pestañas compactas en el teléfono, para que las 4 pestañas no desborden.
- [ ] **HoyView:** se elimina la sección `ACTIONS`.
- [ ] Correr `pnpm typecheck && pnpm build`.
- [ ] Commit: `web: botón Crear + (fila de pestañas en escritorio, flotante en el teléfono) con modal para elegir qué crear`.

### Task 6: Detalle de un paso en el Gantt

**Archivos:**
- nuevo: `apps/web/src/components/gantt/PasoModal.tsx`;
- modificados: `gantt/GanttView.tsx` y `App.tsx` (si `PasoModal` necesita abrir el `TaskModal`).

- [ ] **Clics en los pasos del Gantt, fuera del modo edición:** la barra (`onAbrir`) y el nombre en la columna izquierda abren `PasoModal` con `{ paso, tarea }`. Las filas de tarea siguen abriendo la tarea.
- [ ] **PasoModal**, sobre `Modal`:
  - **Título:** el nombre del paso.
  - **Contenido:**
    - la tarea y el proyecto, con un `Dot` del color del proyecto;
    - el rango de fechas (`rangoPaso`) o el tiempo estimado (formatear `duracionMin` como «1 h 30 min»; si ya hay un formateador en `lib/format.ts`, usar ese);
    - el estado;
    - una etiqueta «Fuera de plazo» si `fueraDePlazo(paso, tarea)`.
  - **Acciones:**
    - «Marcar hecho» / «Desmarcar»: `api.toggleStep(id)`, invalida `['gantt']`, `['today']` y `['calendar']`, y luego cierra con un toast;
    - «Abrir tarea»: `onEditTask(tarea)`.
- [ ] Correr `pnpm typecheck && pnpm build`.
- [ ] Commit: `Gantt: tocar un paso muestra su detalle con marcar hecho y abrir tarea`.

### Task 7: Verificación final y docs

- [ ] Medir a 390 px las 4 vistas (incluida `#/resumen`) con el botón flotante visible: `scrollWidth === innerWidth`. Medir también a 1280 px que «＋ Crear» queda a la derecha.
- [ ] Correr `pnpm typecheck && pnpm test && pnpm build`.
- [ ] **CLAUDE.md:**
  - vistas (`#/resumen`, sin `ReviewModal`);
  - Crear + y `CrearModal`;
  - `PasoModal`;
  - burbujas en Hoy;
  - `buildReport`/`buildMonthlyReport`.
- [ ] **PRD:** la revisión pasa a ser la vista Resumen, con semana y mes.
- [ ] Commit: `docs: Resumen, Crear +, burbujas y detalle de paso`.
