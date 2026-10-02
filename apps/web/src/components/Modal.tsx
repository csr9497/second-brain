import { useEffect, useState, type ReactNode } from 'react';

export function Modal({ title, hint, onClose, children }: { title: string; hint?: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/55 px-4 py-7"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-[480px] rounded-2xl border border-line bg-surface p-5">
        <h3 className={`m-0 font-display text-[19px] font-bold ${hint ? 'mb-0.5' : 'mb-4'}`}>{title}</h3>
        {hint && <p className="m-0 mb-4 text-[12.5px] text-muted">{hint}</p>}
        {children}
      </div>
    </div>
  );
}

export const ModalActions = ({ children }: { children: ReactNode }) => <div className="mt-[18px] flex flex-wrap justify-end gap-2.5">{children}</div>;

/**
 * Campo con etiqueta. Con un solo control, el <label> lo envuelve (queda asociado).
 * Con `group` (varios controles, p. ej. lista de pasos) se usa un título no-label.
 */
export function Field({ label, group = false, children }: { label: string; group?: boolean; children: ReactNode }) {
  if (group) {
    return (
      <div className="mb-[13px]" role="group" aria-label={label}>
        <span className="field-label">{label}</span>
        {children}
      </div>
    );
  }
  return (
    <label className="mb-[13px] block">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}

/** Botón de borrar en dos pasos: el primer clic pide confirmación. Se alinea a la izquierda. */
export function ConfirmDelete({ label, disabled, onConfirm }: { label: string; disabled?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      className={`btn mr-auto ${armed ? 'border-hot bg-hot text-white' : 'text-hot'}`}
    >
      {armed ? '¿Seguro? Clic para eliminar' : label}
    </button>
  );
}
