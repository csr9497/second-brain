# Integración con Claude vía MCP: análisis

Objetivo: que Claude (Claude Code, Claude Desktop, claude.ai web y móvil) pueda **leer
y operar** Second Brain conversando ("¿qué tengo hoy?", "anota esta idea", "mueve las
vencidas al viernes"). Y que el alcance de lo que Claude puede hacer **crezca solo
cuando Cesar lo confirma**.

Estado: análisis. Nada de esto está implementado todavía.

---

## 1. Punto de partida: lo que condiciona el diseño

| Hecho del repo | Consecuencia para el MCP |
|---|---|
| No hay servidor propio; el navegador habla con Supabase y **RLS es la única barrera** (anon key pública). | El MCP debe operar **como Cesar** (JWT de usuario + RLS), nunca con `service_role`. Así hereda la misma seguridad que la web. |
| Tres reglas viven en **triggers** (`completed_at`, `steps_sync_task`, `last_activity_at`). | Si el MCP escribe por PostgREST igual que la web, esas reglas se cumplen solas. |
| `apps/web/src/lib/api.ts` es la única capa de datos, pero está **acoplada** al singleton `sb` y a `todayISO()` con la hora local. | Hay que extraerla a una fábrica `createApi(sb, clock)` reutilizable desde web, MCP local y MCP remoto. Si no, la lógica se duplica y diverge. |
| "Hoy", la semana y la franja salen de la **hora del navegador**. Un servidor (Node o Edge Function) corre en UTC. | El MCP necesita una **zona horaria explícita** (`America/Lima`). `todayISO`/`slotForHour` deben aceptar `tz`. Sin esto, de 19:00 a 24:00 en Lima "hoy" sería mañana. |
| `api.ts` no expone CRUD de hábitos, áreas ni metas, ni "procesar idea". Los esquemas Zod (`createHabitInput`, `updateIdeaInput`…) sí existen. | El MCP puede cubrir esas operaciones a la vez que la web, con los mismos esquemas. |
| `supabase/config.toml` ya trae `[auth.oauth_server]` (desactivado) y `[edge_runtime]`. | Supabase Auth puede actuar como **servidor OAuth 2.1**, que es lo que exige un conector remoto de claude.ai. Una Edge Function puede alojar el MCP sin crear infraestructura nueva. |

---

## 2. Opciones evaluadas

| | A. MCP oficial de Supabase | B. MCP propio local (stdio) | C. MCP propio remoto (HTTP en Edge Function) |
|---|---|---|---|
| Clientes | Claude Code, Desktop, claude.ai | Claude Code, Claude Desktop | **Todos**, incluido claude.ai web y **móvil** |
| Identidad | Token de cuenta Supabase (admin del proyecto) | Cesar (login email/password → JWT) | Cesar (OAuth 2.1 de Supabase Auth) |
| RLS | **Se salta** (`execute_sql` como admin) | Aplica | Aplica |
| Reglas de dominio (`bucketTasks`, `positionBetween`, racha) | No; Claude escribe SQL a mano | Sí, reutiliza `@sb/shared` | Sí, reutiliza `@sb/shared` |
| Control fino de acciones | Casi nulo (SQL libre) | Total | Total |
| Infra nueva | Ninguna | Ninguna (proceso local) | Edge Function + OAuth + página de consentimiento |
| Esfuerzo | 0 | Bajo | Medio |

**Recomendación:**

- **A** solo como herramienta de desarrollo, en modo `read_only` y acotada a
  `project_ref=cwmqgjeqtpilhcagotmn`. No sirve para el uso diario: con SQL libre no
  hay forma de aplicar el modelo de confirmaciones.
- **B primero**: es la vía más rápida para validar el catálogo de herramientas y el
  modelo de permisos desde Claude Code/Desktop.
- **C después**, con **el mismo código de herramientas**. Es la que da el valor real
  (hablar con la app desde el móvil).

---

## 3. Arquitectura propuesta

```
                ┌──────────────────────────── packages/shared ────────────────────────────┐
                │  esquemas Zod · dominio puro · createApi(sb, clock)  · tools/ (catálogo) │
                └───────────────▲────────────────────▲──────────────────────▲─────────────┘
                                │                    │                      │
         apps/web (navegador)   │   apps/mcp (Node, stdio)    supabase/functions/mcp (Deno, HTTP)
         api = createApi(sb,    │   login de Cesar →          Bearer OAuth de Supabase →
               browserClock)    │   createApi(sb, limaClock)  createApi(sbConJWT, limaClock)
                                │                    │                      │
                                └────────────► Supabase (PostgREST + RLS + triggers) ◄──────┘
```

### 3.1 Refactor previo (necesario en cualquier variante)

1. **Reloj con zona horaria:** `todayISO(now, tz?)` y la hora de `slotForHour` vía
   `Intl.DateTimeFormat('en-CA', { timeZone })`. Sin `tz` se mantiene el
   comportamiento actual del navegador. Con tests en `domain.test.ts` para las
   23:30 de Lima (= 04:30 UTC del día siguiente).
2. **`createApi(sb: SupabaseClient, clock: { now(): Date; tz?: string })`**: se
   mueve el cuerpo de `api.ts` a `packages/shared/src/client/`. La web pasa a ser
   `export const api = createApi(sb, browserClock)`. `@supabase/supabase-js` entra
   en `@sb/shared` solo como dependencia de tipos o peer.
3. **Catálogo de herramientas** en `packages/shared/src/mcp/tools.ts`: un array de
   `{ name, nivel, annotations, inputSchema (Zod), run(api, args) }`. Cada
   transporte (stdio/HTTP) solo lo registra.

### 3.2 Variante B: `apps/mcp` (stdio)

- `@modelcontextprotocol/sdk` (TypeScript), transporte stdio, ejecutado con `tsx`
  porque `@sb/shared` exporta TS sin compilar.
- Credenciales en el entorno del proceso: `SB_URL`, `SB_ANON_KEY`, `SB_EMAIL`,
  `SB_PASSWORD` (o un refresh token) y `SB_TZ=America/Lima`. Se hace
  `signInWithPassword` al arrancar y supabase-js renueva la sesión.
- Alta en Claude Code: `.mcp.json` en la raíz (sin secretos; las variables salen
  del entorno). En Claude Desktop: `claude_desktop_config.json`.

### 3.3 Variante C: Edge Function `mcp` + OAuth

- `supabase/functions/mcp/index.ts` con transporte **Streamable HTTP**, sin estado
  (una petición = una invocación; encaja con Edge Functions).
- `verify_jwt = false` en la función: la función valida el token ella misma para
  poder responder `401` con `WWW-Authenticate` y publicar
  `/.well-known/oauth-protected-resource`, que apunta al emisor de Supabase Auth.
  Así es como el cliente MCP descubre dónde autenticarse.
- Con el `Authorization: Bearer <access_token>` del usuario se crea un cliente
  supabase-js, y RLS hace el resto. Se rechaza todo token cuyo `sub` no sea el de
  Cesar (defensa extra, aunque el registro esté cerrado).
- **Supabase OAuth 2.1 server**: `[auth.oauth_server] enabled = true` y
  `allow_dynamic_registration = true` (claude.ai registra su cliente por DCR).
- **Página de consentimiento**: Supabase redirige a `authorization_url_path`. La web
  no tiene router y vive en GitHub Pages, así que lo más simple es una segunda
  entrada de Vite (`oauth/consent/index.html`) que reutiliza `useSession`/`<Login>` y
  muestra "Claude quiere acceder a tu Second Brain → Aprobar / Rechazar".
- Importar `@sb/shared` desde Deno: hay que verificar si el bundler de
  `supabase functions deploy` resuelve imports fuera de `supabase/functions/`. Si no
  lo hace, se genera un bundle con esbuild en CI antes del deploy (en
  `pages.yml` o en un workflow `functions.yml`).

---

## 4. Catálogo de herramientas por nivel de riesgo

Cada herramienta declara un **nivel** (lo usa el servidor) y **annotations** MCP
(`readOnlyHint`, `destructiveHint`, `idempotentHint`), que los clientes usan para
decidir cuándo pedir permiso.

| Nivel | Qué permite | Herramientas |
|---|---|---|
| **0 · Lectura** | Ver. Sin efectos. | `get_today` (lo mismo que la pantalla Hoy, incluida la racha), `list_tasks(filtro: hoy\|semana\|todas\|incumplimiento)`, `get_task`, `search_tasks(texto)`, `list_projects(estado?)`, `list_habits`, `list_ideas`, `get_weekly_review` |
| **1 · Capturar y marcar** | Acciones aditivas o de un toque, fáciles de revertir. | `capture_idea`, `create_task` (con pasos), `add_step`, `toggle_step`, `toggle_task`, `toggle_habit` |
| **2 · Editar** | Cambiar datos existentes. | `update_task` (fechas, prioridad, proyecto, notas), `reorder_task`, `rename_step`, `create_project`, `update_project`, `process_idea` (inbox → procesada/archivada), `create_habit`/`update_habit` (incluye desactivar), `archive_review` |
| **3 · Destructivo o masivo** | Borrar, o tocar muchas filas a la vez. | `delete_task`, `delete_step`, `delete_project`, `bulk_update_tasks` (p. ej. reprogramar todas las vencidas) |

Criterios de diseño:

- **Toda respuesta incluye `hoy` y la `tz`**, para que Claude convierta "el viernes"
  a `YYYY-MM-DD` sin adivinar.
- **Se trabaja con ids.** Las listas devuelven `id` + título. Si una herramienta
  recibe un título ambiguo, devuelve candidatos en vez de elegir uno.
- **Salida compacta:** texto legible + `structuredContent`. Las listas se paginan
  (máx. ~50 elementos) y nunca se vuelcan tablas completas.
- **Los enums en español** (`por_hacer`, `manana`, `alta`…) se exponen tal cual en
  el `inputSchema`, sin "normalizar" (regla del repo).
- Extras útiles (no herramientas): **resources** (`secondbrain://today`,
  `secondbrain://review/current`) y **prompts** ("planificar mi día", "revisión
  semanal guiada", "procesar inbox de ideas").

---

## 5. Modelo de confirmaciones: "según mis confirmaciones, más acciones"

Hay tres capas independientes. Ninguna basta sola.

### Capa 1: permisos del cliente (gratis, ya existe)

- **Claude Code** (`.claude/settings.json`): `allow` para nivel 0
  (`mcp__second-brain__get_*`, `list_*`, `search_*`), `ask` para niveles 1–2 y `deny`
  para nivel 3 hasta que se decida otra cosa.
- **claude.ai / Desktop**: cada herramienta del conector se configura como
  "Permitir siempre" o "Preguntar". Con `readOnlyHint` el cliente ya trata las
  lecturas como seguras.
- Es el único punto donde **un humano** aprueba cada llamada. Las demás capas lo
  refuerzan.

### Capa 2: nivel máximo habilitado (servidor)

- Tabla `mcp_settings (user_id, max_level int default 1, updated_at)` con RLS
  `owner_all`.
- El servidor **solo lista** (`tools/list`) las herramientas con
  `nivel ≤ max_level`. Si se intenta llamar a otra, falla con un mensaje claro: "esta
  acción requiere nivel 3; actívalo en Ajustes".
- **Subir de nivel solo se puede desde la web** (un selector en Ajustes), **nunca con
  una herramienta MCP**. Si Claude pudiera subirse el nivel, cualquier texto
  malicioso guardado en una idea o una nota (prompt injection) podría escalar
  permisos.
- Opcional: niveles **temporales** (`max_level = 3` hasta `expires_at`, p. ej. 1 h)
  para una limpieza puntual. Al expirar, vuelve al nivel base.

### Capa 3: confirmación en dos pasos para acciones de nivel 3 (y masivas)

1. `delete_task(id)` **no borra**. Devuelve una vista previa ("Borrar «Entregar
   capítulo 2» y sus 4 pasos") y un `confirmation_id`. Se guarda en
   `mcp_pending_actions (id, user_id, tool, args_hash, preview, expires_at)` con RLS
   y una expiración de 5 min.
2. `confirm_action(confirmation_id)` ejecuta exactamente lo previsto (se verifica el
   hash de los argumentos) y marca la acción como consumida.
3. En Claude Code, `confirm_action` va siempre en `ask`. En claude.ai, siempre en
   "Preguntar". Así la vista previa la ve **Cesar**, no solo Claude.
4. Si el cliente soporta **elicitation** de MCP, el servidor puede pedir la
   confirmación directamente al usuario con un formulario sí/no y saltarse el paso
   2. Si no la soporta, se usa el flujo de dos pasos. Ojo: el flujo de dos pasos sin
   la capa 1 no garantiza que haya un humano detrás, porque Claude podría llamar a
   `confirm_action` por su cuenta.

### Auditoría y deshacer

- Tabla `mcp_audit (user_id, at, client, tool, args jsonb, before jsonb, result)`
  con RLS. Registra cada escritura del MCP.
- Con el `before` guardado, `undo_last_action` (nivel 1) revierte la última
  escritura de nivel 1–2. Esto permite dejar el nivel 1 en "permitir siempre" sin
  miedo.
- La web puede mostrar "Actividad de Claude" leyendo `mcp_audit` (más adelante).

---

## 6. Cambios concretos en el repo

- **Migración** `supabase migration new mcp`: tablas `mcp_settings`, `mcp_audit` y
  `mcp_pending_actions`, todas con RLS `owner_all`, `revoke all from anon` e índice
  por `user_id`. Más un **pgTAP** en `supabase/tests/database/` (lo exige
  CLAUDE.md al tocar RLS).
- `packages/shared`: `todayISO`/`slotForHour` con `tz` (+ tests), `createApi`
  y el catálogo `mcp/tools.ts` (+ tests de niveles y de filtrado de `tools/list`).
- `apps/web`: usar `createApi`, añadir el selector de nivel en Ajustes y la página
  `oauth/consent` (variante C).
- `apps/mcp` (variante B) y `supabase/functions/mcp` (variante C).
- `supabase/config.toml`: `[auth.oauth_server]` y `[functions.mcp] verify_jwt = false`.
- CI: typecheck/test de `apps/mcp`; deploy de la función.
- Documentación: CLAUDE.md (comandos y arquitectura) y ROADMAP (fase nueva).

---

## 7. Plan por fases

| Fase | Entrega | Validación |
|---|---|---|
| **M0 · Base** | Zona horaria en fechas + `createApi`; la web sigue igual. | `pnpm test`, `pnpm typecheck`, prueba manual de Hoy. |
| **M1 · MCP local** | `apps/mcp` stdio con niveles 0–1 y permisos de Claude Code. | "¿Qué tengo hoy?", "anota idea X" y "marca hábito Y" desde Claude Code contra la DB local. |
| **M2 · Confianza** | Migración `mcp_*`, filtrado por nivel, niveles 2–3, `confirm_action`, auditoría, `undo` y selector en la web. | pgTAP + tests de herramientas; intentar `delete_task` con nivel 1 → rechazo. |
| **M3 · Remoto** | Edge Function + OAuth 2.1 + página de consentimiento → conector en claude.ai y móvil. | Añadir el conector en claude.ai, completar OAuth y repetir las pruebas de M1–M2 desde el móvil. |
| **M4 · Pulido** | Resources, prompts ("planificar mi día", "revisión guiada"), elicitation donde haya soporte. | Uso real durante una semana. |

Encaje con el roadmap actual: M0–M2 no compiten con la Fase 5 (alertas). M3
comparte con ella la infraestructura de Edge Functions, así que conviene hacerlo
justo después o junto con la Fase 5.

---

## 8. Riesgos y puntos abiertos

- **OAuth 2.1 de Supabase** es reciente. Antes de M3 hay que verificar su estado y
  que DCR funcione con claude.ai. Plan B: un Cloudflare Worker con
  `workers-oauth-provider` que delegue el login en Supabase.
- **Prompt injection**: el texto de ideas, notas y títulos llega a Claude como dato.
  Lo mitigan la capa 2 (nivel solo desde la web), la capa 3 (destructivo = dos
  pasos + humano) y la ausencia de herramientas de SQL libre.
- **Caché de la web**: los cambios hechos por Claude no aparecen en una pestaña
  abierta hasta el siguiente refetch. TanStack Query ya refresca al enfocar la
  ventana. Si no alcanza, se puede usar Supabase Realtime sobre `tasks`,
  `habit_logs` e `ideas` para invalidar `['today']`.
- **Zona horaria fija** (`America/Lima`): si Cesar viaja, "hoy" del MCP y de la web
  pueden diferir. Opción: guardar `tz` en `mcp_settings`.
- **Arranque en frío** de la Edge Function (~cientos de ms): aceptable para uso
  conversacional.

### Decisiones que necesita Cesar

1. ¿Prioridad al móvil/claude.ai (ir directo a C) o validar antes en local (B → C)?
   Recomendado: B → C.
2. Nivel por defecto al arrancar: ¿1 (capturar y marcar) o 0 (solo lectura)?
3. ¿Se permite nivel 3 alguna vez desde Claude, o los borrados quedan solo en la web?
4. ¿Hace falta "deshacer" desde el día 1, o basta la auditoría?
