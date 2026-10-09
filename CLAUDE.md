# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es

"Second Brain": app personal de productividad de **un solo usuario** (Cesar). Los docs están en español:
- `docs/PRD.md`: fuente de verdad del comportamiento
- `docs/DATA-MODEL.md`: modelo y métricas derivadas
- `docs/ROADMAP.md`: fases
- `docs/API.md`: diseño REST original; ya no hay API propia
- `design/mockup.html`: referencia visual; sus tokens CSS están en `apps/web/src/index.css`

Estado: Fases 0–5 sobre la pantalla Hoy (incluye los avisos Web Push) y PWA instalable. Faltan lo offline, los avisos de proyectos y deadlines y las métricas (Fase 6).

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
pnpm typecheck          # web + service worker (src/sw/tsconfig.json)
node scripts/vapid-keys.mjs   # genera VAPID_KEYS (secret) y VITE_VAPID_PUBLIC_KEY
supabase functions serve recordatorios --env-file supabase/functions/.env.local   # Edge Function local
pnpm build              # apps/web/dist
pnpm ios:build          # app iOS: vite build --mode native (apps/web/.env.native.local) + cap sync ios
pnpm ios:gen            # xcodegen: regenera App.xcodeproj desde apps/mobile/ios/App/project.yml
pnpm ios:open           # abre el proyecto en Xcode (ver docs/APP-NATIVA.md)

