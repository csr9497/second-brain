import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { shortDate } from '../lib/format';
import { Modal, ModalActions } from './Modal';
import { useToast } from './Toast';

const Sec = ({ children }: { children: React.ReactNode }) => (
  <div className="mt-4 mb-2 text-xs font-semibold tracking-wide text-faint uppercase">{children}</div>
);

/** La revisión es un reporte calculado por el server; solo la nota es editable. */
export function ReviewModal({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [nota, setNota] = useState('');
  const { data: r, isLoading } = useQuery({ queryKey: ['review'], queryFn: api.currentReview });
  const archive = useMutation({
    mutationFn: () => api.archiveReview(nota),
    onSuccess: () => {
      toast('📝 Semana archivada');
      qc.invalidateQueries({ queryKey: ['review'] });
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
  });

  const title = r ? `📝 Revisión · ${shortDate(r.weekStart)} – ${shortDate(r.weekEnd)}` : '📝 Revisión semanal';

  return (
    <Modal title={title} hint="Tu cumplimiento de la semana, de un vistazo." onClose={onClose}>
      {isLoading || !r ? (
        <p className="text-sm text-muted">Calculando…</p>
      ) : (
        <>
          <div className="mb-4 flex gap-3">
            <Kpi value={`${r.habitsPct}%`} label="Hábitos" className="text-good" />
            <Kpi value={`${r.tasksDone}/${r.tasksTotal}`} label="Tareas hechas" />
            <Kpi value={String(r.overdue)} label={r.overdue === 1 ? 'Incumplida' : 'Incumplidas'} className={r.overdue ? 'text-hot' : ''} />
          </div>

          <Sec>Cumplimiento por proyecto</Sec>
          {r.perProject.length === 0 && <p className="text-[13px] text-faint">Sin proyectos en curso.</p>}
          {r.perProject.map((p) => (
            <div key={p.id} className="flex items-center gap-[9px] py-[5px] text-[13px]">
              <span className="min-w-0 flex-1 truncate">{p.nombre}</span>
              <div className="track max-w-[120px]">
                <div className="h-full rounded-full bg-good" style={{ width: `${p.pct}%` }} />
              </div>
              <span className="w-[34px] text-right text-[11.5px] text-muted tabular-nums">{p.pct}%</span>
            </div>
          ))}

          <Sec>Señales</Sec>
          <div className="py-[5px] text-[13px]">
            🔥 Racha de hábitos: <b>{r.streak} días</b>
          </div>
          {r.untouched.length > 0 && (
            <div className="py-[5px] text-[13px]">
              ⚠ Sin tocar esta semana: <b>{r.untouched.map((p) => p.nombre).join(', ')}</b>
            </div>
          )}
          {r.archived && <div className="py-[5px] text-[13px] text-muted">✓ Esta semana ya está archivada (archivar de nuevo la actualiza).</div>}

          <label className="mt-4 block">
            <span className="field-label">Nota de cierre (opcional)</span>
            <textarea
              className="input min-h-14 resize-y"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Un aprendizaje o ajuste para la próxima semana…"
            />
          </label>
        </>
      )}
      <ModalActions>
        <button className="btn" onClick={onClose}>
          Cerrar
        </button>
        <button className="btn btn-primary" disabled={!r || archive.isPending} onClick={() => archive.mutate()}>
          Archivar semana
        </button>
      </ModalActions>
    </Modal>
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
