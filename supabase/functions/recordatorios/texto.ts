// Texto de los avisos por franja. Sin dependencias: lo importa también el test de contrato de @sb/shared
// (packages/shared/src/domain/avisos.test.ts), que comprueba que coincide con `textoAviso` de la app de Mac.
export type Franja = 'manana' | 'tarde' | 'noche';

const FRANJA: Record<Franja, string> = { manana: 'Mañana', tarde: 'Tarde', noche: 'Noche' };

/** «Tarde · te faltan 2» / «Agua, Leer»; hasta 4 nombres y luego +n. */
export function textoAviso(franja: Franja, habitos: string[]): { titulo: string; cuerpo: string } {
  const n = habitos.length;
  const cuerpo = n > 4 ? `${habitos.slice(0, 4).join(', ')} +${n - 4}` : habitos.join(', ');
  return { titulo: `${FRANJA[franja]} · te falta${n === 1 ? '' : 'n'} ${n}`, cuerpo };
}
