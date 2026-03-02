import { useCallback, useState } from 'react';
import { makeUuid } from '../lib/id';

export type ToastVariant = 'default' | 'danger' | 'warning';

export interface AppToast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export function useToastState(): {
  toasts: AppToast[];
  toast: (payload: Omit<AppToast, 'id'>) => void;
  dismiss: (id: string) => void;
} {
  const [toasts, setToasts] = useState<AppToast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((payload: Omit<AppToast, 'id'>) => {
    const id = makeUuid();
    setToasts((prev) => [
      ...prev,
      {
        ...payload,
        id,
      },
    ]);

    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3500);
  }, []);

  return { toasts, toast, dismiss };
}
