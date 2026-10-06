import { useEffect, useRef, useState } from 'react';

export interface OpcionesConfirmar {
  titulo: string;
  mensaje?: string;
  aceptar?: string;
  cancelar?: string;
}
type Peticion = OpcionesConfirmar & {
  resolver: (ok: boolean) => void;
  /** Elemento con el foco al pedir la confirmación; lo recupera al cerrar */
  previo: HTMLElement | null;
};

let mostrar: ((p: Peticion) => void) | null = null;

/** Confirmación con el estilo de la app (sustituye a window.confirm). Resuelve true si se acepta. */
export function confirmar(o: OpcionesConfirmar): Promise<boolean> {
  return new Promise((resolve) => {
    if (!mostrar) return resolve(window.confirm(o.titulo)); // sin host montado (no debería pasar)
    // Se toma aquí, antes de que el autoFocus del diálogo mueva el foco
    const previo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    mostrar({ ...o, resolver: resolve, previo });
  });
}

/** Se monta una vez en App; muestra la confirmación pendiente por encima de los modales. */
export function ConfirmHost() {
  const [p, setP] = useState<Peticion | null>(null);
  // La petición en curso, fuera del estado: los resolver se llaman fuera de los updaters
  const actual = useRef<Peticion | null>(null);
  const caja = useRef<HTMLDivElement>(null);
  const desdeFondo = useRef(false);
  useEffect(() => {
    mostrar = (q) => {
      const prev = actual.current;
      if (prev) {
        // Una petición nueva cancela la anterior: ninguna promesa queda sin resolver.
        // Si el foco estaba en el diálogo anterior, se hereda su destino.
        if (q.previo && caja.current?.contains(q.previo)) q.previo = prev.previo;
        prev.resolver(false);
      }
      actual.current = q;
      setP(q);
    };
    return () => {
      mostrar = null;
      actual.current?.resolver(false);
      actual.current = null;
    };
  }, []);
  const fin = (ok: boolean) => {
    const cur = actual.current;
    if (!cur) return;
    actual.current = null;
    setP(null);
    if (cur.previo?.isConnected) cur.previo.focus({ preventScroll: true });
    cur.resolver(ok);
  };
  useEffect(() => {
    if (!p) return;
    // Captura: Esc cancela solo la confirmación; ni el modal de debajo ni los planificadores lo ven
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        fin(false);
      } else if (e.key === 'Tab' && caja.current) {
        // Foco atrapado entre los botones del diálogo
        const botones = [...caja.current.querySelectorAll<HTMLButtonElement>('button')];
        const i = botones.indexOf(document.activeElement as HTMLButtonElement);
        e.preventDefault();
        e.stopPropagation();
        const n = botones.length;
        botones[i < 0 ? 0 : (i + (e.shiftKey ? n - 1 : 1)) % n]?.focus();
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
    // fin solo lee refs: no hace falta como dependencia
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p]);
  if (!p) return null;
  return (
    <div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/55 px-4"
      // Como en Modal: solo cancela un clic que empezó y terminó en el fondo
      onPointerDown={(e) => (desdeFondo.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && desdeFondo.current && fin(false)}
    >
      <div
        ref={caja}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirmar-titulo"
        aria-describedby={p.mensaje ? 'confirmar-mensaje' : undefined}
        className="w-full max-w-sm rounded-2xl border border-line bg-surface p-5 shadow-xl"
      >
        <h3 id="confirmar-titulo" className="m-0 font-display text-[17px] font-bold">
          {p.titulo}
        </h3>
        {p.mensaje && (
          <p id="confirmar-mensaje" className="m-0 mt-1.5 text-[13px] text-muted">
            {p.mensaje}
          </p>
        )}
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button type="button" autoFocus className="btn" onClick={() => fin(false)}>
            {p.cancelar ?? 'Seguir editando'}
          </button>
          <button type="button" className="btn border-hot bg-hot text-white" onClick={() => fin(true)}>
            {p.aceptar ?? 'Descartar'}
          </button>
        </div>
      </div>
    </div>
  );
}
