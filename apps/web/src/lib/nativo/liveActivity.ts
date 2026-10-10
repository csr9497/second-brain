// Puente con la parte nativa: en iOS, el plugin Swift local `LiveActivity`
// (apps/mobile/ios/App/App/LiveActivity/LiveActivityPlugin.swift); en la Mac, los mensajes `sbMac`
// (apps/mobile/ios/App/Mac/Puente.swift). En la web cada llamada fallaría con «not implemented».
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { EstadoLiveActivity } from '@sb/shared';
import { detectarPlataforma, puenteMac, type ManejadorMac } from './plataforma';

export interface SesionNativa {
  url: string;
  anonKey: string;
  accessToken: string;
  refreshToken: string;
}

export interface LiveActivityPlugin {
  /** Crea o actualiza la actividad; con `estado` null la termina. */
  sincronizar(opts: { estado: EstadoLiveActivity | null }): Promise<{ activa: boolean; id: string | null }>;
  /** Guarda la sesión en el Keychain para los botones de la card. */
  guardarSesion(sesion: SesionNativa): Promise<void>;
  /** Lee la sesión del Keychain (puede haberla renovado un botón de la card); `{}` si no hay. */
  leerSesion(): Promise<Partial<Pick<SesionNativa, 'url' | 'accessToken' | 'refreshToken'>>>;
  /** Borra la sesión del Keychain y termina la actividad. */
  cerrarSesion(): Promise<void>;
}

type ConWebkit = { webkit?: { messageHandlers?: Record<string, unknown> } };
const webkit = () => (window as unknown as ConWebkit).webkit;

/** 'ios' (Capacitor), 'mac' (SecondBrainMac, apps/mobile/ios/App/Mac) o null (navegador). */
export const plataformaNativa = () => detectarPlataforma({ capacitor: Capacitor.isNativePlatform(), webkit: webkit() });

export const esNativo = () => plataformaNativa() !== null;

export const LiveActivity: LiveActivityPlugin =
  plataformaNativa() === 'mac'
    ? puenteMac(webkit()!.messageHandlers!.sbMac as ManejadorMac)
    : registerPlugin<LiveActivityPlugin>('LiveActivity');
