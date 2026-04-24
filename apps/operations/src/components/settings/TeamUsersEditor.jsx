import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@korex/db';
import { useAuth } from '@korex/auth';
import { useApp } from '../../context/AppContext';
import { UserPlus, Trash2, ImagePlus, Zap } from 'lucide-react';

// Editor unico de equipo + cuentas + roles del sistema.
// Vive como tab dentro de Configuraciones. Sin paginas separadas.
export default function TeamUsersEditor() {
  const { isAdmin } = useAuth();
  const { addTeamMember, updateTeamMember, deleteTeamMember } = useApp();

  const [members, setMembers] = useState([]);
  const [rolesByUser, setRolesByUser] = useState({});
  const [rolesCatalog, setRolesCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [editingAvatar, setEditingAvatar] = useState(null);

  // Modal alta de cuenta inline (cuando tildan un rol a un miembro sin cuenta).
  const [accountModal, setAccountModal] = useState(null); // { member, role }
  // Modal alta de miembro nuevo (no estaba en la lista).
  const [newMemberModal, setNewMemberModal] = useState(false);
  // Modal de activacion masiva.
  const [bulkModalOpen, setBulkModalOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [m, r, rc] = await Promise.all([
      supabase.from('team_members').select('*').order('position'),
      supabase.from('user_roles').select('user_id, role'),
      supabase.from('roles').select('*').order('name'),
    ]);
    const rolesMap = {};
    (r.data || []).forEach((x) => {
      if (!rolesMap[x.user_id]) rolesMap[x.user_id] = new Set();
      rolesMap[x.user_id].add(x.role);
    });
    setMembers(m.data || []);
    setRolesByUser(rolesMap);
    setRolesCatalog(rc.data || []);
    setLoading(false);
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  // Asignar/desasignar rol con la regla: admin es exclusivo (no convive con
  // operations o sales porque admin ya implica acceso total).
  const setUserRoles = useCallback(async (userId, nextRoles) => {
    setSaving(userId);
    // Diff con lo que hay actual.
    const current = rolesByUser[userId] || new Set();
    const next = new Set(nextRoles);
    const toAdd = [...next].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !next.has(r));

    if (toRemove.length) {
      await supabase.from('user_roles').delete().eq('user_id', userId).in('role', toRemove);
    }
    if (toAdd.length) {
      await supabase.from('user_roles').insert(toAdd.map((r) => ({ user_id: userId, role: r })));
    }

    setRolesByUser((prev) => ({ ...prev, [userId]: new Set(nextRoles) }));
    setSaving(null);
  }, [rolesByUser]);

  const handleToggle = (member, role) => {
    if (!member.user_id) {
      // Sin cuenta: abrir mini-modal para crearla ya con este rol marcado.
      setAccountModal({ member, role });
      return;
    }
    const current = new Set(rolesByUser[member.user_id] || []);
    const has = current.has(role);

    let nextRoles;
    if (role === 'admin') {
      // admin exclusivo: si lo activan, queda solo admin; si lo apagan, queda vacio.
      nextRoles = has ? [] : ['admin'];
    } else {
      // operations / sales: no pueden convivir con admin (admin ya implica acceso).
      const set = new Set(current);
      set.delete('admin');
      if (has) set.delete(role); else set.add(role);
      nextRoles = [...set];
    }
    setUserRoles(member.user_id, nextRoles);
  };

  // Edicion inline de campos del team_member.
  const patchMember = async (id, patch) => {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
    await updateTeamMember(id, patch);
  };

  const removeMember = async (m) => {
    if (!confirm(`Eliminar a "${m.name}"? Si tiene cuenta vinculada, el login deja de funcionar.`)) return;
    if (m.user_id) await supabase.from('user_roles').delete().eq('user_id', m.user_id);
    await deleteTeamMember(m.id);
    await load();
  };

  if (!isAdmin) return <div className="text-red text-center py-20">No tenés permiso.</div>;
  if (loading) return <div className="text-text3 text-center py-10">Cargando…</div>;

  return (
    <div className="bg-white border border-border rounded-xl p-5 relative">
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <div>
          <h2 className="text-[14px] font-bold text-text">Equipo y usuarios</h2>
          <p className="text-[11px] text-text3 mt-0.5">
            Agregá miembros y tildá los roles del sistema. Si el miembro no tiene cuenta, te pedimos el email en el momento.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {members.some((m) => !m.user_id) && (
            <button onClick={() => setBulkModalOpen(true)}
                    className="py-1.5 px-3 rounded-md border border-border bg-white text-text2 text-[12px] hover:bg-surface2 flex items-center gap-1.5">
              <Zap size={13} /> Activar miembros sin cuenta
            </button>
          )}
          <button onClick={() => setNewMemberModal(true)}
                  className="py-1.5 px-3 rounded-md bg-blue text-white text-[12px] hover:bg-blue-dark flex items-center gap-1.5">
            <UserPlus size={13} /> Nuevo usuario
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px] min-w-[720px]">
          <thead>
            <tr className="text-[10px] font-semibold text-text3 uppercase border-b border-border">
              <th className="text-left py-2 px-2 w-[50px]">Foto</th>
              <th className="text-left py-2 px-2">Nombre</th>
              <th className="text-left py-2 px-2">Rol descriptivo</th>
              <th className="text-left py-2 px-2 w-[40px]">Color</th>
              {rolesCatalog.map((r) => (
                <th key={r.name} className="text-center py-2 px-2 capitalize w-[80px]" title={r.description}>{r.name}</th>
              ))}
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const myRoles = rolesByUser[m.user_id] || new Set();
              const isUserAdmin = myRoles.has('admin');
              return (
                <tr key={m.id} className="border-b border-border last:border-b-0 hover:bg-surface2/50">
                  <td className="py-2 px-2">
                    {editingAvatar === m.id ? (
                      <input type="text" autoFocus defaultValue={m.avatar_url || ''} placeholder="URL…"
                             className="w-[180px] border border-blue rounded py-1 px-2 text-[11px] font-mono outline-none"
                             onBlur={(e) => { patchMember(m.id, { avatar_url: e.target.value.trim() }); setEditingAvatar(null); }}
                             onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditingAvatar(null); }} />
                    ) : (
                      <button onClick={() => setEditingAvatar(m.id)} title="Click para cambiar foto"
                              className="bg-transparent border-none p-0 cursor-pointer relative group">
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt={m.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                               style={{ background: m.color || '#5B7CF5' }}>
                            {m.initials || m.name?.[0] || '?'}
                          </div>
                        )}
                        <span className="absolute inset-0 rounded-full bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                          <ImagePlus size={13} className="text-white" />
                        </span>
                      </button>
                    )}
                  </td>
                  <td className="py-2 px-2">
                    <input value={m.name} onChange={(e) => patchMember(m.id, { name: e.target.value })}
                           className={inlineInput} />
                    {!m.user_id && <div className="text-[10px] text-text3 mt-0.5">Sin cuenta</div>}
                    {m.user_id && <div className="text-[10px] text-green-600 mt-0.5">● Con cuenta</div>}
                  </td>
                  <td className="py-2 px-2">
                    <input value={m.role || ''} onChange={(e) => patchMember(m.id, { role: e.target.value })}
                           className={inlineInput} placeholder="Comercial, CMO…" />
                  </td>
                  <td className="py-2 px-2">
                    <input type="color" value={m.color || '#5B7CF5'}
                           onChange={(e) => patchMember(m.id, { color: e.target.value })}
                           className="w-7 h-7 rounded border border-border cursor-pointer p-0" />
                  </td>
                  {rolesCatalog.map((r) => {
                    const checked = m.user_id && myRoles.has(r.name);
                    // admin convive con nada; operations/sales no muestran activo si admin
                    const greyed = m.user_id && r.name !== 'admin' && isUserAdmin;
                    const isSaving = saving === m.user_id;
                    return (
                      <td key={r.name} className="text-center py-2 px-2">
                        <input
                          type="checkbox"
                          checked={!!checked}
                          disabled={isSaving || greyed}
                          onChange={() => handleToggle(m, r.name)}
                          title={greyed ? `Ya tiene rol admin (acceso total). Destildá admin para asignar ${r.name}.` : ''}
                          className="w-4 h-4 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                        />
                      </td>
                    );
                  })}
                  <td className="py-2 px-2 text-center">
                    <button onClick={() => removeMember(m)}
                            className="text-text3 hover:text-red p-1.5 rounded hover:bg-red/10">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-text3 mt-3">
        <strong>Cómo funcionan los roles:</strong> <code>admin</code> tiene acceso total
        (no necesita marcar los otros). <code>operations</code> ve el módulo Operaciones.
        <code> sales</code> ve el módulo Ventas. Un usuario puede tener operations + sales si
        querés que vea las dos áreas, pero no admin con otros (admin ya cubre todo).
      </p>

      {accountModal && (
        <CreateAccountInlineModal
          member={accountModal.member}
          initialRole={accountModal.role}
          onClose={() => setAccountModal(null)}
          onDone={async () => { setAccountModal(null); await load(); }}
        />
      )}

      {newMemberModal && (
        <NewUserModal
          rolesCatalog={rolesCatalog}
          addTeamMember={addTeamMember}
          onClose={() => setNewMemberModal(false)}
          onDone={async () => { setNewMemberModal(false); await load(); }}
        />
      )}

      {bulkModalOpen && (
        <BulkActivateModal
          unlinkedMembers={members.filter((m) => !m.user_id)}
          rolesCatalog={rolesCatalog}
          onClose={() => setBulkModalOpen(false)}
          onDone={async () => { setBulkModalOpen(false); await load(); }}
        />
      )}
    </div>
  );
}

