# Pasos con fecha y duración — diseño

Entregable 2, pieza 3 de 6. Es la base del Gantt (pieza 5).

## Objetivo

Cada paso de una tarea se puede programar con una **fecha de inicio** y una **duración en días**. El fin se calcula, y si un paso queda fuera del plazo de su tarea se avisa sin bloquear. Hay además un atajo para encadenar los pasos uno tras otro.

## Decisiones

- **Unidad:** días. El fin es `start_date + duracion_dias - 1`, con el día de inicio incluido, así que un paso de 1 día termina el mismo día que empieza.
- **Fuera de plazo:** se permite con aviso. Un paso está fuera de plazo si empieza antes del `start_date` de la tarea o termina después de su `deadline`. Si la tarea no tiene alguna de esas fechas, ese lado no se comprueba.
- **Pasos sin programar:** siguen siendo válidos y no aparecen en el Gantt.

## Datos (migración `steps_programacion`)

```sql
alter table public.steps
  add column start_date date,
  add column duracion_dias int,
  add constraint steps_programacion_completa check ((start_date is null) = (duracion_dias is null)),
  add constraint steps_duracion_positiva check (duracion_dias is null or duracion_dias >= 1);
```

## Dominio (`packages/shared`)

- `Step` gana `startDate: string | null` y `duracionDias: number | null`.
- `createTaskInput.steps[]` acepta `startDate` y `duracionDias`, ambos opcionales y juntos.
- `updateStepInput` es nuevo y acepta `title`, `startDate` y `duracionDias`, todos opcionales, con un `refine` que exige que al menos uno venga definido.
- `src/domain/pasos.ts`, nuevo, con tests:
  - `finPaso(p)` devuelve la fecha de fin, o `null` si el paso no está programado.
  - `fueraDePlazo(p, tarea)` aplica la regla de las decisiones.
  - `encadenar(pasos, desde)` hace que cada paso empiece el día siguiente al fin del anterior. Usa la duración de cada paso, o 1 si no tiene, y devuelve copias de los pasos.

## API (`apps/web/src/lib/api.ts`)

- `toTask` mapea `start_date` y `duracion_dias` de cada paso.
- `createTask` inserta los pasos con su programación.
- `addStep(taskId, { title, startDate, duracionDias })`.
- `updateStep(id, patch)` sustituye a `renameStep` y escribe solo los campos definidos.

## UI

### Modal de tarea (`TaskModal`)
- **Fila de cada paso:**
  - Primera línea: título y ✕.
  - Segunda línea: un `input type="date"` de inicio, un `input type="number"` de días (`min=1`, placeholder "días") y el rango calculado ("6 oct → 8 oct", o "6 oct" si dura un día).
  - Si el paso está fuera de plazo, una etiqueta roja **"fuera de plazo"**.
- **Al guardar:** con fecha y sin días se usa 1; los días se redondean y tienen un mínimo de 1; sin fecha, la programación queda en null. En edición se llama a `updateStep` solo si cambió el título, la fecha o los días.
- **Botón "Encadenar pasos"** (junto a "+ Añadir paso"):
  - Aplica `encadenar` a los pasos con título, desde el `startDate` del formulario o desde hoy.
  - Se deshabilita si no hay pasos con título.

### Lista de tareas (`Tasks.tsx`)
- En la lista de pasos, cada paso programado muestra su rango en pequeño y la etiqueta roja "fuera de plazo" cuando corresponde.

## Pruebas

- **vitest:**
  - `finPaso`: 1 día, varios días y paso sin programar.
  - `fueraDePlazo`: dentro, termina después del deadline, empieza antes del inicio, tarea sin fechas y paso sin programar.
  - `encadenar`: duraciones 2, nula y 3 desde `2026-10-06` dan inicios en 6, 8 y 9 de octubre.
  - Esquemas: `createTaskInput` con pasos programados y `updateStepInput` vacío falla.
- **pgTAP:**
  - Fecha sin días viola el CHECK.
  - Duración 0 viola el CHECK.
  - Fecha con días es válida.
- **Manual en Chrome:** programar pasos, encadenarlos, ver el aviso de fuera de plazo, comprobar que persiste tras guardar y reabrir, ver el rango en la lista y revisar el ancho de 375 px.

## Fuera de alcance

- La barra de la tarea que abarca sus pasos y la línea del deadline: son del Gantt (pieza 5).
- Las dependencias entre pasos; "Encadenar" cubre el caso secuencial de forma manual.
