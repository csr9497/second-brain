import { useEffect, useState } from 'react';
import { confirmar } from '../components/ui/Confirmar';

// Vistas por hash: recargar conserva la vista y sirve igual en GitHub Pages.
export const VISTAS = {
  hoy: { hash: '#/', label: '☀️ Hoy' },
  calendario: { hash: '#/calendario', label: '📅 Calendario' },
  gantt: { hash: '#/gantt', label: '📊 Gantt' },
  resumen: { hash: '#/resumen', label: '📈 Resumen' },
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
let guardia: (() => Promise<boolean>) | null = null;
/** true si se puede salir de la vista actual (pregunta si hay cambios sin guardar). */
export const puedeSalir = (): Promise<boolean> => (guardia ? guardia() : Promise.resolve(true));

export function useGuardiaSalida(activa: boolean, mensaje: string) {
  useEffect(() => {
    if (!activa) return;
    guardia = () => confirmar({ titulo: mensaje, mensaje: 'Los cambios que no guardaste se perderán.' });
    const antesDeCerrar = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // navegadores antiguos
    };
    window.addEventListener('beforeunload', antesDeCerrar);
    return () => {
      guardia = null;
      window.removeEventListener('beforeunload', antesDeCerrar);
    };
  }, [activa, mensaje]);
}
