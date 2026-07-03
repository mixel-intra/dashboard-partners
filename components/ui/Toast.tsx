'use client';

import { createContext, useCallback, useContext, useState } from 'react';

// Toasts — port del showToast() duplicado en pipeline.html y dashboard.js.
// Los estilos (.toast-container/.toast) viven en el CSS de cada página.

type ToastType = 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
  fading: boolean;
}

const ToastContext = createContext<(message: string, type?: ToastType, duration?: number) => void>(
  () => {}
);

export function useToast() {
  return useContext(ToastContext);
}

let nextId = 1;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = nextId++;
    setToasts((t) => [...t, { id, message, type, fading: false }]);
    setTimeout(() => {
      setToasts((t) => t.map((x) => (x.id === id ? { ...x, fading: true } : x)));
      setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 300);
    }, duration);
  }, []);

  const icons: Record<ToastType, string> = { success: 'checkmark-circle', error: 'alert-circle' };

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      <div id="toast-container" className="toast-container">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.type}${t.fading ? ' fade-out' : ''}`}>
            <ion-icon name={`${icons[t.type]}-outline`}></ion-icon>
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
