# CRUD de hábitos y racha por vigencia — diseño

Entregable 2, pieza 2 de 6. Se apoya en la pieza 1: `Select`, `SLOT_OPTIONS` y `Dot`.

## Objetivo

Crear, editar, archivar, reactivar y eliminar hábitos desde la app. Que la racha y los porcentajes cuenten, para cada día, los hábitos **vigentes ese día**: crear un hábito no borra la racha ganada y archivar uno no reescribe el pasado. Esto también deja listo el calendario (pieza 4), que necesita saber qué hábitos existían cada día.

## Datos

Migración `habits_vigencia`:

```sql
alter table public.habits
  add column created_at  timestamptz not null default now(),
  add column archived_at timestamptz;

-- Relleno: los hábitos existentes "nacen" el día de su primer registro
update public.habits h
   set created_at = coalesce((select min(l.fecha)::timestamptz from public.habit_logs l where l.habit_id = h.id), h.created_at);
update public.habits set archived_at = now() where not active;

-- active pasa a derivarse de archived_at (una sola fuente de verdad)
alter table public.habits drop column active;
alter table public.habits add column active boolean generated always as (archived_at is null) stored;
```

- `min(fecha)::timestamptz` es la medianoche UTC, que en America/Lima cae el día anterior. Que el hábito "nazca" un día antes es inofensivo: ese día no tiene registros previos que alterar.
- `seed.sql` inserta los 6 hábitos demo con `created_at = now() - interval '10 days'`, para que sigan contando los 5 días de racha del seed.
- RLS y grants no cambian. La política `owner_all` ya cubre la tabla.

## Dominio (`packages/shared`)

- `HabitRow` gana `createdAt: string` y `archivedAt: string | null`, ambos ISO timestamp.
- `dates.ts` o `metrics.ts` gana `habitsOn(habits, fecha)`. Devuelve los hábitos con `toISO(createdAt) <= fecha` y que no tienen `archivedAt` o tienen `toISO(archivedAt) > fecha`. `toISO` convierte a fecha local, igual que `completedAt` en las tareas.
  - Un hábito archivado hoy ya no cuenta hoy.
- `computeStreak(doneByDate, today, totalOn: (fecha) => number, threshold?)`:
  - Un día es completo si `totalOn(d) > 0` y el % de hechos llega al umbral.
  - Un día con 0 hábitos vigentes **corta** la racha.
  - Hoy sigue sumando si está completo y no rompe si no lo está.
- `doneByDate` solo cuenta los registros de hábitos vigentes en la fecha del registro.
- `buildToday`:
  - La lista y `pctDia` usan `habitsOn(habits, today)`.
  - La racha usa `totalOn = (d) => habitsOn(habits, d).length`.
- `buildWeeklyReport`: `habitsPct = pct(Σ hechos vigentes, Σ vigentes)` sobre los días transcurridos de la semana.
- `DashboardInput.habits` pasa a ser **todos** los hábitos, archivados incluidos. Su comentario se actualiza.
- **Esquemas:**
  - `updateHabitInput` pierde `active`, porque archivar y reactivar tienen acciones propias.
  - `createHabitInput` y `updateHabitInput` mantienen `nombre` y `slot`.
- **Salida:** un tipo nuevo `HabitAdmin { id, nombre, slot, position, archivedAt: string | null }` para el modal de gestión.

## API (`apps/web/src/lib/api.ts`)

- `loadDashboard` trae todos los hábitos: `select('id, nombre, slot, position, created_at, archived_at')`, sin filtrar `active`.
- `habits(): Promise<HabitAdmin[]>`: todos, ordenados por `position`.
- `createHabit({ nombre, slot })`: la `position` es el máximo actual más 1000, así queda al final, como en las tareas.
- `updateHabit(id, { nombre?, slot? })`.
- `archiveHabit(id)`: pone `archived_at = now()`.
- `reactivateHabit(id)`: pone `archived_at = null` y `created_at = now()`. El hábito cuenta como nuevo desde hoy, para que los días que pasó archivado no se vuelvan incumplidos. Sus registros antiguos se conservan pero dejan de contar.
- `deleteHabit(id)`: borrado real. Sus `habit_logs` se van en cascada.
- Todas las mutaciones invalidan `['today']` y `['habits']`.

## UI

- **Encabezado "Hábitos de hoy":** la etiqueta "se abre según la hora" se sustituye por un botón **"✏️ Gestionar"**.
- **`HabitsManager`**, un modal nuevo:
  - Lista los hábitos activos agrupados por franja, en el orden de `SLOT_OPTIONS`, con el `Dot` de la franja.
  - Cada fila tiene el nombre, "Editar" (abre `HabitModal`) y "Archivar".
  - Botón **"+ Nuevo hábito"**.
  - Sección plegable **"Archivados (n)"**, cerrada por defecto. Cada archivado tiene "Reactivar" y "Eliminar" (`ConfirmDelete`), con el aviso de que se borra su historial.
  - Estado vacío: "Aún no tienes hábitos".
- **`HabitModal`** sirve para crear y para editar: campos "Nombre" (obligatorio) y "Franja" (`Select` con `SLOT_OPTIONS`; por defecto, la franja actual).
  - Sigue el patrón de `TaskModal` y `ProjectModal`: `useMutation`, toast y `onSettled` que invalida.
  - Abrir `HabitModal` desde `HabitsManager` apila dos modales. Para evitarlo, `HabitsManager` se cierra y `App` vuelve a abrirlo al guardar o cancelar. El estado vive en el `ModalState` de `App`, con `{ kind: 'habitos' } | { kind: 'habito'; habit?: HabitAdmin }`.
- Los chips de la pantalla Hoy no cambian: un toque marca o desmarca.
- **Fuera de alcance:** reordenar hábitos y los días de aplicación por hábito.

## Pruebas

- **vitest (`packages/shared`):**
  - `habitsOn`: incluye el día de creación, excluye el día de archivado y los posteriores.
  - Racha: crear hoy un hábito nuevo no la rompe.
  - Racha: archivar un hábito no cambia los días pasados.
  - Racha: un día sin hábitos vigentes la corta.
  - Racha: los casos existentes siguen pasando, adaptados a `totalOn`.
  - `buildWeeklyReport.habitsPct` cuenta los vigentes de cada día.
  - `buildToday` no lista los archivados.
  - `updateHabitInput` ya no acepta `active`.
- **pgTAP:**
  - Un hábito nuevo nace con `active = true` y `created_at` relleno.
  - Con `archived_at` puesto, `active = false`.
  - `active` no se puede escribir directamente: hacerlo da un error de columna generada.
- **Manual en Chrome (dev):**
  - Crear un hábito: aparece en su franja y la racha se mantiene.
  - Editar el nombre y la franja.
  - Archivar: sale de Hoy, la racha no cambia y aparece en "Archivados".
  - Reactivar.
  - Eliminar: desaparece por completo.
  - Temas claro y oscuro, y ancho de 375 px.

## Despliegue

- La migración se aplica en local, luego en dev y, al publicar el entregable, en producción, **antes** que el frontend.
- Compatibilidad: el frontend publicado hoy filtra por `active`. Como esa columna sigue existiendo (ahora generada), aplicar la migración antes del frontend nuevo no rompe la versión publicada.
