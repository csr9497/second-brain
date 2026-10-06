import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { greeting, headerDate } from './lib/format';
import { TaskModal } from './components/TaskModal';
import { IdeaModal } from './components/IdeaModal';
import { ReviewModal } from './components/ReviewModal';
import { ProjectModal } from './components/ProjectModal';
import { Login } from './components/Login';
import { useSession } from './lib/useSession';
import { sb } from './lib/supabase';
import { HabitModal } from './components/HabitModal';
import { HabitsManager } from './components/HabitsManager';
import { CalendarView } from './components/CalendarView';
import { HoyView } from './components/HoyView';
import { GanttView } from './components/gantt/GanttView';
import { useVista, hrefVista, listaVistas, puedeSalir, VISTAS } from './lib/useVista';
import type { ModalState } from './lib/modal';
import { todayISO } from '@sb/shared';

export function App() {
  const session = useSession();
  if (session === undefined) return null;
  if (session === null) return <Login />;
  return <Home />;
}

function Home() {
  const qc = useQueryClient();
  const vista = useVista();
  const [modal, setModal] = useState<ModalState>(null);
  const close = useCallback(() => setModal(null), []);
  // Crear/editar un hábito cierra "Gestionar hábitos" y vuelve a él al terminar (sin modales apilados)
  const backToHabits = useCallback(() => setModal({ kind: 'habitos' }), []);

  return (
    <div className={`mx-auto ${VISTAS[vista].ancho} px-4 pt-[26px] pb-[72px]`}>
      <header>
        <div className="text-xs font-semibold tracking-[.08em] text-faint uppercase">{headerDate(todayISO())}</div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="mt-1.5 mb-1 font-display text-[33px] leading-[1.05] font-bold tracking-[-.01em]">🧠 Second Brain</h1>
          <button
            onClick={async () => {
              if (!puedeSalir()) return;
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

      <nav className="mt-5 flex gap-1.5" aria-label="Vistas">
        {listaVistas.map((v) => (
          <a
            key={v}
            href={hrefVista(v)}
            onClick={(e) => {
              if (!puedeSalir()) e.preventDefault();
            }}
            aria-current={vista === v ? 'page' : undefined}
            className="rounded-full border border-line px-3.5 py-1.5 text-[13px] font-semibold text-muted no-underline transition hover:text-text aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-white"
          >
            {VISTAS[v].label}
          </a>
        ))}
      </nav>

      {vista === 'hoy' && <HoyView onOpen={setModal} />}
      {vista === 'calendario' && <CalendarView
          onEditTask={(task) => setModal({ kind: 'tarea', task })}
          onNewTask={(fecha) => setModal({ kind: 'tarea', inicial: { startDate: fecha, deadline: fecha } })}
        />}
      {vista === 'gantt' && <GanttView onEditTask={(task) => setModal({ kind: 'tarea', task })} />}

      {modal?.kind === 'tarea' && <TaskModal task={modal.task} inicial={modal.inicial} onClose={close} />}
      {modal?.kind === 'proyecto' && <ProjectModal project={modal.project} onClose={close} />}
      {modal?.kind === 'revision' && <ReviewModal onClose={close} />}
      {modal?.kind === 'idea' && <IdeaModal onClose={close} />}
      {modal?.kind === 'habitos' && (
        <HabitsManager onClose={close} onNew={() => setModal({ kind: 'habito' })} onEdit={(habit) => setModal({ kind: 'habito', habit })} />
      )}
      {modal?.kind === 'habito' && <HabitModal habit={modal.habit} onClose={backToHabits} />}
    </div>
  );
}
