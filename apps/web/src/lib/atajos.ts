// Atajos de teclado de la web (y de la app de Mac, que la carga). Parte pura: qué acción toca a cada tecla.

export type AccionAtajo =
  | { tipo: 'nueva-tarea' }
  | { tipo: 'crear' }
  | { tipo: 'vista'; indice: number }
  | { tipo: 'mover'; paso: 1 | -1 }
  | { tipo: 'marcar' }
  | { tipo: 'editar' }
  | { tipo: 'ayuda' };

export interface Tecla {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  /** El foco está en un campo de texto (input, textarea, contenteditable): las letras son para escribir. */
  enCampo: boolean;
  /** Hay un modal abierto: los atajos no lo pisan. */
  hayModal: boolean;
}

/** Lista para la ayuda (`?`). */
export const ATAJOS: [string, string][] = [
  ['n', 'Nueva tarea'],
  ['c', 'Crear (tarea, captura, hábito, proyecto)'],
  ['1 – 4', 'Hoy, Calendario, Gantt, Resumen'],
  ['j / k', 'Siguiente / anterior (hábitos y tareas)'],
  ['x', 'Marcar o desmarcar el elegido'],
  ['e', 'Editar la tarea elegida'],
  ['?', 'Esta ayuda'],
];

export function accionDeTecla(t: Tecla): AccionAtajo | null {
  if (t.metaKey || t.ctrlKey || t.altKey || t.enCampo || t.hayModal) return null;
  switch (t.key) {
    case 'n': return { tipo: 'nueva-tarea' };
    case 'c': return { tipo: 'crear' };
    case 'j': return { tipo: 'mover', paso: 1 };
    case 'k': return { tipo: 'mover', paso: -1 };
    case 'x': return { tipo: 'marcar' };
    case 'e': return { tipo: 'editar' };
    case '?': return { tipo: 'ayuda' };
  }
  if (/^[1-4]$/.test(t.key)) return { tipo: 'vista', indice: Number(t.key) - 1 };
  return null;
}

/** Índice del siguiente elemento al moverse `paso` desde `actual` (-1 = ninguno elegido), sin dar la vuelta. */
export function siguienteIndice(actual: number, total: number, paso: 1 | -1): number {
  if (total === 0) return -1;
  if (actual < 0) return paso === 1 ? 0 : total - 1;
  return Math.min(total - 1, Math.max(0, actual + paso));
}
