import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { esNativo } from './liveActivity';

declare global {
  interface Window {
    /** La llama el «jalar para actualizar» nativo (BridgeViewController.swift); termina cuando llegan los datos. */
    sbRefrescar?: () => Promise<void>;
  }
}

/** En la app nativa, jalar hacia abajo vuelve a pedir todo lo que está en pantalla (y con Hoy, la card). */
export function useRefresco() {
  const qc = useQueryClient();
  useEffect(() => {
    if (!esNativo()) return;
    window.sbRefrescar = async () => {
      // Un fallo ya lo muestra cada vista; aquí solo importa cerrar el indicador
      await qc.refetchQueries({ type: 'active' }).catch(() => undefined);
    };
    return () => {
      delete window.sbRefrescar;
    };
  }, [qc]);
}
