// Orden manual con `position numeric`: al mover un elemento se le asigna el punto
// medio entre sus nuevos vecinos, sin renumerar la lista.
export const POSITION_GAP = 1000;

/**
 * @param prev posición del vecino que queda ANTES (arriba), si existe
 * @param next posición del vecino que queda DESPUÉS (abajo), si existe
 */
export function positionBetween(prev?: number | null, next?: number | null): number {
  if (prev != null && next != null) return (prev + next) / 2;
  if (prev != null) return prev + POSITION_GAP;
  if (next != null) return next - POSITION_GAP;
  return POSITION_GAP;
}
