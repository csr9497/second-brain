import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Project } from '@sb/shared';
import { api } from '../lib/api';
import { scheduleLabel } from '../lib/format';

export function Bar({ label, value, total = false }: { label: string; value: number; total?: boolean }) {
  return (
    <div className="flex items-center gap-[9px]">
      <span className="w-[52px] flex-none text-[10.5px] text-faint">{label}</span>
      <div className="track">
        <div className={`h-full rounded-full ${total ? 'bg-accent' : 'bg-good'}`} style={{ width: `${value}%` }} />
      </div>
      <span className="w-[34px] text-right text-[11.5px] whitespace-nowrap text-muted tabular-nums">{value}%</span>
    </div>
  );
}

const ESTADO_LABEL: Record<string, string> = {
  idea: 'Idea',
  en_pausa: 'En pausa',
  completado: 'Completado',
  archivado: 'Archivado',
};

/**
 * "En curso" usa los proyectos que ya trae /today; "Todos" consulta /projects
 * para poder ver y editar los pausados, completados, etc.
 */
export function Projects({ projects, onEdit }: { projects: Project[]; onEdit: (p: Project | undefined) => void }) {
  const [showAll, setShowAll] = useState(false);
  const all = useQuery({ queryKey: ['projects', 'all'], queryFn: () => api.projects(), enabled: showAll });
  const list = showAll ? (all.data ?? []) : projects;

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <h2 className="m-0 font-display text-lg font-semibold">Proyectos</h2>
        <div className="flex items-center gap-1.5">
          {(['en_curso', 'todos'] as const).map((f) => (
            <button
              key={f}
              aria-selected={(f === 'todos') === showAll}
              onClick={() => setShowAll(f === 'todos')}
              className="rounded-full border border-line bg-surface px-3 py-1 text-xs font-semibold text-muted transition aria-selected:border-accent aria-selected:bg-accent aria-selected:text-white"
            >
              {f === 'todos' ? 'Todos' : 'En curso'}
            </button>
          ))}
          <button
            onClick={() => onEdit(undefined)}
            className="rounded-full border border-dashed border-line px-3 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-text"
          >
            + Nuevo
          </button>
        </div>
      </div>
      <div className="card py-1">
        {list.length === 0 && (
          <p className="my-2.5 text-[13px] text-faint">{showAll && all.isLoading ? 'Cargando…' : 'Sin proyectos. Crea uno con “+ Nuevo”.'}</p>
        )}
        {list.map((p) => {
          const days = scheduleLabel(p.scheduleDays);
          return (
            <button
              key={p.id}
              onClick={() => onEdit(p)}
              title="Editar proyecto"
              aria-label={`Editar proyecto ${p.nombre}`}
              className="group block w-full border-t border-line py-[13px] text-left first:border-t-0"
            >
              <div className="flex items-center gap-[11px]">
                <b className={`min-w-0 flex-1 text-sm font-semibold group-hover:underline group-hover:decoration-faint group-hover:underline-offset-2 ${p.estado === 'en_curso' ? '' : 'text-muted'}`}>
                  {p.nombre}
                </b>
                {p.estado !== 'en_curso' && (
                  <span className="rounded-full bg-surface2 px-[9px] py-[3px] text-[10.5px] font-semibold whitespace-nowrap text-muted">
                    {ESTADO_LABEL[p.estado] ?? p.estado}
                  </span>
                )}
                {p.hoyToca && p.estado === 'en_curso' ? (
                  <span className="rounded-full bg-accent/18 px-[9px] py-[3px] text-[10.5px] font-bold whitespace-nowrap text-accent">Hoy toca</span>
                ) : (
                  days && <span className="text-[11px] whitespace-nowrap text-faint">{days}</span>
                )}
                <span aria-hidden className="text-[13px] text-faint opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  ✎
                </span>
              </div>
              {(p.nextAction || days) && (
                <div className="mt-[7px] text-[12.5px] text-muted">
                  {p.nextAction && `→ ${p.nextAction}`}
                  {p.nextAction && days && ' · '}
                  {days}
                </div>
              )}
              <div className="mt-[9px] flex flex-col gap-[5px]">
                <Bar label="Semana" value={p.pctSemana} />
                <Bar label="Total" value={p.totalProgress} total />
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
