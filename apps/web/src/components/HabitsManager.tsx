import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { SLOT_COLOR, formatTurnos, type HabitAdmin } from '@sb/shared';
import { api } from '../lib/api';
import { useHabits, useInvalidateHabits } from '../lib/useHabits';
import { ConfirmDelete, Modal, ModalActions } from './Modal';
import { Dot } from './ui/Dot';
import { useToast } from './Toast';

type Action = 'archive' | 'reactivate' | 'delete';
const DONE_MSG: Record<Action, string> = { archive: '📦 Hábito archivado', reactivate: '✅ Hábito reactivado', delete: '🗑 Hábito eliminado' };
const linkBtn = 'text-xs font-semibold text-muted hover:text-text disabled:opacity-50';

/** Lista de hábitos: editar y archivar los activos; reactivar o eliminar los archivados. */
export function HabitsManager({ onNew, onEdit, onClose }: { onNew: () => void; onEdit: (h: HabitAdmin) => void; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const { data: habits, isLoading, error } = useHabits();
  const [showArchived, setShowArchived] = useState(false);

  const run = useMutation({
    mutationFn: ({ action, id }: { action: Action; id: string }) =>
      action === 'archive' ? api.archiveHabit(id) : action === 'reactivate' ? api.reactivateHabit(id) : api.deleteHabit(id),
    onSuccess: (_r, { action }) => toast(DONE_MSG[action]),
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  const active = (habits ?? []).filter((h) => !h.archivedAt);
  const archived = (habits ?? []).filter((h) => h.archivedAt);

  return (
    <Modal title="✏️ Gestionar hábitos" onClose={onClose}>
      <div className="mb-4 flex justify-end">
        <button type="button" onClick={onNew} className="btn btn-primary px-3 py-1.5 text-xs">
          + Nuevo hábito
        </button>
      </div>

      {isLoading && <p className="m-0 mb-3 text-sm text-muted">Cargando…</p>}
      {error && <p className="m-0 mb-3 text-sm text-hot">No se pudo cargar: {error.message}</p>}
      {habits && active.length === 0 && <p className="m-0 mb-3 text-[13px] text-faint">Aún no tienes hábitos.</p>}

      {active.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {active.map((h) => (
            <li key={h.id} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
              <span className="flex flex-none gap-1">
                {h.turnos.flat().map((f) => (
                  <Dot key={f} color={SLOT_COLOR[f]} />
                ))}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{h.nombre}</span>
                <span className="block truncate text-[11.5px] text-faint">{formatTurnos(h.turnos)}</span>
              </span>
              <button type="button" className={linkBtn} aria-label={`Editar ${h.nombre}`} onClick={() => onEdit(h)}>
                Editar
              </button>
              <button
                type="button"
                className={linkBtn}
                aria-label={`Archivar ${h.nombre}`}
                disabled={run.isPending}
                onClick={() => run.mutate({ action: 'archive', id: h.id })}
              >
                Archivar
              </button>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section className="mt-4 border-t border-line pt-3">
          <button type="button" aria-expanded={showArchived} onClick={() => setShowArchived((v) => !v)} className={linkBtn}>
            {showArchived ? '▾' : '▸'} Archivados ({archived.length})
          </button>
          {showArchived && (
            <>
              <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                {archived.map((h) => (
                  <li key={h.id} className="flex items-center gap-3 rounded-lg bg-surface2 px-3 py-2 text-sm">
                    <span className="flex flex-none gap-1">
                      {h.turnos.flat().map((f) => (
                        <Dot key={f} color={SLOT_COLOR[f]} />
                      ))}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-muted">{h.nombre}</span>
                      <span className="block truncate text-[11.5px] text-faint">{formatTurnos(h.turnos)}</span>
                    </span>
                    <button type="button" className={linkBtn} aria-label={`Reactivar ${h.nombre}`} disabled={run.isPending} onClick={() => run.mutate({ action: 'reactivate', id: h.id })}>
                      Reactivar
                    </button>
                    <ConfirmDelete compact aria-label={`Eliminar ${h.nombre}`} label="Eliminar" disabled={run.isPending} onConfirm={() => run.mutate({ action: 'delete', id: h.id })} />
                  </li>
                ))}
              </ul>
              <p className="mt-2 mb-0 text-[11.5px] text-faint">Eliminar borra también su historial. Reactivar lo cuenta como nuevo desde hoy.</p>
            </>
          )}
        </section>
      )}

      <ModalActions>
        <button type="button" className="btn" onClick={onClose}>
          Cerrar
        </button>
      </ModalActions>
    </Modal>
  );
}
