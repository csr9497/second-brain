import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { sb } from './supabase';

// Tablas que pinta la app; deben estar en la publicación supabase_realtime (migración tiempo_real)
const TABLAS = ['tasks', 'steps', 'task_habits', 'habits', 'habit_logs', 'projects', 'ideas', 'reviews', 'jornada'] as const;
/** Una ráfaga de cambios (p. ej. una tarea con sus pasos y los triggers) se junta en una sola recarga. */
const ESPERA_MS = 400;

/**
 * Cambios hechos en otro dispositivo (o en la card de la app): vuelve a pedir lo que está en pantalla sin recargar.
 * Los propios también llegan; cuestan una recarga extra, que la espera junta con la de la mutación.
 */
export function useTiempoReal() {
  const qc = useQueryClient();
  useEffect(() => {
    let espera: ReturnType<typeof setTimeout> | undefined;
    let jornada = false;
    const refrescar = () => {
      clearTimeout(espera);
      espera = setTimeout(async () => {
        // La jornada primero: api.jornada la fija y todo «hoy» depende de ella
        if (jornada) {
          jornada = false;
          await qc.invalidateQueries({ queryKey: ['jornada'] });
        }
        void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'jornada' });
      }, ESPERA_MS);
    };

    const canal = sb.channel('cambios');
    for (const table of TABLAS) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        if (table === 'jornada') jornada = true;
        refrescar();
      });
    }
    canal.subscribe();
    return () => {
      clearTimeout(espera);
      void sb.removeChannel(canal);
    };
  }, [qc]);
}
