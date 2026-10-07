import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, calendarGrid, mesDe, rangoSeleccion, sumarMeses, todayISO } from '@sb/shared';
import { headerDate, mesLabel, shortDate } from '../../lib/format';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const navBtn = 'rounded-full border border-line px-2 py-0.5 text-xs font-semibold text-muted hover:text-text';

/**
 * Elegir un día o un rango: el primer clic marca el día (ya queda guardado como un solo día) y el segundo,
 * el fin del rango (cierra). `alerta` pinta el botón como aviso (p. ej. fuera de plazo) sin cambiar su tamaño.
 */
export function RangoFecha({
  inicio,
  fin,
  onChange,
  etiqueta,
  alerta,
}: {
  inicio: string;
  fin: string;
  /** '' / '' = sin fecha */
  onChange: (inicio: string, fin: string) => void;
  etiqueta: string;
  alerta?: string | null;
}) {
  const [abierto, setAbierto] = useState(false);
  const [mes, setMes] = useState(mesDe(inicio || todayISO()));
  // Primer día elegido en esta apertura: el siguiente clic cierra el rango
  const [desde, setDesde] = useState<string | null>(null);
  const [sobre, setSobre] = useState<string | null>(null);
  const raiz = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: PointerEvent) => {
      if (!raiz.current?.contains(e.target as Node)) cerrar();
    };
    document.addEventListener('pointerdown', fuera);
    return () => document.removeEventListener('pointerdown', fuera);
  }, [abierto]);

  const abrir = () => {
    setMes(mesDe(inicio || todayISO()));
    setDesde(null);
    setAbierto(true);
  };
  const cerrar = () => {
    setAbierto(false);
    setDesde(null);
    setSobre(null);
  };
  const elegir = (d: string) => {
    if (!desde) {
      setDesde(d);
      onChange(d, d);
      return;
    }
    const r = rangoSeleccion(desde, d);
    onChange(r.inicio, r.fin);
    cerrar();
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !abierto) return;
    e.preventDefault(); // el modal ignora los Esc ya atendidos
    cerrar();
  };

  const texto = !inicio ? 'Elegir fecha' : inicio === fin ? shortDate(inicio) : `${shortDate(inicio)} → ${shortDate(fin)}`;
  const marca = desde && sobre ? rangoSeleccion(desde, sobre) : inicio ? { inicio, fin: fin || inicio } : null;
  const { start, end } = calendarGrid(mes);
  const dias: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dias.push(d);

  return (
    <div ref={raiz} className="relative" onKeyDown={tecla}>
      <button
        type="button"
        aria-label={`${etiqueta}: ${inicio ? texto : 'sin fecha'}${alerta ? ` (${alerta})` : ''}`}
        aria-expanded={abierto}
        title={alerta ?? undefined}
        onClick={() => (abierto ? cerrar() : abrir())}
        className={`input flex w-40 items-center gap-1.5 py-1 text-left text-[13px] ${inicio ? '' : 'text-faint'} ${
          alerta ? 'border-hot/70 bg-hot/10 text-hot' : ''
        }`}
      >
        <span aria-hidden>📅</span>
        <span className="min-w-0 flex-1 truncate">{texto}</span>
        {alerta && <span aria-hidden className="text-[11px]">⚠</span>}
      </button>
      {abierto && (
        <div role="dialog" aria-label={`${etiqueta}: elegir día o rango`} className="absolute top-full left-0 z-50 mt-1 w-64 rounded-xl border border-line bg-surface p-2 shadow-lg">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" aria-label="Mes anterior" className={navBtn} onClick={() => setMes(sumarMeses(mes, -1))}>
              ‹
            </button>
            <span className="text-[12.5px] font-semibold first-letter:uppercase">{mesLabel(mes)}</span>
            <button type="button" aria-label="Mes siguiente" className={navBtn} onClick={() => setMes(sumarMeses(mes, 1))}>
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-faint" aria-hidden>
            {DIAS.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="grid grid-cols-7" onPointerLeave={() => setSobre(null)}>
            {dias.map((d) => {
              const dentro = marca != null && d >= marca.inicio && d <= marca.fin;
              const extremo = marca != null && (d === marca.inicio || d === marca.fin);
              return (
                <button
                  key={d}
                  type="button"
                  aria-label={headerDate(d)}
                  aria-pressed={dentro}
                  onPointerEnter={() => desde && setSobre(d)}
                  onClick={() => elegir(d)}
                  className={`h-7 text-[11.5px] tabular-nums ${mesDe(d) === mes ? '' : 'opacity-40'} ${
                    extremo ? 'rounded-md bg-accent font-semibold text-white' : dentro ? 'bg-accent/15' : 'rounded-md hover:bg-surface2'
                  } ${d === todayISO() && !extremo ? 'font-bold text-accent' : ''}`}
                >
                  {Number(d.slice(8))}
                </button>
              );
            })}
          </div>
          <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-faint">
            <span>{desde ? 'Elige el último día (o cierra para dejar un solo día)' : 'Elige un día o el inicio del rango'}</span>
            {inicio && (
              <button
                type="button"
                className="flex-none font-semibold text-muted hover:text-text"
                onClick={() => {
                  onChange('', '');
                  cerrar();
                }}
              >
                Quitar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
