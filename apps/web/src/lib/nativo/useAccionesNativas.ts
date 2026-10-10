import { useEffect, useRef } from 'react';
import { listaVistas, type Vista } from '../useVista';
import { esNativo } from './liveActivity';
import { ejecutarAccion, type AccionesNativas } from './plataforma';

declare global {
  interface Window {
    /** La llaman los menús de la app de Mac (Comandos.swift): `nueva-tarea`, `crear`, `ir:<vista>`. */
    sbAccion?: (nombre: string) => Promise<boolean>;
  }
}

/** En la app nativa, expone a Swift las acciones de los menús (Archivo y Ver de la Mac). */
export function useAccionesNativas(acciones: AccionesNativas<Vista>) {
  const actuales = useRef(acciones);
  actuales.current = acciones;
  useEffect(() => {
    if (!esNativo()) return;
    window.sbAccion = (nombre) => ejecutarAccion(nombre, actuales.current, listaVistas);
    return () => {
      delete window.sbAccion;
    };
  }, []);
}
