import { useEffect, useRef } from 'react';
import { accionDeTecla, siguienteIndice } from './atajos';
import { listaVistas, type Vista } from './useVista';

export interface AccionesAtajos {
  nuevaTarea: () => void;
  crear: () => void;
  irA: (v: Vista) => void;
  ayuda: () => void;
  hayModal: boolean;
}

const enCampo = (el: Element | null) =>
  el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || (el instanceof HTMLElement && el.isContentEditable);

/** Lo que se recorre con j/k: los botones de marcar visibles (hábitos y tareas), en orden de la página. */
const elegibles = () => [...document.querySelectorAll<HTMLElement>('[data-atajo="marcar"]')].filter((el) => el.offsetParent !== null);

/**
 * Atajos de teclado (`lib/atajos.ts`, lista en la ayuda «?»). Los elementos se marcan con `data-atajo="marcar"` (el
 * botón ✓ o la burbuja), `data-atajo="editar"` y `data-fila` (la fila que agrupa ambos).
 */
export function useAtajos(acciones: AccionesAtajos) {
  const actuales = useRef(acciones);
  actuales.current = acciones;

  useEffect(() => {
    const alPulsar = (e: KeyboardEvent) => {
      const a = actuales.current;
      const accion = accionDeTecla({ key: e.key, metaKey: e.metaKey, ctrlKey: e.ctrlKey, altKey: e.altKey, enCampo: enCampo(document.activeElement), hayModal: a.hayModal });
      if (!accion) return;
      const activo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      switch (accion.tipo) {
        case 'nueva-tarea': a.nuevaTarea(); break;
        case 'crear': a.crear(); break;
        case 'ayuda': a.ayuda(); break;
        case 'vista': a.irA(listaVistas[accion.indice]); break;
        case 'mover': {
          const lista = elegibles();
          const i = siguienteIndice(activo ? lista.indexOf(activo) : -1, lista.length, accion.paso);
          lista[i]?.focus();
          lista[i]?.scrollIntoView({ block: 'nearest' });
          break;
        }
        case 'marcar':
          if (activo?.dataset.atajo !== 'marcar') return;
          activo.click();
          break;
        case 'editar': {
          const editar = activo?.closest('[data-fila]')?.querySelector<HTMLElement>('[data-atajo="editar"]');
          if (!editar) return;
          editar.click();
          break;
        }
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, []);
}
