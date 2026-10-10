import { ATAJOS } from '../lib/atajos';
import { Modal } from './Modal';

/** Ayuda de los atajos de teclado («?»). */
export function AtajosModal({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="⌨️ Atajos de teclado" hint="Fuera de los campos de texto y con ningún otro modal abierto." onClose={onClose}>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {ATAJOS.map(([tecla, que]) => (
          <div key={tecla} className="contents">
            <dt>
              <kbd className="rounded-md border border-line bg-surface2 px-1.5 py-0.5 font-mono text-xs">{tecla}</kbd>
            </dt>
            <dd className="m-0 text-muted">{que}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}
