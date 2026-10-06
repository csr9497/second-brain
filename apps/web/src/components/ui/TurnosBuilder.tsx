import { useState } from 'react';
import { SLOT_COLOR, SLOT_NOMBRE, franjasLibres, type HabitSlot } from '@sb/shared';
import { Dot } from './Dot';

type Abierto = { kind: 'o'; turno: number } | { kind: 'turno' } | null;
const LLENO = 'Ya usaste las 3 franjas';

/** Constructor de turnos: filas unidas por "+" (y); las franjas de cada fila, por "o" (alternativas). */
export function TurnosBuilder({ value, onChange }: { value: HabitSlot[][]; onChange: (t: HabitSlot[][]) => void }) {
  const [abierto, setAbierto] = useState<Abierto>(null);
  const libres = franjasLibres(value);
  const sinLibres = libres.length === 0;
  const unaSola = value.flat().length === 1;

  // Quitar la última franja de un turno elimina el turno
  const quitar = (i: number, f: HabitSlot) =>
    onChange(value.map((t, j) => (j === i ? t.filter((x) => x !== f) : t)).filter((t) => t.length > 0));
  const elegir = (f: HabitSlot) => {
    if (abierto?.kind === 'o') onChange(value.map((t, j) => (j === abierto.turno ? [...t, f] : t)));
    else onChange([...value, [f]]);
    setAbierto(null);
  };

  const opciones = (label: (f: HabitSlot) => string) => (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5" role="group" aria-label="Franjas libres">
      {libres.map((f) => (
        <button
          key={f}
          type="button"
          aria-label={label(f)}
          onClick={() => elegir(f)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-xs font-semibold text-muted hover:border-accent hover:text-text"
        >
          <Dot color={SLOT_COLOR[f]} />
          {SLOT_NOMBRE[f]}
        </button>
      ))}
      <button type="button" onClick={() => setAbierto(null)} className="px-1 text-xs text-faint hover:text-text">
        Cancelar
      </button>
    </div>
  );

  return (
    <div>
      {value.map((turno, i) => (
        <div key={i}>
          {i > 0 && <div className="my-1 text-center text-xs font-bold text-faint" aria-hidden>+</div>}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-surface2 px-2.5 py-2">
            {turno.map((f, k) => (
              <span key={f} className="inline-flex items-center gap-1.5">
                {k > 0 && <span className="text-xs font-semibold text-faint">o</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-1 text-xs font-semibold">
                  <Dot color={SLOT_COLOR[f]} />
                  {SLOT_NOMBRE[f]}
                  <button
                    type="button"
                    aria-label={`Quitar ${SLOT_NOMBRE[f]}`}
                    title={unaSola ? 'El hábito necesita al menos una franja' : undefined}
                    disabled={unaSola}
                    onClick={() => quitar(i, f)}
                    className="text-faint hover:text-hot disabled:opacity-40"
                  >
                    ✕
                  </button>
                </span>
              </span>
            ))}
            <button
              type="button"
              disabled={sinLibres}
              title={sinLibres ? LLENO : 'Añadir una franja alternativa'}
              onClick={() => setAbierto({ kind: 'o', turno: i })}
              className="ml-auto rounded-md px-2 py-0.5 text-xs font-semibold text-muted hover:text-text disabled:opacity-40"
            >
              o…
            </button>
          </div>
          {abierto?.kind === 'o' && abierto.turno === i && opciones((f) => `Añadir ${SLOT_NOMBRE[f]} como alternativa`)}
        </div>
      ))}
      <button
        type="button"
        disabled={sinLibres}
        title={sinLibres ? LLENO : undefined}
        onClick={() => setAbierto({ kind: 'turno' })}
        className="mt-2 rounded-lg border border-dashed border-line px-2.5 py-[5px] text-xs font-semibold text-muted disabled:opacity-40"
      >
        + Añadir turno
      </button>
      {abierto?.kind === 'turno' && opciones((f) => `Añadir turno de ${SLOT_NOMBRE[f]}`)}
    </div>
  );
}
