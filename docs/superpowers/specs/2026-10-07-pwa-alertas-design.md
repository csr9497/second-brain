# PWA instalable y recordatorios por franja (Web Push): diseño

Este documento cubre la Fase 5 (alertas) y la base de la Fase 6 (PWA instalable). Las piezas de offline, avisos de proyectos sin avanzar y métricas tendrán su propio spec.

Hay dos objetivos:
- recibir avisos en el **iPhone** (con la PWA instalada) y en el **navegador de escritorio**;
- recibir **un recordatorio por franja** (mañana, tarde y noche) cuando quedan turnos de hábitos sin marcar.

## 1. Base de la PWA

- **Plugin:** `vite-plugin-pwa` en modo `injectManifest`, con un service worker propio en `apps/web/src/sw.ts`. Hace tres cosas:
  - precachea el shell (`precacheAndRoute(self.__WB_MANIFEST)`);
  - con `push`, hace `showNotification(titulo, { body, tag: 'recordatorio-<franja>', data: { url } })`;
  - con `notificationclick`, enfoca una ventana abierta de la app o, si no hay, abre `url` (por defecto `./#/`).
- **Actualización:** `registerType: 'autoUpdate'`. Solo se precachean los assets del build. Las peticiones a Supabase no se cachean (el modo offline queda para otro spec).
- **Manifest:**
  - `name` "Second Brain", `short_name` "Brain";
  - `start_url: './'`, `scope: './'` y `display: 'standalone'`;
  - `theme_color` y `background_color` iguales al fondo del tema oscuro de `index.css`.
- **Íconos:** van en `apps/web/public/`: 192 y 512 px (más una variante `maskable`) y `apple-touch-icon` de 180 px. En `index.html` se agregan `<link rel="apple-touch-icon">` y `<meta name="apple-mobile-web-app-capable">`.
- **Rutas:** todo es relativo para que funcione con `base: './'` en `/` y en `/second-brain/`.
- **iPhone sin instalar:** si `navigator.standalone !== true` y el dispositivo es iOS, la sección Avisos muestra «Instala la app (Compartir → Agregar a inicio) para recibir avisos» en lugar del botón de activar.

## 2. Datos (una migración nueva)

Las tres tablas llevan `user_id default auth.uid()`, RLS y la política `owner_all`.

- **`push_subscriptions`:** `id`, `user_id`, `endpoint text unique`, `p256dh text`, `auth text`, `user_agent text` y `created_at`. Hay una fila por dispositivo. El cliente usa upsert por `endpoint`.
- **`recordatorios_config`:**
  - `user_id` como PK;
  - `activo bool default true`;
  - `zona text not null`, una zona IANA que escribe el navegador al guardar;
  - `hora_manana time`, `hora_tarde time` y `hora_noche time`, que pueden ser null (null significa sin aviso en esa franja);
  - `updated_at`.
- **`recordatorios_enviados`:** `user_id`, `fecha date` (día local), `franja text` con CHECK `manana|tarde|noche`, y `enviado_at`. La PK es `(user_id, fecha, franja)`. Evita mandar el mismo aviso dos veces.
- **Función `recordatorios_por_enviar()`:**
  - Es `security definer`, con `search_path` fijo y `execute` solo para `service_role`.
  - Por cada configuración activa calcula `ahora = now() at time zone zona`. Una franja está vencida si su hora no es null, es menor o igual que `ahora::time` y la tupla `(user_id, ahora::date, franja)` no está en `enviados`.
  - Devuelve `(user_id, fecha, franja, habitos text[])`, donde `habitos` son los nombres de los hábitos **diarios** que siguen sin marcar en esa franja ese día:
    - el hábito está vigente ese día según su periodo de `habit_periods` (los límites se convierten a la `zona`) y `veces_semana is null`;
    - tiene un turno que contiene la franja;
    - ese turno no tiene ningún registro en `habit_logs` para la fecha. Un turno «o», como `["tarde","noche"]`, cuenta como hecho si tiene un log en cualquiera de sus franjas.
  - Devuelve también las franjas vencidas con `habitos` vacío. Así la función las anota como enviadas y no las vuelve a evaluar.
- **Cron:** `pg_cron` y `pg_net`. El job `recordatorios` corre cada 15 min (`*/15 * * * *`) y hace `net.http_post` a `<SUPABASE_URL>/functions/v1/recordatorios` con el header `x-cron-secret`. La URL y el secreto se leen de Vault (`vault.decrypted_secrets`) para que la migración sirva igual en dev y en prod.
- **pgTAP:** RLS de las tres tablas, y `recordatorios_por_enviar()` cubriendo:
  - la franja vencida frente a la no vencida;
  - la franja ya enviada;
  - un turno «o» hecho en la otra franja;
  - un hábito semanal excluido;
  - un hábito archivado excluido;
  - la zona horaria (una hora UTC que en Lima es otro día).

