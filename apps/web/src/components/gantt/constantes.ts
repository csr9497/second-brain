/** Ancho de una columna (un día) y de la columna de etiquetas, en px. */
export const COL = 28;
export const ETIQUETA = 168;

/** Fondo de la cuadrícula: una línea por día. */
export const fondo = (col: number) =>
  `repeating-linear-gradient(to right, transparent 0 ${col - 1}px, color-mix(in srgb, var(--line) 45%, transparent) ${col - 1}px ${col}px)`;
