import { describe, expect, it } from 'vitest';
import type { HabitChip, HabitSlot, Task, TodayPayload } from '../index';
import { esquemaJson, HERRAMIENTAS, validarEntrada } from '../herramientas';
import { detallarTarea, encadenarTarea, programarPaso, reordenarPasos, resolverMarcaHabito, resumirHoy, resumirTarea } from './agente';

const ficha = (id: string, slot: HabitSlot, turno: HabitSlot[], doneIn: HabitSlot | null = null): HabitChip => ({
  id,
  nombre: id,
  position: 1,
  slot,
  turno,
  done: doneIn != null,
  doneIn,
});

/** Inglés: Mañana + (Tarde o Noche). Leer: solo noche. Correr: semanal. */
const hoy = (o: { manana?: HabitSlot | null; tardeNoche?: HabitSlot | null; leer?: boolean; correr?: boolean } = {}): TodayPayload => {
  const ingles = (slot: HabitSlot, turno: HabitSlot[], doneIn: HabitSlot | null | undefined) => ficha('ingles', slot, turno, doneIn ?? null);
  return {
    date: '2026-10-07',
    habits: {
      slotActual: 'tarde',
      porFranja: {
        manana: [ingles('manana', ['manana'], o.manana)],
        tarde: [ingles('tarde', ['tarde', 'noche'], o.tardeNoche)],
        noche: [ingles('noche', ['tarde', 'noche'], o.tardeNoche), ficha('leer', 'noche', ['noche'], o.leer ? 'noche' : null)],
      },
      pctDia: 0,
      streak: 2,
      semanales: [{ id: 'correr', nombre: 'Correr', position: 3, meta: 3, hechas: o.correr ? 1 : 0, hoy: !!o.correr }],
    },
    tasks: { hoy: [], semana: [], todas: [], incumplimiento: [] },
    projects: [],
  };
};

describe('resolverMarcaHabito', () => {
  it('marcar sin franja usa el turno pendiente de la franja actual', () => {
    expect(resolverMarcaHabito(hoy(), 'ingles', true)).toEqual({ marca: { id: 'ingles', slot: 'tarde', turno: ['tarde', 'noche'], done: false } });
  });
  it('con franja explícita marca ese turno en esa franja', () => {
    expect(resolverMarcaHabito(hoy(), 'ingles', true, 'noche')).toEqual({ marca: { id: 'ingles', slot: 'noche', turno: ['tarde', 'noche'], done: false } });
    expect(resolverMarcaHabito(hoy(), 'ingles', true, 'manana')).toEqual({ marca: { id: 'ingles', slot: 'manana', turno: ['manana'], done: false } });
  });
  it('si el turno de la franja actual ya está hecho, toma el primero pendiente', () => {
    expect(resolverMarcaHabito(hoy({ tardeNoche: 'tarde' }), 'ingles', true)).toEqual({ marca: { id: 'ingles', slot: 'manana', turno: ['manana'], done: false } });
  });
  it('fuera de la franja actual usa la primera franja del turno', () => {
    expect(resolverMarcaHabito(hoy(), 'leer', true)).toEqual({ marca: { id: 'leer', slot: 'noche', turno: ['noche'], done: false } });
  });
  it('es idempotente: todo hecho o nada marcado → nada', () => {
    expect(resolverMarcaHabito(hoy({ manana: 'manana', tardeNoche: 'noche' }), 'ingles', true)).toHaveProperty('nada');
    expect(resolverMarcaHabito(hoy({ tardeNoche: 'noche' }), 'ingles', true, 'tarde')).toHaveProperty('nada');
    expect(resolverMarcaHabito(hoy(), 'ingles', false)).toHaveProperty('nada');
  });
  it('desmarcar: un turno hecho se desmarca en la franja donde se hizo; con varios pide franja', () => {
    expect(resolverMarcaHabito(hoy({ tardeNoche: 'noche' }), 'ingles', false)).toEqual({ marca: { id: 'ingles', slot: 'noche', turno: ['tarde', 'noche'], done: true } });
    expect(resolverMarcaHabito(hoy({ manana: 'manana', tardeNoche: 'noche' }), 'ingles', false)).toHaveProperty('error');
    expect(resolverMarcaHabito(hoy({ manana: 'manana', tardeNoche: 'noche' }), 'ingles', false, 'tarde')).toEqual({
      marca: { id: 'ingles', slot: 'noche', turno: ['tarde', 'noche'], done: true },
    });
  });
  it('franja que el hábito no tiene o id desconocido → error', () => {
    expect(resolverMarcaHabito(hoy(), 'leer', true, 'manana')).toHaveProperty('error');
    expect(resolverMarcaHabito(hoy(), 'nope', true)).toHaveProperty('error');
  });
  it('semanal: una marca por día en la franja actual, idempotente', () => {
    expect(resolverMarcaHabito(hoy(), 'correr', true)).toEqual({ marca: { id: 'correr', slot: 'tarde', turno: ['manana', 'tarde', 'noche'], done: false } });
    expect(resolverMarcaHabito(hoy({ correr: true }), 'correr', true)).toHaveProperty('nada');
    expect(resolverMarcaHabito(hoy({ correr: true }), 'correr', false)).toEqual({ marca: { id: 'correr', slot: 'tarde', turno: ['manana', 'tarde', 'noche'], done: true } });
  });
});

