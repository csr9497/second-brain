// Puente con el plugin Swift local `LiveActivity` (apps/mobile/ios/App/App/LiveActivity/LiveActivityPlugin.swift).
// Solo existe en la app nativa; en la web cada llamada fallaría con «not implemented».
import { Capacitor, registerPlugin } from '@capacitor/core';
import type { EstadoLiveActivity } from '@sb/shared';

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

export const esNativo = () => Capacitor.isNativePlatform();

export const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');
