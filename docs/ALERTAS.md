# Avisos Web Push: runbook

Proyectos: dev `lvaeqltfbbixbpwogeul`, producción `cwmqgjeqtpilhcagotmn`. Repite los pasos 2 a 4 en cada uno.

## 1. Claves

```bash
node scripts/vapid-keys.mjs
```

Imprime `VAPID_KEYS` (JSON con `publicKey`/`privateKey` JWK, para la función) y `VITE_VAPID_PUBLIC_KEY` (clave pública cruda en base64url, para el navegador).

## 2. Secrets de la función, por proyecto

```bash
supabase secrets set --project-ref <ref> VAPID_KEYS='…' VAPID_SUBJECT=mailto:… CRON_SECRET=…
```

En local viven en `supabase/functions/.env.local` (ignorado por git):
`supabase functions serve recordatorios --env-file supabase/functions/.env.local`.

## 3. Desplegar

```bash
supabase functions deploy recordatorios --project-ref <ref>
```

`verify_jwt = false` sale de `supabase/config.toml`: `pg_cron` autentica con `x-cron-secret` y la prueba (`{ "prueba": true }`) verifica el JWT dentro de la función.

## 4. Vault, en el SQL editor de cada proyecto

```sql
select vault.create_secret('https://<ref>.supabase.co/functions/v1/recordatorios', 'recordatorios_url');
select vault.create_secret('<CRON_SECRET>', 'cron_secret');
```

En local, la URL es `http://host.docker.internal:54321/functions/v1/recordatorios`. El job `recordatorios` (cada 15 min) solo corre si existen **ambos** secretos.

## 5. Variable del repo

Crea `VITE_VAPID_PUBLIC_KEY` en las variables del repo (Settings, Variables); `pages.yml` la inyecta al compilar. En local, ponla en `apps/web/.env.*.local`.

## 6. Diagnóstico

```sql
select * from cron.job_run_details order by start_time desc limit 5;
select * from net._http_response order by created desc limit 5;
```

Y los logs de la función en el dashboard.

Reglas a recordar:
- Las horas de `recordatorios_config` son ≤ 23:45 (CHECK).
- Con varias franjas vencidas a la vez (config guardada tarde) se anotan todas y se envía solo la más reciente.
- Una config con `zona` inválida se omite sin romper la ronda.
- La función anota en `recordatorios_enviados` antes de enviar y borra suscripciones que dan 404/410.
- Si cambias la clave VAPID, cada dispositivo se resuscribe al abrir el modal 🔔.

## 7. iPhone

Requiere iOS 16.4+ y la PWA instalada: abrir Pages en Safari, Compartir, «Agregar a inicio», abrir desde el ícono, 🔔 y «Activar avisos aquí».
