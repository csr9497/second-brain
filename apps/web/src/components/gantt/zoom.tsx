import { useCallback, useEffect, useState, type RefObject } from 'react';
import { JORNADA_MIN, PASO_MINUTOS, addDays, daysBetween, rangoSeleccion, tramosDelDia, type Step } from '@sb/shared';
import { shortDate } from '../../lib/format';
import { COL } from './constantes';
export { fondo } from './constantes';
import { Pista } from './Pista';

/** A partir de este ancho de día (px) los pasos por tiempo de un día se dibujan encadenados a escala de la jornada. */
export const HORAS_DESDE = 96;
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

export type RangoZoom = { inicio: string; fin: string };

/**
 * Zoom del Gantt: el rango elegido ocupa el ancho visible (sin bajar de `COL` px por día).
 * El ancho se mide al hacer zoom y al cambiar el tamaño de la ventana.
 */
export function useZoom(scroller: RefObject<HTMLDivElement | null>, etiqueta: number) {
  const [zoom, setZoomState] = useState<RangoZoom | null>(null);
  const [visible, setVisible] = useState(0);
  const medir = useCallback(() => setVisible(scroller.current?.clientWidth ?? 0), [scroller]);
  useEffect(() => {
    if (!zoom) return;
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [zoom, medir]);
  const setZoom = (r: RangoZoom | null) => {
    medir();
    setZoomState(r);
  };
  const col = zoom && visible ? Math.max(COL, Math.floor((visible - etiqueta) / (daysBetween(zoom.inicio, zoom.fin) + 1))) : COL;
  return { zoom, setZoom, col };
}

type Programado = Pick<Step, 'id' | 'startDate' | 'duracionDias' | 'duracionMin'>;

/**
 * Minuto de inicio (dentro de la jornada) de cada paso por tiempo de una tarea: los de un mismo día van uno
 * detrás de otro en el orden de la lista (`pasos` ya viene ordenado por position).
 */
export function desplazamientos(pasos: Programado[]): Map<string, number> {
  const porDia = new Map<string, Programado[]>();
  for (const s of pasos) if (s.startDate && s.duracionMin != null) porDia.set(s.startDate, [...(porDia.get(s.startDate) ?? []), s]);
  const r = new Map<string, number>();
  for (const lista of porDia.values()) for (const t of tramosDelDia(lista)) r.set(t.paso.id, t.desde);
  return r;
}

/**
 * Posición de un paso en la pista. Con zoom suficiente, un paso por tiempo ocupa su parte del día de trabajo de su
 * tarea (`dia` minutos = el ancho de un día), tras los anteriores del mismo día (`desde`, en minutos), y se estira de
 * 15 en 15 min (`unidadEstirar` px); se mueve por días.
 */
export function geometriaPaso(s: Programado, x: (f: string) => number, col: number, desde = 0, dia = JORNADA_MIN) {
  if (s.duracionMin != null && col >= HORAS_DESDE) {
    return {
      left: x(s.startDate!) + (desde / dia) * col,
      width: (s.duracionMin / dia) * col,
      minutos: true,
      unidadEstirar: (col * PASO_MINUTOS) / dia,
    };
  }
  return { left: x(s.startDate!), width: (s.duracionDias ?? 1) * col, minutos: false, unidadEstirar: col };
}

/** Línea de "hoy": el centro del día. */
export const posicionAhora = (x: (f: string) => number, hoy: string, col: number) => x(hoy) + col / 2;

/**
 * Cabecera de fechas: mes y número de día (con zoom, la fecha completa). Arrastrar sobre ella (o tocar dos días)
 * hace zoom a ese rango; tocar el mismo día dos veces, a ese día.
 */
export function Cabecera({ inicio, dias, col, hoy, onZoom }: { inicio: string; dias: number; col: number; hoy: string; onZoom: (r: RangoZoom) => void }) {
  const fechas = Array.from({ length: dias }, (_, i) => addDays(inicio, i));
  return (
    <div title="Selecciona días para hacer zoom" className="cursor-zoom-in select-none">
      <Pista ancho={dias * col} inicio={inicio} col={col} alto={40} activa onToque={() => {}} onRango={(a, b) => onZoom(rangoSeleccion(a, b))} sinFondo>
        {fechas.map((d, i) => (
          <div
            key={d}
            aria-hidden
            className={`pointer-events-none absolute top-0 h-full text-[10px] ${d === hoy ? 'font-bold text-accent' : 'text-faint'}`}
            style={{ left: i * col, width: col }}
          >
            {(i === 0 || d.endsWith('-01')) && (
              <span className="absolute top-1 left-1 text-[10.5px] font-semibold whitespace-nowrap text-muted">{MESES[Number(d.slice(5, 7)) - 1]}</span>
            )}
            <span className="absolute bottom-1 left-0 w-full text-center">{col >= 70 ? shortDate(d) : Number(d.slice(8))}</span>
            {col >= 70 && <span className="absolute top-0 left-0 h-full w-px bg-line" />}
          </div>
        ))}
      </Pista>
    </div>
  );
}

/** Barra de estado del zoom: rango ampliado y botón para quitarlo, o la pista de cómo hacer zoom. */
export function ControlZoom({ zoom, onQuitar }: { zoom: RangoZoom | null; onQuitar: () => void }) {
  if (!zoom)
    return <span className="text-[11.5px] text-faint">🔍 Selecciona fechas en la cabecera para hacer zoom</span>;
  return (
    <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-accent" aria-live="polite">
      🔍 {zoom.inicio === zoom.fin ? shortDate(zoom.inicio) : `${shortDate(zoom.inicio)} – ${shortDate(zoom.fin)}`}
      <button type="button" onClick={onQuitar} className="rounded-full border border-line px-2 py-0.5 text-[11px] font-semibold text-muted hover:text-text">
        Quitar zoom
      </button>
    </span>
  );
}
