import * as React from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';

import { AppToast } from '../../hooks/use-toast';
import { cn } from '../../lib/utils';

const variantClass: Record<NonNullable<AppToast['variant']>, string> = {
  default: 'border-[hsl(var(--border))] bg-[hsl(var(--panel))]',
  warning: 'border-amber-500/40 bg-amber-500/10',
  danger: 'border-red-500/40 bg-red-500/10',
};

interface AppToasterProps {
  toasts: AppToast[];
  onDismiss: (id: string) => void;
}

export function AppToaster({ toasts, onDismiss }: AppToasterProps): JSX.Element {
  return (
    <ToastPrimitive.Provider swipeDirection="right">
      {toasts.map((item) => {
        const variant = item.variant ?? 'default';
        return (
          <ToastPrimitive.Root
            key={item.id}
            open
            onOpenChange={(open) => {
              if (!open) {
                onDismiss(item.id);
              }
            }}
            className={cn(
              'group pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-md border p-3 text-sm text-[hsl(var(--foreground))] shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-80 data-[state=open]:slide-in-from-top-full',
              variantClass[variant],
            )}
          >
            <div className="grid gap-1">
              <ToastPrimitive.Title className="font-semibold">{item.title}</ToastPrimitive.Title>
              {item.description && (
                <ToastPrimitive.Description className="text-xs text-[hsl(var(--muted-foreground))]">
                  {item.description}
                </ToastPrimitive.Description>
              )}
            </div>
            <ToastPrimitive.Close className="ml-auto rounded px-2 py-1 text-xs text-[hsl(var(--muted-foreground))] hover:bg-white/10">
              Dismiss
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        );
      })}
      <ToastPrimitive.Viewport className="fixed right-4 top-4 z-[120] flex w-[360px] max-w-[95vw] flex-col gap-2" />
    </ToastPrimitive.Provider>
  );
}