// Modal de activacion masiva: lista todos los miembros sin cuenta, permite
// editar email y password de cada uno, y crea las cuentas en lote.
function BulkActivateModal({ unlinkedMembers, rolesCatalog, onClose, onDone }) {
  const [rows, setRows] = useState(() =>
    unlinkedMembers.map((m) => ({
      member: m,
      include: true,
      email: `${m.id}@metodokorex.com`,
      password: suggestPassword(),
      roles: ['operations'],
    }))
  );
  const [submitting, setSubmitting] = useState(false);
  const [results, setResults] = useState(null); // null | array de {member, ok, error?, credentials?}

  const updateRow = (id, patch) => setRows((prev) => prev.map((r) => (r.member.id === id ? { ...r, ...patch } : r)));

  const toggleRole = (id, role) => {
    setRows((prev) => prev.map((r) => {
      if (r.member.id !== id) return r;
      let next;
      if (role === 'admin') next = r.roles.includes('admin') ? [] : ['admin'];
      else {
        const s = new Set(r.roles); s.delete('admin');
        if (s.has(role)) s.delete(role); else s.add(role);
        next = [...s];
      }
      return { ...r, roles: next };
    }));
  };

  const submit = async (e) => {
    e.preventDefault();
    const targets = rows.filter((r) => r.include);
    if (targets.length === 0) return;
    setSubmitting(true);
    const out = [];
    for (const r of targets) {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
        body: {
          email: r.email.trim().toLowerCase(),
          password: r.password,
          name: r.member.name,
          team_member_id: r.member.id,
          roles: r.roles,
        },
      });
      if (fnErr || data?.error) {
        out.push({ member: r.member, ok: false, error: data?.detail || data?.error || fnErr?.message || 'error' });
      } else {
        out.push({ member: r.member, ok: true, credentials: { email: r.email, password: r.password } });
      }
    }
    setResults(out);
    setSubmitting(false);
  };

  const close = () => { if (results) onDone(); else onClose(); };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={close}>
      <div className="bg-white rounded-xl w-full max-w-[860px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">Activar miembros sin cuenta</h2>
            <p className="text-xs text-text3 mt-1">
              Le creamos una cuenta a cada uno con el email y contraseña que dejes acá. Por defecto les damos rol <strong>operations</strong>.
              Después de crear, copiale las credenciales a cada uno; pueden cambiar la contraseña con "¿Olvidaste tu contraseña?".
            </p>
          </div>

          {!results ? (
            <>
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead className="text-[10px] uppercase text-text3">
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-1 w-[40px]">✓</th>
                      <th className="text-left py-2 px-2">Nombre</th>
                      <th className="text-left py-2 px-2">Email</th>
                      <th className="text-left py-2 px-2">Contraseña</th>
                      {rolesCatalog.map((rc) => (
                        <th key={rc.name} className="text-center py-2 px-2 capitalize w-[70px]">{rc.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.member.id} className="border-b border-border last:border-b-0">
                        <td className="py-2 px-1">
                          <input type="checkbox" checked={r.include}
                                 onChange={(e) => updateRow(r.member.id, { include: e.target.checked })}
                                 className="w-4 h-4 cursor-pointer" />
                        </td>
                        <td className="py-2 px-2 font-semibold">{r.member.name}</td>
                        <td className="py-2 px-2">
                          <input value={r.email}
                                 onChange={(e) => updateRow(r.member.id, { email: e.target.value })}
                                 className="w-full bg-bg border border-border rounded py-1 px-2 text-[12px] outline-none focus:border-blue" />
                        </td>
                        <td className="py-2 px-2">
                          <div className="flex gap-1 items-center">
                            <input value={r.password}
                                   onChange={(e) => updateRow(r.member.id, { password: e.target.value })}
                                   className="w-full bg-bg border border-border rounded py-1 px-2 text-[11px] font-mono outline-none focus:border-blue" />
                            <button type="button" onClick={() => updateRow(r.member.id, { password: suggestPassword() })}
                                    className="text-[10px] text-text3 hover:text-blue px-1">⟳</button>
                          </div>
                        </td>
                        {rolesCatalog.map((rc) => {
                          const checked = r.roles.includes(rc.name);
                          const greyed = rc.name !== 'admin' && r.roles.includes('admin');
                          return (
                            <td key={rc.name} className="text-center py-2 px-2">
                              <input type="checkbox" checked={checked} disabled={greyed}
                                     onChange={() => toggleRole(r.member.id, rc.name)}
                                     className="w-4 h-4 cursor-pointer disabled:opacity-30" />
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="p-5 border-t border-border flex justify-end gap-2">
                <button type="button" onClick={onClose}
                        className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
                  Cancelar
                </button>
                <button type="submit" disabled={submitting}
                        className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark disabled:opacity-60">
                  {submitting ? `Creando ${rows.filter((r) => r.include).length} cuentas…` : `Activar ${rows.filter((r) => r.include).length}`}
                </button>
              </div>
            </>
          ) : (
            <ResultsView results={results} onDone={onDone} />
          )}
        </form>
      </div>
    </div>
  );
}

function ResultsView({ results, onDone }) {
  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  const allText = ok.map((r) => `${r.member.name}\t${r.credentials.email}\t${r.credentials.password}`).join('\n');

  return (
    <>
      <div className="p-5 space-y-4">
        <div className="flex gap-3 text-[13px]">
          <span className="text-green-600">✓ {ok.length} creadas</span>
          {failed.length > 0 && <span className="text-red">✕ {failed.length} fallaron</span>}
        </div>

        {ok.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-text2">Credenciales (copialas y pasáselas al equipo)</label>
              <button type="button" onClick={() => navigator.clipboard?.writeText(allText)}
                      className="text-[11px] text-blue hover:underline">Copiar todo</button>
            </div>
            <pre className="bg-surface2 rounded-md p-3 text-[11px] font-mono whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
              {ok.map((r) => `${r.member.name.padEnd(28)}  ${r.credentials.email.padEnd(35)}  ${r.credentials.password}`).join('\n')}
            </pre>
          </div>
        )}

        {failed.length > 0 && (
          <div>
            <label className="block text-xs font-semibold text-text2 mb-2">Fallaron:</label>
            <ul className="text-[12px] space-y-1">
              {failed.map((r) => (
                <li key={r.member.id}><strong>{r.member.name}:</strong> <span className="text-red">{r.error}</span></li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <div className="p-5 border-t border-border flex justify-end">
        <button type="button" onClick={onDone}
                className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
          Listo
        </button>
      </div>
    </>
  );
}

// Mini-modal: el admin tildo un rol a un miembro sin cuenta. Le pedimos
// email + password y creamos cuenta + asignamos rol en un solo paso.
function CreateAccountInlineModal({ member, initialRole, onClose, onDone }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(suggestPassword());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!email.trim()) { setError('El email es obligatorio.'); return; }
    if (password.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return; }
    setSubmitting(true);
    const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
      body: {
        email: email.trim().toLowerCase(),
        password,
        name: member.name,
        team_member_id: member.id,
        roles: [initialRole],
      },
    });
    setSubmitting(false);
    if (fnErr || data?.error) {
      setError(data?.detail || data?.error || fnErr?.message || 'Error creando la cuenta');
      return;
    }
    await onDone();
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">Crear cuenta para {member.name}</h2>
            <p className="text-xs text-text3 mt-1">
              Le vamos a dar el rol <strong className="capitalize">{initialRole}</strong>. Definí su email y una contraseña inicial.
            </p>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                     placeholder="usuario@email.com" required className={inputCls} autoFocus />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Contraseña inicial</label>
              <div className="flex gap-2">
                <input type="text" value={password} onChange={(e) => setPassword(e.target.value)}
                       minLength={8} required className={inputCls + ' font-mono'} />
                <button type="button" onClick={() => setPassword(suggestPassword())}
                        className="py-2 px-3 rounded-md border border-border bg-white text-text2 text-[12px] hover:bg-surface2 shrink-0">
                  Generar
                </button>
              </div>
              <p className="text-[10px] text-text3 mt-1">Pasale esta contraseña al usuario. Después puede cambiarla con "¿Olvidaste tu contraseña?".</p>
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
              {submitting ? 'Creando…' : 'Crear cuenta'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// Modal "Nuevo usuario": agrega un miembro nuevo + (opcionalmente) cuenta de acceso.
function NewUserModal({ rolesCatalog, addTeamMember, onClose, onDone }) {
  const [form, setForm] = useState({
    name: '',
    role: '',
    color: '#5B7CF5',
    avatar_url: '',
    create_account: true,
    email: '',
    password: suggestPassword(),
    roles: [],
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleRoleToggle = (roleName) => {
    setForm((f) => {
      let next;
      if (roleName === 'admin') {
        next = f.roles.includes('admin') ? [] : ['admin'];
      } else {
        const s = new Set(f.roles);
        s.delete('admin');
        if (s.has(roleName)) s.delete(roleName); else s.add(roleName);
        next = [...s];
      }
      return { ...f, roles: next };
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      setSubmitting(true);
      if (!form.name.trim()) throw new Error('El nombre es obligatorio.');

      if (!form.create_account) {
        // Solo perfil
        const initials = form.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
        await addTeamMember({
          id: slugify(form.name),
          name: form.name.trim(),
          role: form.role.trim(),
          color: form.color,
          initials,
          avatar_url: form.avatar_url.trim(),
          can_access_settings: false,
        });
      } else {
        if (!form.email || !form.password) throw new Error('Email y contraseña son obligatorios.');
        if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
        const { data, error: fnErr } = await supabase.functions.invoke('admin-create-user', {
          body: {
            email: form.email.trim().toLowerCase(),
            password: form.password,
            name: form.name.trim(),
            role: form.role.trim() || null,
            color: form.color,
            avatar_url: form.avatar_url.trim() || null,
            roles: form.roles,
          },
        });
        if (fnErr || data?.error) throw new Error(data?.detail || data?.error || fnErr?.message || 'Error creando el usuario');
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
      <div className="bg-white rounded-xl w-full max-w-[520px] max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">Nuevo usuario</h2>
          </div>
          <div className="p-5 space-y-3">
            <Field label="Nombre completo *">
              <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                     placeholder="Juan Pérez" required className={inputCls} autoFocus />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Rol descriptivo">
                <input value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                       placeholder="Comercial, CMO…" className={inputCls} />
              </Field>
              <Field label="Color">
                <input type="color" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                       className="w-full h-[38px] rounded-md border border-border cursor-pointer bg-bg" />
              </Field>
            </div>
            <Field label="Foto (URL)">
              <input value={form.avatar_url} onChange={(e) => setForm((f) => ({ ...f, avatar_url: e.target.value }))}
                     placeholder="https://…" className={inputCls} />
            </Field>

            <label className="flex items-center gap-2 text-[13px] cursor-pointer pt-1">
              <input type="checkbox" checked={form.create_account}
                     onChange={(e) => setForm((f) => ({ ...f, create_account: e.target.checked }))} />
              Darle acceso al panel (crear cuenta)
            </label>

            {form.create_account && (
              <>
                <Field label="Email">
                  <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                         placeholder="usuario@email.com" required className={inputCls} />
                </Field>
                <Field label="Contraseña inicial">
                  <div className="flex gap-2">
                    <input type="text" value={form.password} onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                           minLength={8} required className={inputCls + ' font-mono'} />
                    <button type="button" onClick={() => setForm((f) => ({ ...f, password: suggestPassword() }))}
                            className="py-2 px-3 rounded-md border border-border bg-white text-text2 text-[12px] hover:bg-surface2 shrink-0">
                      Generar
                    </button>
                  </div>
                </Field>
                <div>
                  <label className="block text-xs font-semibold text-text2 mb-1.5">Roles del sistema</label>
                  <div className="space-y-1">
                    {rolesCatalog.map((r) => (
                      <label key={r.name} className="flex items-center gap-2 text-[13px] cursor-pointer">
                        <input type="checkbox" checked={form.roles.includes(r.name)}
                               onChange={() => handleRoleToggle(r.name)} />
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

function suggestPassword() {
  // 12 caracteres aleatorios alfanuméricos.
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 12; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
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