# un solo test
pnpm --filter @sb/shared exec vitest run src/domain/domain.test.ts -t "computeStreak"
```

Studio local: http://127.0.0.1:54323. Deploy: cada push a `main` ejecuta `.github/workflows/pages.yml` (typecheck, test, build y Pages). Usa las variables del repo `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`.

## Arquitectura

- **`supabase/migrations/`** es el esquema fuente de verdad. Todas las tablas tienen `user_id default auth.uid()` y RLS con la política `owner_all`. **La anon key es pública**: toda tabla nueva debe activar RLS y su política de dueño, o queda expuesta. `anon` no tiene grants.
  - Hay cinco reglas en **triggers** (no en el cliente): `completed_at` solo cuando `status = 'hecha'`; los pasos sincronizan el estado de su tarea (`steps_sync_task`); tocar una tarea actualiza `projects.last_activity_at`; archivar, reactivar o cambiar los turnos o la meta semanal de un hábito cierra o abre su periodo en `habit_periods` (`habits_sync_periods`), que guarda la programación vigente; y completar una tarea o un paso marca hoy sus hábitos vinculados (`task_habits`; `tasks_sync_habitos`/`steps_sync_habitos`), y deshacerlo borra solo esos registros (`habit_logs.task_id`/`step_id`).
  - Esos triggers calculan el día y la franja **locales** con `public.hora_local()`, que lee la cabecera `x-timezone` (zona IANA) que `supabase.ts` manda en cada petición; sin ella usan UTC. El día y la franja salen de `public.dia_y_franja()`, que aplica la **jornada** (ver reglas de dominio).
  - Cambios de esquema: `supabase migration new <nombre>`. Prueba con `pnpm db:reset` y `supabase test db`, luego aplica en dev con `pnpm db:push:dev` y en producción con `supabase db push`. Hay que añadir un pgTAP si tocas RLS o triggers.
- **Avisos** (Fase 5; runbook en `docs/ALERTAS.md`):
  - `pg_cron` (job `recordatorios`, cada 15 min) llama a la Edge Function `recordatorios` (`verify_jwt = false` en `config.toml`) con `x-cron-secret`. La URL y el secreto están en Vault (`recordatorios_url`, `cron_secret`); el job solo corre si existen ambos.
  - `recordatorios_por_enviar(p_ahora)` (solo `service_role`) calcula en SQL con `recordatorios_config.zona`, porque la función corre en UTC (refleja `periodoEn`/`turnosEn`; los semanales no cuentan). Las horas son ≤ 23:45 (CHECK). Con varias franjas vencidas a la vez se anotan todas y se envía solo la más reciente; una `zona` inválida se omite sin romper la ronda.
  - La función anota en `recordatorios_enviados` **antes** de enviar y borra la suscripción si el push da 404/410. Con `{ prueba: true }` y el JWT del usuario manda un aviso de prueba.
  - Secrets de la función: `VAPID_KEYS` (JSON con `publicKey`/`privateKey` JWK), `VAPID_SUBJECT` (`mailto:`) y `CRON_SECRET`; en local, `supabase/functions/.env.local`. En el navegador, `VITE_VAPID_PUBLIC_KEY`.
  - Web: service worker en `apps/web/src/sw/sw.ts` (`injectManifest`, tsconfig propio; también se registra en dev), íconos generados al compilar desde `public/icon.svg`. `lib/push.ts` se resuscribe si cambia la clave VAPID; la UI es `AvisosModal` (🔔) con la query `['avisos']` y métodos en `lib/api.ts`. El clic en el aviso solo enfoca ventanas dentro del scope de la app (el origin `github.io` es compartido). En iPhone hace falta la PWA instalada (iOS 16.4+).
- **`packages/shared`** (sin build: exporta `src/index.ts`):
  - Esquemas Zod y tipos de salida (`Task`, `TodayPayload`, `WeeklyReport`…).
  - En `src/domain/`, la lógica pura con tests: fechas, `positionBetween`, `computeStreak`, `bucketTasks`, y `buildToday`/`buildWeeklyReport`, que agregan filas ya cargadas. `buildReport(input, {start,end}, archived)` calcula cualquier rango (`buildWeeklyReport` es su envoltorio) y `buildMonthlyReport` añade `dias` (`fecha`, `pct | null`, `futuro`) para el mapa de calor.
  - Colores: `paletteColor` (8 claves) y los mapas enum→color de `src/colors.ts`. Una clave nueva exige tocar 4 sitios: el CHECK de `projects.color`, `paletteColor`, los tokens `--c-*` de los 3 bloques de tema de `index.css` y `COLOR_LABEL` en `apps/web/src/lib/options.ts`. En la web se pinta con `var(--c-<clave>)` en línea, nunca con clases de Tailwind armadas dinámicamente.
  - Los esquemas `*Fields` no llevan `.default()`, para que `.partial()` en los updates no pise campos (en Zod 4 `.partial()` conserva los defaults internos; lo cubre `schemas.test.ts`).
- **`apps/web`** (React 19 + TanStack Query + Tailwind v4 + dnd-kit; navegación por hash: `VISTAS` en `lib/useVista.ts` — `#/` Hoy, `#/calendario`, `#/gantt`, `#/resumen`; todas con el mismo ancho, `max-w-[1040px]` en `App`, para que cambiar de pestaña no mueva nada):
  - `lib/api.ts` es la **única** capa de datos. Hace las consultas con supabase-js, traduce snake_case ↔ camelCase y pasa las filas a la lógica de `@sb/shared`. PostgREST limita a 1000 filas por petición: para listas que pueden crecer, usa `fetchAll`.
  - Toda la pantalla sale de **una query `['today']`**. Las mutaciones usan `useTodayMutation`, que aplica un cambio optimista opcional y siempre invalida `['today']`. Los modales de tarea y de proyecto sirven para crear y para editar, según reciban o no la entidad. El **modal de tarea** tiene como cabecera el nombre editable y, a la derecha, Inicio/Fin con la duración: **solo ahí cambia la duración de la tarea**. Debajo van los colapsables a ancho completo «Descripción y notas», «Detalles» y «Pasos» (una fila compacta por paso: asa ⠿ para reordenar arrastrando —solo cambia `position`, no las fechas; al guardar, si cambió el orden se renumera la lista de esa tarea—, nombre, chip de programación y ✕. Un paso sin fecha es un pendiente simple («＋ Fecha»); el chip abre debajo de la fila un panel con fecha o rango (`ui/RangoFecha`), tiempo estimado + unidad h/min —excluyente con un rango de varios días—, la duración calculada y «Quitar fecha». Enter en un nombre añade otro paso debajo. Fuera de plazo se marca solo con color) y, al final, el planificador a todo el ancho (`components/planner/`: pestañas Calendario y Gantt) sobre el mismo estado (`lib/pasosBorrador.ts`): en el Calendario, **tocar un día lo expande** bajo su semana (tarea, pasos de rango y los encadenados por tiempo en orden, con su total sobre la jornada) y **arrastrar de un día a otro** (o «＋ Paso este día» del día expandido, o la fila «＋ Nuevo paso» del Gantt) ofrece **agregar un paso** con ese rango (si es de un día, con tiempo estimado opcional); en el Gantt la barra de la tarea es de solo lectura y las de los pasos se mueven/estiran (`Barra` + `shared/domain/gantt.ts` sobre una tarea virtual, `comoTask`). Nada se guarda hasta «Guardar».
  - **Resumen** (`components/resumen/`; reemplaza al antiguo `ReviewModal`, que ya no existe): selector Semana | Mes. Semana = pestañas Proyectos/Hábitos + nota + «Archivar semana». Mes = `MapaCalor` (cuadro por día con su % de hábitos, futuros sin color) + las mismas pestañas; el mes no se archiva. Queries `['review']` y `['resumen','mes']`; las mutaciones invalidan ambas.
  - **Crear +** (`CrearModal`: Tarea, Captura, Hábito, Proyecto): en `sm+` es un botón en la fila de pestañas, a la derecha; en el teléfono, un botón flotante. `ModalState` `habito.volver` decide si al cerrar vuelve a Gestionar hábitos. Hoy ya no tiene barra de acciones.
  - **Hoy, hábitos:** título «Hábitos»; cada hábito es una burbuja (las marcadas se quedan rellenas); los semanales llevan anillo de progreso.
  - **Gantt, paso:** fuera del modo edición, tocar un paso abre `PasoModal` (detalle, marcar hecho, abrir tarea).
  - **Calendario:** query `['calendar', mes, hoy]` (`api.calendar` → `buildCalendar`), de solo lectura para hábitos; las mutaciones de Hoy, de los modales y de hábitos invalidan `['calendar']`.
  - **Gantt** (`components/gantt/`): query `['gantt', incluirHechas]`. El modo edición trabaja sobre un borrador (`GanttDraft`, lógica pura en `shared/domain/gantt.ts`); nada se escribe hasta confirmar el resumen, y entonces `api.aplicarPlan` llama a la RPC `aplicar_plan` (todo o nada, `security invoker`). **Zoom** (`gantt/zoom.tsx`, también en el Gantt del modal): seleccionar fechas en la cabecera ajusta ese rango al ancho visible (`col` px por día, en vez de `COL`); con `col ≥ HORAS_DESDE` los pasos por tiempo de un mismo día se dibujan uno tras otro a escala de la jornada (`desplazamientos`), se mueven por días y se estiran de 15 en 15 min (`estirarPasoMin`). Con cambios pendientes, `useGuardiaSalida` pide confirmación al cambiar de pestaña o cerrar (el botón atrás del navegador no está cubierto).
  - **Confirmaciones:** nunca `window.confirm`; usa `confirmar({ titulo, mensaje })` (`components/ui/Confirmar.tsx`, host montado en `App`). La guardia de navegación es asíncrona (`await puedeSalir()`); solo cerrar/recargar la pestaña usa el aviso nativo de `beforeunload`.
  - **Crear desde rango:** Calendario (arrastrar, Shift+clic o «Marcar rango desde este día») y la fila «＋ Nueva tarea» del Gantt (`gantt/Pista.tsx`) abren el modal con inicio/deadline del rango (`nuevaTarea` en `App`; deadline vacío si el rango ya pasó). Las celdas del calendario muestran `CalendarDay.items` (tarea con rango, ↳ paso, ⚑ vence). Para que las barras se vean **continuas**, cada item tiene un `carril` fijo por semana (`carriles()`), las celdas no tienen separación horizontal y las barras llegan al borde de la celda salvo en sus extremos; el calendario del modal hace lo mismo y rotula cada barra (📌 tarea, ↳ paso) el primer día y cada lunes.
  - **WebMCP** (`lib/webmcp/`): con sesión, `useWebMcp` registra en `document.modelContext` (si existe) el catálogo de `@sb/shared/herramientas` (subruta aparte por un ciclo con `index.ts`). Hay lectura, capturar/marcar, edición sin borrados (pasos normalizados con `programarPaso`) e interfaz (`PuenteUI`, que aporta `Home`: no pisa un modal abierto y respeta `puedeSalir`). Las de marcar reciben `hecho` y son idempotentes. Tras cada escritura llama a `invalidateQueries()`, y al cerrar sesión las desregistra con un `AbortController`. En producción hace falta el token del origin trial (`VITE_WEBMCP_OT_TOKEN`). Una herramienta nueva necesita su definición en `herramientas.ts` y su ejecutor en `ejecutar.ts`. Ver `docs/MCP.md`.
  - Sesión: `useSession`. Si no hay sesión, se muestra `<Login>`.
  - Formularios: no hay `<select>` nativos; se usa `components/ui/Select.tsx` (Radix) con las opciones de `lib/options.ts`.
  - `vite.config.ts` usa `base: './'`, para servir igual en `/` (local) y en `/second-brain/` (Pages).
