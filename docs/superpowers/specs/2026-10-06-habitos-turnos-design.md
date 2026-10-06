# Hábitos en varias franjas ("y" / "o") — diseño

Entregable 2, revisión de la pieza 2. Sustituye la franja única (`habits.slot`) por una expresión de franjas, y mantiene el historial exacto con periodos.

## Objetivo

Un hábito puede programarse en varias franjas, combinadas con **"+" (y)** y **"o" (alternativa)**. Por ejemplo, `Mañana + (Tarde o Noche)` se cumple dos veces al día: una por la mañana y otra por la tarde o por la noche. Se marca **una vez por turno**, y crearlo y editarlo se hace con un constructor guiado y validado.

## Modelo

- **Turnos:** `HabitSlot[][]`, una lista de turnos (unidos por "y"). Cada turno es una lista de franjas alternativas (unidas por "o").
  - `[["manana"],["noche"]]` es Mañana + Noche.
  - `[["manana","tarde"]]` es Mañana o Tarde.
  - `[["manana"],["tarde","noche"]]` es Mañana + (Tarde o Noche).
- **Reglas de validez** (iguales en Zod y en un CHECK de la base):
  - Es un array de entre 1 y 3 turnos.
  - Cada turno es un array no vacío.
  - Toda franja es `manana`, `tarde` o `noche`.
  - **Ninguna franja se repite** en todo el hábito.
- No se admite la forma "o" de "y", del tipo `(Mañana + Tarde) o Noche`.
- **Unidad de cumplimiento:** el turno. Un turno está hecho en la fecha *d* si existe un registro de *d* cuya franja pertenece a ese turno. Como las franjas no se repiten, cada registro pertenece a un único turno.

## Datos (migración `habits_turnos`)

### `habits`
- Columna nueva `turnos jsonb not null` con `check (public.turnos_validos(turnos))`. Su relleno es `jsonb_build_array(jsonb_build_array(slot))`.
- `slot` deja de escribirse y pasa a ser **columna generada**: `slot text generated always as (turnos->0->>0) stored`, la primera franja. Así el frontend publicado sigue leyendo `slot` sin romperse.
- `turnos_validos(jsonb)` es una función `immutable` en plpgsql que aplica las reglas de validez.

### `habit_periods`
- Columna nueva `turnos jsonb not null`, rellenada con los turnos del hábito: es la programación vigente durante ese periodo.
- El trigger `habits_sync_periods` amplía su alcance a `after insert or update of archived_at, turnos`:
  - **Insertar:** abre un periodo con `turnos = new.turnos`. Los casos de archivar y reactivar quedan como antes; reactivar abre el periodo con los turnos actuales.
  - **Cambiar `turnos` con el hábito activo** (y `old.turnos is distinct from new.turnos`): cierra el periodo abierto con `hasta = now()` y abre uno nuevo con `desde = now()` y los turnos nuevos.
  - **Cambiar `turnos` con el hábito archivado:** no toca los periodos. Al reactivar se usarán los turnos nuevos.
- **Resultado:** editar las franjas no reescribe el pasado. Hoy ya cuenta la programación nueva, porque el periodo viejo, cerrado hoy, deja de cubrir el día de hoy.

### `habit_logs`
- Columna nueva `slot text not null`, con un CHECK que la limita a las 3 franjas. Se rellena con el `slot` del hábito.
- La unicidad pasa de `(habit_id, fecha)` a `(habit_id, fecha, slot)`.
- **Compatibilidad:** el frontend publicado hace `upsert … onConflict: 'habit_id,fecha'`. Sin esa unicidad, Postgres rechaza el upsert, así que **entre `db push` y el deploy de Pages, marcar hábitos falla** en la versión publicada, con un toast de error y sin perder datos. Leer sigue funcionando. Se acepta porque la ventana dura solo lo que tarde el workflow de Pages (push a `main` justo después de la migración). Queda en el checklist del deploy.

## Dominio (`packages/shared`)

### `src/turnos.ts`, nuevo y puro
- `turnosSchema`: el Zod con las reglas de validez y mensajes en español. Los mensajes son:
  - "Elige al menos una franja".
  - "Cada franja solo puede usarse una vez".
  - "Máximo 3 turnos".
- `franjasLibres(turnos)` devuelve las franjas aún no usadas, en orden mañana, tarde, noche.
- `formatTurnos(turnos)` devuelve el texto de la expresión, como `"Mañana + (Tarde o Noche)"`. Pone paréntesis solo en los turnos con alternativas, siempre que haya más de un turno.
- `resumenTurnos(turnos)` devuelve la frase de ayuda. Ejemplos:
  - `[["manana"],["tarde","noche"]]` da "Se marca 2 veces al día: por la mañana, y por la tarde o la noche".
  - `[["manana","tarde"]]` da "Se marca 1 vez al día: por la mañana o la tarde".

### Esquemas
- `habitFields = { nombre, turnos: turnosSchema }`.
- `createHabitInput` usa `[["manana"]]` como `turnos` por defecto.
- `updateHabitInput` se queda como `partial` más `refine`.
- `HabitAdmin` cambia `slot` por `turnos`.

### `dashboard.ts`
- `HabitPeriod` gana `turnos: HabitSlot[][]`.
- `periodoEn(h, fecha)` devuelve el periodo que cubre la fecha, o `undefined`. `habitsOn` se apoya en él.
- `turnosEn(habits, fecha)` devuelve `{ habit, turnos }` de los hábitos vigentes, con los turnos de su periodo ese día.
- `doneLogs` pasa a ser `{ habitId, fecha, slot }[]`.
- `doneByDate` cuenta, para cada fecha, los **turnos hechos** de los hábitos vigentes.
- `totalOn(d)` cuenta los **turnos vigentes**. La racha y el `habitsPct` semanal usan turnos.
- `buildToday`:
  - `porFranja[franja]` es una lista de **fichas** `HabitChip { id, nombre, position, slot, turno: HabitSlot[], done, doneIn: HabitSlot | null }`, una por cada franja de cada turno vigente hoy.
  - `done` y `doneIn` se calculan por turno: si el turno se hizo en otra franja, la ficha aparece hecha con `doneIn` igual a esa franja.
  - `pctDia` es turnos hechos entre turnos de hoy.
