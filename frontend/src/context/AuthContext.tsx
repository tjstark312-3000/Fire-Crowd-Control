import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';

import { hasSupabaseConfig, supabase } from '../lib/supabase';

type AppRole = 'admin' | 'viewer' | null;

interface AuthContextValue {
  session: Session | null;
  role: AppRole;
  ready: boolean;
  enabled: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function readRole(userId: string): Promise<AppRole> {
  if (!supabase) {
    return null;
  }

  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle();
  if (!data || (data.role !== 'admin' && data.role !== 'viewer')) {
    return null;
  }
  return data.role;
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<AppRole>(null);
  const [ready, setReady] = useState(!hasSupabaseConfig);

  useEffect(() => {
    if (!supabase) {
      return;
    }

    let mounted = true;

    const syncRole = async (nextSession: Session | null) => {
      if (!nextSession?.user) {
        setRole(null);
        return;
      }
      const nextRole = await readRole(nextSession.user.id);
      if (mounted) {
        setRole(nextRole);
      }
    };

    void supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) {
        return;
      }
      setSession(data.session);
      await syncRole(data.session);
      setReady(true);
    });

    const { data: authSubscription } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      void syncRole(nextSession);
    });

    return () => {
      mounted = false;
      authSubscription.subscription.unsubscribe();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) {
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      role,
      ready,
      enabled: hasSupabaseConfig,
      signIn,
      signUp,
      signOut,
    }),
    [session, role, ready, signIn, signUp, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuthContext(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within AuthProvider');
  }
  return context;
}
