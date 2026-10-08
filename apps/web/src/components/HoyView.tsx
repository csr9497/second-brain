import { useToday } from '../lib/useToday';
import type { ModalState } from '../lib/modal';
import { Habits } from './Habits';
import { Tasks } from './Tasks';
import { Projects } from './Projects';

const ACTIONS: { id: 'tarea' | 'revision' | 'idea'; icon: string; label: string; primary?: boolean }[] = [
  { id: 'tarea', icon: '➕', label: 'Tarea rápida', primary: true },
  { id: 'revision', icon: '📝', label: 'Revisión semanal' },
  { id: 'idea', icon: '⚡', label: 'Captura rápida' },
];

export function HoyView({ onOpen }: { onOpen: (m: Exclude<ModalState, null>) => void }) {
  const { data, error, isLoading } = useToday();

  return (
    <>
      <section className="mt-6 flex gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => onOpen({ kind: a.id })}
            aria-label={a.label}
            className={`flex flex-1 items-center justify-center gap-2 rounded-[11px] border px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition hover:-translate-y-px hover:border-accent ${
              a.primary ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-text'
            }`}
          >
            <span className="text-[17px] sm:text-[15px]">{a.icon}</span>
            <b className="hidden sm:inline">{a.label}</b>
          </button>
        ))}
      </section>

      {isLoading && <p className="mt-6 text-sm text-muted">Cargando…</p>}
      {error && (
        <div className="card mt-6 text-sm text-hot">
          No se pudo cargar: {error.message}
        </div>
      )}

      {data && (
        <>
          <section className="mt-6">
            <div className="mb-3 flex items-baseline justify-between gap-2.5">
              <h2 className="m-0 font-display text-lg font-semibold">Hábitos</h2>
              <button
                onClick={() => onOpen({ kind: 'habitos' })}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
              >
                ✏️ Gestionar
              </button>
            </div>
            <Habits habits={data.habits} />
          </section>
          <Tasks data={data} onEdit={(task) => onOpen({ kind: 'tarea', task })} />
          <Projects projects={data.projects} onEdit={(project) => onOpen({ kind: 'proyecto', project })} />
        </>
      )}
    </>
  );
}
