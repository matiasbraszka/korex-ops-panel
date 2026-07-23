import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

// Auth del PORTAL (cliente). Mismo patrón que packages/auth/AuthProvider.jsx del
// panel, pero para clientes: login por email+password contra Supabase Auth. La
// identidad/rol del cliente y el scoping de datos se resuelven server-side en las
// RPCs portal_cliente_* (no cargamos team_members/user_roles acá).
//
// `demo` permite ver la UI con datos de ejemplo SIN sesión (útil mientras el
// backend/RPCs todavía no están, y para revisión rápida).

const Ctx = createContext(null);

export function PortalAuthProvider({ children }) {
  const [session, setSession] = useState(undefined); // undefined = cargando
  const [demo, setDemo] = useState(false);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => { if (mounted) setSession(data.session ?? null); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email: (email || '').trim(), password });
    if (error) throw error;
  };
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail((email || '').trim());
    if (error) throw error;
  };
  const signOut = async () => { setDemo(false); await supabase.auth.signOut(); };
  const enterDemo = () => setDemo(true);

  const value = useMemo(() => ({
    session,
    loading: session === undefined,
    authed: !!session || demo,
    demo,
    user: session?.user ?? null,
    signIn, signOut, resetPassword, enterDemo,
  }), [session, demo]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePortalAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('usePortalAuth debe usarse dentro de <PortalAuthProvider>');
  return c;
}
