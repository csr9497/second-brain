import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    // PWA instalable; el service worker propio (src/sw/sw.ts) precachea el shell y muestra los avisos
    // En la app nativa (`--mode native`, Capacitor) no hay PWA: WKWebView no admite Web Push
    VitePWA({
      disable: mode === 'native',
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'sw.ts',
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      pwaAssets: { config: true, overrideManifestIcons: true },
      manifest: {
        name: 'Second Brain',
        short_name: 'Brain',
        lang: 'es',
        start_url: './',
        scope: './',
        display: 'standalone',
        theme_color: '#191817',
        background_color: '#191817',
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,png,svg,ico}'] },
      // En `pnpm dev` también hay SW, para probar los avisos sin hacer build
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  // Rutas relativas: sirve igual en / (local) y en /second-brain/ (GitHub Pages)
  base: './',
  server: { port: 5173 },
}));
