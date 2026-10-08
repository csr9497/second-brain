# PRD — Second Brain

Especificación funcional. Cada feature refleja el mockup `design/mockup.html`.
Usuario: una sola persona (Cesar). No hay multi-tenant al inicio.

## 1. Principios de producto

- **Fricción cero al capturar y al marcar.** Todo lo diario debe ser 1–2 toques.
- **Nada se pierde.** Una tarea no marcada no desaparece; migra a incumplimiento.
- **Todo cuelga de proyectos**, y los proyectos de metas. La acción diaria siempre
  se puede rastrear hasta un objetivo.
- **La app muestra el estado; no pide que lo escribas.** La revisión es un reporte.

## 2. Pantalla principal (Hoy)

Orden vertical:
1. Encabezado: fecha, título, saludo.
2. **Acciones rápidas** (fila de 3 botones): Tarea rápida · Revisión semanal · Captura rápida.
3. **Hábitos de hoy**.
4. **Pendientes** (con filtro Hoy / Semana / Todas) + **En incumplimiento**.
5. **Proyectos en curso**.

## 3. Hábitos

- Un hábito se programa en **turnos**: una lista unida por "y" (+) de turnos, cada uno
  con franjas alternativas unidas por "o". Cada franja (`manana` | `tarde` | `noche`)
  se usa una sola vez. Ej.: Mañana + (Tarde o Noche).
- Se marca **una vez por turno**: un turno con alternativas se puede cumplir en
  cualquiera de sus franjas. Hoy lo muestra en la pestaña de cada una y, al hacerse,
  indica en cuál ("hecho por la tarde").
- La vista tiene 3 pestañas (una por franja). **La pestaña activa por defecto es la
  de la franja horaria actual** (mañana <12h, tarde 12–19h, noche ≥19h).
- Marcar/desmarcar un turno registra su estado **para el día actual**.
- **% del día** = turnos hechos / total de turnos de los hábitos vigentes ese día
  (todas las franjas), mostrado como anillo de progreso.
- **Racha**: nº de días consecutivos con % del día = 100% (configurable: podría ser
  ≥ umbral). Se rompe si un día cerró sin llegar al umbral. Cuenta turnos de los
  hábitos vigentes ese día.
- Persistencia: un registro por (hábito, fecha, franja). Archivar, reactivar y editar
  un hábito conservan el historial exacto mediante periodos.
- **Hábitos semanales** (`veces_semana` 1–7): en vez de turnos tienen una meta de N días
  por semana (p. ej. «Inglés — práctica 1 h, 5 veces por semana»), cualquier día. Se marcan
  como mucho una vez al día. En Hoy van aparte («📅 Esta semana», con su progreso N/M) y
  **no cuentan en el % del día ni en la racha**. En la revisión suman su meta completa al
  % semanal, con tope en la meta. Cambiar la meta abre un periodo nuevo, como los turnos.
- **Hábitos vinculados a tareas**: una tarea puede vincularse a varios hábitos (p. ej.
  «Leer libro de matemática» → Estudio y Lectura). Al completar la tarea o uno de sus
  pasos, cada hábito vinculado se marca ese día (diario: el primer turno pendiente,
  prefiriendo el de la franja actual; semanal: el día). Una tarea, con sus pasos, cuenta
  una vez por día y hábito. Desmarcar la tarea o el paso borra solo lo que marcó; un
  registro hecho a mano no se toca.

## 4. Tareas / Pendientes

Campos de una tarea:
- `title` (obligatorio), `description`
- `type`: Estudio | Trabajo | Tesis | Personal | Revisión (configurable)
- `project_id` (opcional), `area_id` (derivable del proyecto)
- `priority`: alta | media | baja
- `status`: por_hacer | en_curso | hecha
- `start_date`, `deadline`
- `position`: orden manual (ver reordenamiento)
- `notes`

Reglas:
- **Subtareas (pasos).** Una tarea puede tener N pasos (`steps`). Si tiene >1 paso,
  se muestra el contador `hechos/total` y un desplegable con cada paso marcable.
  Al completar todos los pasos, la tarea se marca hecha automáticamente.
- **Pasos programados.** La duración de un paso es **o** un rango de fechas (un día o
  varios) **o** un tiempo estimado en horas o minutos en un solo día; no tienen hora de
  inicio. «Encadenar» coloca los pasos seguidos: los de días, uno tras otro; los de
  tiempo, en el mismo día en el orden de la lista mientras quepan en una jornada de 8 h.
  Un paso fuera del plazo de la tarea se marca con color, sin mover la fila.
