import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from './lib/api';
import { greeting, headerDate } from './lib/format';
import { TaskModal } from './components/TaskModal';
import { AvisosModal } from './components/AvisosModal';
import { IdeaModal } from './components/IdeaModal';
import { ProjectModal } from './components/ProjectModal';
import { CrearModal } from './components/CrearModal';
import { Login } from './components/Login';
import { useSession } from './lib/useSession';
import { sb } from './lib/supabase';
import { HabitModal } from './components/HabitModal';
import { HabitsManager } from './components/HabitsManager';
import { CalendarView } from './components/CalendarView';
import { HoyView } from './components/HoyView';
import { ResumenView } from './components/resumen/ResumenView';
import { GanttView } from './components/gantt/GanttView';
import { ConfirmHost } from './components/ui/Confirmar';
import { SinConexion } from './components/SinConexion';
import { AtajosModal } from './components/AtajosModal';
import { useAtajos } from './lib/useAtajos';
import { useVista, hrefVista, listaVistas, puedeSalir, VISTAS, type Vista } from './lib/useVista';
import type { ModalState } from './lib/modal';
import { todayISO } from '@sb/shared';
import { useWebMcp } from './lib/webmcp/registrar';
import { useLiveActivity } from './lib/nativo/useLiveActivity';
import { useRefresco } from './lib/nativo/useRefresco';
import { useAccionesNativas } from './lib/nativo/useAccionesNativas';
import { useAvisosMac } from './lib/nativo/useAvisosMac';
import { useTiempoReal } from './lib/useTiempoReal';

export function App() {
  const session = useSession();
  if (session === undefined) return null;
  if (session === null) return <Login />;
  return <ConJornada />;
}

/** Espera a la jornada antes de pintar: todo «hoy» y toda franja dependen de ella (`fijarJornada`). Si falla, sigue con la de por defecto. */
function ConJornada() {
  const jornada = useQuery({ queryKey: ['jornada'], queryFn: api.jornada, staleTime: Infinity, retry: 1 });
  if (jornada.isPending) return null;
  return <Home />;
}

