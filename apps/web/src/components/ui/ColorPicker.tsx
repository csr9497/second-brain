import type { KeyboardEvent } from 'react';
import { paletteColor, type PaletteColor } from '@sb/shared';
import { COLOR_LABEL } from '../../lib/options';

const COLORS = paletteColor.options;

/** Radiogroup de la paleta: clic o flechas para elegir. */
export function ColorPicker({ value, onChange }: { value: PaletteColor; onChange: (c: PaletteColor) => void }) {
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!dir) return;
    e.preventDefault();
    const next = COLORS[(COLORS.indexOf(value) + dir + COLORS.length) % COLORS.length]!;
    onChange(next);
    e.currentTarget.querySelector<HTMLElement>(`[data-color="${next}"]`)?.focus();
  }

  return (
    <div role="radiogroup" aria-label="Color" className="flex flex-wrap gap-2" onKeyDown={onKeyDown}>
      {COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          data-color={c}
          aria-checked={c === value}
          aria-label={COLOR_LABEL[c]}
          title={COLOR_LABEL[c]}
          tabIndex={c === value ? 0 : -1}
          onClick={() => onChange(c)}
          className="size-7 rounded-full ring-offset-2 ring-offset-surface transition aria-checked:ring-2 aria-checked:ring-accent"
          style={{ background: `var(--c-${c})` }}
        />
      ))}
    </div>
  );
}
