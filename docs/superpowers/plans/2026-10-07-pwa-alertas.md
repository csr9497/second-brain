# PWA instalable y recordatorios por franja: plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Objetivo:** que la app se instale como PWA y mande un recordatorio Web Push por franja (mañana, tarde y noche) cuando quedan turnos de hábitos sin marcar.

**Arquitectura:**
- **Datos y lógica en SQL:** una migración crea las tablas de suscripciones, de configuración y de enviados, y la función `recordatorios_por_enviar(p_ahora)`, que calcula en SQL, con la zona del usuario, qué franjas vencieron y qué hábitos faltan.
- **Envío:** `pg_cron` llama cada 15 min a la Edge Function `recordatorios`, que solo envía (con `jsr:@negrel/webpush`) y anota lo enviado.
- **Web:** gana un service worker propio (`vite-plugin-pwa`, en modo `injectManifest`) y un modal 🔔 Avisos.

**Stack:** Postgres, pg_cron, pg_net y Vault en Supabase · Deno (Edge Functions) · vite-plugin-pwa 2, workbox 7 y @vite-pwa/assets-generator · React 19 y TanStack Query.

**Spec:** `docs/superpowers/specs/2026-10-07-pwa-alertas-design.md` · **Rama:** `feat/alertas-pwa`

**Desviación del spec (verificada al planear):** `@negrel/webpush` usa claves VAPID en formato JWK. Por eso hay un solo secret, `VAPID_KEYS` (un JSON con `publicKey` y `privateKey`), en lugar de `VAPID_PUBLIC_KEY` + `VAPID_PRIVATE_KEY`. La clave pública para el navegador (`VITE_VAPID_PUBLIC_KEY`) es la clave cruda en base64url que imprime `scripts/vapid-keys.mjs`.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/<ts>_recordatorios.sql` (nuevo) | Tablas, RLS, `recordatorios_por_enviar()` y job de `pg_cron` |
| `supabase/tests/database/recordatorios.test.sql` (nuevo) | pgTAP de la RLS y de la función |
| `supabase/functions/recordatorios/index.ts` (nuevo) | Ronda del cron y aviso de prueba: envía Web Push |
| `supabase/config.toml` | `[functions.recordatorios] verify_jwt = false` |
| `scripts/vapid-keys.mjs` (nuevo) | Genera las claves VAPID (Node, WebCrypto) |
| `apps/web/vite.config.ts` | Plugin PWA (manifest, injectManifest, íconos) |
| `apps/web/pwa-assets.config.ts` (nuevo) | Íconos generados desde `public/icon.svg` |
| `apps/web/public/icon.svg` (nuevo) | Ícono fuente |
| `apps/web/src/sw/sw.ts` + `apps/web/src/sw/tsconfig.json` (nuevos) | Service worker: precache, `push` y `notificationclick` |
| `apps/web/tsconfig.json`, `apps/web/package.json` | Excluir `src/sw` del tsconfig principal, typecheck del SW y dependencias |
| `apps/web/index.html` | Metas de iOS; quitar el favicon emoji (lo inyecta el plugin) |
| `apps/web/src/webmcp.d.ts` | Tipo de `VITE_VAPID_PUBLIC_KEY` |
| `apps/web/src/lib/push.ts` (nuevo) | Soporte, permiso y suscripción en este dispositivo |
| `apps/web/src/lib/api.ts` | `avisos`, `guardarAvisos`, `suscribir`, `quitarDispositivo`, `quitarEndpoint` y `probarAviso` |
| `apps/web/src/components/AvisosModal.tsx` (nuevo) | UI de Avisos |
| `apps/web/src/lib/modal.ts`, `apps/web/src/App.tsx` | `{ kind: 'avisos' }` y botón 🔔 en la cabecera |
| `apps/web/.env.example`, `.github/workflows/pages.yml` | `VITE_VAPID_PUBLIC_KEY` |
| `docs/ALERTAS.md` (nuevo), `CLAUDE.md`, `docs/PRD.md`, `docs/ROADMAP.md`, `docs/MINUTA.md` | Documentación |

---

### Task 1: pgTAP de recordatorios (test en rojo)

**Archivos:**
- Crear: `supabase/tests/database/recordatorios.test.sql`

- [ ] **Paso 1: Escribir el test**

```sql
-- Ejecutar con: supabase test db
-- Avisos (Fase 5): RLS de las tablas de avisos y recordatorios_por_enviar().
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (instance_id, id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', 'a@test'),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', 'b@test');

-- ---------- Como A: hábitos, registros y configuración ----------
set local role authenticated;
set local request.jwt.claims = '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.habits (id, nombre, turnos) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'Agua', '[["manana"],["tarde","noche"]]'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Leer', '[["tarde"]]'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'Archivado', '[["tarde"]]');
insert into public.habits (id, nombre, turnos, veces_semana) values
  ('bbbbbbbb-0000-4000-8000-000000000003', 'Gym', '[["tarde"]]', 3);
-- Agua: el turno «Tarde o Noche» del 7 ya se hizo de noche
insert into public.habit_logs (habit_id, fecha, slot) values ('bbbbbbbb-0000-4000-8000-000000000001', '2026-10-07', 'noche');
insert into public.recordatorios_config (zona, hora_manana, hora_tarde, hora_noche) values ('America/Lima', '11:00', '17:00', '21:30');
insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/a', 'p256', 'auth');

select is((select user_id from public.recordatorios_config), '11111111-1111-4111-8111-111111111111'::uuid,
  'recordatorios_config se rellena con auth.uid()');
select throws_ok($$ select * from public.recordatorios_por_enviar() $$, '42501', null,
  'authenticated no puede ejecutar recordatorios_por_enviar');

