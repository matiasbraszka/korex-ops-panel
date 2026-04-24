import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [roles, setRoles] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);

  // Suscripcion al estado de auth.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Cargar perfil, roles y permisos cuando cambia la sesion.
  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!session?.user) {
        setProfile(null);
        setRoles([]);
        setPermissions([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const userId = session.user.id;

      const [profileRes, rolesRes] = await Promise.all([
        supabase.from('team_members').select('*').eq('user_id', userId).maybeSingle(),
        supabase.from('user_roles').select('role').eq('user_id', userId),
      ]);
      if (cancelled) return;

      const userRoles = (rolesRes.data || []).map((r) => r.role);
      setRoles(userRoles);
      setProfile(profileRes.data || null);

      // Cargar permisos efectivos. Si es admin, no necesitamos filas.
      if (userRoles.includes('admin')) {
        setPermissions([{ role: 'admin', module: '*', submodule: '*', can_read: true, can_write: true }]);
      } else if (userRoles.length > 0) {
        const { data: perms } = await supabase
          .from('role_permissions')
          .select('*')
          .in('role', userRoles);
        if (!cancelled) setPermissions(perms || []);
      } else {
        setPermissions([]);
      }
      if (!cancelled) setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [session?.user?.id]);

  const isAdmin = roles.includes('admin');

  const can = useMemo(() => {
    return (module, action = 'read', submodule = null) => {
      if (isAdmin) return true;
      return permissions.some(
        (p) =>
          p.module === module &&
          (p.submodule === '*' || p.submodule === (submodule || '*')) &&
          (action === 'read' ? p.can_read : p.can_write)
      );
    };
  }, [permissions, isAdmin]);

  const value = useMemo(
    () => ({ session, user: session?.user ?? null, profile, roles, isAdmin, permissions, can, loading }),
    [session, profile, roles, isAdmin, permissions, can, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>');
  return ctx;
}

export function useSession() {
  return useAuth().session;
}

export function useCurrentUser() {
  const { user, profile, roles, isAdmin, loading } = useAuth();
  return { user, profile, roles, isAdmin, loading };
}

export function useCan(module, action = 'read', submodule = null) {
  return useAuth().can(module, action, submodule);
}
