import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { addDays, calendarGrid, carriles, finPaso, fueraDePlazo, mesDe, rangoSeleccion, sumarMeses, todayISO, weekday } from '@sb/shared';
import { headerDate, mesLabel, shortDate } from '../../lib/format';
import { nombrePaso, programacion, type PlanProps } from '../../lib/pasosBorrador';

const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const navBtn = 'rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold text-muted hover:text-text';

/** Mes en el que se seleccionan días (arrastrando, o con dos toques) para agregar un paso. La tarea solo se muestra. */
export function CalendarioPlan({ tarea, steps, color, sel, setSel }: PlanProps) {
  const hoy = todayISO();
  const [mes, setMes] = useState(mesDe(tarea.startDate || tarea.deadline || hoy));
  const [arrastre, setArrastre] = useState<{ desde: string; hasta: string } | null>(null);
  const [pendiente, setPendiente] = useState<string | null>(null);
  const arrastreRef = useRef<{ desde: string; hasta: string } | null>(null);

  const aplicar = (a: string, b: string) => {
    setSel(rangoSeleccion(a, b));
    setPendiente(null);
  };
  const aplicarRef = useRef(aplicar);
  aplicarRef.current = aplicar;

  // Soltar el ratón en cualquier parte termina el arrastre (si abarcó más de un día)
  useEffect(() => {
    const soltar = () => {
      const a = arrastreRef.current;
      if (!a) return;
      arrastreRef.current = null;
      setArrastre(null);
      if (a.desde !== a.hasta) aplicarRef.current(a.desde, a.hasta);
    };
    const cancelar = () => {
      arrastreRef.current = null;
      setArrastre(null);
    };
    window.addEventListener('pointerup', soltar);
    window.addEventListener('pointercancel', cancelar);
    return () => {
      window.removeEventListener('pointerup', soltar);
      window.removeEventListener('pointercancel', cancelar);
    };
  }, []);

  const tocar = (d: string) => {
    if (pendiente) aplicar(pendiente, d);
    else {
      setPendiente(d);
      setSel(null);
    }
  };
  const tecla = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || (!pendiente && !sel)) return;
    e.preventDefault(); // el modal ignora los Esc ya atendidos
    setPendiente(null);
    setSel(null);
  };

  const { start, end } = calendarGrid(mes);
  const dias: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) dias.push(d);
  const marca = arrastre ? rangoSeleccion(arrastre.desde, arrastre.hasta) : pendiente ? { inicio: pendiente, fin: pendiente } : sel;
  const plazo = { startDate: tarea.startDate || null, deadline: tarea.deadline || null };
  const pasos = steps
    .map((s, i) => ({ i, p: programacion(s) }))
    .filter((x) => x.p.startDate)
    .map((x) => ({ ...x, desde: x.p.startDate!, hasta: finPaso(x.p)! }))
    .sort((a, b) => a.desde.localeCompare(b.desde) || a.i - b.i);
  const banda =
    tarea.startDate && tarea.deadline && tarea.startDate <= tarea.deadline
      ? { desde: tarea.startDate, hasta: tarea.deadline }
      : tarea.startDate || tarea.deadline
        ? { desde: (tarea.startDate || tarea.deadline)!, hasta: (tarea.startDate || tarea.deadline)! }
        : null;
  const enTarea = (d: string) => banda != null && d >= banda.desde && d <= banda.hasta;
  // Carril fijo por semana (la tarea primero): cada barra conserva su altura y se ve continua
  const porSemana = carriles(banda ? [banda, ...pasos] : pasos, start, end);
  const desplazo = banda ? 1 : 0;
  const nCarriles = (k: number) => Math.max(0, ...porSemana[k].map((c) => c + 1));
  // De borde a borde de la celda (padding + borde) salvo en los extremos del rango
  const tramo = (d: string, r: { desde: string; hasta: string }) =>
    `${d === r.desde ? 'ml-0.5 rounded-l-md' : weekday(d) === 1 ? '-ml-1' : '-ml-[5px]'} ${d === r.hasta ? 'mr-0.5 rounded-r-md' : weekday(d) === 0 ? '-mr-1' : '-mr-[5px]'}`;

  return (
    <div onKeyDown={tecla}>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-sm font-semibold first-letter:uppercase">{mesLabel(mes)}</span>
        <div className="flex gap-1">
          <button type="button" aria-label="Mes anterior" className={navBtn} onClick={() => setMes(sumarMeses(mes, -1))}>
            ‹
          </button>
          <button type="button" aria-label="Mes siguiente" className={navBtn} onClick={() => setMes(sumarMeses(mes, 1))}>
            ›
          </button>
        </div>
      </div>
      {pendiente && (
        <p className="m-0 mb-1.5 text-[12px] font-semibold text-accent" aria-live="polite">
          Inicio: {shortDate(pendiente)} · elige el último día (Esc cancela)
        </p>
      )}
      <div className="grid grid-cols-7 text-center text-[10px] font-semibold text-faint" aria-hidden>
        {DIAS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {dias.map((d, n) => {
          const k = Math.floor(n / 7);
          const marcado = marca != null && d >= marca.inicio && d <= marca.fin;
          const cubre = pasos.filter((x) => d >= x.desde && d <= x.hasta);
          return (
            <button
              key={d}
              type="button"
              aria-pressed={marcado}
              aria-label={`${headerDate(d)}${enTarea(d) ? ', dentro de la tarea' : ''}${d === tarea.deadline ? ', deadline' : ''}${cubre.length ? `, pasos: ${cubre.map((x) => nombrePaso(steps[x.i], x.i)).join(', ')}` : ''}`}
              onPointerDown={(e) => {
                if (e.pointerType !== 'mouse' || e.button !== 0) return;
                arrastreRef.current = { desde: d, hasta: d };
                setArrastre({ desde: d, hasta: d });
              }}
              onPointerEnter={() => {
                const a = arrastreRef.current;
                if (a && a.hasta !== d) {
                  a.hasta = d;
                  setArrastre({ ...a });
                }
              }}
              // Un arrastre de varios días ya se aplicó al soltar; su clic cae en el ancestro común, no aquí.
              // Se enfoca el día porque Safari no enfoca botones al hacer clic: así el Esc pasa por `tecla`.
              onClick={(e) => {
                e.currentTarget.focus();
                tocar(d);
              }}
              className={`relative flex min-h-11 flex-col gap-0.5 rounded-md border p-1 text-left text-[11px] select-none ${
                marcado ? 'border-accent bg-accent/15' : 'border-transparent hover:bg-surface2'
              } ${mesDe(d) === mes ? '' : 'opacity-40'}`}
            >
              <span className={`font-semibold ${d === hoy ? 'text-accent' : ''}`}>{Number(d.slice(8))}</span>
              {Array.from({ length: nCarriles(k) }, (_, c) => {
                // El nombre se muestra el primer día de la barra y cada lunes (continúa de la semana anterior)
                const rotular = (r: { desde: string }) => d === r.desde || weekday(d) === 1;
                if (banda && c === porSemana[k][0]) {
                  return enTarea(d) ? (
                    <span
                      key="t"
                      aria-hidden
                      className={`flex h-4 min-w-0 items-center px-1 text-[10px] font-semibold text-white ${tramo(d, banda)}`}
                      style={{ background: `var(--c-${color})` }}
                    >
                      <span className="truncate">{rotular(banda) ? `📌 ${tarea.titulo || 'Tarea'}` : '\u00a0'}</span>
                    </span>
                  ) : (
                    <span key="t" aria-hidden className="h-4" />
                  );
                }
                const x = cubre.find((y) => porSemana[k][pasos.indexOf(y) + desplazo] === c);
                if (!x) return <span key={`v${c}`} aria-hidden className="h-4" />;
                const fuera = !steps[x.i].done && fueraDePlazo(x.p, plazo);
                return (
                  <span
                    key={`p${x.i}`}
                    aria-hidden
                    className={`flex h-4 min-w-0 items-center px-1 text-[10px] font-medium ${fuera ? 'text-hot' : 'text-text'} ${tramo(d, x)}`}
                    style={{ background: `color-mix(in srgb, ${fuera ? 'var(--hot)' : `var(--c-${color})`} 30%, transparent)` }}
                  >
                    <span className="truncate">{rotular(x) ? `↳ ${nombrePaso(steps[x.i], x.i)}` : '\u00a0'}</span>
                  </span>
                );
              })}
              {d === tarea.deadline && (
                <span aria-hidden className="absolute top-1 right-1 text-[9px] leading-none font-bold text-hot">
                  ▍
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
