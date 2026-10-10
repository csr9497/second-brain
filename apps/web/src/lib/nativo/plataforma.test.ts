import { describe, expect, it, vi } from 'vitest';
import { avisosMac, detectarPlataforma, ejecutarAccion, puenteMac } from './plataforma';

describe('detectarPlataforma', () => {
  it('Capacitor nativo es iOS', () => {
    expect(detectarPlataforma({ capacitor: true })).toBe('ios');
  });
  it('el manejador sbMac es la Mac', () => {
    expect(detectarPlataforma({ capacitor: false, webkit: { messageHandlers: { sbMac: { postMessage: vi.fn() } } } })).toBe('mac');
  });
  it('sin nada, la web', () => {
    expect(detectarPlataforma({ capacitor: false })).toBeNull();
    expect(detectarPlataforma({ capacitor: false, webkit: { messageHandlers: {} } })).toBeNull();
  });
});

describe('puenteMac', () => {
  it('manda metodo y args y devuelve la respuesta', async () => {
    const postMessage = vi.fn().mockResolvedValue({ activa: true, id: null });
    const p = puenteMac({ postMessage });
    await expect(p.sincronizar({ estado: null })).resolves.toEqual({ activa: true, id: null });
    expect(postMessage).toHaveBeenCalledWith({ metodo: 'sincronizar', args: { estado: null } });
  });
  it('leerSesion sin respuesta es {}', async () => {
    const p = puenteMac({ postMessage: vi.fn().mockResolvedValue(null) });
    await expect(p.leerSesion()).resolves.toEqual({});
  });
  it('un error de Swift rechaza', async () => {
    const p = puenteMac({ postMessage: vi.fn().mockRejectedValue(new Error('KEYCHAIN')) });
    await expect(p.cerrarSesion()).rejects.toThrow('KEYCHAIN');
  });
});

describe('ejecutarAccion', () => {
  const acciones = () => ({ nuevaTarea: vi.fn(() => true), crear: vi.fn(() => true), irA: vi.fn(async () => true) });
  const vistas = ['hoy', 'calendario'] as const;
  it('nueva-tarea y crear', async () => {
    const a = acciones();
    await expect(ejecutarAccion('nueva-tarea', a, vistas)).resolves.toBe(true);
    await expect(ejecutarAccion('crear', a, vistas)).resolves.toBe(true);
    expect(a.nuevaTarea).toHaveBeenCalled();
    expect(a.crear).toHaveBeenCalled();
  });
  it('ir:vista solo con vistas conocidas', async () => {
    const a = acciones();
    await expect(ejecutarAccion('ir:calendario', a, vistas)).resolves.toBe(true);
    expect(a.irA).toHaveBeenCalledWith('calendario');
    await expect(ejecutarAccion('ir:nada', a, vistas)).resolves.toBe(false);
    await expect(ejecutarAccion('otra', a, vistas)).resolves.toBe(false);
  });
});

describe('avisosMac', () => {
  it('manda los avisos a Swift', async () => {
    const postMessage = vi.fn().mockResolvedValue({ programados: 1 });
    const aviso = { id: '2026-10-01-tarde', franja: 'tarde' as const, cuando: '2026-10-01T22:00:00.000Z', titulo: 'Tarde · te falta 1', cuerpo: 'Agua', habitos: [], fecha: '2026-10-01' };
    await expect(avisosMac({ postMessage }).programar([aviso])).resolves.toEqual({ programados: 1 });
    expect(postMessage).toHaveBeenCalledWith({ metodo: 'programarAvisos', args: { avisos: [aviso] } });
  });
});
