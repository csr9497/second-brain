# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

"Second Brain": app personal de productividad de **un solo usuario** (Cesar). Los docs están en español:
- `docs/PRD.md`: fuente de verdad del comportamiento
- `docs/DATA-MODEL.md`: modelo y métricas derivadas
- `docs/ROADMAP.md`: fases
- `docs/API.md`: diseño REST original; ya no hay API propia
- `design/mockup.html`: referencia visual; sus tokens CSS están en `apps/web/src/index.css`

Estado: Fases 0–4 sobre la pantalla Hoy. Faltan las alertas (Fase 5: `pg_cron` + Edge Function con Web Push) y la PWA (Fase 6).

Producción:
- Frontend estático en **GitHub Pages**: https://csr9497.github.io/second-brain/ (repo `csr9497/second-brain`).
- Backend en **Supabase**, project ref `cwmqgjeqtpilhcagotmn`.
- **No hay servidor propio**: el navegador habla directo con Supabase vía `supabase-js`.

Ambientes (cada modo de Vite lee su archivo en `apps/web/`, todos ignorados por git):

| Comando | Backend | Env |
|---|---|---|
| `pnpm dev` | Supabase **dev** en la nube: `second-brain-dev`, ref `lvaeqltfbbixbpwogeul` | `.env.dev.local` |
| `pnpm dev:local` | Supabase local en Docker | `.env.docker.local` (`pnpm db:env`) |
| GitHub Pages | Producción, ref `cwmqgjeqtpilhcagotmn` | variables del repo |

- `supabase.ts` lanza un error si el servidor de desarrollo apunta al ref de producción. Además, en dev el título de la pestaña muestra el modo.
- El proyecto **linkeado** (`supabase link`) sigue siendo **producción**: `supabase db push` a secas va a prod. Para dev usa `pnpm db:push:dev` / `pnpm db:reset:dev`, que leen `SUPABASE_DEV_DB_URL` de `.env.dev.local` en la raíz (ver `.env.dev.example`).
- Dev tiene el mismo seed y el mismo usuario que local (`dev@local.test` / `devpassword`) y el registro desactivado. Su config de Auth se sincroniza con `supabase config push --project-ref lvaeqltfbbixbpwogeul`.

## Comandos (desde la raíz)

```bash
pnpm db:start           # Supabase local (Docker): aplica migraciones + supabase/seed.sql
pnpm db:reset           # recrea la DB local desde migraciones + seed
pnpm db:env             # genera apps/web/.env.docker.local (URL + anon key locales)
pnpm dev                # Vite :5173 contra Supabase dev (nube) — usuario: dev@local.test / devpassword
pnpm dev:local          # Vite :5173 contra Supabase local (Docker)
pnpm db:push:dev        # aplica migraciones pendientes al proyecto dev
pnpm db:reset:dev       # recrea la DB dev desde migraciones + seed
pnpm test               # vitest de packages/shared
supabase test db        # tests pgTAP de RLS y triggers (supabase/tests/database)
pnpm typecheck
pnpm build              # apps/web/dist

# un solo test
pnpm --filter @sb/shared exec vitest run src/domain/domain.test.ts -t "computeStreak"
```

Studio local: http://127.0.0.1:54323. Deploy: cada push a `main` ejecuta `.github/workflows/pages.yml` (typecheck, test, build y Pages). Usa las variables del repo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Arquitectura

- **`supabase/migrations/`** es el esquema fuente de verdad. Todas las tablas tienen `user_id default auth.uid()` y RLS con la política `owner_all`. **La anon key es pública**: toda tabla nueva debe activar RLS y su política de dueño, o queda expuesta. `anon` no tiene grants.
  - Hay cuatro reglas en **triggers** (no en el cliente): `completed_at` solo cuando `status = 'hecha'`; los pasos sincronizan el estado de su tarea (`steps_sync_task`); tocar una tarea actualiza `projects.last_activity_at`; y archivar, reactivar o cambiar los turnos de un hábito cierra o abre su periodo en `habit_periods` (`habits_sync_periods`), que guarda la programación vigente.
  - Cambios de esquema: `supabase migration new <nombre>`. Prueba con `pnpm db:reset` y `supabase test db`, luego aplica en dev con `pnpm db:push:dev` y en producción con `supabase db push`. Hay que añadir un pgTAP si tocas RLS o triggers.
- **`packages/shared`** (sin build: exporta `src/index.ts`):
  - Esquemas Zod y tipos de salida (`Task`, `TodayPayload`, `WeeklyReport`…).
  - En `src/domain/`, la lógica pura con tests: fechas, `positionBetween`, `computeStreak`, `bucketTasks`, y `buildToday`/`buildWeeklyReport`, que agregan filas ya cargadas.
  - Colores: `paletteColor` (8 claves) y los mapas enum→color de `src/colors.ts`. Una clave nueva exige tocar 4 sitios: el CHECK de `projects.color`, `paletteColor`, los tokens `--c-*` de los 3 bloques de tema de `index.css` y `COLOR_LABEL` en `apps/web/src/lib/options.ts`. En la web se pinta con `var(--c-<clave>)` en línea, nunca con clases de Tailwind armadas dinámicamente.
  - Los esquemas `*Fields` no llevan `.default()`, para que `.partial()` en los updates no pise campos (en Zod 4 `.partial()` conserva los defaults internos; lo cubre `schemas.test.ts`).
