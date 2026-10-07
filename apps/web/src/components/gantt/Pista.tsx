import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';
import { addDays, daysBetween } from '@sb/shared';
import { COL, fondo } from './constantes';

/** Fondo de una fila: con ratón, arrastrar marca un rango; un clic o un toque, dos toques (inicio y fin). */
export function Pista({
  ancho,
  inicio,
  activa,
  onToque,
  onRango,
  col = COL,
  alto = 34,
  sinFondo = false,
  children,
}: {
  ancho: number;
  inicio: string;
  /** Ancho de un día en px (cambia con el zoom) */
  col?: number;
  alto?: number;
  /** Sin la cuadrícula de días (p. ej. la cabecera, que dibuja la suya) */
  sinFondo?: boolean;
  /** Si la fila deja de ser la activa, se descarta su primer toque */
  activa: boolean;
  onToque: () => void;
  onRango: (a: string, b: string) => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const sel = useRef<{ desde: number; hasta: number } | null>(null);
  const arrastrado = useRef(false);
  const [vista, setVista] = useState<{ a: number; b: number } | null>(null);
  // Primer toque como fecha (no como índice): si la ventana se desplaza, no se mueve
  const [pendiente, setPendiente] = useState<string | null>(null);
  useEffect(() => {
    if (!activa) setPendiente(null);
  }, [activa]);
  // Día bajo el puntero, limitado a la ventana (con captura, el puntero puede salir de la fila)
  const diaEn = (clientX: number) =>
    Math.min(Math.round(ancho / col) - 1, Math.max(0, Math.floor((clientX - ref.current!.getBoundingClientRect().left) / col)));
  const fecha = (n: number) => addDays(inicio, n);

  const down = (e: PointerEvent<HTMLDivElement>) => {
    arrastrado.current = false; // por si el click de un arrastre anterior no llegó
    if (e.target !== e.currentTarget || e.pointerType !== 'mouse' || e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const n = diaEn(e.clientX);
    sel.current = { desde: n, hasta: n };
    setVista({ a: n, b: n });
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const s = sel.current;
    if (!s) return;
    const n = diaEn(e.clientX);
    if (n !== s.hasta) {
      s.hasta = n;
      setVista({ a: s.desde, b: n });
    }
  };
  const up = () => {
    const s = sel.current;
    if (!s) return;
    sel.current = null;
    setVista(null);
    if (s.desde !== s.hasta) {
      arrastrado.current = true; // el click que sigue no es un toque
      setPendiente(null);
      onRango(fecha(s.desde), fecha(s.hasta));
    }
  };
  const cancelar = () => {
    sel.current = null;
    setVista(null);
  };
  const click = (e: { target: EventTarget; currentTarget: EventTarget; clientX: number }) => {
    if (arrastrado.current) {
      arrastrado.current = false;
      return;
    }
    if (e.target !== e.currentTarget) return; // clic en una barra
    const n = diaEn(e.clientX);
    if (pendiente == null) {
      setPendiente(fecha(n));
      onToque();
      ref.current?.focus({ preventScroll: true }); // para que Esc lo cancele
    } else {
      onRango(pendiente, fecha(n));
      setPendiente(null);
    }
  };
  const tecla = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && pendiente != null) {
      e.preventDefault(); // el modal ignora los Esc ya atendidos
      setPendiente(null);
    }
  };
  const ip = pendiente != null ? daysBetween(inicio, pendiente) : null;
  const marca = vista ?? (ip != null && ip >= 0 && ip < ancho / col ? { a: ip, b: ip } : null);

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="relative cursor-crosshair outline-none"
      style={{
        width: ancho,
        height: alto,
        backgroundImage: sinFondo ? undefined : fondo(col),
      }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={cancelar}
      onClick={click}
      onKeyDown={tecla}
    >
      {marca && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1 bottom-1 rounded-md border border-dashed border-accent bg-accent/15"
          style={{ left: Math.min(marca.a, marca.b) * col, width: (Math.abs(marca.b - marca.a) + 1) * col }}
        />
      )}
      {children}
    </div>
  );
}
