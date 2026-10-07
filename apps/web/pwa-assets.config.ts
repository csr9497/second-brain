import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config';

// Genera favicon, pwa-64/192/512, maskable-icon-512 y apple-touch-icon-180 desde public/icon.svg
export default defineConfig({ preset: minimal2023Preset, images: ['public/icon.svg'] });