## 3. Edge Function `recordatorios` (`supabase/functions/recordatorios/index.ts`)

- **Acceso:** rechaza con 401 si `x-cron-secret` no coincide con `CRON_SECRET`. Se despliega con `--no-verify-jwt`, porque la llama el cron.
- **Cliente:** usa supabase-js con `SUPABASE_SERVICE_ROLE_KEY`.
- **Flujo:**
  1. Llama a `rpc('recordatorios_por_enviar')`.
  2. Por cada fila con `habitos` no vacío, manda un push a cada suscripción del usuario. El payload es JSON: `{ titulo: 'Tarde · te faltan 2', body: 'Agua, Leer', url: './#/' }`. El cuerpo lista hasta 4 nombres y luego «+n».
  3. Si una suscripción responde 404 o 410, la borra.
  4. Inserta la fila en `recordatorios_enviados` (`on conflict do nothing`) aunque `habitos` venga vacío o el envío falle. No reintenta: un aviso tarde no sirve.
- **Prueba:** si viene `{ prueba: true }` con un JWT de usuario, en vez del secreto, manda «Avisos activados ✓» solo a las suscripciones de ese usuario. Esa rama sí verifica el JWT con `auth.getUser()`.
- **Web Push:** se firma con VAPID usando una librería compatible con Deno (`jsr:@negrel/webpush` o `npm:web-push`). El plan debe confirmar cuál funciona en el runtime de Edge antes de escribir la función.

## 4. UI: sección «Avisos»

- **Ubicación:** un botón 🔔 en la cabecera abre `AvisosModal`, que usa el mismo `Modal`.
- **Contenido:**
  - **Este dispositivo:**
    - si no hay soporte, se dice así;
    - en un iPhone sin instalar, se muestra la indicación de la sección 1;
    - si los avisos no están activos, aparece el botón «Activar avisos aquí», que pide permiso, hace `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: VITE_VAPID_PUBLIC_KEY })` y luego upsert;
    - si ya están activos, dice «Activado», con un botón para desactivar (unsubscribe y borrar la fila).
  - **Horas:** un interruptor general y, por franja, un campo de hora con la opción de dejarlo sin aviso. Los valores por defecto son mañana 11:00, tarde 17:00 y noche 21:30. Al guardar se hace upsert con `zona = Intl.DateTimeFormat().resolvedOptions().timeZone`.
  - **Dispositivos:** la lista de suscripciones (el `user_agent` resumido y la fecha), con un botón para quitar cada una. El quitado pide `confirmar(...)`.
  - **«Enviar prueba»:** invoca la función con `{ prueba: true }`.
- **Datos:** todo pasa por `lib/api.ts` (`avisos.config`, `avisos.guardar`, `avisos.suscripciones`, `avisos.suscribir`, `avisos.quitar` y `avisos.probar`), con la query `['avisos']`. No toca `['today']`.

## 5. Secretos y despliegue

- **Claves VAPID:** se generan una vez (`npx web-push generate-vapid-keys`).
  - La pública va como `VITE_VAPID_PUBLIC_KEY` en `.env.dev.local`, `.env.docker.local` y las variables del repo. `pages.yml` la pasa al build.
  - Los secrets de Supabase (en dev y en prod) son `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:`) y `CRON_SECRET`.
- **Vault (por proyecto):** `recordatorios_url` y `cron_secret`. Los pasos van en `docs/ALERTAS.md`.
- **Despliegue de la función:** `supabase functions deploy recordatorios --no-verify-jwt --project-ref <ref>`, primero en dev y después en prod.
- **Docs:** actualizar CLAUDE.md (arquitectura: SW, función y cron), PRD §7 y ROADMAP (Fase 5 hecha y parte de la 6).

## Fuera de alcance

- Offline para marcar hábitos.
- Avisos de deadlines y de proyectos sin avanzar.
- Métricas.
- Email.
- Botones de acción en la notificación (iOS no los soporta).
- Recordatorios para hábitos semanales.

## Riesgos

- **Web Push en iOS** solo funciona con la PWA instalada (iOS 16.4+), y la Edge Function tiene que firmar VAPID en Deno. La prueba manual en el iPhone es el criterio de «hecho».
- **El cron puede retrasar el aviso hasta 15 min.** Se acepta.
