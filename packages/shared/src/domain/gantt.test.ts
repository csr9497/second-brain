import { describe, expect, it } from 'vitest';
import type { Step, Task } from '../index';
import {
  aplicarBorrador,
  borradorVacio,
  cambiosDelBorrador,
  estirarPaso,
  estirarTarea,
  moverPaso,
  estirarPasoMin,
  moverTarea,
  spanTarea,
  ventanaGantt,
} from './gantt';

const step = (id: string, startDate: string | null, duracionDias: number | null): Step => ({ id, taskId: 't', title: id, done: false, position: 1, startDate, duracionDias, duracionMin: null });
const task = (o: Partial<Task> = {}): Task => ({
  id: 't',
  projectId: null,
  projectName: null,
  projectColor: null,
  title: 'T',
  description: null,
  type: null,
  priority: 'media',
  status: 'por_hacer',
  startDate: '2026-10-06',
  deadline: '2026-10-09',
  minutosDia: null,
  position: 1000,
  notes: null,
  completedAt: null,
  steps: [step('s1', '2026-10-06', 2), step('s2', null, null)],
  habitIds: [],
  ...o,
});

describe('spanTarea', () => {
  it('abarca inicio, deadline y pasos', () =>
    expect(spanTarea(task({ steps: [step('s', '2026-10-08', 4)] }))).toEqual({ inicio: '2026-10-06', fin: '2026-10-11' }));
  it('sin fechas → null', () => expect(spanTarea(task({ startDate: null, deadline: null, steps: [] }))).toBeNull());
  it('solo deadline → un día', () => expect(spanTarea(task({ startDate: null, steps: [] }))).toEqual({ inicio: '2026-10-09', fin: '2026-10-09' }));
});

describe('borrador', () => {
  it('mover una tarea arrastra sus pasos programados (no los sin programar)', () => {
    const d = moverTarea(borradorVacio(), task(), 3);
    expect(d.tasks.t).toEqual({ startDate: '2026-10-09', deadline: '2026-10-12' });
    expect(d.steps).toEqual({ s1: { startDate: '2026-10-09', duracionDias: 2, duracionMin: null } });
    expect(aplicarBorrador([task()], d)[0].steps[0].startDate).toBe('2026-10-09');
  });
  it('ida y vuelta no deja cambios', () => {
    const d1 = moverTarea(borradorVacio(), task(), 3);
    const d2 = moverTarea(d1, aplicarBorrador([task()], d1)[0], -3);
    expect(cambiosDelBorrador([task()], d2)).toEqual([]);
  });
  it('estirar la tarea cambia solo el deadline y nunca antes del inicio', () => {
    expect(estirarTarea(borradorVacio(), task(), 2).tasks.t).toEqual({ startDate: '2026-10-06', deadline: '2026-10-11' });
    expect(estirarTarea(borradorVacio(), task(), -10).tasks.t.deadline).toBe('2026-10-06');
  });
  it('mover y estirar un paso (mínimo 1 día)', () => {
    const s1 = task().steps[0];
    expect(moverPaso(borradorVacio(), s1, 1).steps.s1).toEqual({ startDate: '2026-10-07', duracionDias: 2, duracionMin: null });
    expect(estirarPaso(borradorVacio(), s1, -5).steps.s1.duracionDias).toBe(1);
    expect(moverPaso(borradorVacio(), task().steps[1], 1)).toEqual(borradorVacio());
  });
  it('el resumen lista tarea y pasos y marca fuera de plazo', () => {
    const d = estirarPaso(borradorVacio(), task().steps[0], 5); // 6 oct + 7 días → 12 oct > deadline 9 oct
    const c = cambiosDelBorrador([task()], d);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ tipo: 'paso', id: 's1', tarea: 'T', fueraDePlazo: true, antes: { duracionDias: 2 }, despues: { duracionDias: 7 } });
  });
});

describe('ventanaGantt', () => {
  it('hoy −7 a hoy +56, ampliada para cubrir las tareas', () => {
    expect(ventanaGantt([], '2026-10-06')).toEqual({ inicio: '2026-09-29', fin: '2026-12-01', dias: 64 });
    const v = ventanaGantt([task({ startDate: '2026-09-01', deadline: '2026-09-03', steps: [] })], '2026-10-06');
    expect(v.inicio).toBe('2026-08-30');
  });
});

describe('pasos por tiempo en el Gantt', () => {
  const h = (duracionMin: number): Step => ({ ...step('h', '2026-10-06', 1), duracionMin });
  it('estirar de 15 en 15 min: mínimo 15 min y máximo 24 h', () => {
    expect(estirarPasoMin(borradorVacio(), h(60), 2).steps.h.duracionMin).toBe(90);
    expect(estirarPasoMin(borradorVacio(), h(60), -10).steps.h.duracionMin).toBe(15);
    expect(estirarPasoMin(borradorVacio(), h(1430), 4).steps.h.duracionMin).toBe(1440);
  });
  it('estirar por días no cambia un paso por tiempo, y moverlo de día conserva el tiempo', () => {
    expect(estirarPaso(borradorVacio(), h(60), 2)).toEqual(borradorVacio());
    expect(moverPaso(borradorVacio(), h(60), 1).steps.h).toMatchObject({ startDate: '2026-10-07', duracionDias: 1, duracionMin: 60 });
  });
  it('el resumen detecta un cambio solo de tiempo', () => {
    const t = { ...task(), steps: [{ ...h(60), id: 's1' }] };
    expect(cambiosDelBorrador([t], estirarPasoMin(borradorVacio(), t.steps[0], 1))).toMatchObject([{ id: 's1', despues: { duracionMin: 75 } }]);
  });
});
