import { useEffect, useState } from 'react';

// Vistas por hash: recargar conserva la vista y sirve igual en GitHub Pages.
export const VISTAS = {
  hoy: { hash: '#/', label: '☀️ Hoy', ancho: 'max-w-[780px]' },
  calendario: { hash: '#/calendario', label: '📅 Calendario', ancho: 'max-w-[1040px]' },
  gantt: { hash: '#/gantt', label: '📊 Gantt', ancho: 'max-w-[1240px]' },
} as const;
export type Vista = keyof typeof VISTAS;
export const listaVistas = Object.keys(VISTAS) as Vista[];
const desdeHash = (h: string): Vista => listaVistas.find((v) => VISTAS[v].hash === h) ?? 'hoy';
export const hrefVista = (v: Vista) => VISTAS[v].hash;

export function useVista() {
  const [vista, setVista] = useState<Vista>(() => desdeHash(window.location.hash));
  useEffect(() => {
    const onHash = () => setVista(desdeHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return vista;
}

// Guardia de salida: una vista con cambios sin guardar decide si se puede ir a otra.
// (El botón "atrás" del navegador no pasa por aquí: limitación aceptada.)
let guardia: (() => boolean) | null = null;
export const puedeSalir = () => (guardia ? guardia() : true);

export function useGuardiaSalida(activa: boolean, mensaje: string) {
  useEffect(() => {
    if (!activa) return;
    guardia = () => window.confirm(mensaje);
    const antesDeCerrar = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', antesDeCerrar);
    return () => {
      guardia = null;
      window.removeEventListener('beforeunload', antesDeCerrar);
    };
  }, [activa, mensaje]);
}
