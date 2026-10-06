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
- **Reordenamiento.** El usuario arrastra tareas para ordenarlas manualmente, sin
  importar prioridad. El orden se guarda en `position`. (dnd-kit en el front;
  endpoint de reorder en el back.)
- **Permanencia.** Una tarea con `status != hecha` sigue visible aunque pase el día.
- **Filtro** de la lista:
  - *Hoy*: deadline = hoy, o sin deadline y con fecha de inicio hoy, o con un paso
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
  - KPIs: % hábitos de la semana, tareas hechas/total, nº incumplidas.
  - % de cumplimiento por proyecto.
  - Señales: racha actual, proyectos sin tocar en la semana.
  - Campo opcional de "nota de cierre".
  - Acción "Archivar semana" (guarda una foto del reporte en el historial).

## 7. Alertas / notificaciones

- **Recordatorio de hábitos**: a una hora configurable (p. ej. 21:00), si quedan
  hábitos del día sin marcar → notificación push (y/o email).
- Implementado con un job programado (BullMQ) que corre a esa hora, evalúa el día y
  dispara la notificación. Ver `docs/API.md` y ROADMAP fase 5.
- Futuro: recordatorio de deadlines y de "proyecto que hoy toca y no avanzaste".

## 8. Requisitos no funcionales

- **Responsive / móvil primero** para el marcado diario; PWA instalable (fase 6).
- Tema oscuro por defecto (tokens en el mockup), con claro opcional.
- Un solo usuario; auth simple. Datos privados.
- Offline-friendly deseable a futuro (marcar hábitos sin red y sincronizar).
