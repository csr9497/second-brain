import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { jornadaSchema, type Jornada } from '@sb/shared';
import { api } from '../lib/api';
import { useToast } from './Toast';

const linkBtn = 'text-xs font-semibold text-muted hover:text-text disabled:opacity-50';

const CAMPOS: { clave: keyof Jornada; etiqueta: string; ayuda?: string }[] = [
  { clave: 'horaTarde', etiqueta: 'Tarde desde' },
  { clave: 'horaNoche', etiqueta: 'Noche desde' },
  { clave: 'finDia', etiqueta: 'El día termina', ayuda: 'Hasta esta hora, lo que marques cuenta para la noche del día anterior.' },
];

/** Horas de las franjas y fin del día (tabla `jornada`). Al guardar, todo se recalcula con la nueva jornada. */
export function JornadaForm() {
  const toast = useToast();
  const qc = useQueryClient();
  const actual = useQuery({ queryKey: ['jornada'], queryFn: api.jornada, staleTime: Infinity });
  const [abierto, setAbierto] = useState(false);
  const [form, setForm] = useState<Jornada | null>(null);
  useEffect(() => {
    if (actual.data && !form) setForm(actual.data);
  }, [actual.data, form]);

  const guardar = useMutation({
    mutationFn: api.guardarJornada,
    onSuccess: (_r, j) => {
      qc.setQueryData(['jornada'], j);
      // «Hoy», la franja actual, el calendario y los resúmenes dependen de la jornada
      void qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'jornada' });
      toast('✓ Franjas guardadas');
    },
    onError: (err) => toast(`⚠ ${err.message}`),
  });

  const valida = form ? jornadaSchema.safeParse(form) : null;
  const error = valida && !valida.success ? valida.error.issues[0]?.message : null;
  const cambiado = form && actual.data && JSON.stringify(form) !== JSON.stringify(actual.data);

  return (
    <section className="mt-4 border-t border-line pt-3">
      <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className={linkBtn}>
        {abierto ? '▾' : '▸'} Franjas del día
        {actual.data && (
          <span className="ml-2 font-normal text-faint">
            mañana · {actual.data.horaTarde} tarde · {actual.data.horaNoche} noche · fin {actual.data.finDia}
          </span>
        )}
      </button>
      {abierto && form && (
        <form
          className="mt-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (valida?.success) guardar.mutate(valida.data);
          }}
        >
          {CAMPOS.map(({ clave, etiqueta, ayuda }) => (
            <div key={clave} className="mb-2">
              <div className="flex items-center gap-2">
                <span className="w-32 text-sm">{etiqueta}</span>
                <input
                  type="time"
                  step={900}
                  required
                  className="input w-32"
                  aria-label={etiqueta}
                  value={form[clave]}
                  max={clave === 'finDia' ? '06:00' : undefined}
                  onChange={(e) => setForm({ ...form, [clave]: e.target.value.slice(0, 5) })}
                />
              </div>
              {ayuda && <p className="mt-1 mb-0 text-[11.5px] text-faint">{ayuda}</p>}
            </div>
          ))}
          <p className="mt-1 mb-2 text-[11.5px] text-faint">La mañana empieza cuando termina el día. Horas en pasos de 15 min.</p>
          {error && <p className="m-0 mb-2 text-[12.5px] text-hot">{error}</p>}
          <button type="submit" className="btn btn-primary px-3 py-1.5 text-xs" disabled={!cambiado || !!error || guardar.isPending}>
            Guardar franjas
          </button>
        </form>
      )}
    </section>
  );
}
