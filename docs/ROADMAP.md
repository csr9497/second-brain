# Roadmap por fases

Pensado para construir incremental y tener algo usable cuanto antes. Cada fase deja
la app funcional. Estimaciones en jornadas de dev enfocadas (ajústalas a tu ritmo).

## Fase 0 — Cimientos (0.5–1 día)
- Monorepo (pnpm workspaces): `apps/web`, `apps/api`, `packages/shared`.
- `docker-compose.yml` con Postgres + Redis.
- Drizzle configurado; aplicar `schema.sql` / primera migración.
- Fastify arriba con `/health`. Vite + Tailwind con los tokens del mockup.
- Auth-lite: un usuario, JWT o sesión. (Puede ser hardcode al inicio.)

## Fase 1 — Tareas + Hoy (núcleo) (2–3 días)
- CRUD de tareas. Vista **Hoy** con filtro Hoy/Semana/Todas + incumplimiento.
- **Subtareas (pasos)**: crear, marcar, contador, auto-completar la tarea.
- **Reordenar arrastrando** con dnd-kit + endpoint `reorder` (position midpoint).
- Modal "Tarea rápida" con el formulario completo.
- ✅ Hito: ya reemplaza tu lista de pendientes de Notion.

## Fase 2 — Hábitos (1–2 días)
- CRUD de hábitos con franja. Vista de 3 pestañas, **pestaña por hora del día**.
- Marcado diario (`habit_logs`), % del día con anillo, **racha**.
- ✅ Hito: tracking diario de un toque, mejor que Notion.

## Fase 3 — Proyectos (1–2 días)
- CRUD de proyectos con `schedule_days`, next_action.
- Orden "hoy toca primero"; barras **% semana** y **% total**.
- Vinculación tarea↔proyecto y cálculo de % en consulta.
- Metas y áreas (CRUD simple) para completar la jerarquía.

## Fase 4 — Captura + Revisión (1 día)
- Inbox de ideas (captura rápida).
- **Revisión semanal** como reporte calculado (`/reviews/current`) + archivar.

## Fase 5 — Alertas + deploy (1–2 días)
- Web Push (VAPID) + suscripción por dispositivo.
- Job BullMQ de recordatorio de hábitos a hora configurable.
- Dockerizar; desplegar (Vercel front + Fly/Render back, o todo en tu cloud).
- ✅ Hito: te llegan avisos al celular y PC; app en producción.

## Fase 6 — Pulido / PWA (continuo)
- PWA instalable, offline básico para marcar hábitos y sincronizar.
- Deadlines y "nudge" de proyectos sin avanzar.
- Métricas históricas (tendencia de hábitos, cumplimiento por mes).

## Fase W — Agentes vía WebMCP
- ✅ Herramientas de lectura y de capturar/marcar registradas en la página (`document.modelContext`), con su catálogo en `@sb/shared/herramientas`. Ver `docs/MCP.md` §0.
- Siguiente: edición (nivel 2), herramientas de interfaz (abrir tarea, proponer pasos en el planificador) y el servidor MCP (variantes B y C).

## Orden recomendado de valor
1 → 2 → 3 → 5 (alertas) → 4 → 6. Es decir: consíguete el núcleo diario y las alertas
antes que la revisión, porque el hábito de uso se sostiene con lo diario + los avisos.

## Decisiones tomadas (oct 2026)
- Backend: **Supabase** (Postgres + Auth + RLS) en lugar de Fastify + Drizzle; sin servidor propio.
- Auth: Supabase Auth, single-user con registro desactivado.
- Hosting: frontend estático en **GitHub Pages**.
- Racha: umbral del 100% del día.
- Alertas (Fase 5): `pg_cron` + Edge Function de Supabase en lugar de BullMQ + Redis.
