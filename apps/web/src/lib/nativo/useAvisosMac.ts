import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { avisoPendientes, avisosDelDia } from '@sb/shared';
import { api } from '../api';
import { TODAY_KEY } from '../useToday';
import { AvisosMac } from './liveActivity';

/**
 * En la app de Mac, programa los avisos de hoy como notificaciones del sistema (Puente.swift): uno por franja con hora
 * configurada (🔔 Avisos) y hábitos pendientes, más uno por la mañana con lo que vence y los proyectos parados. Se reprograma con cada cambio de Hoy o de las horas, así que marcar los
 * hábitos de una franja quita su aviso. En iOS y en la web no hace nada (los avisos van por Web Push).
 */
export function useAvisosMac() {
  const mac = AvisosMac !== null;
  const { data: today } = useQuery({ queryKey: TODAY_KEY, queryFn: api.today, enabled: mac });
  const { data: avisos } = useQuery({ queryKey: ['avisos'], queryFn: api.avisos, enabled: mac });
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    if (!AvisosMac || !today || !avisos) return;
    const ahora = new Date();
    const pendientes = avisoPendientes(today, avisos.config, ahora);
    const lista = [...avisosDelDia(today, avisos.config, ahora), ...(pendientes ? [pendientes] : [])];
    const clave = JSON.stringify(lista);
    if (clave === ultimo.current) return;
    ultimo.current = clave;
    AvisosMac.programar(lista).catch((e: unknown) => {
      // Se reintenta con el próximo cambio de Hoy
      ultimo.current = null;
      console.warn('[Avisos] programar falló', e instanceof Error ? e.message : e);
    });
  }, [today, avisos]);
}
