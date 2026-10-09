import { createClient } from '@supabase/supabase-js';
import { esNativo } from './nativo/liveActivity';
import { almacenNativo } from './nativo/sesion';

// Proyecto de producción (el que usa GitHub Pages). En desarrollo nunca debe usarse.
const PROD_REF = 'cwmqgjeqtpilhcagotmn';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error(
    `Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY para el modo "${import.meta.env.MODE}" ` +
      '(dev: apps/web/.env.dev.local · local: pnpm db:env)',
  );
}
if (import.meta.env.DEV && url.includes(PROD_REF)) {
  throw new Error('El servidor de desarrollo apunta a Supabase de producción; usa el proyecto dev o el local.');
}

// Fuera de producción, el título de la pestaña indica a qué backend estás conectado.
if (import.meta.env.DEV) document.title = `[${import.meta.env.MODE}] ${document.title}`;

// La anon key es pública: la seguridad la da RLS (ver supabase/migrations).
// x-timezone: los triggers que marcan hábitos desde tareas usan el día y la franja locales (public.hora_local()).
// En la app nativa la sesión se comparte con los botones de la Live Activity por el Keychain (ver `almacenNativo`).
export const sb = createClient(url, anonKey, {
  global: { headers: { 'x-timezone': Intl.DateTimeFormat().resolvedOptions().timeZone } },
  ...(esNativo() && { auth: { storage: almacenNativo } }),
});
