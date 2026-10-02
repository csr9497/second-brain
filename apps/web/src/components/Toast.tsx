import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const ToastCtx = createContext<(msg: string) => void>(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const timer = useRef<number>(undefined);
  const say = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMsg(null), 1700);
  }, []);
  return (
    <ToastCtx.Provider value={say}>
      {children}
      <div
        role="status"
        className={`fixed left-1/2 bottom-5 z-60 -translate-x-1/2 rounded-full bg-text px-4 py-2.5 text-[13px] font-medium text-bg transition duration-250 pointer-events-none ${msg ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'}`}
      >
        {msg}
      </div>
    </ToastCtx.Provider>
  );
}
