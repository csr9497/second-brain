import { useEffect, useRef, useState, type ReactNode } from 'react';

export function Modal({
  title,
  hint,
  onClose,
  children,
  ancho = 'max-w-[480px]',
}: {
  title: string;
  hint?: string;
  onClose: () => void;
  children: ReactNode;
  ancho?: string;
}) {
  useEffect(() => {
    // Radix (Select) cierra su lista con Esc y marca el evento: no cerrar también el modal
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !e.defaultPrevented && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  // Solo cierra un clic que empezó en el fondo: arrastrar desde dentro (p. ej. días del planificador) y soltar fuera no cierra
  const desdeFondo = useRef(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/55 px-4 py-7"
      onPointerDown={(e) => (desdeFondo.current = e.target === e.currentTarget)}
      onClick={(e) => e.target === e.currentTarget && desdeFondo.current && onClose()}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className={`w-full ${ancho} rounded-2xl border border-line bg-surface p-5`}>
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
export function ConfirmDelete({
  label,
  disabled,
  onConfirm,
  compact,
  'aria-label': ariaLabel,
}: {
  label: string;
  disabled?: boolean;
  onConfirm: () => void;
  compact?: boolean;
  'aria-label'?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => (armed ? onConfirm() : setArmed(true))}
      onBlur={() => setArmed(false)}
      aria-label={armed && ariaLabel ? `Confirmar: ${ariaLabel}` : ariaLabel}
      className={
        compact
          ? `text-xs font-semibold disabled:opacity-50 ${armed ? 'text-hot underline' : 'text-hot'}`
          : `btn mr-auto ${armed ? 'border-hot bg-hot text-white' : 'text-hot'}`
      }
    >
      {armed ? (compact ? '¿Seguro?' : '¿Seguro? Clic para eliminar') : label}
    </button>
  );
}