-- ---------- Como B: no ve nada de A ----------
set local request.jwt.claims = '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.push_subscriptions), 0, 'B no ve las suscripciones de A');
select is((select count(*)::int from public.recordatorios_config), 0, 'B no ve la configuración de A');
select throws_ok(
  $$ insert into public.push_subscriptions (endpoint, p256dh, auth, user_id) values ('https://push.example/b', 'p', 'x', '11111111-1111-4111-8111-111111111111') $$,
  '42501', null, 'B no puede suscribir dispositivos a nombre de A');

-- ---------- Anónimo ----------
set local role anon;
set local request.jwt.claims = '{"role":"anon"}';
select throws_ok($$ select * from public.push_subscriptions $$, '42501', null, 'anon no tiene acceso a push_subscriptions');
select throws_ok($$ select * from public.recordatorios_enviados $$, '42501', null, 'anon no tiene acceso a recordatorios_enviados');

-- ---------- Como el servicio: vigencias fijas para no depender de now() ----------
reset role;
update public.habit_periods set desde = '2026-10-01 12:00+00' where habit_id::text like 'bbbbbbbb-%';
-- «Archivado» dejó de estar vigente el 5
update public.habit_periods set hasta = '2026-10-05 12:00+00' where habit_id = 'bbbbbbbb-0000-4000-8000-000000000004';

-- 2026-10-08 02:00 UTC = 7 oct, 21:00 en Lima
select results_eq(
  $$ select franja, fecha from public.recordatorios_por_enviar('2026-10-08 02:00+00') order by franja $$,
  $$ values ('manana'::text, '2026-10-07'::date), ('tarde', '2026-10-07') $$,
  'a las 21:00 de Lima vencieron mañana y tarde, con el día local (no el UTC)');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'tarde'), array['Leer']::text[],
  'tarde: falta Leer; Agua hizo su turno de noche y Gym (semanal) y Archivado no cuentan');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'manana'), array['Agua']::text[],
  'mañana: falta Agua');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 02:45+00') where franja = 'noche'), '{}'::text[],
  'una franja vencida sin pendientes sale con la lista vacía');
select is((select habitos from public.recordatorios_por_enviar('2026-10-08 16:30+00') where franja = 'manana' and fecha = '2026-10-08'), array['Agua']::text[],
  'al día siguiente (11:30 en Lima) vuelve a faltar Agua');

insert into public.recordatorios_enviados (user_id, fecha, franja) values ('11111111-1111-4111-8111-111111111111', '2026-10-07', 'tarde');
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'tarde'), 0,
  'una franja ya avisada no se repite');

update public.recordatorios_config set hora_manana = null;
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00') where franja = 'manana'), 0,
  'una franja sin hora no avisa');

update public.recordatorios_config set activo = false;
select is((select count(*)::int from public.recordatorios_por_enviar('2026-10-08 02:00+00')), 0,
  'con los avisos desactivados no sale nada');

select * from finish();
rollback;
```

- [ ] **Paso 2: Comprobar que falla**

Run: `pnpm db:start` (si no está corriendo) y luego `supabase test db`
Expected: `recordatorios.test.sql` falla con `relation "public.recordatorios_config" does not exist`. `rls_and_triggers.test.sql` sigue en verde.

---

### Task 2: Migración de recordatorios

**Archivos:**
- Crear: `supabase/migrations/<ts>_recordatorios.sql` (vía `supabase migration new recordatorios`)

- [ ] **Paso 1: Crear el archivo**

Run: `supabase migration new recordatorios`

- [ ] **Paso 2: Escribir la migración**

```sql
-- Fase 5: avisos Web Push. Suscripciones por dispositivo, hora por franja y registro de lo enviado.
-- La Edge Function `recordatorios` (la llama pg_cron cada 15 min) pide a recordatorios_por_enviar() qué avisar.

create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Una fila por usuario. zona: IANA, la escribe el navegador al guardar. Hora null = sin aviso en esa franja
create table public.recordatorios_config (
  user_id     uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  activo      boolean not null default true,
  zona        text not null,
  hora_manana time,
  hora_tarde  time,
  hora_noche  time,
  updated_at  timestamptz not null default now()
);

-- Evita repetir un aviso: una fila por (usuario, día local, franja)
create table public.recordatorios_enviados (
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha      date not null,
  franja     text not null check (franja in ('manana','tarde','noche')),
  enviado_at timestamptz not null default now(),
  primary key (user_id, fecha, franja)
);

alter table public.push_subscriptions enable row level security;
create policy owner_all on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

alter table public.recordatorios_config enable row level security;
create policy owner_all on public.recordatorios_config for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.recordatorios_config from anon;
grant select, insert, update, delete on public.recordatorios_config to authenticated;

alter table public.recordatorios_enviados enable row level security;
create policy owner_all on public.recordatorios_enviados for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
revoke all on public.recordatorios_enviados from anon;
grant select, insert, update, delete on public.recordatorios_enviados to authenticated;