- `TodayPayload.habits.porFranja` pasa a ser `Record<HabitSlot, HabitChip[]>`. `Habit` se elimina si nadie más lo usa.

## API (`apps/web/src/lib/api.ts`)

- `loadDashboard`:
  - Los hábitos se traen con `periods:habit_periods(desde, hasta, turnos)`.
  - Los registros se traen con `select('habit_id, fecha, slot')`.
- `toggleHabit(id, slot)`. El cliente le pasa además el turno de la ficha:
  - Si el turno ya está hecho, desmarca su registro (`done = false` en la fila de la franja `doneIn`).
  - Si no está hecho, hace upsert de `(habit_id, fecha, slot)` con `done = true` y `onConflict: 'habit_id,fecha,slot'`.
  - La firma queda `toggleHabit({ id, slot, doneIn }: { id; slot; doneIn: HabitSlot | null })`.
- `createHabit` y `updateHabit` envían `turnos` y nunca `slot`.
- `habits()` devuelve `turnos`.

## UI

### Pantalla Hoy (`Habits.tsx`)
- Cada pestaña lista las fichas de su franja.
- Una ficha hecha en otra franja de su turno se muestra marcada con el texto pequeño "hecho por la tarde" (según `doneIn`). Tocarla desmarca el turno.
- El cambio optimista marca o desmarca todas las fichas del mismo hábito y turno, y recalcula `pctDia` como turnos únicos hechos entre turnos únicos.

### Constructor de franjas (`components/ui/TurnosBuilder.tsx`, en `HabitModal`)
- Una fila por turno. Cada franja es una ficha con su `Dot` y una ✕, y las fichas se unen con la palabra **"o"**. Entre filas aparece un separador **"+"**.
- Al final de cada fila, el botón **"o…"** muestra en línea las franjas libres como botones. Al pulsar una se añade como alternativa a ese turno.
- Bajo las filas, el botón **"+ Añadir turno"** muestra en línea las franjas libres; al pulsar una se crea un turno nuevo con ella.
- **Validaciones visibles:**
  - Sin franjas libres, "o…" y "+ Añadir turno" se deshabilitan con el título "Ya usaste las 3 franjas".
  - Quitar la última franja de un turno elimina el turno. No se puede quitar la última franja del hábito: su ✕ está deshabilitada.
  - El botón "Guardar" exige que `turnosSchema` sea válido.
- **Ayuda:** debajo se muestra `formatTurnos` en negrita y `resumenTurnos` en texto tenue.
- **Accesibilidad:** cada ✕ lleva `aria-label="Quitar Tarde"`, y cada botón de franja libre `aria-label="Añadir Noche como alternativa"` o `"Añadir turno de Noche"`.
- **Estado inicial:**
  - Hábito nuevo: `[[franja actual]]`.
  - Edición: los `turnos` del hábito.

### `HabitsManager`
- **"+ Nuevo hábito"** pasa **arriba** del todo, como botón primario pequeño y separado de la lista.
- La lista deja de agruparse por franja: es una lista plana por `position`. Cada fila muestra los `Dot` de sus franjas, el nombre y, debajo en pequeño, `formatTurnos`. Las acciones Editar y Archivar no cambian.
- Los archivados muestran también `formatTurnos`.

## Pruebas

### vitest (`packages/shared`)
- **`turnosSchema`:**
  - Acepta los 3 ejemplos del modelo.
  - Rechaza `[]`, `[[]]`, una franja repetida (`[["manana"],["manana"]]` y `[["manana","manana"]]`) y una franja inválida.
- **`franjasLibres`, `formatTurnos` y `resumenTurnos`:** los casos del spec.
- **`buildToday`:**
  - "Mañana + Noche" con solo la mañana hecha da `pctDia` 50, y sus fichas aparecen en las dos pestañas.
  - "Tarde o Noche" hecho en tarde: la ficha de noche sale hecha con `doneIn = 'tarde'` y `pctDia` 100.
- **Racha:**
  - Cambiar los turnos hoy, con un periodo nuevo, no cambia los días pasados.
  - Un día completo con dos turnos exige los dos.
- **Semanal:** `habitsPct` cuenta turnos.

### pgTAP
- `turnos` inválidos violan el CHECK.
- `slot` es generado y no se puede escribir.
- Cambiar `turnos` en un hábito activo cierra un periodo y abre otro con los turnos nuevos.
- Dos registros del mismo hábito y fecha en franjas distintas se permiten; dos en la misma franja, no.

### Manual en Chrome (local)
- Crear `Mañana + (Tarde o Noche)` con el constructor.
- Comprobar las validaciones: franjas deshabilitadas y "Guardar" bloqueado.
- Marcar en Hoy: la ficha de noche muestra "hecho por la tarde".
- Comprobar el % y la racha.
- Editar a "Mañana o Tarde" y ver que los días pasados no cambian.
- Revisar el ancho de 375 px y los temas claro y oscuro.

## Despliegue

- Orden: `supabase db push` a producción (todas las migraciones del entregable) e **inmediatamente** el push a `main`.
- Durante la ventana entre ambos, el frontend publicado sigue mostrando Hoy (lee `slot`, ahora generada), pero no puede marcar hábitos.
