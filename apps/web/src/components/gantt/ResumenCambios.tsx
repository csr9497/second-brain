import { useMutation, useQueryClient } from '@tanstack/react-query';
import { daysBetween, type Cambio } from '@sb/shared';
import { api } from '../../lib/api';
import { rangoPaso, shortDate } from '../../lib/format';
import { TODAY_KEY } from '../../lib/useToday';
import { Modal, ModalActions } from '../Modal';
import { useToast } from '../Toast';

const fecha = (iso: string | null) => (iso ? shortDate(iso) : '—');
/** " (+2 días)" entre dos fechas, o "" si no se movió o falta alguna. */
const diferencia = (a: string | null, b: string | null) => {
  if (!a || !b) return '';
  const n = daysBetween(a, b);
  return n ? ` (${n > 0 ? '+' : ''}${n} ${Math.abs(n) === 1 ? 'día' : 'días'})` : '';
};

/** Detalle de los cambios del Gantt antes de guardarlos; confirmar los aplica todos a la vez. */
export function ResumenCambios({ cambios, onVolver, onGuardado }: { cambios: Cambio[]; onVolver: () => void; onGuardado: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const guardar = useMutation({
    mutationFn: () => api.aplicarPlan(cambios),
    onSuccess: () => {
      toast(`✅ ${cambios.length} ${cambios.length === 1 ? 'cambio guardado' : 'cambios guardados'}`);
      onGuardado();
    },
    onError: (err) => toast(`⚠ No se guardó nada: ${err.message}`),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['gantt'] });
      qc.invalidateQueries({ queryKey: TODAY_KEY });
      qc.invalidateQueries({ queryKey: ['calendar'] });
    },
  });
  const fuera = cambios.filter((c) => c.tipo === 'paso' && c.fueraDePlazo).length;

  return (
    <Modal title="Revisar cambios" hint="Todavía no se ha guardado nada. Al confirmar se aplican todos a la vez." onClose={onVolver}>
      <ul className="m-0 flex max-h-[55vh] list-none flex-col gap-2 overflow-auto p-0">
        {cambios.map((c) => (
          <li key={`${c.tipo}-${c.id}`} className="rounded-lg bg-surface2 px-3 py-2 text-[13px]">
            {c.tipo === 'tarea' ? (
              <>
                <b className="block">📌 {c.titulo}</b>
                {c.antes.startDate !== c.despues.startDate && (
                  <span className="block text-muted">
                    Inicio: {fecha(c.antes.startDate)} → {fecha(c.despues.startDate)}
                    {diferencia(c.antes.startDate, c.despues.startDate)}
                  </span>
                )}
                {c.antes.deadline !== c.despues.deadline && (
                  <span className="block text-muted">
                    Deadline: {fecha(c.antes.deadline)} → {fecha(c.despues.deadline)}
                    {diferencia(c.antes.deadline, c.despues.deadline)}
                  </span>
                )}
              </>
            ) : (
              <>
                <b className="block">
                  ↳ {c.titulo} <span className="font-normal text-faint">· {c.tarea}</span>
                </b>
                <span className="block text-muted">
                  {rangoPaso(c.antes) ?? 'sin programar'} → {rangoPaso(c.despues) ?? 'sin programar'}
                  {diferencia(c.antes.startDate, c.despues.startDate)}
                  {c.antes.duracionDias !== c.despues.duracionDias && ` · ${c.antes.duracionDias} → ${c.despues.duracionDias} días`}
                </span>
                {c.fueraDePlazo && <span className="mt-1 inline-block rounded-full bg-hot/15 px-2 py-0.5 text-[11px] font-semibold text-hot">fuera de plazo</span>}
              </>
            )}
          </li>
        ))}
      </ul>
      {fuera > 0 && (
        <p className="mt-3 mb-0 text-[12.5px] text-hot">
          ⚠ {fuera} {fuera === 1 ? 'paso queda' : 'pasos quedan'} fuera del plazo de su tarea. Puedes guardarlo igual.
        </p>
      )}
      <ModalActions>
        <button type="button" className="btn" onClick={onVolver} disabled={guardar.isPending}>
          Volver a editar
        </button>
        <button type="button" className="btn btn-primary" disabled={guardar.isPending} onClick={() => guardar.mutate()}>
          {guardar.isPending ? 'Guardando…' : 'Confirmar y guardar'}
        </button>
      </ModalActions>
    </Modal>
  );
}
