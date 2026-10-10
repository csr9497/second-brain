// Partes puras del puente nativo (testeables sin Capacitor ni WebKit).
import type { LiveActivityPlugin } from './liveActivity';

export type Plataforma = 'ios' | 'mac' | null;

/** `window.webkit.messageHandlers.sbMac` con respuesta (WKScriptMessageHandlerWithReply, apps/mobile/ios/App/Mac/Puente.swift). */
export interface ManejadorMac {
  postMessage(mensaje: unknown): Promise<unknown>;
}

export interface Entorno {
  capacitor: boolean;
  webkit?: { messageHandlers?: Record<string, unknown> };
}

export function detectarPlataforma(e: Entorno): Plataforma {
  if (e.capacitor) return 'ios';
  if (e.webkit?.messageHandlers?.sbMac) return 'mac';
  return null;
}

type Respuesta<M extends keyof LiveActivityPlugin> = Awaited<ReturnType<LiveActivityPlugin[M]>>;

/** Mismo contrato que el plugin de Capacitor, por mensajes a Swift. */
export function puenteMac(m: ManejadorMac): LiveActivityPlugin {
  const llamar = (metodo: string, args: object = {}) => m.postMessage({ metodo, args });
  return {
    sincronizar: async (opts) => (await llamar('sincronizar', opts)) as Respuesta<'sincronizar'>,
    guardarSesion: async (s) => void (await llamar('guardarSesion', s)),
    leerSesion: async () => ((await llamar('leerSesion')) ?? {}) as Respuesta<'leerSesion'>,
    cerrarSesion: async () => void (await llamar('cerrarSesion')),
  };
}

/** Acciones que piden los menús nativos (`window.sbAccion`). */
export interface AccionesNativas<V extends string> {
  /** false si hay un modal abierto */
  nuevaTarea: () => boolean;
  crear: () => boolean;
  /** false si Cesar decide quedarse por cambios sin guardar */
  irA: (v: V) => Promise<boolean>;
}

export async function ejecutarAccion<V extends string>(nombre: string, a: AccionesNativas<V>, vistas: readonly V[]): Promise<boolean> {
  if (nombre === 'nueva-tarea') return a.nuevaTarea();
  if (nombre === 'crear') return a.crear();
  if (nombre.startsWith('ir:')) {
    const v = vistas.find((x) => x === nombre.slice(3));
    return v ? a.irA(v) : false;
  }
  return false;
}