-- Franjas cuya hora ya pasó hoy (en la zona del usuario) y que aún no se avisaron, con los hábitos
-- diarios que siguen sin marcar en esa franja. Devuelve también las vencidas sin pendientes (habitos
-- vacío) para que la función las anote y no las vuelva a evaluar.
-- Vigencia como periodoEn() de @sb/shared: el periodo que cubre el día local; si varios, el más reciente.
-- Un turno «o» (p. ej. ["tarde","noche"]) cuenta como hecho si tiene un registro en cualquiera de sus franjas.
create function public.recordatorios_por_enviar(p_ahora timestamptz default now())
returns table (user_id uuid, fecha date, franja text, habitos text[])
language sql stable security definer set search_path = '' as $$
  with vencidas as (
    select c.user_id, c.zona, (p_ahora at time zone c.zona)::date as fecha, f.franja
    from public.recordatorios_config c
    join pg_catalog.pg_timezone_names tz on tz.name = c.zona   -- una zona inválida no rompe la ronda
    cross join lateral (values ('manana', c.hora_manana), ('tarde', c.hora_tarde), ('noche', c.hora_noche)) f(franja, hora)
    where c.activo
      and f.hora is not null
      and f.hora <= (p_ahora at time zone c.zona)::time
      and not exists (
        select 1 from public.recordatorios_enviados e
        where e.user_id = c.user_id and e.fecha = (p_ahora at time zone c.zona)::date and e.franja = f.franja)
  ),
  periodos as (
    select distinct on (p.habit_id, v.franja) v.user_id, v.fecha, v.franja, p.habit_id, p.turnos, p.veces_semana
    from vencidas v
    join public.habit_periods p on p.user_id = v.user_id
      and (p.desde at time zone v.zona)::date <= v.fecha
      and (p.hasta is null or (p.hasta at time zone v.zona)::date > v.fecha)
    order by p.habit_id, v.franja, p.desde desc
  ),
  pendientes as (
    -- los semanales (veces_semana) no tienen recordatorio
    select pe.user_id, pe.fecha, pe.franja, h.nombre
    from periodos pe
    join public.habits h on h.id = pe.habit_id
    cross join lateral jsonb_array_elements(pe.turnos) t(turno)
    where pe.veces_semana is null
      and t.turno ? pe.franja
      and not exists (
        select 1 from public.habit_logs l
        where l.habit_id = pe.habit_id and l.fecha = pe.fecha and l.done and t.turno ? l.slot)
  )
  select v.user_id, v.fecha, v.franja,
         coalesce(array_agg(distinct p.nombre order by p.nombre) filter (where p.nombre is not null), '{}')
  from vencidas v
  left join pendientes p on p.user_id = v.user_id and p.fecha = v.fecha and p.franja = v.franja
  group by v.user_id, v.fecha, v.franja;
$$;
revoke execute on function public.recordatorios_por_enviar(timestamptz) from public, anon, authenticated;
grant execute on function public.recordatorios_por_enviar(timestamptz) to service_role;

-- Cron: cada 15 min llama a la Edge Function. La URL y el secreto viven en Vault (uno por proyecto,
-- ver docs/ALERTAS.md). Sin ellos (local recién creado, tests) el job no hace nada.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
select cron.schedule('recordatorios', '*/15 * * * *', $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'recordatorios_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')),
    body := '{}'::jsonb)
  where exists (select 1 from vault.decrypted_secrets where name = 'recordatorios_url');
$cron$);
```

- [ ] **Paso 3: Recrear la DB local y correr los tests**

Run: `pnpm db:reset && supabase test db`
Expected: los dos archivos pasan (`recordatorios.test.sql`: 15/15).

- [ ] **Paso 4: Commit**

```bash
git add supabase/migrations/*_recordatorios.sql supabase/tests/database/recordatorios.test.sql
git commit -m "DB: avisos por franja (suscripciones, horas, enviados), recordatorios_por_enviar() y cron"
```

---

### Task 3: Claves VAPID y Edge Function `recordatorios`

**Archivos:**
- Crear: `scripts/vapid-keys.mjs`
- Crear: `supabase/functions/recordatorios/index.ts`
- Modificar: `supabase/config.toml` (al final)

- [ ] **Paso 1: Script de claves**

`scripts/vapid-keys.mjs`:

```js
// Genera las claves VAPID en el formato de jsr:@negrel/webpush:
//   VAPID_KEYS            → secret de la Edge Function (JWK de la pareja)
//   VITE_VAPID_PUBLIC_KEY → clave pública cruda en base64url para pushManager.subscribe
// Uso: node scripts/vapid-keys.mjs  (una vez; la misma pareja en dev y prod o una por proyecto)
const { subtle } = globalThis.crypto;
const keys = await subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
const jwk = { publicKey: await subtle.exportKey('jwk', keys.publicKey), privateKey: await subtle.exportKey('jwk', keys.privateKey) };
const raw = Buffer.from(await subtle.exportKey('raw', keys.publicKey)).toString('base64url');
console.log(`VAPID_KEYS='${JSON.stringify(jwk)}'`);
console.log(`VITE_VAPID_PUBLIC_KEY=${raw}`);
```

Run: `node scripts/vapid-keys.mjs`
Expected: dos líneas. **No las commitees.** Guarda `VAPID_KEYS` en `supabase/functions/.env.local` (ignorado por `*.local`) junto con `VAPID_SUBJECT=mailto:cesaraop.12@gmail.com` y `CRON_SECRET=<openssl rand -hex 24>`. Agrega `VITE_VAPID_PUBLIC_KEY` a `apps/web/.env.dev.local` y `apps/web/.env.docker.local`.

- [ ] **Paso 2: Escribir la función**

`supabase/functions/recordatorios/index.ts`:

```ts
// Recordatorios por franja (Fase 5). pg_cron la llama cada 15 min con x-cron-secret: pide a
// recordatorios_por_enviar() qué avisar, anota cada franja y manda el push a los dispositivos.
// Con { prueba: true } y el JWT del usuario manda un aviso de prueba solo a los suyos.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5';

type Franja = 'manana' | 'tarde' | 'noche';
interface Aviso { titulo: string; body: string; url: string; tag: string }
interface Fila { user_id: string; fecha: string; franja: Franja; habitos: string[] }

const FRANJA: Record<Franja, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-timezone',
};

function env(k: string) {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`Falta el secret ${k}`);
  return v;
}
const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'));

let app: webpush.ApplicationServer | undefined;
async function servidor() {
  app ??= await webpush.ApplicationServer.new({
    contactInformation: env('VAPID_SUBJECT'),
    vapidKeys: await webpush.importVapidKeys(JSON.parse(env('VAPID_KEYS')), { extractable: false }),
  });
  return app;
}

/** «Tarde · te faltan 2» / «Agua, Leer»; hasta 4 nombres y luego +n. */
function textoAviso(franja: Franja, habitos: string[]): Aviso {
  const n = habitos.length;
  const body = n > 4 ? `${habitos.slice(0, 4).join(', ')} +${n - 4}` : habitos.join(', ');
  return { titulo: `${FRANJA[franja]} · te falta${n === 1 ? '' : 'n'} ${n}`, body, url: './#/', tag: `recordatorio-${franja}` };
}

