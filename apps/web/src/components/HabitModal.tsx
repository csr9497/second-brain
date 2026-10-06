import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { formatTurnos, resumenTurnos, slotForHour, turnosSchema, type HabitAdmin, type Turnos } from '@sb/shared';
import { api } from '../lib/api';
import { useInvalidateHabits } from '../lib/useHabits';
import { Field, Modal, ModalActions } from './Modal';
import { TurnosBuilder } from './ui/TurnosBuilder';
import { useToast } from './Toast';

/** Crea un hábito o, si recibe `habit`, lo edita (nombre y turnos). */
export function HabitModal({ habit, onClose }: { habit?: HabitAdmin; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const editing = !!habit;
  const [nombre, setNombre] = useState(habit?.nombre ?? '');
  const [turnos, setTurnos] = useState<Turnos>(habit?.turnos ?? [[slotForHour(new Date().getHours())]]);
  const validos = turnosSchema.safeParse(turnos).success;

  const save = useMutation({
    mutationFn: () => {
      const input = { nombre: nombre.trim(), turnos };
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
        <Field label="Franjas" group>
          <TurnosBuilder value={turnos} onChange={setTurnos} />
          <p className="mt-2 mb-0 text-[13px] font-semibold">{formatTurnos(turnos)}</p>
          <p className="m-0 text-[12px] text-faint">{resumenTurnos(turnos)}</p>
        </Field>
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
