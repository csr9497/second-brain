import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatTurnos, franjaDe, resumenTurnos, turnosSchema, type HabitAdmin, type Turnos } from '@sb/shared';
import { api } from '../lib/api';
import { useInvalidateHabits } from '../lib/useHabits';
import { Field, Modal, ModalActions } from './Modal';
import { TurnosBuilder } from './ui/TurnosBuilder';
import { useToast } from './Toast';

/** Crea un hábito o, si recibe `habit`, lo edita: nombre y, según la frecuencia, sus turnos diarios o su meta semanal. */
export function HabitModal({ habit, onClose }: { habit?: HabitAdmin; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const editing = !!habit;
  const [nombre, setNombre] = useState(habit?.nombre ?? '');
  const [turnos, setTurnos] = useState<Turnos>(habit?.turnos ?? [[franjaDe(new Date())]]);
  const [semanal, setSemanal] = useState(habit?.vecesSemana != null);
  const [veces, setVeces] = useState(habit?.vecesSemana ?? 3);
  const validos = semanal ? veces >= 1 && veces <= 7 : turnosSchema.safeParse(turnos).success;

  const save = useMutation({
    mutationFn: () => {
      // Un semanal conserva sus turnos (no se usan) por si vuelve a ser diario
      const input = { nombre: nombre.trim(), turnos, vecesSemana: semanal ? veces : null };
      return editing ? api.updateHabit(habit.id, input) : api.createHabit(input);
    },
    onSuccess: () => {
      toast(editing ? '✅ Hábito actualizado' : '✅ Hábito creado');
      onClose();
    },
    onError: (err) => toast(`⚠ ${err.message}`),
    onSettled: refresh,
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (nombre.trim() && validos) save.mutate();
  }

  return (
    <Modal title={editing ? '✏️ Editar hábito' : '🌱 Nuevo hábito'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input className="input" autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="p. ej. Meditar 10 min" />
        </Field>
        <Field label="Frecuencia" group>
          <div role="radiogroup" aria-label="Frecuencia" className="flex gap-1 rounded-lg bg-surface2 p-0.5">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                type="button"
                role="radio"
                aria-checked={semanal === v}
                onClick={() => setSemanal(v)}
                className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-muted aria-checked:bg-surface aria-checked:text-text aria-checked:shadow-sm"
              >
                {v ? '📅 Veces por semana' : '🔁 Cada día, por turnos'}
              </button>
            ))}
          </div>
        </Field>
        {semanal ? (
          <Field label="Meta semanal" group>
            <div role="radiogroup" aria-label="Días por semana" className="flex gap-1.5">
              {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={veces === n}
                  onClick={() => setVeces(n)}
                  className="size-9 rounded-lg border border-line bg-surface2 text-[13px] font-semibold text-muted aria-checked:border-good aria-checked:bg-good-ink aria-checked:text-good"
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="mt-2 mb-0 text-[13px] font-semibold">{veces === 1 ? '1 vez' : `${veces} veces`} por semana</p>
            <p className="m-0 text-[12px] text-faint">Se marca como mucho una vez al día, el día que quieras. No cuenta en el % del día ni en la racha.</p>
          </Field>
        ) : (
          <Field label="Franjas" group>
            <TurnosBuilder value={turnos} onChange={setTurnos} />
            <p className="mt-2 mb-0 text-[13px] font-semibold">{formatTurnos(turnos)}</p>
            <p className="m-0 text-[12px] text-faint">{resumenTurnos(turnos)}</p>
          </Field>
        )}
        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !nombre.trim() || !validos}>
            {editing ? 'Guardar' : 'Crear hábito'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