function Home() {
  const qc = useQueryClient();
  const vista = useVista();
  const [modal, setModal] = useState<ModalState>(null);
  const close = useCallback(() => setModal(null), []);
  // Crear/editar un hábito desde "Gestionar hábitos" lo cierra y vuelve a él al terminar (sin modales apilados)
  const backToHabits = useCallback(() => setModal({ kind: 'habitos' }), []);
  // Nueva tarea desde Calendario/Gantt: inicio = primer día y deadline = último. Si el último día ya pasó,
  // el deadline queda vacío (uno vencido mandaría la tarea a incumplimiento)
  const nuevaTarea = (rango?: { inicio: string; fin: string }) =>
    setModal({ kind: 'tarea', inicial: rango ? { startDate: rango.inicio, deadline: rango.fin < todayISO() ? '' : rango.fin } : undefined });

  // App nativa: la Live Activity sigue a Hoy
  useLiveActivity();
  // App de Mac: avisos de hábitos como notificaciones del sistema
  useAvisosMac();
  // Cambios desde otro dispositivo o la card: se ven sin recargar
  useTiempoReal();
  // App nativa: jalar hacia abajo actualiza
  useRefresco();

  // Cambiar de vista desde fuera (agente, menús nativos) respeta la guardia
  const irA = async (v: Vista) => {
    if (!(await puedeSalir())) return false;
    window.location.hash = hrefVista(v);
    return true;
  };

  // Herramientas de interfaz de WebMCP: no pisan un modal abierto
  useWebMcp({
    abrirTarea: (task) => (modal ? false : (setModal({ kind: 'tarea', task }), true)),
    nuevaTarea: (inicial) => (modal ? false : (setModal({ kind: 'tarea', inicial }), true)),
    irA,
  });

  // Teclado: n, c, 1–4, j/k, x, e y ? (lib/atajos.ts)
  useAtajos({
    nuevaTarea: () => setModal({ kind: 'tarea' }),
    crear: () => setModal({ kind: 'crear' }),
    irA: (v) => void irA(v),
    ayuda: () => setModal({ kind: 'atajos' }),
    hayModal: modal !== null,
  });

  // App de Mac: menús Archivo y Ver
  useAccionesNativas({
    nuevaTarea: () => (modal ? false : (setModal({ kind: 'tarea' }), true)),
    crear: () => (modal ? false : (setModal({ kind: 'crear' }), true)),
    irA,
  });

  return (
    <div className="mx-auto max-w-[1040px] px-4 pt-[26px] pb-28 sm:pb-[72px]">
      <SinConexion />
      <header>
        <div className="text-xs font-semibold tracking-[.08em] text-faint uppercase">{headerDate(todayISO())}</div>
        <div className="flex items-start justify-between gap-3">
          <h1 className="mt-1.5 mb-1 font-display text-[33px] leading-[1.05] font-bold tracking-[-.01em]">🧠 Second Brain</h1>
          <div className="mt-2 flex gap-1.5">
            <button
              onClick={() => setModal({ kind: 'avisos' })}
              aria-label="Avisos"
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
            >
              🔔
            </button>
            <button
              onClick={async () => {
                if (!(await puedeSalir())) return;
                await sb.auth.signOut();
                qc.clear();
              }}
              className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted hover:text-text"
            >
              Salir
            </button>
          </div>
        </div>
        <p className="m-0 text-sm text-muted">{greeting()}</p>
      </header>

      <div className="mt-5 flex items-center gap-1.5">
      <nav className="-mx-4 flex min-w-0 gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden" aria-label="Vistas">
        {listaVistas.map((v) => (
          <a
            key={v}
            href={hrefVista(v)}
            onClick={async (e) => {
              // Ctrl/Cmd/Shift/clic central: que el navegador abra la pestaña nueva como siempre
              if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
              e.preventDefault();
              if (await puedeSalir()) window.location.hash = hrefVista(v);
            }}
            aria-current={vista === v ? 'page' : undefined}
            className="shrink-0 rounded-full border border-line px-3 py-1.5 text-xs font-semibold whitespace-nowrap text-muted no-underline sm:px-3.5 sm:text-[13px] transition hover:text-text aria-[current=page]:border-accent aria-[current=page]:bg-accent aria-[current=page]:text-white"
          >
            {VISTAS[v].label}
          </a>
        ))}
      </nav>
      <button
        onClick={() => setModal({ kind: 'crear' })}
        className="ml-auto hidden shrink-0 rounded-full border border-accent bg-accent px-4 py-1.5 text-[13px] font-semibold whitespace-nowrap text-white sm:block"
      >
        ＋ Crear
      </button>
      </div>

      {vista === 'hoy' && <HoyView onOpen={setModal} />}
      {vista === 'calendario' && (
        <CalendarView
          onEditTask={(task) => setModal({ kind: 'tarea', task })}
          onNewTask={nuevaTarea}
        />
      )}
      {vista === 'gantt' && <GanttView onEditTask={(task) => setModal({ kind: 'tarea', task })} onNewTask={nuevaTarea} />}
      {vista === 'resumen' && <ResumenView />}

      {modal?.kind === 'tarea' && <TaskModal task={modal.task} inicial={modal.inicial} onClose={close} />}
      {modal?.kind === 'proyecto' && <ProjectModal project={modal.project} onClose={close} />}
      {modal?.kind === 'idea' && <IdeaModal onClose={close} />}
      {modal?.kind === 'avisos' && <AvisosModal onClose={close} />}
      {modal?.kind === 'habitos' && (
        <HabitsManager onClose={close} onNew={() => setModal({ kind: 'habito', volver: true })} onEdit={(habit) => setModal({ kind: 'habito', habit, volver: true })} />
      )}
      {modal?.kind === 'habito' && <HabitModal habit={modal.habit} onClose={modal.volver ? backToHabits : close} />}
      {modal?.kind === 'crear' && <CrearModal onSelect={setModal} onClose={close} />}
      {modal?.kind === 'atajos' && <AtajosModal onClose={close} />}
      <button
        onClick={() => setModal({ kind: 'crear' })}
        aria-label="Crear"
        className="fixed right-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-40 flex size-14 items-center justify-center rounded-full border-0 bg-accent text-3xl leading-none text-white shadow-lg sm:hidden"
      >
        ＋
      </button>
      <ConfirmHost />
    </div>
  );
}
