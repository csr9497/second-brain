import { useEffect, useState } from 'react';

// Vistas por hash (#/ y #/calendario): recargar conserva la vista y sirve igual en GitHub Pages.
export type Vista = 'hoy' | 'calendario';
const HASH: Record<Vista, string> = { hoy: '#/', calendario: '#/calendario' };
const desdeHash = (h: string): Vista => (h === HASH.calendario ? 'calendario' : 'hoy');

export function useVista() {
  const [vista, setVista] = useState<Vista>(() => desdeHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setVista(desdeHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return vista;
}

export const hrefVista = (v: Vista) => HASH[v];
