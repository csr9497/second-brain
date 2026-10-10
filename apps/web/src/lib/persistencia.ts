import type { Query } from '@tanstack/react-query';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

/** Lo que se guarda para abrir sin conexión: Hoy y la jornada (sin ella no se pinta nada). */
const GUARDADAS = new Set(['today', 'jornada']);
const DIA = 24 * 60 * 60 * 1000;

/**
 * Sin conexión, la app arranca con el último Hoy guardado en este navegador (solo lectura: las mutaciones fallan
 * y lo avisan como siempre). Al cerrar sesión, `qc.clear()` vacía también lo guardado.
 */
export const persistencia = {
  persister: createSyncStoragePersister({ storage: window.localStorage, key: 'sb-cache' }),
  maxAge: DIA,
  dehydrateOptions: {
    shouldDehydrateQuery: (q: Query) => q.state.status === 'success' && GUARDADAS.has(String(q.queryKey[0])),
  },
};

/** Las queries guardadas deben sobrevivir en memoria al menos lo que dura lo guardado. */
export const GC_TIME = DIA;
