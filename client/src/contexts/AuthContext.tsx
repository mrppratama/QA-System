import React, { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  configured: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  updateDisplayName: (name: string) => Promise<{ error: string | null }>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function createLocalSession(displayName?: string): Session {
  const storedName = displayName ?? localStorage.getItem('qa_display_name') ?? 'Pratama';
  const storedEmail = localStorage.getItem('qa_local_email') ?? 'pratama@local.qa';
  const user: User = {
    id: 'local-user',
    app_metadata: {},
    user_metadata: { full_name: storedName },
    aud: 'authenticated',
    created_at: new Date().toISOString(),
    email: storedEmail,
  };
  return {
    access_token: 'local-dev-token',
    refresh_token: 'local-dev-refresh',
    expires_in: 3600 * 24 * 365,
    token_type: 'bearer',
    user,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!supabase) {
      // Local mode: auto-login with local session
      setSession(createLocalSession());
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    if (!supabase) {
      localStorage.setItem('qa_local_email', email);
      setSession(createLocalSession());
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    if (!supabase) {
      // In local mode, re-establish local session or allow quick switch
      setSession(createLocalSession());
      return;
    }
    await supabase.auth.signOut();
  };

  const updateDisplayName = async (name: string): Promise<{ error: string | null }> => {
    if (!supabase) {
      localStorage.setItem('qa_display_name', name);
      localStorage.setItem('qa_tested_by', name);
      setSession(createLocalSession(name));
      return { error: null };
    }
    const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (error) return { error: error.message };
    if (data.user) setSession(prev => (prev ? { ...prev, user: data.user } : prev));
    return { error: null };
  };

  return (
    <AuthContext.Provider value={{ session, loading, configured: true, signIn, signOut, updateDisplayName }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
