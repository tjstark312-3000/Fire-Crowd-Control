import * as Dialog from '@radix-ui/react-dialog';
import { Camera, Command, Search, Video, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Camera as CameraType } from '../types';
import { cn } from '../lib/utils';

interface CommandPaletteProps {
  cameras: CameraType[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onToggleSidebar: () => void;
}

interface ActionItem {
  id: string;
  label: string;
  hint?: string;
  onSelect: () => void;
  icon: JSX.Element;
}

export function CommandPalette({ cameras, open, onOpenChange, onToggleSidebar }: CommandPaletteProps): JSX.Element {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) {
      setQuery('');
    }
  }, [open]);

  const actions = useMemo<ActionItem[]>(() => {
    const base: ActionItem[] = [
      {
        id: 'nav-overview',
        label: 'Open Overview Dashboard',
        hint: 'Go to overview page',
        onSelect: () => navigate('/'),
        icon: <Command className="h-4 w-4" />,
      },
      {
        id: 'nav-cameras',
        label: 'Open Cameras Table',
        hint: 'Go to enterprise grid',
        onSelect: () => navigate('/cameras'),
        icon: <Video className="h-4 w-4" />,
      },
      {
        id: 'toggle-sidebar',
        label: 'Toggle Sidebar',
        hint: 'Collapse or expand nav',
        onSelect: onToggleSidebar,
        icon: <Command className="h-4 w-4" />,
      },
    ];

    const cameraActions = cameras.map((camera) => ({
      id: `camera-${camera.id}`,
      label: `Open ${camera.name}`,
      hint: camera.stream_url,
      onSelect: () => navigate(`/camera/${camera.id}`),
      icon: <Camera className="h-4 w-4" />,
    }));

    return [...base, ...cameraActions];
  }, [cameras, navigate, onToggleSidebar]);

  const filtered = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) {
      return actions;
    }
    return actions.filter((item) => item.label.toLowerCase().includes(trimmed) || item.hint?.toLowerCase().includes(trimmed));
  }, [actions, query]);

  const onSelect = (action: ActionItem) => {
    action.onSelect();
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[100] bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content className="fixed left-1/2 top-[18%] z-[101] w-[min(640px,94vw)] -translate-x-1/2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-0 text-[hsl(var(--foreground))] shadow-2xl focus:outline-none data-[state=open]:animate-in data-[state=closed]:animate-out">
          <Dialog.Title className="sr-only">Command Palette</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
            <Search className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search cameras and actions..."
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-[hsl(var(--muted-foreground))]"
            />
            <Dialog.Close className="rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--panel-2))] hover:text-[hsl(var(--foreground))]">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <div className="max-h-[52vh] overflow-auto p-2">
            {filtered.length === 0 && <p className="px-2 py-4 text-sm text-[hsl(var(--muted-foreground))]">No matching commands.</p>}
            <ul className="space-y-1">
              {filtered.map((action) => (
                <li key={action.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(action)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors duration-150',
                      'hover:bg-[hsl(var(--panel-2))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                    )}
                  >
                    <span className="text-[hsl(var(--muted-foreground))]">{action.icon}</span>
                    <span className="flex-1 text-sm">{action.label}</span>
                    {action.hint && <span className="max-w-[42%] truncate text-xs text-[hsl(var(--muted-foreground))]">{action.hint}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