/** Manda `aviso` a cada dispositivo del usuario; borra los que ya no existen. Devuelve cuántos lo recibieron. */
async function enviar(userId: string, aviso: Aviso) {
  const { data: subs, error } = await admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', userId);
  if (error) throw error;
  const server = await servidor();
  let ok = 0;
  for (const s of subs) {
    try {
      // ttl de 1 h: un recordatorio que llega tarde ya no sirve
      await server.subscribe({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }).pushTextMessage(JSON.stringify(aviso), { ttl: 3600 });
      ok++;
    } catch (e) {
      if (e instanceof webpush.PushMessageError && (e.isGone() || e.response.status === 404)) {
        await admin.from('push_subscriptions').delete().eq('id', s.id);
      } else {
        console.error('push falló', s.endpoint, String(e));
      }
    }
  }
  return ok;
}

/** Ronda del cron: anota primero (no se repite aunque falle el envío) y luego envía. */
async function ronda() {
  const { data, error } = await admin.rpc('recordatorios_por_enviar');
  if (error) throw error;
  let avisos = 0;
  for (const f of data as Fila[]) {
    const { error: e } = await admin
      .from('recordatorios_enviados')
      .upsert({ user_id: f.user_id, fecha: f.fecha, franja: f.franja }, { onConflict: 'user_id,fecha,franja', ignoreDuplicates: true });
    if (e) throw e;
    if (f.habitos.length) avisos += await enviar(f.user_id, textoAviso(f.franja, f.habitos)).catch((err) => (console.error(err), 0));
  }
  return { franjas: (data as Fila[]).length, avisos };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  try {
    if (req.headers.get('x-cron-secret') === env('CRON_SECRET')) return json(await ronda());
    const body = await req.json().catch(() => ({}));
    const token = req.headers.get('Authorization')?.replace(/^Bearer /, '');
    if (body?.prueba && token) {
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data.user) return json({ error: 'no autorizado' }, 401);
      const enviados = await enviar(data.user.id, {
        titulo: 'Avisos activados ✓',
        body: 'Así te llegarán los recordatorios de hábitos.',
        url: './#/',
        tag: 'prueba',
      });
      return json({ enviados });
    }
    return json({ error: 'no autorizado' }, 401);
  } catch (e) {
    console.error(e);
    return json({ error: String(e) }, 500);
  }
});
```

- [ ] **Paso 3: Desactivar la verificación de JWT para esta función**

Al final de `supabase/config.toml`:

```toml
# La llama pg_cron (con x-cron-secret); la prueba verifica el JWT dentro de la función
[functions.recordatorios]
verify_jwt = false
```

- [ ] **Paso 4: Probar en local**

Run (en otra terminal): `supabase functions serve recordatorios --env-file supabase/functions/.env.local`

Luego:

```bash
. supabase/functions/.env.local
curl -s -X POST http://127.0.0.1:54321/functions/v1/recordatorios -H "x-cron-secret: $CRON_SECRET"
curl -s -X POST http://127.0.0.1:54321/functions/v1/recordatorios -H "x-cron-secret: malo"
```

Expected:
- con el secreto correcto: `{"franjas":N,"avisos":0}`, sin error (no hay suscripciones todavía);
- con un secreto malo: `{"error":"no autorizado"}`.

Si el import de `jsr:@negrel/webpush` falla en el Edge Runtime, para y repórtalo antes de cambiar de librería.

- [ ] **Paso 5: Commit**

```bash
git add scripts/vapid-keys.mjs supabase/functions/recordatorios/index.ts supabase/config.toml
git commit -m "Edge Function recordatorios: ronda del cron y aviso de prueba por Web Push"
```

---

### Task 4: PWA instalable con service worker propio

**Archivos:**
- Modificar: `apps/web/package.json`, `apps/web/vite.config.ts`, `apps/web/tsconfig.json`, `apps/web/index.html`
- Crear: `apps/web/pwa-assets.config.ts`, `apps/web/public/icon.svg`, `apps/web/src/sw/sw.ts`, `apps/web/src/sw/tsconfig.json`

- [ ] **Paso 1: Dependencias**

Run: `pnpm --filter @sb/web add -D vite-plugin-pwa@^2 workbox-precaching@^7.4 workbox-core@^7.4 workbox-build@^7.4 workbox-window@^7.4 @vite-pwa/assets-generator@^2`

- [ ] **Paso 2: Ícono fuente** (`apps/web/public/icon.svg`)

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#191817"/>
  <g fill="none" stroke="#7c9cff" stroke-width="30" stroke-linecap="round" stroke-linejoin="round">
    <path d="M256 140v240"/>
    <path d="M256 160c-18-36-96-38-108 12-46 8-64 62-34 94-28 32-10 86 36 90 12 46 82 54 106 14"/>
    <path d="M256 160c18-36 96-38 108 12 46 8 64 62 34 94 28 32 10 86-36 90-12 46-82 54-106 14"/>
  </g>
</svg>
```

- [ ] **Paso 3: Configuración de íconos** (`apps/web/pwa-assets.config.ts`)

```ts
import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Genera favicon, pwa-64/192/512, maskable-icon-512 y apple-touch-icon-180 desde public/icon.svg
export default defineConfig({ preset: minimal2023Preset, images: ['public/icon.svg'] });
```

- [ ] **Paso 4: Vite** (`apps/web/vite.config.ts`)

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA instalable; el service worker propio (src/sw/sw.ts) precachea el shell y muestra los avisos
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Second Brain',
        short_name: 'Brain',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#191817',
        background_color: '#191817',
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'] },
      // En `pnpm dev` también hay SW, para probar los avisos sin hacer build
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  // Rutas relativas: sirve igual en / (local) y en /second-brain/ (GitHub Pages)
  base: './',
  server: { port: 5173 },
});
```

- [ ] **Paso 5: Service worker** (`apps/web/src/sw/sw.ts`)

```ts
// Service worker (vite-plugin-pwa, injectManifest): precachea el shell y muestra los avisos de
// la Edge Function `recordatorios`. Las peticiones a Supabase no se cachean.
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// registerType autoUpdate: la versión nueva toma el control sin esperar
self.skipWaiting();
clientsClaim();

