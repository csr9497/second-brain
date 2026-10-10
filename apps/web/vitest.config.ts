import { defineConfig } from 'vitest/config';

// Solo funciones puras (sin DOM ni plugins de Vite)
export default defineConfig({ test: { include: ['src/**/*.test.ts'] } });
