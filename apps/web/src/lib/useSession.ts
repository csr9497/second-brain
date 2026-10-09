import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from './supabase';
import { sesionNativa } from './nativo/sesion';

/** undefined = aún comprobando; null = sin sesión. */
export function useSession() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((evento, s) => {
      setSession(s);
      // App nativa: la sesión se copia al Keychain para los botones de la Live Activity
      sesionNativa(evento, s);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return session;
}