interface Aviso { titulo: string; body?: string; url?: string; tag?: string }

function leer(data: PushMessageData | null): Aviso {
  try {
    return data?.json() ?? { titulo: 'Second Brain' };
  } catch {
    return { titulo: 'Second Brain', body: data?.text() };
  }
}

self.addEventListener('push', (e) => {
  const a = leer(e.data);
  e.waitUntil(
    self.registration.showNotification(a.titulo, { body: a.body, tag: a.tag, icon: 'pwa-192x192.png', data: { url: a.url ?? './#/' } }),
  );
});

// Tocar el aviso enfoca la app si está abierta (sin navegar: no saltarse la guardia de cambios) o la abre
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data as { url?: string } | null)?.url ?? './#/', self.registration.scope).href;
  e.waitUntil(
    (async () => {
      const [abierta] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (abierta) await abierta.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
```

- [ ] **Paso 6: Typecheck aparte para el SW** (las libs DOM y WebWorker chocan en un mismo programa)

`apps/web/src/sw/tsconfig.json`:

```json
{
  "extends": "../../../../tsconfig.base.json",
  "compilerOptions": { "lib": ["ES2022", "WebWorker"], "types": [] },
  "include": ["."]
}
```

En `apps/web/tsconfig.json`, agrega `"exclude": ["src/sw"]`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "jsx": "react-jsx", "lib": ["ES2022", "DOM", "DOM.Iterable"], "types": ["vite/client", "vite-plugin-pwa/client"] },
  "include": ["src", "vite.config.ts"],
  "exclude": ["src/sw"]
}
```

En `apps/web/package.json`, cambia el script de typecheck a: `"typecheck": "tsc -p . && tsc -p src/sw"`.

- [ ] **Paso 7: `index.html`**

Quita la línea `<link rel="icon" href="data:image/svg+xml,...🧠...">`, porque el plugin inyecta el favicon y el `apple-touch-icon`. Debajo del viewport agrega:

```html
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
    <meta name="apple-mobile-web-app-title" content="Brain" />
```

- [ ] **Paso 8: Verificar**

Run: `pnpm typecheck && pnpm build && ls apps/web/dist | grep -E "sw.js|manifest.webmanifest|apple-touch-icon|pwa-512"`
Expected: el typecheck pasa y aparecen `sw.js`, `manifest.webmanifest`, `apple-touch-icon-180x180.png` y `pwa-512x512.png`. Además, `grep -o 'href="[^"]*manifest[^"]*"' apps/web/dist/index.html` debe mostrar una ruta relativa (sin `/` inicial).

- [ ] **Paso 9: Commit**

```bash
git add apps/web pnpm-lock.yaml
git commit -m "web: PWA instalable con service worker propio (precache, push y clic en el aviso)"
```

---

### Task 5: Push en el dispositivo y API de avisos

**Archivos:**
- Crear: `apps/web/src/lib/push.ts`
- Modificar: `apps/web/src/lib/api.ts` (tipos arriba de `export const api`, métodos al final del objeto), `apps/web/src/webmcp.d.ts` (`ImportMetaEnv`)

- [ ] **Paso 1: Tipo del env** (en `interface ImportMetaEnv` de `webmcp.d.ts`)

```ts
  /** Clave pública VAPID (base64url) para suscribir este dispositivo a los avisos */
  readonly VITE_VAPID_PUBLIC_KEY?: string;
```

- [ ] **Paso 2: `apps/web/src/lib/push.ts`**

```ts
// Web Push en este dispositivo: soporte, permiso y suscripción del service worker (src/sw/sw.ts).
// En iPhone/iPad solo hay push con la app instalada en la pantalla de inicio (iOS 16.4+).
export type EstadoPush = 'sin-soporte' | 'instalar' | 'bloqueado' | 'inactivo' | 'activo';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const haySoporte = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (esIOS() && !instalada()) return 'instalar';
  if (!haySoporte()) return 'sin-soporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  return (await suscripcionActual()) ? 'activo' : 'inactivo';
}

/** Endpoint de este dispositivo si está suscrito (para marcarlo en la lista). */
export const endpointActual = async () => (haySoporte() ? ((await suscripcionActual())?.endpoint ?? null) : null);

function base64UrlABytes(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

/** Pide permiso (debe venir de un clic) y suscribe este dispositivo. */
export async function suscribir(): Promise<PushSubscriptionJSON> {
  const clave = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!clave) throw new Error('Falta VITE_VAPID_PUBLIC_KEY');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('No diste permiso para notificaciones');
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlABytes(clave) }));
  return sub.toJSON();
}

/** Anula la suscripción de este dispositivo; devuelve su endpoint (para borrar la fila) o null. */
export async function desuscribir(): Promise<string | null> {
  const sub = await suscripcionActual();
  if (!sub) return null;
  await sub.unsubscribe();
  return sub.endpoint;
}
```

- [ ] **Paso 3: Tipos en `api.ts`** (justo antes de `export const api = {`)

```ts
/** Hora local "HH:MM" por franja; null = sin aviso en esa franja. */
export interface AvisosConfig {
  activo: boolean;
  horas: Record<HabitSlot, string | null>;
}
export interface Dispositivo {
  id: string;
  endpoint: string;
  userAgent: string;
  createdAt: string;
}

/** Postgres devuelve "HH:MM:SS"; el input type=time usa "HH:MM". */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);
```

- [ ] **Paso 4: Métodos al final del objeto `api`** (después de `archiveReview`)

```ts
  // Avisos (Web Push): horas por franja y dispositivos suscritos. La Edge Function `recordatorios` envía.
  avisos: async (): Promise<{ config: AvisosConfig | null; dispositivos: Dispositivo[] }> => {
    const [config, subs] = await Promise.all([
      sb.from('recordatorios_config').select('activo, hora_manana, hora_tarde, hora_noche').maybeSingle(),
      sb.from('push_subscriptions').select('id, endpoint, user_agent, created_at').order('created_at'),
    ]);
    if (config.error) throw new Error(config.error.message);
    const c = config.data;
    return {
      config: c ? { activo: c.activo, horas: { manana: hhmm(c.hora_manana), tarde: hhmm(c.hora_tarde), noche: hhmm(c.hora_noche) } } : null,
      dispositivos: must(subs).map((s) => ({ id: s.id, endpoint: s.endpoint, userAgent: s.user_agent ?? '', createdAt: s.created_at })),
    };
  },
  /** Guarda las horas con la zona del navegador: el cron evalúa cada franja en esa zona. */
  guardarAvisos: async (c: AvisosConfig) => {
    must(
      await sb.from('recordatorios_config').upsert(
        {
          user_id: await userId(),
          activo: c.activo,
          zona: Intl.DateTimeFormat().resolvedOptions().timeZone,
          hora_manana: c.horas.manana,
          hora_tarde: c.horas.tarde,
          hora_noche: c.horas.noche,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      ),
    );
  },
  suscribir: async (sub: PushSubscriptionJSON) => {
    if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys.auth) throw new Error('Suscripción incompleta');
    must(
      await sb
        .from('push_subscriptions')
        .upsert({ endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, user_agent: navigator.userAgent }, { onConflict: 'endpoint' }),
    );
  },
  quitarDispositivo: async (id: string) => {
    must(await sb.from('push_subscriptions').delete().eq('id', id));
  },
  quitarEndpoint: async (endpoint: string) => {
    must(await sb.from('push_subscriptions').delete().eq('endpoint', endpoint));
  },
  /** Aviso de prueba a todos mis dispositivos; devuelve a cuántos llegó. */
  probarAviso: async () => {
    const { data, error } = await sb.functions.invoke<{ enviados: number }>('recordatorios', { body: { prueba: true } });
    if (error) throw new Error(error.message);
    return data?.enviados ?? 0;
  },
```

Comprueba que `HabitSlot` ya se importa de `@sb/shared` en `api.ts` (sí, en la lista de imports).

- [ ] **Paso 5: Verificar**

Run: `pnpm typecheck`
Expected: pasa.

- [ ] **Paso 6: Commit**

```bash
git add apps/web/src/lib/push.ts apps/web/src/lib/api.ts apps/web/src/webmcp.d.ts
git commit -m "web: suscripción push del dispositivo y API de avisos"
```

---

### Task 6: Modal 🔔 Avisos

**Archivos:**
- Crear: `apps/web/src/components/AvisosModal.tsx`
- Modificar: `apps/web/src/lib/modal.ts` (agregar `| { kind: 'avisos' }`), `apps/web/src/App.tsx` (botón e importación)

- [ ] **Paso 1: `AvisosModal.tsx`**

```tsx
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SLOT_NOMBRE, type HabitSlot } from '@sb/shared';
import { api, type AvisosConfig, type Dispositivo } from '../lib/api';
import { desuscribir, endpointActual, estadoPush, suscribir, type EstadoPush } from '../lib/push';
import { Field, Modal, ModalActions } from './Modal';
import { useToast } from './Toast';
import { confirmar } from './ui/Confirmar';

const FRANJAS: HabitSlot[] = ['manana', 'tarde', 'noche'];
const POR_DEFECTO: AvisosConfig = { activo: true, horas: { manana: '11:00', tarde: '17:00', noche: '21:30' } };

const MENSAJE: Record<Exclude<EstadoPush, 'activo' | 'inactivo'>, string> = {
  'sin-soporte': 'Este navegador no admite notificaciones push.',
  instalar: 'En iPhone, instala la app para recibir avisos: Compartir → «Agregar a inicio», y ábrela desde ahí.',
  bloqueado: 'Bloqueaste las notificaciones de este sitio. Actívalas en los ajustes del navegador.',
};

/** «iPhone · Safari», «Mac · Chrome»… a partir del user agent. */
function nombreDispositivo(ua: string) {
  const so = /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Otro';
  const nav = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return nav ? `${so} · ${nav}` : so;
}

export function AvisosModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const avisos = useQuery({ queryKey: ['avisos'], queryFn: api.avisos });
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [actual, setActual] = useState<string | null>(null);
  const [config, setConfig] = useState<AvisosConfig | null>(null);

  const refrescarDispositivo = async () => {
    setEstado(await estadoPush());
    setActual(await endpointActual());
  };
  useEffect(() => {
    void refrescarDispositivo();
  }, []);
  // El formulario parte de lo guardado (o de los valores por defecto) una sola vez
  useEffect(() => {
    if (avisos.data && !config) setConfig(avisos.data.config ?? POR_DEFECTO);
  }, [avisos.data, config]);

  const alTerminar = (msg: string) => () => {
    toast(msg);
    qc.invalidateQueries({ queryKey: ['avisos'] });
    void refrescarDispositivo();
  };
  const onError = (err: Error) => toast(`⚠ ${err.message}`);

  const activar = useMutation({
    mutationFn: async () => {
      await api.suscribir(await suscribir());
      // Sin configuración guardada, activar el primer dispositivo guarda las horas por defecto
      if (!avisos.data?.config) await api.guardarAvisos(config ?? POR_DEFECTO);
    },
    onSuccess: alTerminar('🔔 Avisos activados en este dispositivo'),
    onError,
  });
  const desactivar = useMutation({
    mutationFn: async () => {
      const endpoint = await desuscribir();
      if (endpoint) await api.quitarEndpoint(endpoint);
    },
    onSuccess: alTerminar('Avisos desactivados en este dispositivo'),
    onError,
  });
  const guardar = useMutation({ mutationFn: api.guardarAvisos, onSuccess: alTerminar('✓ Horas guardadas'), onError });
  const quitar = useMutation({
    mutationFn: async (d: Dispositivo) => {
      if (d.endpoint === actual) await desuscribir();
      await api.quitarDispositivo(d.id);
    },
    onSuccess: alTerminar('Dispositivo quitado'),
    onError,
  });
  const probar = useMutation({
    mutationFn: api.probarAviso,
    onSuccess: (n) => toast(n ? `📨 Prueba enviada a ${n} dispositivo${n === 1 ? '' : 's'}` : '⚠ No hay dispositivos suscritos'),
    onError,
  });

  const setHora = (f: HabitSlot, v: string | null) => setConfig((c) => c && { ...c, horas: { ...c.horas, [f]: v } });

  return (
    <Modal title="🔔 Avisos" hint="Un recordatorio por franja si te quedan hábitos sin marcar." onClose={onClose}>
      <Field label="Este dispositivo" group>
        {estado === null ? null : estado === 'activo' ? (
          <div className="flex items-center justify-between gap-2 text-sm">
            <span>✓ Recibe avisos</span>
            <button className="btn" onClick={() => desactivar.mutate()} disabled={desactivar.isPending}>
              Desactivar aquí
            </button>
          </div>
        ) : estado === 'inactivo' ? (
          <button className="btn btn-primary" onClick={() => activar.mutate()} disabled={activar.isPending}>
            Activar avisos aquí
          </button>
        ) : (
          <p className="m-0 text-sm text-muted">{MENSAJE[estado]}</p>
        )}
      </Field>

      {config && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            guardar.mutate(config);
          }}
        >
          <Field label="Horas" group>
            <label className="mb-2.5 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={config.activo} onChange={(e) => setConfig({ ...config, activo: e.target.checked })} />
              Recordatorios activos
            </label>
            {FRANJAS.map((f) => (
              <div key={f} className="mb-2 flex items-center gap-2">
                <span className="w-20 text-sm">{SLOT_NOMBRE[f]}</span>
                <input
                  type="time"
                  className="input w-32"
                  aria-label={`Hora del aviso de ${SLOT_NOMBRE[f]}`}
                  value={config.horas[f] ?? ''}
                  disabled={!config.activo}
                  onChange={(e) => setHora(f, e.target.value || null)}
                />
                {config.horas[f] == null ? (
                  <span className="text-xs text-faint">sin aviso</span>
                ) : (
                  <button type="button" className="text-xs text-muted hover:text-text" disabled={!config.activo} onClick={() => setHora(f, null)}>
                    quitar
                  </button>
                )}
              </div>
            ))}
          </Field>
          <ModalActions>
            <button type="button" className="btn" onClick={() => probar.mutate()} disabled={probar.isPending}>
              Enviar prueba
            </button>
            <button className="btn btn-primary" disabled={guardar.isPending}>
              Guardar horas
            </button>
          </ModalActions>
        </form>
      )}

      {!!avisos.data?.dispositivos.length && (
        <Field label="Dispositivos" group>
          {avisos.data.dispositivos.map((d) => (
            <div key={d.id} className="mb-2 flex items-center justify-between gap-2 rounded-[9px] border border-line bg-surface2 px-[11px] py-[9px] text-[13px]">
              <span>
                {nombreDispositivo(d.userAgent)}
                {d.endpoint === actual && <span className="text-faint"> · este</span>}
                <span className="block text-xs text-faint">desde {new Date(d.createdAt).toLocaleDateString()}</span>
              </span>
              <button
                className="text-xs text-muted hover:text-text"
                aria-label={`Quitar ${nombreDispositivo(d.userAgent)}`}
                disabled={quitar.isPending}
                onClick={async () => {
                  if (await confirmar({ titulo: '¿Quitar este dispositivo?', mensaje: 'Dejará de recibir avisos.', aceptar: 'Quitar', cancelar: 'Cancelar' }))
                    quitar.mutate(d);
                }}
              >
                Quitar
              </button>
            </div>
          ))}
        </Field>
      )}
    </Modal>
  );
}
```

- [ ] **Paso 2: Estado del modal** (`lib/modal.ts`): agrega `| { kind: 'avisos' }` antes de `| null`.

- [ ] **Paso 3: `App.tsx`**

- Importa `import { AvisosModal } from './components/AvisosModal';`.
- Envuelve el botón «Salir» en `<div className="mt-2 flex gap-1.5">` y pon este botón delante:

```tsx
          <button
            onClick={() => setModal({ kind: 'avisos' })}
            aria-label="Avisos"
            className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
          >
            🔔
          </button>
```

  Al botón «Salir» quítale `mt-2`, porque ahora lo lleva el contenedor.
- Monta el modal junto a los demás: `{modal?.kind === 'avisos' && <AvisosModal onClose={close} />}`.

- [ ] **Paso 4: Verificar**

Run: `pnpm typecheck && pnpm build`
Expected: los dos pasan.

Luego, manual: `pnpm dev:local` con `supabase functions serve` corriendo. En Chrome de escritorio abre 🔔:
1. «Activar avisos aquí»: el navegador pide permiso y aparece «✓ Recibe avisos». El dispositivo sale en la lista como «Mac · Chrome · este».
2. «Enviar prueba»: llega la notificación «Avisos activados ✓».
3. Pon la hora de la tarde 1 min antes de la hora actual y guarda. Lanza el curl del cron (Task 3, paso 4): llega «Tarde · te faltan N». Si lo lanzas otra vez, ya no llega nada.

- [ ] **Paso 5: Commit**

```bash
git add apps/web/src/components/AvisosModal.tsx apps/web/src/lib/modal.ts apps/web/src/App.tsx
git commit -m "web: modal de Avisos (activar en el dispositivo, horas por franja, prueba y dispositivos)"
```

---

### Task 7: Variables, CI y documentación

**Archivos:**
- Modificar: `apps/web/.env.example`, `.github/workflows/pages.yml`, `CLAUDE.md`, `docs/PRD.md` (§7 y §8), `docs/ROADMAP.md` (Fases 5 y 6), `docs/MINUTA.md`
- Crear: `docs/ALERTAS.md`

- [ ] **Paso 1:** al final de `apps/web/.env.example`:

```
# Avisos (Web Push): clave pública VAPID de `node scripts/vapid-keys.mjs`
VITE_VAPID_PUBLIC_KEY=
```

- [ ] **Paso 2:** en `pages.yml`, dentro de `env:` y después de `VITE_WEBMCP_OT_TOKEN`:

```yaml
      # Avisos Web Push: clave pública VAPID (la privada vive en los secrets de Supabase)
      VITE_VAPID_PUBLIC_KEY: ${{ vars.VITE_VAPID_PUBLIC_KEY }}
```

- [ ] **Paso 3: `docs/ALERTAS.md`.** Es un runbook con estas secciones:
  1. **Claves:** `node scripts/vapid-keys.mjs`.
  2. **Secrets de la función, por proyecto:** `supabase secrets set --project-ref <ref> VAPID_KEYS='…' VAPID_SUBJECT=mailto:… CRON_SECRET=…`.
  3. **Desplegar:** `supabase functions deploy recordatorios --project-ref <ref>`. `verify_jwt` sale de `config.toml`.
  4. **Vault, en el SQL editor de cada proyecto:**
     - `select vault.create_secret('https://<ref>.supabase.co/functions/v1/recordatorios', 'recordatorios_url');`
     - `select vault.create_secret('<CRON_SECRET>', 'cron_secret');`
     - En local, la URL es `http://host.docker.internal:54321/functions/v1/recordatorios`.
  5. **Variable del repo:** `VITE_VAPID_PUBLIC_KEY`.
  6. **Diagnóstico:**
     - `select * from cron.job_run_details order by start_time desc limit 5;`
     - `select * from net._http_response order by created desc limit 5;`
     - logs de la función en el dashboard.
  7. **iPhone:** abrir Pages en Safari, Compartir, «Agregar a inicio», abrir desde el ícono, 🔔 y «Activar avisos aquí».

- [ ] **Paso 4: Docs del proyecto**

- **`CLAUDE.md`:**
  - En «Estado»: ya está la Fase 5 y la PWA instalable. Falta lo offline, los avisos de proyectos y deadlines y las métricas.
  - En «Arquitectura», un punto **Avisos** que cuente:
    - que el SW está en `src/sw/sw.ts` (`injectManifest`, con su propio tsconfig);
    - que `recordatorios_por_enviar()` calcula en SQL con `recordatorios_config.zona`, porque la función corre en UTC;
    - que la Edge Function `recordatorios` la llama `pg_cron` cada 15 min con `x-cron-secret`, y que la URL y el secreto están en Vault;
    - que se anota antes de enviar;
    - los secrets `VAPID_KEYS` y `CRON_SECRET`;
    - que la UI está en `AvisosModal` con la query `['avisos']`;
    - y que el runbook es `docs/ALERTAS.md`.
- **`docs/PRD.md` §7:** reemplazar BullMQ por «un recordatorio por franja a la hora configurada, solo si quedan turnos de hábitos diarios sin marcar; `pg_cron` + Edge Function + Web Push».
- **`docs/PRD.md` §8:** marcar como hecha la PWA instalable.
- **`docs/ROADMAP.md`:**
  - en la Fase 5, ✅ con lo implementado;
  - en la Fase 6, ✅ en «PWA instalable», y el offline queda pendiente.
- **`docs/MINUTA.md`:** usa el agente `minuta` para actualizarla.

- [ ] **Paso 5: Verificar y hacer commit**

Run: `pnpm typecheck && pnpm test && pnpm build && supabase test db`
Expected: todo en verde.

```bash
git add apps/web/.env.example .github/workflows/pages.yml docs CLAUDE.md
git commit -m "docs: avisos Web Push (runbook, PRD, roadmap) y VITE_VAPID_PUBLIC_KEY en CI"
```

---

### Task 8: Desplegar en dev y probar en los dispositivos

**Nada aquí toca producción.** Producción va después de fusionar, y con confirmación del usuario.

- [ ] **Paso 1:** `pnpm db:push:dev`, que aplica la migración en dev (`lvaeqltfbbixbpwogeul`).
- [ ] **Paso 2:** `supabase secrets set --project-ref lvaeqltfbbixbpwogeul VAPID_KEYS='…' VAPID_SUBJECT=mailto:cesaraop.12@gmail.com CRON_SECRET=…`
- [ ] **Paso 3:** `supabase functions deploy recordatorios --project-ref lvaeqltfbbixbpwogeul`
- [ ] **Paso 4:** crea los dos secrets de Vault en dev (`recordatorios_url` y `cron_secret`) como dice `docs/ALERTAS.md`. Se hace por SQL contra `SUPABASE_DEV_DB_URL`: `psql "$SUPABASE_DEV_DB_URL" -c "select vault.create_secret(...)"`.
- [ ] **Paso 5:** `pnpm dev`. En el escritorio: activar, enviar prueba y comprobar que llega. Pon una franja 1 min en el pasado y espera la siguiente ronda (máx. 15 min). Debe llegar el aviso y `cron.job_run_details` debe mostrar `succeeded`.
- [ ] **Paso 6 (iPhone):** dev no sirve por HTTPS en el teléfono. La prueba en el iPhone se hace con producción, tras fusionar y desplegar (Task 9).

### Task 9: Producción (tras fusionar, con confirmación del usuario)

- [ ] Las mismas operaciones de la Task 8, con el ref `cwmqgjeqtpilhcagotmn`:
  - `supabase db push` (el proyecto linkeado es prod);
  - secrets;
  - deploy de la función;
  - Vault;
  - la variable `VITE_VAPID_PUBLIC_KEY` en el repo (`gh variable set VITE_VAPID_PUBLIC_KEY --body …`).
- [ ] **Prueba en el iPhone:** instalar desde Safari, activar y enviar prueba.
