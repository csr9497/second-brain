# Second Brain — plataforma personal

Sistema personal de productividad tipo "second brain": conecta la acción diaria
(tareas, hábitos) con proyectos y metas de largo plazo. Reemplaza el prototipo de
Notion con una app propia, con la interfaz y la lógica exactas que quiero.

Referencia visual: `design/mockup.html` (ábrelo en el navegador — es interactivo).

## Qué hace

- **Hoy**: lo primero que ves. Hábitos del momento del día + tareas pendientes.
- **Acciones rápidas**: crear tarea (con subtareas), captura de ideas al inbox, y
  la revisión semanal.
- **Hábitos**: por franja (mañana / tarde / noche), con % del día, anillo de
  progreso y racha de días consecutivos.
- **Pendientes**: tareas con prioridad, deadline y subtareas (pasos). Se reordenan
  arrastrando. No desaparecen hasta completarse; las vencidas van a una lista de
  incumplimiento.
- **Proyectos**: con horario de aplicación (días de la semana), % de la semana y %
  total. Los que "hoy toca" salen primero.
- **Revisión semanal**: reporte automático del cumplimiento de la semana.
- **Alertas**: aviso si no marcaste tus hábitos a cierta hora (push / email).

App: **https://csr9497.github.io/second-brain/**

## Stack

| Capa | Elección |
|------|----------|
| Frontend | React + Vite + TypeScript, TanStack Query, Tailwind CSS, `@dnd-kit` |
| Backend | Supabase: Postgres + Auth + API REST (PostgREST), protegido con RLS |
| Lógica de dominio | `packages/shared` (TS puro: fechas, racha, %, listas), Zod |
| Reglas en la base | Triggers: pasos → tarea hecha, `completed_at`, actividad del proyecto |
| Hosting | GitHub Pages (estático), desplegado con GitHub Actions |
| Alertas (pendiente) | `pg_cron` + Edge Function de Supabase con Web Push |

## Estructura

```
apps/web/            # frontend (React + Vite)
packages/shared/     # tipos, esquemas Zod y lógica de dominio (con tests)
supabase/
  migrations/        # esquema + RLS + triggers
  seed.sql           # datos de demo (solo local)
  tests/database/    # tests pgTAP de RLS y triggers
.github/workflows/   # deploy a GitHub Pages
```

## Documentación

- `docs/PRD.md` — especificación de producto (todas las features en detalle).
- `docs/DATA-MODEL.md` — modelo de datos + esquema.
- `docs/API.md` — diseño REST original (hoy la app habla directo con Supabase).
- `docs/ROADMAP.md` — plan por fases.
- `supabase/migrations/` — DDL de PostgreSQL con RLS.

## Cómo arrancar (local)

Requisitos: Node 22+, pnpm 10+, Docker y la CLI de Supabase (`brew install supabase/tap/supabase`).

```bash
pnpm install
pnpm db:start       # Supabase local (aplica migraciones + seed)
pnpm db:env         # escribe apps/web/.env.local con la URL y la anon key locales
pnpm dev            # http://localhost:5173 — usuario demo: dev@local.test / devpassword
```

## Producción

- Cada push a `main` despliega en GitHub Pages (`.github/workflows/pages.yml`).
  Necesita las variables del repo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.
- Cambios de esquema: crea una migración (`supabase migration new <nombre>`) y
  aplícala con `supabase db push` (el proyecto debe estar enlazado con `supabase link`).
- El registro está desactivado: el usuario se crea en el dashboard de Supabase.
