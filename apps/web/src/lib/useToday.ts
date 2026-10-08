import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { TodayPayload } from '@sb/shared';
import { api } from './api';

export const TODAY_KEY = ['today'] as const;

export const useToday = () => useQuery({ queryKey: TODAY_KEY, queryFn: api.today });

/**
 * Mutación que, opcionalmente, aplica un cambio optimista sobre /today y
 * siempre refresca /today al terminar (los % y listas se calculan en el server).
 */
export function useTodayMutation<V, R>(fn: (v: V) => Promise<R>, optimistic?: (data: TodayPayload, v: V) => TodayPayload) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onMutate: async (v) => {
      if (!optimistic) return;
      await qc.cancelQueries({ queryKey: TODAY_KEY });
      const prev = qc.getQueryData<TodayPayload>(TODAY_KEY);
      if (prev) qc.setQueryData(TODAY_KEY, optimistic(prev, v));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(TODAY_KEY, ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: TODAY_KEY });
      // lo que se marca en Hoy también se ve en el calendario
      qc.invalidateQueries({ queryKey: ['calendar'] });
      qc.invalidateQueries({ queryKey: ['gantt'] });
      qc.invalidateQueries({ queryKey: ['review'] });
      qc.invalidateQueries({ queryKey: ['resumen'] });
    },
  });
}
