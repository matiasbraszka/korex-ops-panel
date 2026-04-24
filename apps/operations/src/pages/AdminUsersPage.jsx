import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import { UserPlus } from 'lucide-react';

export default function AdminUsersPage() {
  const { isAdmin } = useAuth();

  const [members, setMembers] = useState([]);
  const [rolesByUser, setRolesByUser] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);

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
    return <div className="text-red text-center py-20">No tenés permiso para acceder a esta página.</div>;
  }
  if (loading) return <div className="text-text3 text-center py-20">Cargando...</div>;

  const unlinkedMembers = members.filter((m) => !m.user_id);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold mb-1">Usuarios y permisos</h1>
          <p className="text-xs text-text3">Asigná roles a los miembros del equipo.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
                className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
          <UserPlus size={14} /> Nuevo usuario
        </button>
      </div>

      <div className="bg-white border border-border rounded-lg overflow-hidden">
        <table className="w-full text-[13px]">
          <thead className="bg-surface2 border-b border-border text-text2">
            <tr>
              <th className="text-left px-4 py-2 font-semibold">Miembro</th>
              <th className="text-left px-4 py-2 font-semibold">Cuenta</th>
              {rolesCatalog.map((r) => (
                <th key={r.name} className="text-center px-3 py-2 font-semibold capitalize" title={r.description}>{r.name}</th>
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
                  {m.user_id ? <span className="text-[11px] text-green-600">● Vinculada</span>
                             : <span className="text-[11px] text-text3">Sin cuenta</span>}
                </td>
                {rolesCatalog.map((r) => {
                  const has = m.user_id && (rolesByUser[m.user_id]?.has(r.name) ?? false);
                  const disabled = !m.user_id || saving === m.user_id;
                  return (
                    <td key={r.name} className="text-center px-3 py-2.5">
                      <input type="checkbox" checked={has}
                             onChange={() => toggleRole(m.user_id, r.name)}
                             disabled={disabled}
                             className="w-4 h-4 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40" />
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
        <div className="bg-white border border-border rounded-lg p-4 text-[12px] text-text2 space-y-2">
          {rolesCatalog.map((r) => (
            <div key={r.name}>
              <strong className="capitalize">{r.name}:</strong>{' '}
              {r.name === 'admin' ? (
                <span>acceso total implícito (todos los módulos).</span>
              ) : (permissionsByRole[r.name] || []).length === 0 ? (
                <span className="text-text3">sin permisos asignados.</span>
              ) : (
                (permissionsByRole[r.name] || []).map((p, i) => (
                  <span key={i}>
                    {i > 0 && ', '}
                    {p.module}{p.submodule !== '*' ? `.${p.submodule}` : ''}{' '}
                    ({[p.can_read && 'read', p.can_write && 'write'].filter(Boolean).join('/')})
                  </span>
                ))
              )}
            </div>
          ))}
        </div>
      </div>

      <NewUserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        rolesCatalog={rolesCatalog}
        unlinkedMembers={unlinkedMembers}
        onCreated={async () => { setModalOpen(false); await load(); }}
      />
    </div>
  );
}

function NewUserModal({ open, onClose, rolesCatalog, unlinkedMembers, onCreated }) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setForm(emptyForm()); setError(''); } }, [open]);

  if (!open) return null;

  const isExisting = form.mode === 'existing';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.email || !form.password) { setError('Email y contraseña son obligatorios.'); return; }
    if (form.password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }

    let payload;
    if (isExisting) {
      const tm = unlinkedMembers.find((m) => m.id === form.team_member_id);
      if (!tm) { setError('Elegí un miembro existente o crea uno nuevo.'); return; }
      payload = {
        email: form.email,
        password: form.password,
        name: tm.name,
        team_member_id: tm.id,
        roles: form.roles,
      };
    } else {
      if (!form.name?.trim()) { setError('El nombre es obligatorio.'); return; }
      payload = {
        email: form.email,
        password: form.password,
        name: form.name.trim(),
        role: form.role?.trim() || null,
        roles: form.roles,
      };
    }

    setSubmitting(true);
    const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', { body: payload });
    setSubmitting(false);

    if (fnErr || data?.error) {
      setError(data?.detail || data?.error || fnErr?.message || 'Error creando el usuario');
      return;
    }
    await onCreated();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">Nuevo usuario</h2>
            <p className="text-xs text-text3 mt-1">Creamos la cuenta en Supabase Auth y la vinculamos a un miembro del equipo.</p>
          </div>
          <div className="p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1.5">Tipo</label>
              <div className="flex gap-3">
                <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input type="radio" name="mode" value="new"
                         checked={form.mode === 'new'}
                         onChange={() => setForm((f) => ({ ...f, mode: 'new' }))} />
                  Crear miembro nuevo
                </label>
                <label className={`flex items-center gap-1.5 text-[13px] cursor-pointer ${unlinkedMembers.length === 0 ? 'opacity-40' : ''}`}>
                  <input type="radio" name="mode" value="existing"
                         disabled={unlinkedMembers.length === 0}
                         checked={form.mode === 'existing'}
                         onChange={() => setForm((f) => ({ ...f, mode: 'existing' }))} />
                  Vincular miembro existente {unlinkedMembers.length === 0 && '(no hay)'}
                </label>
              </div>
            </div>

            {isExisting ? (
              <Field label="Miembro *">
                <select value={form.team_member_id || ''} onChange={(e) => setForm((f) => ({ ...f, team_member_id: e.target.value }))}
                        className={inputCls + ' cursor-pointer'} required>
                  <option value="">Elegí un miembro…</option>
                  {unlinkedMembers.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.role}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Nombre completo *">
                  <input value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                         className={inputCls} placeholder="Juan Pérez" required />
                </Field>
                <Field label="Rol descriptivo (equipo)">
                  <input value={form.role || ''} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                         className={inputCls} placeholder="Comercial, CMO, Programador..." />
                </Field>
              </>
            )}

            <Field label="Email *">
              <input type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                     className={inputCls} placeholder="usuario@email.com" required />
            </Field>
            <Field label="Contraseña inicial *">
              <input type="text" value={form.password || ''} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                     className={inputCls} placeholder="Mínimo 8 caracteres" required minLength={8} />
              <p className="text-[10px] text-text3 mt-1">Pasale al usuario esta contraseña para el primer login. Él la puede cambiar después.</p>
            </Field>

            <div>
              <label className="block text-xs font-semibold text-text2 mb-1.5">Roles del sistema</label>
              <div className="space-y-1.5">
                {rolesCatalog.map((r) => (
                  <label key={r.name} className="flex items-center gap-2 text-[13px] cursor-pointer">
                    <input type="checkbox" checked={form.roles.includes(r.name)}
                           onChange={(e) => setForm((f) => ({
                             ...f,
                             roles: e.target.checked ? [...f.roles, r.name] : f.roles.filter((x) => x !== r.name),
                           }))} />
                    <span className="capitalize">{r.name}</span>
                    <span className="text-[11px] text-text3">— {r.description}</span>
                  </label>
                ))}
              </div>
            </div>

            {error && <div className="text-red text-xs bg-red/5 rounded-md p-2">{error}</div>}
          </div>
          <div className="p-5 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
              {submitting ? 'Creando…' : 'Crear usuario'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="block text-xs font-semibold text-text2 mb-1">{label}</label>
      {children}
    </div>
  );
}

function emptyForm() {
  return {
    mode: 'new',
    team_member_id: '',
    name: '',
    role: '',
    email: '',
    password: '',
    roles: [],
  };
}

const inputCls = 'w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]';
