import { todayISO, type MonthlyReport } from '@sb/shared';
import { headerDate } from '../../lib/format';

const CABECERA = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

type Dia = MonthlyReport['dias'][number];

function estilo(d: Dia): { className: string; style?: React.CSSProperties; label: string } {
  const fecha = headerDate(d.fecha);
  if (d.futuro) return { className: 'bg-surface2', label: `${fecha}: por venir` };
  if (d.pct == null) return { className: 'bg-surface2', label: `${fecha}: sin hábitos` };
  if (d.pct === 0) return { className: 'bg-line', label: `${fecha}: 0%` };
  const op = d.pct === 100 ? 100 : d.pct >= 50 ? 65 : 35;
  return { className: '', style: { background: `color-mix(in srgb, var(--good) ${op}%, transparent)` }, label: `${fecha}: ${d.pct}%` };
}

/** Cumplimiento diario de hábitos del mes: lunes a domingo, con huecos antes del día 1. */
export function MapaCalor({ dias }: { dias: MonthlyReport['dias'] }) {
  const hoy = todayISO();
  const huecos = dias.length ? (new Date(`${dias[0]!.fecha}T00:00:00`).getDay() + 6) % 7 : 0;
  return (
    <div>
      <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[11px] text-faint" aria-hidden>
        {CABECERA.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: huecos }, (_, i) => (
          <span key={`h${i}`} aria-hidden />
        ))}
        {dias.map((d) => {
          const e = estilo(d);
          return (
            <div
              key={d.fecha}
              role="img"
              aria-label={e.label}
              title={e.label}
              style={e.style}
              className={`flex aspect-square items-start justify-start rounded p-0.5 text-[9px] leading-none text-text/70 tabular-nums ${e.className} ${
                d.fecha === hoy ? 'outline-2 -outline-offset-1 outline-accent' : ''
              }`}
            >
              {Number(d.fecha.slice(8))}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-1.5 text-[11px] text-faint" aria-hidden>
        menos
        <span className="size-3 rounded bg-line" />
        {[35, 65, 100].map((o) => (
          <span key={o} className="size-3 rounded" style={{ background: `color-mix(in srgb, var(--good) ${o}%, transparent)` }} />
        ))}
        más
      </div>
    </div>
  );
}
