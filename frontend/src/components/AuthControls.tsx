import * as Dialog from '@radix-ui/react-dialog';
import { useState } from 'react';

import { useAuthContext } from '../context/AuthContext';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Input } from './ui/input';

export function AuthControls(): JSX.Element {
  const { enabled, session, role, signIn, signOut, signUp } = useAuthContext();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!enabled) {
    return <Badge variant="muted">Auth Disabled</Badge>;
  }

  if (session?.user) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant={role === 'admin' ? 'warning' : 'muted'}>{(role ?? 'viewer').toUpperCase()}</Badge>
        <span className="max-w-[180px] truncate text-xs text-[hsl(var(--muted-foreground))]">{session.user.email}</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            void signOut();
          }}
        >
          Sign out
        </Button>
      </div>
    );
  }

  const runAuth = async (mode: 'signin' | 'signup') => {
    setPending(true);
    setError(null);
    try {
      if (mode === 'signin') {
        await signIn(email, password);
      } else {
        await signUp(email, password);
      }
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed');
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="secondary" size="sm">
          Sign in
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[98] bg-black/70" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[99] w-[min(420px,94vw)] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-4">
          <Dialog.Title className="text-base font-semibold">Supabase Auth</Dialog.Title>
          <Dialog.Description className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Sign in as admin/viewer or create a new account.</Dialog.Description>

          <div className="mt-4 space-y-3">
            <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@agency.gov" />
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />

            {error && <p className="text-xs text-red-300">{error}</p>}

            <div className="flex flex-wrap gap-2">
              <Button disabled={pending} onClick={() => void runAuth('signin')}>
                Sign in
              </Button>
              <Button variant="secondary" disabled={pending} onClick={() => void runAuth('signup')}>
                Sign up
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
