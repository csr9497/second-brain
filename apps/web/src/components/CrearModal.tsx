import type { ModalState } from '../lib/modal';
import { Modal } from './Modal';

const OPCIONES: { modal: Exclude<ModalState, null>; icon: string; label: string }[] = [
  { modal: { kind: 'tarea' }, icon: '📝', label: 'Tarea' },
  { modal: { kind: 'idea' }, icon: '⚡', label: 'Captura' },
  { modal: { kind: 'habito' }, icon: '🔁', label: 'Hábito' },
  { modal: { kind: 'proyecto' }, icon: '📁', label: 'Proyecto' },
];

/** Elige qué crear; la opción sustituye a este modal (no se apilan). */
export function CrearModal({ onSelect, onClose }: { onSelect: (m: Exclude<ModalState, null>) => void; onClose: () => void }) {
  return (
    <Modal title="Crear" onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        {OPCIONES.map((o) => (
          <button
            key={o.modal.kind}
            onClick={() => onSelect(o.modal)}
            className="flex min-h-[72px] flex-col items-center justify-center gap-1 rounded-[11px] border border-line bg-surface text-[14px] font-semibold text-text transition hover:border-accent"
          >
            <span className="text-[22px]">{o.icon}</span>
            {o.label}
          </button>
        ))}
      </div>
    </Modal>
  );
}
