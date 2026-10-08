// Service worker (vite-plugin-pwa, injectManifest): precachea el shell y muestra los avisos de
// la Edge Function `recordatorios`. Las peticiones a Supabase no se cachean.
import { cleanupOutdatedCaches, precacheAndRoute, type PrecacheEntry } from 'workbox-precaching';
import { clientsClaim } from 'workbox-core';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | PrecacheEntry)[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// registerType autoUpdate: la versión nueva toma el control sin esperar
self.skipWaiting();
clientsClaim();

interface Aviso { titulo: string; body?: string; url?: string; tag?: string }

function leer(data: PushMessageData | null): Aviso {
  try {
    return data?.json() ?? { titulo: 'Second Brain' };
  } catch {
    return { titulo: 'Second Brain', body: data?.text() };
  }
}

self.addEventListener('push', (e) => {
  const a = leer(e.data);
  e.waitUntil(
    self.registration.showNotification(a.titulo, { body: a.body, tag: a.tag, icon: 'pwa-192x192.png', data: { url: a.url ?? './#/' } }),
  );
});

// Tocar el aviso enfoca la app si está abierta (sin navegar: no saltarse la guardia de cambios) o la abre
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data as { url?: string } | null)?.url ?? './#/', self.registration.scope).href;
  e.waitUntil(
    (async () => {
      // El origen (github.io) lo comparten otros sitios: solo vale una ventana dentro del scope de la app
      const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const abierta = ventanas.find((c) => c.url.startsWith(self.registration.scope));
      if (abierta) await abierta.focus();
      else await self.clients.openWindow(url);
    })(),
  );
});
