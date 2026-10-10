import { useSyncExternalStore } from 'react';

const suscribir = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};

/** Aviso fijo mientras no hay conexión: lo que se ve es lo último guardado y los cambios no se guardan. */
export function SinConexion() {
  const enLinea = useSyncExternalStore(suscribir, () => navigator.onLine);
  if (enLinea) return null;
  return (
    <div role="status" className="mb-3 rounded-lg border border-line px-3 py-2 text-sm text-muted">
      📴 Sin conexión: ves lo último guardado. Los cambios no se guardarán hasta que vuelva la conexión.
    </div>
  );
}
