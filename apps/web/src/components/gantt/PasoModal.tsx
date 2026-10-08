import { useMutation, useQueryClient } from '@tanstack/react-query';
import { fueraDePlazo, type Step, type Task } from '@sb/shared';
import { api } from '../../lib/api';
import { rangoPaso } from '../../lib/format';
import { Modal, ModalActions } from '../Modal';
import { useToast } from '../Toast';
import { Dot } from '../ui/Dot';

/** Detalle de un paso del Gantt (fuera del modo edición): marcar hecho o abrir su tarea. */
export function PasoModal({ paso, tarea, onClose, onEditTask }: { paso: Step; tarea: Task; onClose: () => void; onEditTask: (t: Task) => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const fuera = fueraDePlazo(paso, tarea);
  const alto = { minHeight: 44 };
  const alternar = useMutation({
    mutationFn: () => api.toggleStep(paso.id),
    onSuccess: async () => {
      await Promise.all(['gantt', 'today', 'calendar', 'review', 'resumen'].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      toast(paso.done ? 'Paso desmarcado' : '✓ Paso hecho');
      onClose();
    },
    onError: (e: Error) => toast(`⚠ ${e.message}`),
  });

  return (
    <Modal title={paso.title} onClose={onClose}>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13.5px]">
        <dt className="text-muted">Tarea</dt>
        <dd className="m-0 min-w-0 break-words">{tarea.title}</dd>
        {tarea.projectName && (
          <>
            <dt className="text-muted">Proyecto</dt>
            <dd className="m-0 flex min-w-0 items-center gap-1.5">
              <Dot color={tarea.projectColor ?? 'gris'} />
              <span className="truncate">{tarea.projectName}</span>
            </dd>
          </>
        )}
        <dt className="text-muted">{paso.duracionMin != null ? 'Fecha y tiempo' : 'Fechas'}</dt>
        <dd className="m-0">{rangoPaso(paso) ?? 'Sin programar'}</dd>
        <dt className="text-muted">Estado</dt>
        <dd className="m-0 flex flex-wrap items-center gap-2">
          <span>{paso.done ? 'Hecho' : 'Pendiente'}</span>
          {fuera && <span className="rounded-full border border-hot px-2 py-0.5 text-[11.5px] font-semibold text-hot">Fuera de plazo</span>}
        </dd>
      </dl>
      <ModalActions>
        <button type="button" className="btn" style={alto} onClick={() => { onClose(); onEditTask(tarea); }}>
          Abrir tarea
        </button>
        <button type="button" className="btn btn-primary" style={alto} disabled={alternar.isPending} onClick={() => alternar.mutate()}>
          {paso.done ? 'Desmarcar' : 'Marcar hecho'}
        </button>
      </ModalActions>
    </Modal>
  );
}