- **`apps/mobile`** (prototipo iOS; runbook en `docs/APP-NATIVA.md`): Capacitor 8 por SPM que carga el build de `apps/web` hecho con `vite build --mode native` (sin service worker ni PWA; en la web, `esNativo()` de `lib/nativo/`).
  - El proyecto Xcode sale de XcodeGen: `apps/mobile/ios/App/project.yml` y el `App.xcodeproj` commiteado. Tras tocar `project.yml`, `pnpm ios:gen`.
  - Plugin Swift local `LiveActivity` (`App/LiveActivity/`): `sincronizar`, `guardarSesion`, `leerSesion` y `cerrarSesion`. La web lo usa desde `lib/nativo/`: `useLiveActivity` sincroniza la card con `['today']` vía `estadoLiveActivity` (`@sb/shared`), y `useSession` copia la sesión al Keychain.
  - Extensión `SecondBrainLiveActivity` (SwiftUI): pinta la card. Sus botones son App Intents que corren en el proceso de la app y escriben por PostgREST (`SupabaseREST.swift`) con la sesión del Keychain.
  - Supabase rota el refresh token: si un botón lo renueva, el almacenamiento de supabase-js en nativo (`almacenNativo`) toma los tokens del Keychain al cargar la sesión.

## Reglas de dominio no obvias