- **Planificador del modal.** En el calendario, tocar un día lo expande para ver la
  tarea, sus pasos y los encadenados por tiempo en orden (con el total del día); solo
  arrastrar de un día a otro (o «＋ Paso este día») abre el campo para agregar un paso.
  En los Gantt, seleccionar fechas en la cabecera hace zoom a ese rango; con zoom
  suficiente los pasos por tiempo de un día se ven uno tras otro y se estiran de 15 en
  15 minutos. La lista de pasos se reordena arrastrando ⠿ (solo cambia el orden).
- **Reordenamiento.** El usuario arrastra tareas para ordenarlas manualmente, sin
  importar prioridad. El orden se guarda en `position`. (dnd-kit en el front;
  endpoint de reorder en el back.)
- **Permanencia.** Una tarea con `status != hecha` sigue visible aunque pase el día.
- **Filtro** de la lista:
  - *Hoy*: hoy cae dentro de su rango inicio–deadline (todos los días), o deadline = hoy, o sin deadline y con inicio hoy, o con un paso
    pendiente programado que cubre hoy.
  - *Semana*: lo de Hoy más deadline hasta el domingo, fecha de inicio dentro de la
    semana (lun–dom) o un paso pendiente en algún día de la semana.
  - *Todas*.
- **Incumplimiento.** Lista aparte con tareas donde `deadline < hoy` y `status != hecha`.
  Se muestra con acento rojo y "venció hace N días".

## 5. Proyectos

Campos:
- `name`, `area_id`, `goal_id`, `status` (idea | en_curso | en_pausa | completado | archivado)
- `priority`, `next_action` (texto)
- `schedule_days`: días de la semana de aplicación (p. ej. [lun, mié, sáb])
- `total_progress`: % total del proyecto (manual o derivado de tareas/hitos)

Vista:
- Los proyectos cuya aplicación es **hoy** ("hoy toca") se ordenan primero, con badge.
- Dos barras por proyecto:
  - **% semana**: tareas del proyecto completadas esta semana / total de la semana.
  - **% total**: avance global del proyecto.
- Muestra `next_action` y los días de aplicación.
- Regla de foco (WIP): recordar máximo 2–3 en "en_curso" (aviso suave, no bloqueo).

## 6. Acciones rápidas (modales)

- **Tarea rápida** → formulario: título, descripción, pasos (subtareas, añadibles),
  tipo, proyecto relacionado, fecha inicio, deadline, notas. Crea la tarea.
- **Captura rápida** → modal con input para una idea nueva; se agrega a la lista de
  ideas (Inbox). Se procesan luego en la revisión.
- **Revisión semanal** → **reporte** (no formulario) del cumplimiento de la semana:
  - Dos pestañas:
    - **Proyectos**: KPIs de tareas hechas/total, nº incumplidas y proyectos sin tocar.
      Por cada proyecto en curso, una tarjeta con % de la semana (tareas con deadline en la
      semana), % de pasos hechos, avance total, siguiente acción y si se tocó. Debajo, sus
      tareas en seguimiento (pendientes, más las hechas que vencían o se completaron en la
      semana; vencidas primero) con el progreso de sus pasos y cada paso desplegable: hecho
      o pendiente, rango, «esta semana» y «fuera de plazo».
    - **Hábitos**: KPIs de % hábitos de la semana y racha actual. Por cada hábito vigente:
      una fila lunes–domingo con los turnos hechos de cada día (✓, parcial, sin hacer,
      no vigente o aún no llega) y su % de la semana.
  - Campo opcional de "nota de cierre".
  - Acción "Archivar semana" (guarda una foto del reporte en el historial).

## 7. Alertas / notificaciones

- **Recordatorio de hábitos**: un recordatorio por franja a la hora configurada, solo si
  quedan turnos de hábitos diarios sin marcar; `pg_cron` + Edge Function + Web Push.
  Runbook en `docs/ALERTAS.md`.
- Futuro: recordatorio de deadlines y de "proyecto que hoy toca y no avanzaste".

## 8. Requisitos no funcionales

- **Responsive / móvil primero** para el marcado diario; PWA instalable (✅ hecha).
- Tema oscuro por defecto (tokens en el mockup), con claro opcional.
- Un solo usuario; auth simple. Datos privados.
- Offline-friendly deseable a futuro (marcar hábitos sin red y sincronizar).
