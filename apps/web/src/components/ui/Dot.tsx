import type { PaletteColor } from '@sb/shared';

/** Círculo de color de la paleta (tokens --c-* de index.css). */
export function Dot({ color, size = 8 }: { color: PaletteColor; size?: number }) {
  return <span aria-hidden className="inline-block flex-none rounded-full" style={{ width: size, height: size, background: `var(--c-${color})` }} />;
}