- **La mezcla de idiomas es intencional.** Las columnas mezclan español e inglés (`nombre`, `estado`, `fecha`, `texto` junto a `title`, `status`, `deadline`). Los enums van en español sin tildes (`por_hacer|en_curso|hecha`, `manana|tarde|noche`, `alta|media|baja`) y la base los valida con CHECKs. No "normalices" nada.
- **"Hoy", la semana y la franja de hábitos** se calculan con la **hora del navegador** y la **jornada** del usuario. La DB está en UTC; por eso `seed.sql` usa `America/Lima` para que la demo cuadre.
- **Jornada** (tabla `jornada`, una fila por usuario; sin fila: 00:00/12:00/19:00): `fin_dia` (≤ 06:00), `hora_tarde` y `hora_noche`, en pasos de 15 min (CHECK `jornada_valida` = `jornadaSchema`). Antes de `fin_dia` todavía es el **día anterior**, en su noche; la mañana empieza en `fin_dia`. Aplica a toda la app:
  - En `@sb/shared`, `diaDe(fecha)` y `franjaDe(fecha)` usan la jornada fijada con `fijarJornada` (estado global; `api.jornada` la fija y `App` espera a la query `['jornada']` antes de pintar). `todayISO()` = `diaDe(ahora)`. Un timestamp (`completedAt`, periodos, `lastActivityAt`) se pasa a día con `diaDe(new Date(ts))`, nunca con `toISO`.
  - En SQL, `dia_y_franja(hora_local, user)` (misma regla); `recordatorios_por_enviar` compara las horas de aviso desplazadas `fin_dia` hacia atrás.
  - La card nativa marca en `EstadoLiveActivity.fecha` (el día que muestra), no en el del reloj.
  - Se edita en «Gestionar hábitos» → «Franjas del día» (`JornadaForm`); al guardar se invalidan todas las queries.
