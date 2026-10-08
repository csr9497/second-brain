import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { shortDate } from '../../lib/format';
import { useToast } from '../Toast';
import { MapaCalor } from './MapaCalor';
import { ReporteTabs } from './ReporteTabs';

type Periodo = 'semana' | 'mes';

export function ResumenView() {
  const [periodo, setPeriodo] = useState<Periodo>('semana');
  return (
    <section className="mt-6">
      <div role="tablist" aria-label="Periodo" className="mb-4 flex gap-1 rounded-lg bg-surface2 p-0.5">
        {(['semana', 'mes'] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="tab"
            id={`resumen-tab-${p}`}
            aria-controls={periodo === p ? `resumen-panel-${p}` : undefined}
            aria-selected={periodo === p}
            onClick={() => setPeriodo(p)}
            className="flex-1 rounded-md px-3 py-1.5 text-xs font-semibold text-muted aria-selected:bg-surface aria-selected:text-text aria-selected:shadow-sm"
          >
            {p === 'semana' ? 'Semana' : 'Mes'}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`resumen-panel-${periodo}`} aria-labelledby={`resumen-tab-${periodo}`}>
        {periodo === 'semana' ? <Semana /> : <Mes />}
      </div>
    </section>
  );
}

function Semana() {
  const toast = useToast();
  const qc = useQueryClient();
  const [nota, setNota] = useState('');
  const { data: r, error, isLoading } = useQuery({ queryKey: ['review'], queryFn: api.currentReview });
  const archive = useMutation({
    mutationFn: () => api.archiveReview(nota),
    onSuccess: () => {
      toast('📝 Semana archivada');
      setNota('');
      qc.invalidateQueries({ queryKey: ['review'] });
    },
    onError: (err) => toast(`⚠ ${err.message}`),
  });

  if (error) return <div className="card text-sm text-hot">No se pudo cargar: {error.message}</div>;
  if (isLoading || !r) return <p className="text-sm text-muted">Calculando…</p>;
  return (
    <>
      <h2 className="m-0 mb-3 font-display text-lg font-semibold">
        Semana · {shortDate(r.weekStart)} – {shortDate(r.weekEnd)}
      </h2>
      <ReporteTabs r={r} id="semana" />
      {r.archived && <div className="py-[5px] text-[13px] text-muted">✓ Esta semana ya está archivada (archivar de nuevo la actualiza).</div>}
      <label className="mt-4 block">
        <span className="field-label">Nota de cierre (opcional)</span>
        <textarea
          className="input min-h-14 resize-y"
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Un aprendizaje o ajuste para la próxima semana…"
        />
      </label>
      <div className="mt-3 flex justify-end">
        <button className="btn btn-primary" disabled={archive.isPending} onClick={() => archive.mutate()}>
          Archivar semana
        </button>
      </div>
    </>
  );
}

function Mes() {
  const { data: r, error, isLoading } = useQuery({ queryKey: ['resumen', 'mes'], queryFn: api.monthlyReport });
  if (error) return <div className="card text-sm text-hot">No se pudo cargar: {error.message}</div>;
  if (isLoading || !r) return <p className="text-sm text-muted">Calculando…</p>;
  return (
    <>
      <h2 className="m-0 mb-3 font-display text-lg font-semibold">
        Mes · {shortDate(r.monthStart)} – {shortDate(r.monthEnd)}
      </h2>
      <MapaCalor dias={r.dias} />
      <div className="mt-5">
        <ReporteTabs r={r} id="mes" periodo="mes" />
      </div>
    </>
  );
}
