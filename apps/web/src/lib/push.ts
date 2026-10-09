// Web Push en este dispositivo: soporte, permiso y suscripción del service worker (src/sw/sw.ts).
// En iPhone/iPad solo hay push con la app instalada en la pantalla de inicio (iOS 16.4+).
// En la app nativa (Capacitor) no hay service worker ni Web Push: 'nativo'.
import { esNativo } from './nativo/liveActivity';

export type EstadoPush = 'nativo' | 'sin-soporte' | 'instalar' | 'bloqueado' | 'inactivo' | 'activo';

const esIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalada = () => matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
const haySoporte = () => !esNativo() && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

export async function estadoPush(): Promise<EstadoPush> {
  if (esNativo()) return 'nativo';
  if (esIOS() && !instalada()) return 'instalar';
  if (!haySoporte()) return 'sin-soporte';
  if (Notification.permission === 'denied') return 'bloqueado';
  return (await suscripcionActual()) ? 'activo' : 'inactivo';
}

/** Endpoint de este dispositivo si está suscrito (para marcarlo en la lista). */
export const endpointActual = async () => (haySoporte() ? ((await suscripcionActual())?.endpoint ?? null) : null);

function base64UrlABytes(s: string) {
  const b = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

function mismaClave(a: ArrayBuffer | null, b: Uint8Array) {
  if (!a || a.byteLength !== b.length) return false;
  const x = new Uint8Array(a);
  return x.every((v, i) => v === b[i]);
}

/** Pide permiso (debe venir de un clic) y suscribe este dispositivo. */
export async function suscribir(): Promise<PushSubscriptionJSON> {
  if (!haySoporte()) throw new Error('Este dispositivo no admite avisos push');
  const clave = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!clave) throw new Error('Falta VITE_VAPID_PUBLIC_KEY');
  if ((await Notification.requestPermission()) !== 'granted') throw new Error('No diste permiso para notificaciones');
  const reg = await navigator.serviceWorker.ready;
  const key = base64UrlABytes(clave);
  const previa = await reg.pushManager.getSubscription();
  // Una suscripción hecha con otra clave VAPID (rotada, o de otro ambiente en el mismo origen) daría 403 en cada envío
  if (previa && !mismaClave(previa.options.applicationServerKey, key)) await previa.unsubscribe();
  else if (previa) return previa.toJSON();
  return (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })).toJSON();
}

/** Anula la suscripción de este dispositivo; devuelve su endpoint (para borrar la fila) o null. */
export async function desuscribir(): Promise<string | null> {
  if (!haySoporte()) return null;
  const sub = await suscripcionActual();
  if (!sub) return null;
  await sub.unsubscribe();
  return sub.endpoint;
}
