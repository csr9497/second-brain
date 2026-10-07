import { describe, expect, it } from 'vitest';
import type { HabitChip, HabitSlot, Task, TodayPayload } from '../index';
import { esquemaJson, HERRAMIENTAS, validarEntrada } from '../herramientas';
import { detallarTarea, resolverMarcaHabito, resumirHoy, resumirTarea } from './agente';

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
    { id: 's1', taskId: 't1', title: 'Leer', done: true, startDate: '2026-10-05', duracionDias: 1, position: 1 },
    { id: 's2', taskId: 't1', title: 'Escribir', done: false, startDate: '2026-10-06', duracionDias: 3, position: 2 },
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
  it('15 herramientas con JSON Schema de objeto y nombres únicos', () => {
    const defs = Object.values(HERRAMIENTAS);
    expect(defs).toHaveLength(15);
    expect(new Set(defs.map((d) => d.name)).size).toBe(15);
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
