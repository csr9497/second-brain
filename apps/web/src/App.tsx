import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToday } from './lib/useToday';
import { greeting, headerDate } from './lib/format';
import { Habits } from './components/Habits';
import { Tasks } from './components/Tasks';
import { Projects } from './components/Projects';
import { TaskModal } from './components/TaskModal';
import { IdeaModal } from './components/IdeaModal';
import { ReviewModal } from './components/ReviewModal';
import { ProjectModal } from './components/ProjectModal';
import { Login } from './components/Login';
import { useSession } from './lib/useSession';
import { sb } from './lib/supabase';
import type { Project, Task } from '@sb/shared';

type ModalState =
  | { kind: 'tarea'; task?: Task }
  | { kind: 'proyecto'; project?: Project }
  | { kind: 'revision' }
  | { kind: 'idea' }
  | null;

const ACTIONS: { id: 'tarea' | 'revision' | 'idea'; icon: string; label: string; primary?: boolean }[] = [
  { id: 'tarea', icon: '➕', label: 'Tarea rápida', primary: true },
  { id: 'revision', icon: '📝', label: 'Revisión semanal' },
  { id: 'idea', icon: '⚡', label: 'Captura rápida' },
];

export function App() {
  const session = useSession();
  if (session === undefined) return null;
  if (session === null) return <Login />;
  return <Home />;
}

function Home() {
  const qc = useQueryClient();
  const { data, error, isLoading } = useToday();
  const [modal, setModal] = useState<ModalState>(null);
  const close = useCallback(() => setModal(null), []);

  return (
    <div className="mx-auto max-w-[780px] px-4 pt-[26px] pb-[72px]">
      <header>
        <div className="text-xs font-semibold tracking-[.08em] text-faint uppercase">{data ? headerDate(data.date) : ' '}</div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="mt-1.5 mb-1 font-display text-[33px] leading-[1.05] font-bold tracking-[-.01em]">🧠 Second Brain</h1>
          <button
            onClick={async () => {
              await sb.auth.signOut();
              qc.clear();
            }}
            className="mt-2 rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
          >
            Salir
          </button>
        </div>
        <p className="m-0 text-sm text-muted">{greeting()}</p>
      </header>

      <section className="mt-6 flex gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.id}
            onClick={() => setModal({ kind: a.id })}
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
              <h2 className="m-0 font-display text-lg font-semibold">Hábitos de hoy</h2>
              <small className="text-xs text-faint">se abre según la hora</small>
            </div>
            <Habits habits={data.habits} />
          </section>
          <Tasks data={data} onEdit={(task) => setModal({ kind: 'tarea', task })} />
          <Projects projects={data.projects} onEdit={(project) => setModal({ kind: 'proyecto', project })} />
        </>
      )}

      {modal?.kind === 'tarea' && <TaskModal task={modal.task} onClose={close} />}
      {modal?.kind === 'proyecto' && <ProjectModal project={modal.project} onClose={close} />}
      {modal?.kind === 'revision' && <ReviewModal onClose={close} />}
      {modal?.kind === 'idea' && <IdeaModal onClose={close} />}
    </div>
  );
}
