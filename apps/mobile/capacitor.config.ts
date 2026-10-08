import type { CapacitorConfig } from '@capacitor/cli';

// La app carga el build de apps/web en modo `native` (`pnpm ios:build`)
const config: CapacitorConfig = {
  appId: 'com.csr9497.secondbrain',
  appName: 'Second Brain',
  webDir: '../web/dist',
  ios: { scheme: 'Second Brain' },
};

export default config;
