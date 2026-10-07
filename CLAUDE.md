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
  - Hay cinco reglas en **triggers** (no en el cliente): `completed_at` solo cuando `status = 'hecha'`; los pasos sincronizan el estado de su tarea (`steps_sync_task`); tocar una tarea actualiza `projects.last_activity_at`; archivar, reactivar o cambiar los turnos o la meta semanal de un hábito cierra o abre su periodo en `habit_periods` (`habits_sync_periods`), que guarda la programación vigente; y completar una tarea o un paso marca hoy sus hábitos vinculados (`task_habits`; `tasks_sync_habitos`/`steps_sync_habitos`), y deshacerlo borra solo esos registros (`habit_logs.task_id`/`step_id`).
  - Esos triggers calculan el día y la franja **locales** con `public.hora_local()`, que lee la cabecera `x-timezone` (zona IANA) que `supabase.ts` manda en cada petición; sin ella usan UTC.
  - Cambios de esquema: `supabase migration new <nombre>`. Prueba con `pnpm db:reset` y `supabase test db`, luego aplica en dev con `pnpm db:push:dev` y en producción con `supabase db push`. Hay que añadir un pgTAP si tocas RLS o triggers.
- **`packages/shared`** (sin build: exporta `src/index.ts`):
  - Esquemas Zod y tipos de salida (`Task`, `TodayPayload`, `WeeklyReport`…).
  - En `src/domain/`, la lógica pura con tests: fechas, `positionBetween`, `computeStreak`, `bucketTasks`, y `buildToday`/`buildWeeklyReport`, que agregan filas ya cargadas.
  - Colores: `paletteColor` (8 claves) y los mapas enum→color de `src/colors.ts`. Una clave nueva exige tocar 4 sitios: el CHECK de `projects.color`, `paletteColor`, los tokens `--c-*` de los 3 bloques de tema de `index.css` y `COLOR_LABEL` en `apps/web/src/lib/options.ts`. En la web se pinta con `var(--c-<clave>)` en línea, nunca con clases de Tailwind armadas dinámicamente.
  - Los esquemas `*Fields` no llevan `.default()`, para que `.partial()` en los updates no pise campos (en Zod 4 `.partial()` conserva los defaults internos; lo cubre `schemas.test.ts`).
- **`apps/web`** (React 19 + TanStack Query + Tailwind v4 + dnd-kit; navegación por hash: `VISTAS` en `lib/useVista.ts` — `#/` Hoy, `#/calendario`, `#/gantt`):
  - `lib/api.ts` es la **única** capa de datos. Hace las consultas con supabase-js, traduce snake_case ↔ camelCase y pasa las filas a la lógica de `@sb/shared`. PostgREST limita a 1000 filas por petición: para listas que pueden crecer, usa `fetchAll`.
  - Toda la pantalla sale de **una query `['today']`**. Las mutaciones usan `useTodayMutation`, que aplica un cambio optimista opcional y siempre invalida `['today']`. Los modales de tarea y de proyecto sirven para crear y para editar, según reciban o no la entidad. El **modal de tarea** tiene como cabecera el nombre editable y, a la derecha, Inicio/Fin con la duración: **solo ahí cambia la duración de la tarea**. Debajo van los colapsables a ancho completo «Descripción y notas», «Detalles» y «Pasos» (una fila por paso: asa ⠿ para reordenar arrastrando —solo cambia `position`, no las fechas; al guardar, si cambió el orden se renumera la lista de esa tarea—, nombre, fecha o rango (`ui/RangoFecha`), tiempo estimado + unidad h/min —excluyente con un rango de varios días— y la duración calculada; fuera de plazo se marca solo con color) y, al final, el planificador a todo el ancho (`components/planner/`: pestañas Calendario y Gantt) sobre el mismo estado (`lib/pasosBorrador.ts`): en el Calendario, **tocar un día lo expande** bajo su semana (tarea, pasos de rango y los encadenados por tiempo en orden, con su total sobre la jornada) y **arrastrar de un día a otro** (o «＋ Paso este día» del día expandido, o la fila «＋ Nuevo paso» del Gantt) ofrece **agregar un paso** con ese rango (si es de un día, con tiempo estimado opcional); en el Gantt la barra de la tarea es de solo lectura y las de los pasos se mueven/estiran (`Barra` + `shared/domain/gantt.ts` sobre una tarea virtual, `comoTask`). Nada se guarda hasta «Guardar».
  - **Calendario:** query `['calendar', mes, hoy]` (`api.calendar` → `buildCalendar`), de solo lectura para hábitos; las mutaciones de Hoy, de los modales y de hábitos invalidan `['calendar']`.
  - **Gantt** (`components/gantt/`): query `['gantt', incluirHechas]`. El modo edición trabaja sobre un borrador (`GanttDraft`, lógica pura en `shared/domain/gantt.ts`); nada se escribe hasta confirmar el resumen, y entonces `api.aplicarPlan` llama a la RPC `aplicar_plan` (todo o nada, `security invoker`). **Zoom** (`gantt/zoom.tsx`, también en el Gantt del modal): seleccionar fechas en la cabecera ajusta ese rango al ancho visible (`col` px por día, en vez de `COL`); con `col ≥ HORAS_DESDE` los pasos por tiempo de un mismo día se dibujan uno tras otro a escala de la jornada (`desplazamientos`), se mueven por días y se estiran de 15 en 15 min (`estirarPasoMin`). Con cambios pendientes, `useGuardiaSalida` pide confirmación al cambiar de pestaña o cerrar (el botón atrás del navegador no está cubierto).
  - **Confirmaciones:** nunca `window.confirm`; usa `confirmar({ titulo, mensaje })` (`components/ui/Confirmar.tsx`, host montado en `App`). La guardia de navegación es asíncrona (`await puedeSalir()`); solo cerrar/recargar la pestaña usa el aviso nativo de `beforeunload`.
  - **Crear desde rango:** Calendario (arrastrar, Shift+clic o «Marcar rango desde este día») y la fila «＋ Nueva tarea» del Gantt (`gantt/Pista.tsx`) abren el modal con inicio/deadline del rango (`nuevaTarea` en `App`; deadline vacío si el rango ya pasó). Las celdas del calendario muestran `CalendarDay.items` (tarea con rango, ↳ paso, ⚑ vence). Para que las barras se vean **continuas**, cada item tiene un `carril` fijo por semana (`carriles()`), las celdas no tienen separación horizontal y las barras llegan al borde de la celda salvo en sus extremos; el calendario del modal hace lo mismo y rotula cada barra (📌 tarea, ↳ paso) el primer día y cada lunes.
  - **WebMCP** (`lib/webmcp/`): con sesión, `useWebMcp` registra en `document.modelContext` (si existe) el catálogo de `@sb/shared/herramientas` (subruta aparte por un ciclo con `index.ts`). Hay lectura, capturar/marcar, edición sin borrados (pasos normalizados con `programarPaso`) e interfaz (`PuenteUI`, que aporta `Home`: no pisa un modal abierto y respeta `puedeSalir`). Las de marcar reciben `hecho` y son idempotentes. Tras cada escritura llama a `invalidateQueries()`, y al cerrar sesión las desregistra con un `AbortController`. En producción hace falta el token del origin trial (`VITE_WEBMCP_OT_TOKEN`). Una herramienta nueva necesita su definición en `herramientas.ts` y su ejecutor en `ejecutar.ts`. Ver `docs/MCP.md`.
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
  - `hoy` = deadline hoy, o sin deadline y con `start_date` hoy, o un paso pendiente que cubre hoy.
  - `semana` = hoy + deadline hasta el domingo, o `start_date` dentro de la semana (lun–dom), o un paso pendiente en algún día de la semana.