const tarea: Task = {
  id: 't1',
  projectId: null,
  projectName: 'Tesis',
  projectColor: null,
  title: 'Capítulo 2',
  description: null,
  type: null,
  priority: 'alta',
  status: 'en_curso',
  startDate: '2026-10-05',
  deadline: '2026-10-06',
  position: 1,
  notes: null,
  completedAt: null,
  steps: [
    { id: 's1', taskId: 't1', title: 'Leer', done: true, startDate: '2026-10-05', duracionDias: 1, duracionMin: null, position: 1 },
    { id: 's2', taskId: 't1', title: 'Escribir', done: false, startDate: '2026-10-06', duracionDias: 3, duracionMin: null, position: 2 },
  ],
  habitIds: ['leer'],
};

describe('resúmenes', () => {
  it('resumirTarea: vencida y avance de pasos', () => {
    expect(resumirTarea(tarea, '2026-10-07')).toMatchObject({ id: 't1', vencida: true, pasos: '1/2', proyecto: 'Tesis', habitIds: ['leer'] });
  });
  it('detallarTarea: pasos con fin y fuera de plazo, hábitos por nombre', () => {
    const d = detallarTarea(tarea, '2026-10-07', [{ id: 'leer', nombre: 'Leer' }]);
    expect(d.pasos[1]).toMatchObject({ id: 's2', fin: '2026-10-08', fueraDePlazo: true });
    expect(d.habitos).toEqual([{ id: 'leer', nombre: 'Leer' }]);
  });
  it('resumirHoy: fichas con turno y semanales', () => {
    const r = resumirHoy(hoy({ tardeNoche: 'noche' }));
    expect(r.franjaActual).toBe('tarde');
    expect(r.habitosPorFranja.tarde[0]).toEqual({ id: 'ingles', nombre: 'ingles', turno: ['tarde', 'noche'], hecho: true, hechoEn: 'noche' });
    expect(r.habitosSemanales[0]).toMatchObject({ id: 'correr', meta: 3 });
  });
});

