import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Rutas relativas: sirve igual en / (local) y en /second-brain/ (GitHub Pages)
  base: './',
  server: { port: 5173 },
});
