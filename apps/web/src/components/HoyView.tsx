import { useToday } from '../lib/useToday';
import type { ModalState } from '../lib/modal';
import { Habits } from './Habits';
import { Tasks } from './Tasks';
import { Projects } from './Projects';

export function HoyView({ onOpen }: { onOpen: (m: Exclude<ModalState, null>) => void }) {
  const { data, error, isLoading } = useToday();

  return (
    <>
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
