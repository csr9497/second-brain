# Modelo de datos

PostgreSQL. Relaciones: `areas` 1—N `goals` 1—N `projects` 1—N `tasks` 1—N `steps`.
`habits` 1—N `habit_logs`. `ideas` y `reviews` son independientes.

```mermaid
erDiagram
  areas ||--o{ goals : tiene
  areas ||--o{ projects : agrupa
  goals ||--o{ projects : cumple
  projects ||--o{ tasks : contiene
  tasks ||--o{ steps : se_divide
  habits ||--o{ habit_logs : registra
  areas {
    uuid id PK
    text nombre
    text tipo
  }
  goals {
    uuid id PK
    uuid area_id FK
    text nombre
    date horizonte
    text porque
    text estado
  }
  projects {
    uuid id PK
    uuid area_id FK
    uuid goal_id FK
    text nombre
    text estado
    text prioridad
    text next_action
    jsonb schedule_days
    int total_progress
    timestamptz last_activity_at
  }
  tasks {
    uuid id PK
    uuid project_id FK
    uuid area_id FK
    text title
    text description
    text type
    text priority
    text status
    date start_date
    date deadline
    numeric position
    text notes
    timestamptz completed_at
  }
  steps {
    uuid id PK
    uuid task_id FK
    text title
    bool done
    numeric position
  }
  habits {
    uuid id PK
    text nombre
    text slot
    bool active
    numeric position
  }
  habit_logs {
    uuid id PK
    uuid habit_id FK
    date fecha
    bool done
  }
  ideas {
    uuid id PK
    text texto
    text estado
    timestamptz created_at
  }
  reviews {
    uuid id PK
    date week_start
    date week_end
    jsonb metrics
    text nota
    timestamptz archived_at
  }
```

## Notas de diseño

- **`position` como `numeric`** (no int): permite reordenar insertando entre dos
  valores (p. ej. 1.5 entre 1 y 2) sin re-numerar toda la lista. El endpoint de
  reorder calcula el punto medio.
- **`schedule_days`**: array de enteros 0–6 (0 = domingo) o texto `["lun","mie"]`.
  "Hoy toca" = `today_weekday ∈ schedule_days`.
- **% semana de un proyecto** = tareas del proyecto con `deadline` en la semana y
  `status = hecha` / total de tareas del proyecto con `deadline` en la semana.
  Se calcula en consulta, no se almacena.
- **% del día de hábitos** = `habit_logs` done de hoy / hábitos activos.
- **Racha**: recorrer hacia atrás días consecutivos con % = 100% (o umbral). Se puede
  calcular al vuelo o cachear en una tabla `streaks` si crece el volumen.
- **Incumplimiento** = `deadline < current_date AND status <> 'hecha'`.
- **Subtarea completa la tarea**: al marcar el último `step`, un trigger o la capa de
  servicio setea `tasks.status = 'hecha'`. Recomendado hacerlo en el servicio (más
  controlable que un trigger de DB).

Ver `supabase/migrations/` para el DDL ejecutable (con `user_id` y RLS por tabla).
