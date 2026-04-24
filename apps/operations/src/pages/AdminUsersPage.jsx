import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import { useApp } from '../context/AppContext';
import { UserPlus, Trash2, ImagePlus } from 'lucide-react';

// Pagina unica de gestion de equipo + usuarios.
// Consolida lo que antes vivia en Settings > Equipo + Admin > Usuarios.
export default function AdminUsersPage() {
  const { isAdmin } = useAuth();
  const { addTeamMember, updateTeamMember, deleteTeamMember } = useApp();

  const [members, setMembers] = useState([]);
  const [rolesByUser, setRolesByUser] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState([]);
  const [permissions, setPermissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(null);
  // Si esta seteado, abrimos el modal en modo "darle acceso" con el miembro pre-elegido.
  const [linkPrefill, setLinkPrefill] = useState(null); // { team_member_id, role? }

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, rc, p] = await Promise.all([
      supabase.from('team_members').select('*').order('position'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('roles').select('*').order('name'),
      supabase.from('role_permissions').select('*'),
    ]);
    const rolesMap = {};
    (r.data || []).forEach((x) => {
      if (!rolesMap[x.user_id]) rolesMap[x.user_id] = new Set();
      rolesMap[x.user_id].add(x.role);
    });
    setMembers(m.data || []);
    setRolesByUser(rolesMap);
    setRolesCatalog(rc.data || []);
    setPermissions(p.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  const toggleRole = async (userId, roleName) => {
    if (!userId) return;
    const has = rolesByUser[userId]?.has(roleName) ?? false;
    setSaving(userId);
    if (has) await supabase.from('user_roles').delete().eq('user_id', userId).eq('role', roleName);
    else await supabase.from('user_roles').insert({ user_id: userId, role: roleName });
    setRolesByUser((prev) => {
      const next = { ...prev };
      const set = new Set(next[userId] || []);
      if (has) set.delete(roleName); else set.add(roleName);
      next[userId] = set;
      return next;
    });
    setSaving(null);
  };

  // Edicion inline de campos de team_members. Actualiza local + persiste.
  const patchMember = async (id, patch) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await updateTeamMember(id, patch);
  };

  const removeMember = async (m) => {
    if (!confirm(`Eliminar a "${m.name}"? Si tiene cuenta vinculada, el login deja de funcionar.`)) return;
    // Roles quedan huerfanos, los limpiamos si hay user_id.
    if (m.user_id) {
      await supabase.from('user_roles').delete().eq('user_id', m.user_id);
    }
    await deleteTeamMember(m.id);
    await load();
  };

  const permissionsByRole = useMemo(() => {
    const m = {};
    permissions.forEach((p) => {
      if (!m[p.role]) m[p.role] = [];
      m[p.role].push(p);
    });
    return m;
  }, [permissions]);

  if (!isAdmin) return <div className="text-red text-center py-20">No tenés permiso para acceder a esta página.</div>;
  if (loading) return <div className="text-text3 text-center py-20">Cargando...</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-bold mb-1">Usuarios y equipo</h1>
          <p className="text-xs text-text3">Perfiles del equipo, cuentas de acceso y roles del sistema.</p>
        </div>
        <button onClick={() => setModalOpen(true)}
                className="py-2 px-3 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark flex items-center gap-1.5">
          <UserPlus size={14} /> Nuevo miembro
        </button>
      </div>

      <div className="bg-white border border-border rounded-lg overflow-hidden overflow-x-auto">
        <table className="w-full text-[12px] min-w-[780px]">
          <thead className="bg-surface2 border-b border-border text-text2 text-[11px]">
            <tr>
              <th className="text-left px-3 py-2 font-semibold w-[50px]">Foto</th>
              <th className="text-left px-3 py-2 font-semibold">Nombre</th>
              <th className="text-left px-3 py-2 font-semibold">Rol descriptivo</th>
              <th className="text-left px-3 py-2 font-semibold w-[50px]">Color</th>
              <th className="text-left px-3 py-2 font-semibold">Cuenta</th>
              {rolesCatalog.map((r) => (
                <th key={r.name} className="text-center px-2 py-2 font-semibold capitalize" title={r.description}>{r.name}</th>
              ))}
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-surface2/50">
                <td className="px-3 py-2">
                  {editingAvatar === m.id ? (
                    <input type="text" autoFocus defaultValue={m.avatar_url || ''} placeholder="URL…"
                           className="w-[180px] border border-blue rounded py-1 px-2 text-[11px] font-mono outline-none"
                           onBlur={(e) => { patchMember(m.id, { avatar_url: e.target.value.trim() }); setEditingAvatar(null); }}
                           onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingAvatar(null); }} />
                  ) : (
                    <button onClick={() => setEditingAvatar(m.id)}
                            title="Click para cambiar la foto"
                            className="bg-transparent border-none p-0 cursor-pointer relative group">
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt={m.name} className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                             style={{ background: m.color || '#5B7CF5' }}>
                          {m.initials || m.name?.[0] || '?'}
                        </div>
                      )}
                      <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                        <ImagePlus size={12} className="text-white" />
                      </span>
                    </button>
                  )}
                </td>
                <td className="px-3 py-2">
                  <input value={m.name} onChange={(e) => patchMember(m.id, { name: e.target.value })}
                         className={inlineInput} />
                </td>
                <td className="px-3 py-2">
                  <input value={m.role || ''} onChange={(e) => patchMember(m.id, { role: e.target.value })}
                         className={inlineInput} placeholder="Comercial, CMO, ..." />
                </td>
                <td className="px-3 py-2">
                  <input type="color" value={m.color || '#5B7CF5'} onChange={(e) => patchMember(m.id, { color: e.target.value })}
                         className="w-7 h-7 rounded border border-border cursor-pointer p-0" />
                </td>
                <td className="px-3 py-2">
                  {m.user_id ? (
                    <span className="text-[11px] text-green-600">● Vinculada</span>
                  ) : (
                    <button onClick={() => { setLinkPrefill({ team_member_id: m.id }); setModalOpen(true); }}
                            className="text-[11px] text-blue hover:underline cursor-pointer bg-transparent border-0 p-0">
                      + Crear cuenta
                    </button>
                  )}
                </td>
                {rolesCatalog.map((r) => {
                  const hasAccount = !!m.user_id;
                  const has = hasAccount && (rolesByUser[m.user_id]?.has(r.name) ?? false);
                  const isSaving = saving === m.user_id;
                  return (
                    <td key={r.name} className="text-center px-2 py-2">
                      {hasAccount ? (
                        <input type="checkbox" checked={has}
                               onChange={() => toggleRole(m.user_id, r.name)}
                               disabled={isSaving}
                               className="w-4 h-4 cursor-pointer disabled:opacity-40" />
                      ) : (
                        <button
                          type="button"
                          title="Este miembro no tiene cuenta. Click para crearla y asignar este rol."
                          onClick={() => { setLinkPrefill({ team_member_id: m.id, role: r.name }); setModalOpen(true); }}
                          className="text-text3 hover:text-blue cursor-pointer text-[11px] bg-transparent border border-dashed border-border hover:border-blue rounded px-2 py-0.5"
                        >
                          + cuenta
                        </button>
                      )}
                    </td>
                  );
                })}
                <td className="px-2 py-2 text-center">
                  <button onClick={() => removeMember(m)}
                          className="text-text3 hover:text-red p-1.5 rounded hover:bg-red/10">
                    <Trash2 size={13} />
                  </button>
                </td>
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

      <NewMemberModal
        open={modalOpen}
        onClose={() => { setModalOpen(false); setLinkPrefill(null); }}
        rolesCatalog={rolesCatalog}
        unlinkedMembers={members.filter((m) => !m.user_id)}
        addTeamMember={addTeamMember}
        prefill={linkPrefill}
        onDone={async () => { setModalOpen(false); setLinkPrefill(null); await load(); }}
      />
    </div>
  );
}