- **`apps/web`** (React 19 + TanStack Query + Tailwind v4 + dnd-kit; navegación por hash: `VISTAS` en `lib/useVista.ts` — `#/` Hoy, `#/calendario`, `#/gantt`):
  - `lib/api.ts` es la **única** capa de datos. Hace las consultas con supabase-js, traduce snake_case ↔ camelCase y pasa las filas a la lógica de `@sb/shared`. PostgREST limita a 1000 filas por petición: para listas que pueden crecer, usa `fetchAll`.
  - Toda la pantalla sale de **una query `['today']`**. Las mutaciones usan `useTodayMutation`, que aplica un cambio optimista opcional y siempre invalida `['today']`. Los modales de tarea y de proyecto sirven para crear y para editar, según reciban o no la entidad.
  - **Calendario:** query `['calendar', mes, hoy]` (`api.calendar` → `buildCalendar`), de solo lectura para hábitos; las mutaciones de Hoy, de los modales y de hábitos invalidan `['calendar']`.
  - **Gantt** (`components/gantt/`): query `['gantt', incluirHechas]`. El modo edición trabaja sobre un borrador (`GanttDraft`, lógica pura en `shared/domain/gantt.ts`); nada se escribe hasta confirmar el resumen, y entonces `api.aplicarPlan` llama a la RPC `aplicar_plan` (todo o nada, `security invoker`). Con cambios pendientes, `useGuardiaSalida` pide confirmación al cambiar de pestaña o cerrar (el botón atrás del navegador no está cubierto).
  - Sesión: `useSession`. Si no hay sesión, se muestra `<Login>`.
  - Formularios: no hay `<select>` nativos; se usa `components/ui/Select.tsx` (Radix) con las opciones de `lib/options.ts`.
  - `vite.config.ts` usa `base: './'`, para servir igual en `/` (local) y en `/second-brain/` (Pages).

## Reglas de dominio no obvias

- **La mezcla de idiomas es intencional.** Las columnas mezclan español e inglés (`nombre`, `estado`, `fecha`, `texto` junto a `title`, `status`, `deadline`). Los enums van en español sin tildes (`por_hacer|en_curso|hecha`, `manana|tarde|noche`, `alta|media|baja`) y la base los valida con CHECKs. No "normalices" nada.
- **"Hoy", la semana y la franja de hábitos** se calculan con la **hora del navegador**. La DB está en UTC; por eso `seed.sql` usa `America/Lima` para que la demo cuadre.
- **Reordenar:** `beforeId` es el vecino que queda **arriba** y `afterId` el de **abajo**. Se guarda el punto medio en `position numeric` y nunca se renumera la lista.
- **Listas de tareas (`bucketTasks`):**
  - Las hechas solo se ven el día en que se completaron.
  - Las vencidas sin terminar van **solo** a `incumplimiento`.
  - `hoy` = deadline hoy, o sin deadline y con `start_date` hoy.
  - `semana` = hoy + deadline hasta el domingo.
- **Pasos programados:** `steps.start_date` + `duracion_dias` (ambos o ninguno, CHECK); el fin es inclusivo (`finPaso` = inicio + días − 1). Un paso fuera del rango `start_date`–`deadline` de su tarea se permite y se marca "fuera de plazo" (`fueraDePlazo`); sin programar no sale en el Gantt.
- **Semana:** de lunes a domingo. **`schedule_days`:** enteros 0–6, con 0 = domingo.
- **Racha:** días consecutivos al 100% de los **turnos** de los hábitos vigentes ese día (`periodoEn`: el periodo de `habit_periods` que cubre ese día, con sus turnos). Hoy suma si está completo, pero si no lo está no rompe la racha; un día sin hábitos vigentes la corta.
- **Hábitos:** archivar pone `archived_at` y conserva el historial; `active` es una columna generada (`archived_at is null`), no se escribe. Reactivar pone `archived_at = null` y el trigger abre un periodo nuevo: el historial previo se conserva. Eliminar borra también sus `habit_logs`.
- **Turnos de un hábito:** `habits.turnos` es una lista "y" de franjas alternativas "o" (`[["manana"],["tarde","noche"]]` = Mañana + (Tarde o Noche)); ninguna franja se repite (CHECK `turnos_validos` = `turnosSchema`). Se marca **una vez por turno**: `habit_logs.slot` guarda la franja donde se hizo, único por (hábito, fecha, franja). `habits.slot` es generado (primera franja) solo por compatibilidad; no se escribe.
- **Revisión semanal:** se calcula en el cliente. "Archivar" hace upsert en `reviews` por `(user_id, week_start)`.
- **Auth:** el registro está desactivado (`[auth] enable_signup = false`). No desactives `[auth.email] enable_signup`: eso apaga el login por email.