describe('catálogo de herramientas', () => {
  it('24 herramientas con JSON Schema de objeto y nombres únicos', () => {
    const defs = Object.values(HERRAMIENTAS);
    expect(defs).toHaveLength(24);
    expect(new Set(defs.map((d) => d.name)).size).toBe(24);
    expect(defs.filter((d) => d.interfaz).map((d) => d.name)).toEqual(['open_task', 'open_new_task', 'go_to']);
    for (const d of defs) expect(esquemaJson(d)).toMatchObject({ type: 'object' });
  });
  it('create_task: los defaults no son obligatorios en la entrada', () => {
    const s = esquemaJson(HERRAMIENTAS.create_task) as { required?: string[] };
    expect(s.required).toEqual(['title']);
  });
  it('validarEntrada da un error legible', () => {
    const r = validarEntrada('set_task_done', { id: 'x' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/Entrada no válida/);
    expect(validarEntrada('create_task', { title: 'Hola' })).toMatchObject({ ok: true, datos: { title: 'Hola', priority: 'media', steps: [], habitIds: [] } });
  });
});

describe('programarPaso', () => {
  const nada = { startDate: null, duracionDias: null, duracionMin: null };
  const porDias = { startDate: '2026-10-07', duracionDias: 3, duracionMin: null };
  const porTiempo = { startDate: '2026-10-07', duracionDias: 1, duracionMin: 90 };
  it('solo inicio → 1 día; con minutos → por tiempo en un día', () => {
    expect(programarPaso(nada, { startDate: '2026-10-07' })).toEqual({ startDate: '2026-10-07', duracionDias: 1, duracionMin: null });
    expect(programarPaso(nada, { startDate: '2026-10-07', duracionDias: 4, duracionMin: 30 })).toEqual({ startDate: '2026-10-07', duracionDias: 1, duracionMin: 30 });
  });
  it('duración sin inicio → error; sin nada → sin programar', () => {
    expect(programarPaso(nada, { duracionMin: 30 })).toHaveProperty('error');
    expect(programarPaso(nada, {})).toEqual(nada);
  });
  it('cambiar solo la fecha conserva el tipo; días ↔ minutos cambia de tipo; startDate null lo desprograma', () => {
    expect(programarPaso(porTiempo, { startDate: '2026-10-09' })).toEqual({ ...porTiempo, startDate: '2026-10-09' });
    expect(programarPaso(porDias, { startDate: '2026-10-09' })).toEqual({ ...porDias, startDate: '2026-10-09' });
    expect(programarPaso(porTiempo, { duracionDias: 2 })).toEqual({ startDate: '2026-10-07', duracionDias: 2, duracionMin: null });
    expect(programarPaso(porDias, { duracionMin: 45 })).toEqual({ startDate: '2026-10-07', duracionDias: 1, duracionMin: 45 });
    expect(programarPaso(porDias, { startDate: null })).toEqual(nada);
  });
});

describe('reordenarPasos', () => {
  const pasos = [
    { id: 'a', position: 1000 },
    { id: 'b', position: 2000 },
    { id: 'c', position: 3000 },
  ];
  it('mueve solo los que quedan desordenados', () => {
    expect(reordenarPasos(pasos, ['a', 'b', 'c'])).toEqual([]);
    const r = reordenarPasos(pasos, ['b', 'c', 'a']);
    expect(r).toEqual([{ id: 'a', position: 4000 }]);
  });
  it('el orden resultante es el pedido', () => {
    const r = reordenarPasos(pasos, ['c', 'a', 'b']) as { id: string; position: number }[];
    const pos = new Map(pasos.map((p) => [p.id, p.position]));
    for (const c of r) pos.set(c.id, c.position);
    expect([...pos.entries()].sort((x, y) => x[1] - y[1]).map(([id]) => id)).toEqual(['c', 'a', 'b']);
  });
  it('exige exactamente los pasos de la tarea', () => {
    expect(reordenarPasos(pasos, ['a', 'b'])).toHaveProperty('error');
    expect(reordenarPasos(pasos, ['a', 'b', 'b'])).toHaveProperty('error');
    expect(reordenarPasos(pasos, ['a', 'b', 'x'])).toHaveProperty('error');
  });
});

describe('encadenarTarea', () => {
  it('encadena los pendientes desde la fecha; por tiempo en el mismo día', () => {
    const t = {
      ...tarea,
      steps: [
        { ...tarea.steps[0], done: true },
        { ...tarea.steps[1], duracionDias: 2, duracionMin: null },
        { id: 's3', taskId: 't1', title: 'Revisar', done: false, startDate: null, duracionDias: null, duracionMin: 60, position: 3 },
        { id: 's4', taskId: 't1', title: 'Enviar', done: false, startDate: null, duracionDias: null, duracionMin: 30, position: 4 },
      ],
    };
    expect(encadenarTarea(t, '2026-10-12').map((s) => [s.id, s.startDate, s.duracionDias, s.duracionMin])).toEqual([
      ['s2', '2026-10-12', 2, null],
      ['s3', '2026-10-14', 1, 60],
      ['s4', '2026-10-14', 1, 30],
    ]);
  });
});
