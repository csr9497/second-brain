import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './api';
import { TODAY_KEY } from './useToday';

export const HABITS_KEY = ['habits'] as const;

export const useHabits = () => useQuery({ queryKey: HABITS_KEY, queryFn: api.habits });

/** Refresca Hoy y la lista de gestión tras cualquier cambio en hábitos. */
export function useInvalidateHabits() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: TODAY_KEY });
    qc.invalidateQueries({ queryKey: HABITS_KEY });
    qc.invalidateQueries({ queryKey: ['calendar'] });
  };
}
