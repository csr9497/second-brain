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

/** `exp` del JWT (segundos), o null si no se puede leer. */
function expDelJwt(jwt: string): number | null {
  try {
    const b64 = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const exp = (JSON.parse(atob(b64)) as { exp?: unknown }).exp;
    return typeof exp === 'number' ? exp : null;
  } catch {
    return null;
  }
}

/**
 * Almacenamiento de supabase-js en la app nativa: localStorage, pero la sesión toma los tokens del Keychain cuando
 * difieren.
 *
 * Supabase rota el refresh token. Si un botón de la card refrescó la sesión (SupabaseREST.swift), el refresh token
 * que guarda la web ya está usado y, pasado el intervalo de reutilización, supabase-js recibiría «Invalid Refresh
 * Token» y cerraría la sesión. Un `setSession` al volver a primer plano llegaría tarde: al arrancar y al hacerse
 * visible, supabase-js ya refresca con lo que tiene en el almacenamiento. Por eso el parche va aquí, que es lo que
 * supabase-js lee cada vez que carga la sesión (arranque, vuelta a primer plano, cada petición).
 *
 * El Keychain siempre está igual o más al día que la web: cada TOKEN_REFRESHED/SIGNED_IN de la web lo sobrescribe
 * (`sesionNativa`). Las carreras que quedan (la web y un botón refrescando a la vez) las cubre el intervalo de
 * reutilización de Supabase; ver `SupabaseREST.refrescar`.
 */
export const almacenNativo = {
  async getItem(clave: string): Promise<string | null> {
    const crudo = localStorage.getItem(clave);
    if (!crudo || !clave.endsWith('-auth-token')) return crudo;
    try {
      const k = await LiveActivity.leerSesion();
      if (!k.refreshToken || !k.accessToken || k.url !== import.meta.env.VITE_SUPABASE_URL) return crudo;
      const sesion = JSON.parse(crudo) as Record<string, unknown>;
      if (sesion.refresh_token === k.refreshToken) return crudo;
      const exp = expDelJwt(k.accessToken);
      const nueva = {
        ...sesion,
        access_token: k.accessToken,
        refresh_token: k.refreshToken,
        ...(exp !== null && { expires_at: exp, expires_in: Math.max(0, exp - Math.floor(Date.now() / 1000)) }),
      };
      const json = JSON.stringify(nueva);
      localStorage.setItem(clave, json);
      console.info('[LiveActivity] sesión tomada del Keychain (la renovó la card)');
      return json;
    } catch (e: unknown) {
      console.warn('[LiveActivity] leerSesion falló', e);
      return crudo;
    }
  },
  setItem: async (clave: string, valor: string) => localStorage.setItem(clave, valor),
  removeItem: async (clave: string) => localStorage.removeItem(clave),
};
