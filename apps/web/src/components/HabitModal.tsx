import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { slotForHour, type HabitAdmin, type HabitSlot } from '@sb/shared';
import { api } from '../lib/api';
import { SLOT_OPTIONS } from '../lib/options';
import { useInvalidateHabits } from '../lib/useHabits';
import { Field, Modal, ModalActions } from './Modal';
import { Select } from './ui/Select';
import { useToast } from './Toast';

/** Crea un hábito o, si recibe `habit`, lo edita (nombre y franja). */
export function HabitModal({ habit, onClose }: { habit?: HabitAdmin; onClose: () => void }) {
  const toast = useToast();
  const refresh = useInvalidateHabits();
  const editing = !!habit;
  const [nombre, setNombre] = useState(habit?.nombre ?? '');
  const [slot, setSlot] = useState<HabitSlot>(habit?.slot ?? slotForHour(new Date().getHours()));

  const save = useMutation({
    mutationFn: () => {
      const input = { nombre: nombre.trim(), slot };
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
    if (nombre.trim()) save.mutate();
  }

  return (
    <Modal title={editing ? '✏️ Editar hábito' : '🌱 Nuevo hábito'} onClose={onClose}>
      <form onSubmit={submit}>
        <Field label="Nombre">
          <input className="input" autoFocus required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="p. ej. Meditar 10 min" />
        </Field>
        <Field label="Franja">
          <Select value={slot} onChange={setSlot} options={SLOT_OPTIONS} />
        </Field>
        <ModalActions>
          <button type="button" className="btn" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !nombre.trim()}>
            {editing ? 'Guardar' : 'Crear hábito'}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}
