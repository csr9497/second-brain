// Recordatorios por franja (Fase 5). pg_cron la llama cada 15 min con x-cron-secret: pide a
// recordatorios_por_enviar() qué avisar, anota cada franja y manda el push a los dispositivos.
// Con { prueba: true } y el JWT del usuario manda un aviso de prueba solo a los suyos.
import { createClient } from 'npm:@supabase/supabase-js@2';
import * as webpush from 'jsr:@negrel/webpush@0.5';

type Franja = 'manana' | 'tarde' | 'noche';
interface Aviso { titulo: string; body: string; url: string; tag: string }
interface Fila { user_id: string; fecha: string; franja: Franja; habitos: string[] }

const FRANJA: Record<Franja, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };
const ORDEN: Franja[] = ['manana', 'tarde', 'noche'];
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
  const filas = data as Fila[];
  const porUsuario = new Map<string, Fila[]>();
  for (const f of filas) {
    const { error: e } = await admin
      .from('recordatorios_enviados')
      .upsert({ user_id: f.user_id, fecha: f.fecha, franja: f.franja }, { onConflict: 'user_id,fecha,franja', ignoreDuplicates: true });
    if (e) throw e;
    porUsuario.set(f.user_id, [...(porUsuario.get(f.user_id) ?? []), f]);
  }
  let avisos = 0;
  for (const [userId, propias] of porUsuario) {
    // Un aviso tarde no sirve: si varias franjas vencen a la vez (config guardada tarde), solo cuenta la más reciente
    const ultima = propias.sort((a, b) => ORDEN.indexOf(a.franja) - ORDEN.indexOf(b.franja)).at(-1);
    if (ultima?.habitos.length) avisos += await enviar(userId, textoAviso(ultima.franja, ultima.habitos)).catch((err) => (console.error(err), 0));
  }
  return { franjas: filas.length, avisos };
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