- **Reordenar:** `beforeId` es el vecino que queda **arriba** y `afterId` el de **abajo**. Se guarda el punto medio en `position numeric` y nunca se renumera la lista.
- **Listas de tareas (`bucketTasks`):**
  - Las hechas solo se ven el día en que se completaron.
  - Las vencidas sin terminar van **solo** a `incumplimiento`.
  - `hoy` = hoy cae entre `start_date` y `deadline` (todos los días del rango), o deadline hoy, o `start_date` hoy (sin deadline), o un paso pendiente que cubre hoy.
  - `semana` = hoy + deadline hasta el domingo, o `start_date` dentro de la semana (lun–dom), o un paso pendiente en algún día de la semana.
- **Pasos programados:** `steps.start_date` + `duracion_dias` (ambos o ninguno, CHECK); el fin es inclusivo (`finPaso` = inicio + días − 1). Un paso fuera del rango `start_date`–`deadline` de su tarea se permite y se marca "fuera de plazo" (`fueraDePlazo`); sin programar no sale en el Gantt.
- **Duración de un paso:** o un rango de fechas (`start_date` + `duracion_dias`), o un **tiempo estimado** (`duracion_min`, en horas o minutos en el formulario) en un solo día (CHECK: `duracion_dias = 1`, máx. 24 h). No hay hora de inicio: los pasos por tiempo de un mismo día van en el orden de la lista (`tramosDelDia`). «⛓ Encadenar» (`encadenar`) los pone seguidos en el mismo día mientras quepan en la jornada (`JORNADA_MIN` = 8 h) y salta al día siguiente si no. Toda la lógica por días los trata como pasos de un día.
- **Responsive:** en el teléfono la página nunca desborda en horizontal (medir a 390 px: `document.documentElement.scrollWidth === innerWidth`; el Gantt solo se desplaza dentro de su caja). Los grids con `md:grid-cols-[…]` necesitan `grid-cols-1` / `minmax(0,1fr)` debajo de `md`.
- **Semana:** de lunes a domingo. **`schedule_days`:** enteros 0–6, con 0 = domingo.
- **Racha:** días consecutivos al 100% de los **turnos** de los hábitos vigentes ese día (`periodoEn`: el periodo de `habit_periods` que cubre ese día, con sus turnos). Hoy suma si está completo, pero si no lo está no rompe la racha; un día sin hábitos vigentes la corta.
- **Hábitos semanales:** `habits.veces_semana` (1–7) = meta de N días por semana; null = diario por turnos. Se marcan una vez al día como mucho, van aparte en Hoy (`habits.semanales`) y **no cuentan en el % del día ni en la racha** (`turnosEn` los excluye); en la revisión suman su meta al % semanal con tope; en el mes suman la meta de cada semana (lun–dom) que toca el mes, con tope por días dentro del mes.
- **Hábitos:** archivar pone `archived_at` y conserva el historial; `active` es una columna generada (`archived_at is null`), no se escribe. Reactivar pone `archived_at = null` y el trigger abre un periodo nuevo: el historial previo se conserva. Eliminar borra también sus `habit_logs`.
- **Turnos de un hábito:** `habits.turnos` es una lista "y" de franjas alternativas "o" (`[["manana"],["tarde","noche"]]` = Mañana + (Tarde o Noche)); ninguna franja se repite (CHECK `turnos_validos` = `turnosSchema`). Se marca **una vez por turno**: `habit_logs.slot` guarda la franja donde se hizo, único por (hábito, fecha, franja). `habits.slot` es generado (primera franja) solo por compatibilidad; no se escribe.
- **Revisión semanal/mensual:** se calcula en el cliente. "Archivar" hace upsert en `reviews` por `(user_id, week_start)`.
- **Auth:** el registro está desactivado (`[auth] enable_signup = false`). No desactives `[auth.email] enable_signup`: eso apaga el login por email.
