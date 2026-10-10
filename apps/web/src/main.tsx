import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { GC_TIME, persistencia } from './lib/persistencia';
import { App } from './App';
import { ToastProvider } from './components/Toast';
import './index.css';

const queryClient = new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 10_000, gcTime: GC_TIME } } });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistencia}>
      <ToastProvider>
        <App />
      </ToastProvider>
    </PersistQueryClientProvider>
  </StrictMode>,
);