// Modal unificado:
//  - Crear perfil (solo team_member) o crear perfil + cuenta.
//  - Alternativa: vincular cuenta nueva a un team_member ya existente.
function NewMemberModal({ open, onClose, rolesCatalog, unlinkedMembers, addTeamMember, prefill, onDone }) {
  const [form, setForm] = useState(emptyForm());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setError('');
    if (prefill?.team_member_id) {
      // Abrir directamente en "Vincular miembro existente" con ese miembro elegido
      // y, si vino prefill.role, marcar ese rol del sistema.
      setForm({
        ...emptyForm(),
        mode: 'link_existing',
        create_account: true,
        team_member_id: prefill.team_member_id,
        roles: prefill.role ? [prefill.role] : [],
      });
    } else {
      setForm(emptyForm());
    }
  }, [open, prefill]);

  if (!open) return null;

  const isExistingMember = form.mode === 'link_existing';
  const needsAccount = isExistingMember || form.create_account;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setSubmitting(true);

      // Ramo 1: solo perfil (team_member sin cuenta).
      if (!needsAccount) {
        if (!form.name?.trim()) throw new Error('El nombre es obligatorio.');
        const initials = form.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        await addTeamMember({
          id: slugify(form.name),
          name: form.name.trim(),
          role: form.role?.trim() || '',
          color: form.color || '#5B7CF5',
          initials,
          avatar_url: form.avatar_url?.trim() || '',
          can_access_settings: false,
        });
        await onDone();
        return;
      }

      // Ramo 2: perfil + cuenta (edge function admin-create-user).
      if (!form.email || !form.password) throw new Error('Email y contraseña son obligatorios.');
      if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');

      let payload;
      if (isExistingMember) {
        const tm = unlinkedMembers.find((m) => m.id === form.team_member_id);
        if (!tm) throw new Error('Elegí un miembro existente.');
        payload = {
          email: form.email, password: form.password,
          name: tm.name, team_member_id: tm.id,
          roles: form.roles,
        };
      } else {
        if (!form.name?.trim()) throw new Error('El nombre es obligatorio.');
        payload = {
          email: form.email, password: form.password,
          name: form.name.trim(),
          role: form.role?.trim() || null,
          color: form.color || null,
          avatar_url: form.avatar_url?.trim() || null,
          roles: form.roles,
        };
      }

      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', { body: payload });
      if (fnErr || data?.error) {
        throw new Error(data?.detail || data?.error || fnErr?.message || 'Error creando el usuario');
      }
      await onDone();
    } catch (err) {
      setError(err.message || 'Error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[560px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">Nuevo miembro</h2>
            <p className="text-xs text-text3 mt-1">
              Podés agregar un perfil sin cuenta (para asignar tareas) o directamente con acceso al panel.
            </p>
          </div>
          <div className="p-5 space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1.5">Tipo</label>
              <div className="space-y-1">
                <label className="flex items-center gap-1.5 text-[13px] cursor-pointer">
                  <input type="radio" name="mode" value="new"
                         checked={form.mode === 'new'}
                         onChange={() => setForm((f) => ({ ...f, mode: 'new' }))} />
                  Nuevo perfil
                </label>
                <label className={`flex items-center gap-1.5 text-[13px] cursor-pointer ${unlinkedMembers.length === 0 ? 'opacity-40' : ''}`}>
                  <input type="radio" name="mode" value="link_existing"
                         disabled={unlinkedMembers.length === 0}
                         checked={form.mode === 'link_existing'}
                         onChange={() => setForm((f) => ({ ...f, mode: 'link_existing', create_account: true }))} />
                  Darle acceso a un miembro existente {unlinkedMembers.length === 0 && '(no hay)'}
                </label>
              </div>
            </div>

            {isExistingMember ? (
              <Field label="Miembro *">
                <select value={form.team_member_id || ''} onChange={(e) => setForm((f) => ({ ...f, team_member_id: e.target.value }))}
                        className={inputCls + ' cursor-pointer'} required>
                  <option value="">Elegí un miembro…</option>
                  {unlinkedMembers.map((m) => <option key={m.id} value={m.id}>{m.name}{m.role ? ` · ${m.role}` : ''}</option>)}
                </select>
              </Field>
            ) : (
              <>
                <Field label="Nombre completo *">
                  <input value={form.name || ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                         className={inputCls} placeholder="Juan Pérez" required />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Rol descriptivo">
                    <input value={form.role || ''} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                           className={inputCls} placeholder="Comercial, CMO..." />
                  </Field>
                  <Field label="Color">
                    <input type="color" value={form.color || '#5B7CF5'}
                           onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                           className="w-full h-[38px] rounded-md border border-border cursor-pointer bg-bg" />
                  </Field>
                </div>
                <Field label="Foto (URL)">
                  <input value={form.avatar_url || ''} onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                         className={inputCls} placeholder="https://..." />
                </Field>

                <label className="flex items-center gap-2 text-[13px] pt-1 cursor-pointer">
                  <input type="checkbox"
                         checked={form.create_account}
                         onChange={(e) => setForm((f) => ({ ...f, create_account: e.target.checked }))} />
                  Crear cuenta de acceso
                </label>
              </>
            )}

            {needsAccount && (
              <>
                <Field label="Email *">
                  <input type="email" value={form.email || ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                         className={inputCls} placeholder="usuario@email.com" required />
                </Field>
                <Field label="Contraseña inicial *">
                  <input type="text" value={form.password || ''} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                         className={inputCls} placeholder="Mínimo 8 caracteres" required minLength={8} />
                  <p className="text-[10px] text-text3 mt-1">El usuario la cambia después con "¿Olvidaste tu contraseña?" si querés.</p>
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
              </>
            )}

            {error && <div className="text-red text-xs bg-red/5 rounded-md p-2">{error}</div>}
          </div>
          <div className="p-5 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
              Cancelar
            </button>
            <button type="submit" disabled={submitting}
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
              {submitting ? 'Creando…' : 'Crear'}
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
    color: '#5B7CF5',
    avatar_url: '',
    create_account: false,
    email: '',
    password: '',
    roles: [],
  };
}

function slugify(s) {
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

const inputCls = 'w-full bg-bg border border-border rounded-md py-[9px] px-3 text-text text-[13px] outline-none focus:border-blue focus:shadow-[0_0_0_3px_rgba(91,124,245,0.1)]';
const inlineInput = 'w-full border border-transparent hover:border-border focus:border-blue rounded py-1 px-1.5 text-[12px] outline-none bg-transparent';
