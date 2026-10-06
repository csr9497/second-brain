import * as RS from '@radix-ui/react-select';
import type { PaletteColor } from '@sb/shared';
import { Dot } from './Dot';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  color?: PaletteColor;
}

// Radix no admite value="" en un Item: la opción vacía usa este centinela
const NONE = '__none__';
const toRadix = (v: string) => (v === '' ? NONE : v);

/** Select accesible (Radix) con un dot de color por opción. `''` = opción vacía. */
export function Select<T extends string>({
  value,
  onChange,
  options,
  placeholder,
  'aria-label': ariaLabel,
}: {
  value: T;
  onChange: (value: T) => void;
  options: SelectOption<T>[];
  placeholder?: string;
  'aria-label'?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const hasEmpty = options.some((o) => o.value === '');
  // Con opción vacía se usa el centinela; sin ella, '' llega a Root y Radix muestra el placeholder
  const rootValue = value === '' && !hasEmpty ? '' : toRadix(value);
  return (
    <RS.Root
      value={rootValue}
      onValueChange={(v) => {
        // El select nativo oculto de Radix emite un change con '' si ninguna opción coincide
        // (p. ej. opciones aún cargando): comparar en el espacio de valores de Radix (la opción
        // vacía es NONE, no '') e ignorar lo ajeno para no borrar el estado del padre
        if (!options.some((o) => toRadix(o.value) === v)) return;
        onChange((v === NONE ? '' : v) as T);
      }}
    >
      <RS.Trigger
        aria-label={ariaLabel}
        className="input flex items-center gap-2 text-left data-[placeholder]:text-faint"
      >
        {selected?.color && <Dot color={selected.color} />}
        <span className="min-w-0 flex-1 truncate">
          <RS.Value placeholder={placeholder} />
        </span>
        <RS.Icon className="text-xs text-faint">▾</RS.Icon>
      </RS.Trigger>
      <RS.Portal>
        <RS.Content
          position="popper"
          sideOffset={4}
          className="z-[60] max-h-[var(--radix-select-content-available-height)] w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[11px] border border-line bg-surface p-1 shadow-lg"
        >
          <RS.Viewport>
            {options.map((o) => (
              <RS.Item
                key={toRadix(o.value)}
                value={toRadix(o.value)}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-text outline-none select-none data-[highlighted]:bg-surface2"
              >
                {o.color ? <Dot color={o.color} /> : <span className="w-2 flex-none" />}
                <RS.ItemText>{o.label}</RS.ItemText>
                <RS.ItemIndicator className="ml-auto text-accent">✓</RS.ItemIndicator>
              </RS.Item>
            ))}
          </RS.Viewport>
        </RS.Content>
      </RS.Portal>
    </RS.Root>
  );
}
