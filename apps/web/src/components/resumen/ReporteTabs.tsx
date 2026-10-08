import { useState } from 'react';
import { pct, TASK_STATUS_COLOR, todayISO, type MonthlyReport, type WeeklyHabit, type WeeklyProject, type WeeklyReport, type WeeklyTask } from '@sb/shared';
import { dueLabel, shortDate } from '../../lib/format';
import { Dot } from '../ui/Dot';

/** Lo que comparten el reporte semanal y el mensual. */
type Reporte = WeeklyReport | MonthlyReport;
type Periodo = 'semana' | 'mes';

const Sec = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 mb-2 text-xs font-semibold tracking-wide text-faint uppercase">{children}</div>
);

/** Pestañas Proyectos / Hábitos de un reporte (semana o mes). */
export function ReporteTabs({ r, id, periodo = 'semana' }: { r: Reporte; id: string; periodo?: Periodo }) {
  const [tab, setTab] = useState<'proyectos' | 'habitos'>('proyectos');
  return (
    <>
      <div role="tablist" aria-label="Secciones del reporte" className="mb-4 flex gap-1 rounded-lg bg-surface2 p-0.5">
        {(['proyectos', 'habitos'] as const).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            id={`${id}-tab-${v}`}
            aria-controls={tab === v ? `${id}-panel-${v}` : undefined}
            aria-selected={tab === v}
            onClick={() => setTab(v)}
            className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-muted aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          >
            {v === 'proyectos' ? '📁 Proyectos' : '🔁 Hábitos'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`}>
        {tab === 'proyectos' ? <ProyectosTab r={r} periodo={periodo} /> : <HabitosTab r={r} periodo={periodo} />}
      </div>
    </>
  );
}

function Kpi({ value, label, className = '' }: { value: string; label: string; className?: string }) {
  return (
    <div className="flex-1 rounded-[11px] border border-line bg-surface2 p-[11px] text-center">
      <b className={`block font-display text-[22px] ${className}`}>{value}</b>
      <span className="text-[11px] text-muted">{label}</span>
    </div>
  );
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** Seguimiento de los proyectos en curso: tareas de la semana y el progreso de sus pasos. */
function ProyectosTab({ r, periodo }: { r: Reporte; periodo: Periodo }) {
  return (
    <>
      <div className="mb-4 flex gap-3">
        <Kpi value={`${r.tasksDone}/${r.tasksTotal}`} label="Tareas hechas" />
        <Kpi value={String(r.overdue)} label={r.overdue === 1 ? 'Incumplida' : 'Incumplidas'} className={r.overdue ? 'text-hot' : ''} />
        <Kpi value={String(r.untouched.length)} label="Sin tocar" className={r.untouched.length ? 'text-warn' : ''} />
      </div>

      <Sec>Seguimiento por proyecto</Sec>
      {r.perProject.length === 0 && <p className="text-[13px] text-faint">Sin proyectos en curso.</p>}
      <div className="flex flex-col gap-3">
        {r.perProject.map((p) => (
          <ProyectoCard key={p.id} p={p} periodo={periodo} />
        ))}
      </div>
    </>
  );
}

function Barra({ pct, label }: { pct: number; label: string }) {
  return (
    <div className="track" role="progressbar" aria-label={label} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-good" style={{ width: `${pct}%` }} />
    </div>
  );
}

function ProyectoCard({ p, periodo }: { p: WeeklyProject; periodo: Periodo }) {
  const today = todayISO();
  const etiqueta = periodo === 'mes' ? 'Mes' : 'Semana';
  return (
    <section aria-label={p.nombre} className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-[9px] text-[14px]">
        <Dot color={p.color} size={10} />
        <h4 className="m-0 min-w-0 flex-1 truncate font-semibold">{p.nombre}</h4>
        {!p.touched && <span className="rounded-full border border-warn/60 px-2 py-0.5 text-[11px] text-warn">Sin tocar {periodo === 'mes' ? 'este mes' : 'esta semana'}</span>}
      </div>

      <div className="mt-2.5 grid gap-x-6 gap-y-1.5 text-[11.5px] text-muted sm:grid-cols-3">
        <Medida label={etiqueta} valor={`${p.pct}%`} detalle={p.total ? `${p.done}/${plural(p.total, 'tarea', 'tareas')}` : 'sin deadlines'}>
          <Barra pct={p.pct} label={`${p.nombre}: ${etiqueta.toLowerCase()}`} />
        </Medida>
        <Medida label="Pasos" valor={`${pct(p.pasosHechos, p.pasosTotal)}%`} detalle={p.pasosTotal ? `${p.pasosHechos}/${p.pasosTotal}` : 'sin pasos'}>
          <Barra pct={pct(p.pasosHechos, p.pasosTotal)} label={`${p.nombre}: pasos`} />
        </Medida>
        <Medida label="Avance total" valor={`${p.totalProgress}%`}>
          <Barra pct={p.totalProgress} label={`${p.nombre}: avance total`} />
        </Medida>
      </div>
      {p.nextAction && <div className="mt-2 truncate text-[12px] text-muted">→ Siguiente: {p.nextAction}</div>}

      {p.tasks.length === 0 ? (
        <p className="m-0 mt-2.5 text-[12px] text-faint">Sin tareas pendientes.</p>
      ) : (
        <ul className="m-0 mt-2.5 list-none border-t border-line p-0">
          {p.tasks.map((t) => (
            <TareaFila key={t.id} t={t} today={today} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Medida({ label, valor, detalle, children }: { label: string; valor: string; detalle?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-1.5">
        <span>{label}</span>
        <b className="text-text tabular-nums">{valor}</b>
        {detalle && <span className="ml-auto text-faint tabular-nums">{detalle}</span>}
      </div>
      {children}
    </div>
  );
}

function TareaFila({ t, today }: { t: WeeklyTask; today: string }) {
  const due = t.status === 'hecha' ? null : dueLabel(t.deadline, today);
  const pasosPct = pct(t.pasosHechos, t.pasosTotal);
  const cabecera = (
    <div className="flex items-center gap-2 text-[13px]">
      <Dot color={TASK_STATUS_COLOR[t.status]} />
      <span className={`min-w-0 flex-1 truncate ${t.status === 'hecha' ? 'text-muted line-through' : ''}`}>{t.title}</span>
      {due && <span className={`text-[11.5px] ${due.over ? 'text-hot' : 'text-faint'}`}>{due.text}</span>}
      {t.status === 'hecha' && <span className="text-[11.5px] text-good">✓ hecha</span>}
      {t.pasosTotal > 0 && (
        <>
          <div className="track max-w-[90px]">
            <div className="h-full rounded-full bg-good" style={{ width: `${pasosPct}%` }} />
          </div>
          <span className="w-[42px] text-right text-[11.5px] text-muted tabular-nums">
            {t.pasosHechos}/{t.pasosTotal}
          </span>
        </>
      )}
    </div>
  );
  if (t.pasosTotal === 0) return <li className="border-b border-line py-2 pl-[22px] last:border-b-0">{cabecera}</li>;
  return (
    <li className="border-b border-line last:border-b-0">
      <details open={t.status !== 'hecha'} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-1 py-2 [&::-webkit-details-marker]:hidden">
          <span aria-hidden className="w-[14px] text-[10px] text-faint transition-transform group-open:rotate-90">▶</span>
          <div className="min-w-0 flex-1">{cabecera}</div>
        </summary>
        <ul className="m-0 mb-2 list-none pl-[38px]">
          {t.pasos.map((s) => (
            <li key={s.id} className="flex items-center gap-2 py-[3px] text-[12.5px]">
              <span aria-label={s.done ? 'Hecho' : 'Pendiente'} className={s.done ? 'text-good' : 'text-faint'}>
                {s.done ? '✓' : '○'}
              </span>
              <span className={`min-w-0 flex-1 truncate ${s.done ? 'text-muted line-through' : ''}`}>{s.title}</span>
              {s.fueraDePlazo && <span className="text-[11px] text-warn">fuera de plazo</span>}
              {s.enSemana && !s.done && <span className="rounded-full bg-accent/15 px-1.5 text-[11px] text-accent">esta semana</span>}
              <span className="w-[104px] text-right text-[11.5px] text-faint tabular-nums">
                {s.inicio && s.fin ? (s.inicio === s.fin ? shortDate(s.inicio) : `${shortDate(s.inicio)} → ${shortDate(s.fin)}`) : 'sin programar'}
              </span>
            </li>
          ))}
        </ul>
      </details>
    </li>
  );
}

const DIAS_SEMANA = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

/** Cumplimiento de los hábitos vigentes en la semana, por turnos y por día. */
function HabitosTab({ r, periodo }: { r: Reporte; periodo: Periodo }) {
  const mes = periodo === 'mes';
  return (
    <>
      <div className="mb-4 flex gap-3">
        <Kpi value={`${r.habitsPct}%`} label="Hábitos" className="text-good" />
        <Kpi value={String(r.streak)} label={r.streak === 1 ? 'Día de racha' : 'Días de racha'} />
      </div>

      <Sec>Cumplimiento por hábito</Sec>
      {r.perHabit.length === 0 ? (
        <p className="text-[13px] text-faint">Sin hábitos vigentes {mes ? 'este mes' : 'esta semana'}.</p>
      ) : (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-[11px] text-faint">
              <th className="pb-1 text-left font-normal">
                <span className="sr-only">Hábito</span>
              </th>
              {!mes && DIAS_SEMANA.map((d) => (
                <th key={d} className="w-7 pb-1 text-center font-normal">
                  {d}
                </th>
              ))}
              <th className="w-[52px] pb-1 text-right font-normal">{mes ? 'Mes' : 'Semana'}</th>
            </tr>
          </thead>
          <tbody>
            {r.perHabit.map((h) => (
              <tr key={h.id}>
                <td className="max-w-0 truncate py-[5px] pr-2">
                  {h.nombre}
                  {h.meta != null && <span className="ml-1.5 text-[11px] text-faint">📅 {h.meta}/sem</span>}
                </td>
                {!mes && h.dias.map((d) => (
                  <td key={d.fecha} className="py-[5px] text-center">
                    <Celda d={d} semanal={h.meta != null} />
                  </td>
                ))}
                <td
                  className={`py-[5px] text-right text-[11.5px] tabular-nums ${h.meta != null && h.hechos >= h.meta ? 'text-good' : 'text-muted'}`}
                  title={h.meta != null ? `${h.hechos} de ${h.meta} días` : `${h.hechos}/${h.turnos} turnos`}
                >
                  {h.meta != null ? `${h.hechos}/${h.meta}` : `${h.pct}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}

/** Día de un hábito. En un semanal, no hacerlo un día no es un fallo: la casilla queda neutra. */
function Celda({ d, semanal }: { d: WeeklyHabit['dias'][number]; semanal: boolean }) {
  const base = 'mx-auto flex size-6 items-center justify-center rounded-md text-[10.5px] tabular-nums';
  const fecha = shortDate(d.fecha);
  if (d.futuro) return <span className={`${base} text-faint`} aria-label={`${fecha}: aún no llega`}>·</span>;
  if (d.turnos === 0) return <span className={`${base} text-faint`} aria-label={`${fecha}: no vigente`}>–</span>;
  const label = semanal ? `${fecha}: ${d.hechos ? 'hecho' : 'no hecho'}` : `${fecha}: ${d.hechos} de ${plural(d.turnos, 'turno', 'turnos')}`;
  if (d.hechos === d.turnos)
    return (
      <span className={`${base} bg-good font-semibold text-good-ink`} title={label} aria-label={label}>
        ✓
      </span>
    );
  if (d.hechos > 0)
    return (
      <span className={`${base} border border-good text-good`} title={label} aria-label={label}>
        {d.hechos}/{d.turnos}
      </span>
    );
  if (semanal) return <span className={`${base} text-faint`} title={label} aria-label={label}>○</span>;
  return <span className={`${base} border border-line bg-surface2`} title={label} aria-label={label} />;
}
