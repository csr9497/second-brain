# API — REST (Fastify)

Base: `/api`. JSON. Un solo usuario (auth simple con JWT o sesión). Validación con Zod
(esquemas compartidos en `packages/shared`). Fechas en ISO (`YYYY-MM-DD`).

## Dashboard

- `GET /today` → payload de la pantalla principal, en una sola llamada:
  ```json
  {
    "date": "2026-09-26",
    "habits": {
      "slotActual": "tarde",
      "porFranja": { "manana": [...], "tarde": [...], "noche": [...] },
      "pctDia": 40, "streak": 5
    },
    "tasks": { "hoy": [...], "semana": [...], "incumplimiento": [...] },
    "projects": [ { ...proyecto, "pctSemana": 66, "hoyToca": true } ]
  }
  ```

## Áreas / Metas

- `GET/POST /areas`, `PATCH/DELETE /areas/:id`
- `GET/POST /goals`, `PATCH/DELETE /goals/:id`

## Proyectos

- `GET /projects` (query: `?estado=en_curso`)
- `POST /projects`, `PATCH /projects/:id`, `DELETE /projects/:id`
- `GET /projects/:id` → incluye tareas y `pctSemana`, `pctTotal`.

## Tareas

- `GET /tasks` (query: `filtro=hoy|semana|todas|incumplimiento`)
- `POST /tasks` → acepta `steps: [{title}]` para crear con subtareas.
- `PATCH /tasks/:id` (título, estado, prioridad, fechas, proyecto, etc.)
- `POST /tasks/:id/toggle` → alterna hecha/por_hacer, setea `completed_at`.
- `DELETE /tasks/:id`
- `POST /tasks/reorder` → `{ id, beforeId?, afterId? }`; el server calcula el nuevo
  `position` como punto medio entre vecinos. Responde con la nueva `position`.

## Pasos (subtareas)

- `POST /tasks/:id/steps` → `{ title }`
- `POST /steps/:id/toggle` → alterna `done`; si todos los pasos quedan `done`, el
  servicio marca la tarea `hecha` (y viceversa al desmarcar).
- `PATCH /steps/:id`, `DELETE /steps/:id`, `POST /steps/reorder`

## Hábitos

- `GET/POST /habits`, `PATCH/DELETE /habits/:id`
- `POST /habits/:id/toggle` → `{ fecha? }` (default hoy). Upsert en `habit_logs`.
- `GET /habits/streak` → `{ streak, umbral }`

## Ideas (captura rápida)

- `GET /ideas` (query `?estado=inbox`)
- `POST /ideas` → `{ texto }`
- `PATCH /ideas/:id` (cambiar estado), `DELETE /ideas/:id`

## Revisión semanal

- `GET /reviews/current` → **reporte calculado** de la semana en curso (no persiste):
  KPIs, % por proyecto, racha, proyectos sin tocar.
- `POST /reviews/archive` → congela el reporte actual en `reviews` con `nota` opcional.
- `GET /reviews` → historial. `GET /reviews/:id`.

## Notificaciones

- `POST /push/subscribe` → guarda la suscripción Web Push (VAPID) del dispositivo.
- `GET/PUT /settings/reminders` → hora del recordatorio de hábitos, canales (push/email).

### Job programado (BullMQ)

- `habit-reminder`: cron diario a la hora configurada. Evalúa el `pctDia`; si hay
  hábitos sin marcar, envía push/email. Un job repetible por usuario.
- (Futuro) `deadline-reminder`, `project-nudge` para proyectos que "hoy tocan".

## Convenciones

- Errores: `{ error: { code, message } }`, con códigos claros y accionables.
- Todos los listados admiten orden por `position` cuando aplica.
- Zod valida entrada y salida; los tipos se exportan a `packages/shared` para el front.
