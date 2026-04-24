import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';

// Gestion de usuarios y roles del sistema.
// Solo accesible por admin. Cada team_member puede estar vinculado o no a
// una cuenta de auth.users. Si esta vinculado, se le pueden asignar roles.
export default function AdminUsersPage() {
  const { isAdmin } = useAuth();

  const [members, setMembers] = useState([]);
  const [rolesByUser, setRolesByUser] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null); // user_id en curso

  const load = useCallback(async () => {
    setLoading(true);
    const [
      { data: membersData },
      { data: rolesData },
      { data: rolesCat },
      { data: perms },
    ] = await Promise.all([
      supabase.from('team_members').select('*').order('position'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('roles').select('*').order('name'),
      supabase.from('role_permissions').select('*'),
    ]);
    const map = {};
    (rolesData || []).forEach((r) => {
      if (!map[r.user_id]) map[r.user_id] = new Set();
      map[r.user_id].add(r.role);
    });
    setMembers(membersData || []);
    setRolesByUser(map);
    setRolesCatalog(rolesCat || []);
    setPermissions(perms || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const toggleRole = async (userId, roleName) => {
    if (!userId) return;
    const current = rolesByUser[userId] || new Set();
    const has = current.has(roleName);
    setSaving(userId);

    if (has) {
      await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', roleName);
    } else {
      await supabase.from('user_roles').insert({ user_id: userId, role: roleName });
    }
    setRolesByUser((prev) => {
      const next = { ...prev };
      const set = new Set(next[userId] || []);
      if (has) set.delete(roleName); else set.add(roleName);
      next[userId] = set;
      return next;
    });
    setSaving(null);
  };

  const permissionsByRole = useMemo(() => {
    const m = {};
    permissions.forEach((p) => {
      if (!m[p.role]) m[p.role] = [];
      m[p.role].push(p);
    });
    return m;
  }, [permissions]);

  if (!isAdmin) {
    return (
      <div className="text-red text-center py-20">
        No tenés permiso para acceder a esta página.
      </div>
    );
  }

  if (loading) return <div className="text-text3 text-center py-20">Cargando...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-1">Usuarios y permisos</h1>
      <p className="text-xs text-text3 mb-5">
        Asigná roles a los miembros del equipo. El rol controla qué módulos y sub-pestañas ve cada usuario.
      </p>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-surface2 border-b border-border text-text2">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Miembro</th>
              <th className="text-left px-4 py-2 font-semibold">Cuenta</th>
              {rolesCatalog.map((r) => (
                <th key={r.name} className="text-center px-3 py-2 font-semibold capitalize" title={r.description}>
                  {r.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-surface2/50">
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    {m.avatar_url ? (
                      <img src={m.avatar_url} alt={m.name} className="w-7 h-7 rounded-full object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded-full flex items-center justify-center font-bold text-[11px]"
                           style={{ background: (m.color || '#5B7CF5') + '18', color: m.color || '#5B7CF5' }}>
                        {m.initials || m.name?.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <div className="font-semibold text-text">{m.name}</div>
                      <div className="text-[11px] text-text3">{m.role}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-2.5">
                  {m.user_id ? (
                    <span className="text-[11px] text-green-600">● Vinculada</span>
                  ) : (
                    <span className="text-[11px] text-text3">Sin cuenta</span>
                  )}
                </td>
                {rolesCatalog.map((r) => {
                  const has = m.user_id && (rolesByUser[m.user_id]?.has(r.name) ?? false);
                  const disabled = !m.user_id || saving === m.user_id;
                  return (
                    <td key={r.name} className="text-center px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={has}
                        onChange={() => toggleRole(m.user_id, r.name)}
                        disabled={disabled}
                        className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold mb-2">Permisos por rol</h2>
        <p className="text-xs text-text3 mb-3">
          Solo lectura. Podés editar la tabla <code>role_permissions</code> desde Supabase si necesitás ajustarla.
        </p>
        <div className="bg-white border border-border rounded-lg p-4 text-[12px] text-text2 space-y-2">
          {rolesCatalog.map((r) => (
            <div key={r.name}>
              <strong className="capitalize">{r.name}:</strong>{' '}
              {r.name === 'admin' ? (
                <span>acceso total implícito (todos los módulos, lectura y escritura).</span>
              ) : (permissionsByRole[r.name] || []).length === 0 ? (
                <span className="text-text3">sin permisos asignados.</span>
              ) : (
                (permissionsByRole[r.name] || []).map((p, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {p.module}{p.submodule !== '*' ? `.${p.submodule}` : ''}
                    {' '}({[p.can_read && 'read', p.can_write && 'write'].filter(Boolean).join('/')})
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-8 rounded-lg border border-border bg-blue-bg2 p-4 text-[12px] text-text2">
        <strong className="block mb-1">Cómo agregar un usuario nuevo</strong>
        <ol className="list-decimal ml-5 space-y-1">
          <li>Creá la cuenta en <a className="text-blue underline" href="https://supabase.com/dashboard/project/cgdwieoxjoexzlfbxrfc/auth/users" target="_blank" rel="noreferrer">Supabase Auth</a> (Add user + Auto Confirm User).</li>
          <li>Asignale su <code>user_id</code> (uuid) a la fila correspondiente de <code>team_members</code>.</li>
          <li>Desde esta pantalla, marcá los roles que le corresponden.</li>
        </ol>
        <p className="mt-2 text-text3">Más adelante automatizamos el paso 1 y 2 con una función serverless que acepte email + nombre y deje todo listo de un click.</p>
      </div>
    </div>
  );
}
