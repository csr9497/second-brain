import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { App as AppNativa } from '@capacitor/app';
import { estadoLiveActivity, extraMac } from '@sb/shared';
import { api } from '../api';
import { TODAY_KEY } from '../useToday';
import { esNativo, LiveActivity, plataformaNativa } from './liveActivity';

const DEBOUNCE_MS = 300;

/**
 * En la app nativa, mantiene la Live Activity al día con `['today']`, en cualquier vista (en la web no hace
 * nada ni pide Hoy fuera de su pantalla).
 */
export function useLiveActivity() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: TODAY_KEY, queryFn: api.today, enabled: esNativo() });
  const ultimo = useRef<string | null>(null);

  useEffect(() => {
    if (!esNativo() || !data) return;
    const t = setTimeout(() => {
      const estado = estadoLiveActivity(data, new Date().toISOString());
      // En la Mac, también el día completo para la barra y los widgets
      const extra = plataformaNativa() === 'mac' ? extraMac(data) : undefined;
      // Sin `actualizado`: si solo cambió la hora, no hay nada que mandar
      const clave = JSON.stringify([estado && { ...estado, actualizado: undefined }, extra]);
      if (clave === ultimo.current) return;
      ultimo.current = clave;
      LiveActivity.sincronizar({ estado, ...(extra && { extra }) }).then(
        (r) => console.info('[LiveActivity] sincronizar', JSON.stringify(r)),
        (e: unknown) => {
          // Se reintenta con el próximo cambio de Hoy
          ultimo.current = null;
          console.warn('[LiveActivity] sincronizar falló', e instanceof Error ? e.message : e);
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [data]);

  // Al volver a primer plano Hoy puede haber cambiado (otro dispositivo, los botones de la card).
  // En la Mac lo pide Swift (`sbRefrescar`): al abrir la barra, al despertar y en cada cambio de franja.
  useEffect(() => {
    if (plataformaNativa() !== 'ios') return;
    const sub = AppNativa.addListener('appStateChange', ({ isActive }) => {
      if (isActive) void qc.invalidateQueries({ queryKey: TODAY_KEY });
    });
    return () => void sub.then((s) => s.remove());
  }, [qc]);
}
