import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (en local: pnpm db:env)');
}

// La anon key es pública: la seguridad la da RLS (ver supabase/migrations).
export const sb = createClient(url, anonKey);