- **Pasos programados:** `steps.start_date` + `duracion_dias` (ambos o ninguno, CHECK); el fin es inclusivo (`finPaso` = inicio + días − 1). Un paso fuera del rango `start_date`–`deadline` de su tarea se permite y se marca "fuera de plazo" (`fueraDePlazo`); sin programar no sale en el Gantt.
- **Duración de un paso:** o un rango de fechas (`start_date` + `duracion_dias`), o un **tiempo estimado** (`duracion_min`, en horas o minutos en el formulario) en un solo día (CHECK: `duracion_dias = 1`, máx. 24 h). No hay hora de inicio: los pasos por tiempo de un mismo día van en el orden de la lista (`tramosDelDia`). «⛓ Encadenar» (`encadenar`) los pone seguidos en el mismo día mientras quepan en la jornada (`JORNADA_MIN` = 8 h) y salta al día siguiente si no. Toda la lógica por días los trata como pasos de un día.
- **Semana:** de lunes a domingo. **`schedule_days`:** enteros 0–6, con 0 = domingo.
- **Racha:** días consecutivos al 100% de los **turnos** de los hábitos vigentes ese día (`periodoEn`: el periodo de `habit_periods` que cubre ese día, con sus turnos). Hoy suma si está completo, pero si no lo está no rompe la racha; un día sin hábitos vigentes la corta.
- **Hábitos semanales:** `habits.veces_semana` (1–7) = meta de N días por semana; null = diario por turnos. Se marcan una vez al día como mucho, van aparte en Hoy (`habits.semanales`) y **no cuentan en el % del día ni en la racha** (`turnosEn` los excluye); en la revisión suman su meta al % semanal con tope.
- **Hábitos:** archivar pone `archived_at` y conserva el historial; `active` es una columna generada (`archived_at is null`), no se escribe. Reactivar pone `archived_at = null` y el trigger abre un periodo nuevo: el historial previo se conserva. Eliminar borra también sus `habit_logs`.
- **Turnos de un hábito:** `habits.turnos` es una lista "y" de franjas alternativas "o" (`[["manana"],["tarde","noche"]]` = Mañana + (Tarde o Noche)); ninguna franja se repite (CHECK `turnos_validos` = `turnosSchema`). Se marca **una vez por turno**: `habit_logs.slot` guarda la franja donde se hizo, único por (hábito, fecha, franja). `habits.slot` es generado (primera franja) solo por compatibilidad; no se escribe.
- **Revisión semanal:** se calcula en el cliente. "Archivar" hace upsert en `reviews` por `(user_id, week_start)`.
- **Auth:** el registro está desactivado (`[auth] enable_signup = false`). No desactives `[auth.email] enable_signup`: eso apaga el login por email.
