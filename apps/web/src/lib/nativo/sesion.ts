import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { esNativo, LiveActivity } from './liveActivity';

/**
 * En la app nativa, copia la sesión de Supabase al Keychain (para los botones de la Live Activity)
 * y la borra al cerrar sesión. Se llama desde el `onAuthStateChange` de `useSession`.
 */
export function sesionNativa(evento: AuthChangeEvent, s: Session | null) {
  if (!esNativo()) return;
  if (evento === 'SIGNED_OUT') {
    LiveActivity.cerrarSesion().catch((e: unknown) => console.warn('[LiveActivity] cerrarSesion falló', e));
    return;
  }
  if (s && (evento === 'SIGNED_IN' || evento === 'TOKEN_REFRESHED' || evento === 'INITIAL_SESSION')) {
    LiveActivity.guardarSesion({
      url: import.meta.env.VITE_SUPABASE_URL,
      anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      accessToken: s.access_token,
      refreshToken: s.refresh_token,
    }).catch((e: unknown) => console.warn('[LiveActivity] guardarSesion falló', e));
  }
}
