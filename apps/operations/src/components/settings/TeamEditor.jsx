import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, X, Eye, EyeOff, ImagePlus } from 'lucide-react';
import SaveBar from './SaveBar';

/**
 * Editor de equipo con patron draft + save/cancel.
 * Cambios se mantienen en local hasta que el usuario clickea Guardar.
 * Al guardar, se diff vs original y se ejecutan add/update/delete en batch.
 */
export default function TeamEditor() {
  const { teamMembers, addTeamMember, updateTeamMember, deleteTeamMember, currentUser } = useApp();
  const [draft, setDraft] = useState(teamMembers);
  const [dirty, setDirty] = useState(false);
  const [showPasswords, setShowPasswords] = useState({});
  const [editingAvatar, setEditingAvatar] = useState(null); // memberId
  const [adding, setAdding] = useState(false);
  const [newMember, setNewMember] = useState({ id: '', name: '', role: '', password: 'korex2026' });

  // Resync con el contexto cuando no hay cambios pendientes
  useEffect(() => {
    if (!dirty) setDraft(teamMembers);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamMembers]);

  const mark = (next) => { setDraft(next); setDirty(true); };

  const togglePass = (id) => setShowPasswords(p => ({ ...p, [id]: !p[id] }));

  const updateField = (id, field, value) => {
    mark(draft.map(m => m.id === id ? { ...m, [field]: value } : m));
  };

  const removeMember = (m) => {
    if (m.id === currentUser?.id) return;
    if (!confirm(`Eliminar a "${m.name}" del equipo?`)) return;
    mark(draft.filter(x => x.id !== m.id));
  };

  const handleAddMember = () => {
    const id = newMember.id.trim().toLowerCase();
    if (!id || !newMember.name.trim()) return;
    if (draft.some(m => m.id === id)) {
      alert('Ya existe un miembro con ese usuario.');
      return;
    }
    const initials = newMember.name.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase();
    const row = {
      id,
      name: newMember.name.trim(),
      role: newMember.role.trim() || 'Colaborador',
      color: '#5B7CF5',
      initials,
      avatar_url: '',
      password: newMember.password || 'korex2026',
      can_access_settings: false,
      position: draft.length,
    };
    mark([...draft, row]);
    setNewMember({ id: '', name: '', role: '', password: 'korex2026' });
    setAdding(false);
  };

  // Save: diff draft vs original (teamMembers) y ejecutar CRUD en batch
  const handleSave = async () => {
    const originalById = new Map(teamMembers.map(m => [m.id, m]));
    const draftById = new Map(draft.map(m => [m.id, m]));

    // Deletes
    for (const orig of teamMembers) {
      if (!draftById.has(orig.id)) {
        await deleteTeamMember(orig.id);
      }
    }
    // Adds
    for (const d of draft) {
      if (!originalById.has(d.id)) {
        await addTeamMember(d);
      }
    }
    // Updates
    for (const d of draft) {
      const orig = originalById.get(d.id);
      if (!orig) continue;
      const changed = {};
      ['name', 'role', 'color', 'initials', 'password'].forEach(f => {
        if ((d[f] || '') !== (orig[f] || '')) changed[f] = d[f];
      });
      if ((d.avatar_url || '') !== (orig.avatar_url || '')) changed.avatar_url = d.avatar_url || '';
      if (!!d.can_access_settings !== !!orig.can_access_settings) changed.can_access_settings = !!d.can_access_settings;
      if (Object.keys(changed).length > 0) {
        await updateTeamMember(d.id, changed);
      }
    }
    setDirty(false);
  };

  const handleCancel = () => {
    setDraft(teamMembers);
    setDirty(false);
    setAdding(false);
    setEditingAvatar(null);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Equipo</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Agregá, editá o quitá miembros. Tildá quién puede entrar a Configuración. Click en el avatar para cambiar la foto.</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-[10px] font-semibold text-gray-400 uppercase border-b border-gray-100">
              <th className="text-left py-2 px-2 w-[50px]">Foto</th>
              <th className="text-left py-2 px-2">Usuario</th>
              <th className="text-left py-2 px-2">Nombre</th>
              <th className="text-left py-2 px-2">Rol</th>
              <th className="text-left py-2 px-2 w-[40px]">Color</th>
              <th className="text-left py-2 px-2">Contraseña</th>
              <th className="text-center py-2 px-2 w-[80px]">Settings</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {draft.map(m => {
              const isSelf = m.id === currentUser?.id;
              return (
                <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2 px-2">
                    {editingAvatar === m.id ? (
                      <input
                        type="text"
                        autoFocus
                        defaultValue={m.avatar_url || ''}
                        placeholder="https://..."
                        className="w-[180px] border border-blue-400 rounded py-1 px-2 text-[11px] font-mono outline-none"
                        onBlur={(e) => {
                          updateField(m.id, 'avatar_url', e.target.value.trim());
                          setEditingAvatar(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') e.target.blur();
                          if (e.key === 'Escape') setEditingAvatar(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="bg-transparent border-none p-0 cursor-pointer relative group"
                        onClick={() => setEditingAvatar(m.id)}
                        title="Click para cambiar la foto"
                      >
                        {m.avatar_url ? (
                          <img src={m.avatar_url} alt={m.name} className="w-9 h-9 rounded-full object-cover" />
                        ) : (
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ background: m.color || '#5B7CF5' }}>
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
                    <span className="text-gray-400 text-[11px] font-mono">{m.id}</span>
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={m.name}
                      onChange={(e) => updateField(m.id, 'name', e.target.value)}
                      className="w-full border border-transparent hover:border-gray-200 focus:border-blue-400 rounded py-1 px-1.5 text-[12px] font-sans outline-none bg-transparent"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="text"
                      value={m.role}
                      onChange={(e) => updateField(m.id, 'role', e.target.value)}
                      className="w-full border border-transparent hover:border-gray-200 focus:border-blue-400 rounded py-1 px-1.5 text-[12px] font-sans outline-none bg-transparent"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <input
                      type="color"
                      value={m.color || '#5B7CF5'}
                      onChange={(e) => updateField(m.id, 'color', e.target.value)}
                      className="w-7 h-7 rounded border border-gray-200 cursor-pointer p-0 bg-white"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <input
                        type={showPasswords[m.id] ? 'text' : 'password'}
                        value={m.password || ''}
                        onChange={(e) => updateField(m.id, 'password', e.target.value)}
                        className="flex-1 min-w-0 border border-transparent hover:border-gray-200 focus:border-blue-400 rounded py-1 px-1.5 text-[12px] font-mono outline-none bg-transparent"
                      />
                      <button
                        className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                        onClick={() => togglePass(m.id)}
                        title={showPasswords[m.id] ? 'Ocultar' : 'Mostrar'}
                      >
                        {showPasswords[m.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                      </button>
                    </div>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!m.can_access_settings}
                      onChange={(e) => updateField(m.id, 'can_access_settings', e.target.checked)}
                      disabled={isSelf}
                      title={isSelf ? 'No podés revocarte a vos mismo' : 'Permitir acceso a Configuración'}
                      className="cursor-pointer w-3.5 h-3.5 disabled:cursor-not-allowed"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <button
                      className="bg-transparent border-none text-gray-400 hover:text-red-500 cursor-pointer p-1.5 rounded hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                      onClick={() => removeMember(m)}
                      disabled={isSelf}
                      title={isSelf ? 'No podés eliminarte a vos mismo' : 'Eliminar'}
                    >
                      <X size={13} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {adding ? (
        <div className="mt-3 border border-blue-300 rounded-md p-3 bg-blue-50/30 grid grid-cols-[120px_1fr_1fr_140px_auto] gap-2 items-center">
          <input
            type="text"
            placeholder="usuario"
            value={newMember.id}
            onChange={(e) => setNewMember(p => ({ ...p, id: e.target.value }))}
            className="border border-gray-200 rounded py-1.5 px-2 text-[12px] font-mono outline-none focus:border-blue-400"
            autoFocus
          />
          <input
            type="text"
            placeholder="Nombre completo"
            value={newMember.name}
            onChange={(e) => setNewMember(p => ({ ...p, name: e.target.value }))}
            className="border border-gray-200 rounded py-1.5 px-2 text-[12px] outline-none focus:border-blue-400"
          />
          <input
            type="text"
            placeholder="Rol"
            value={newMember.role}
            onChange={(e) => setNewMember(p => ({ ...p, role: e.target.value }))}
            className="border border-gray-200 rounded py-1.5 px-2 text-[12px] outline-none focus:border-blue-400"
          />
          <input
            type="text"
            placeholder="Contraseña"
            value={newMember.password}
            onChange={(e) => setNewMember(p => ({ ...p, password: e.target.value }))}
            className="border border-gray-200 rounded py-1.5 px-2 text-[12px] font-mono outline-none focus:border-blue-400"
          />
          <div className="flex gap-1">
            <button
              className="py-1.5 px-3 bg-blue-500 hover:bg-blue-600 text-white text-[11px] font-semibold rounded border-none cursor-pointer font-sans"
              onClick={handleAddMember}
            >Agregar</button>
            <button
              className="bg-transparent border-none text-gray-400 hover:text-gray-700 cursor-pointer text-sm px-1"
              onClick={() => { setAdding(false); setNewMember({ id: '', name: '', role: '', password: 'korex2026' }); }}
            >✕</button>
          </div>
        </div>
      ) : (
        <button
          className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-md py-2 px-3 cursor-pointer font-sans w-full justify-center transition-colors"
          onClick={() => setAdding(true)}
        >
          <Plus size={13} /> Agregar miembro
        </button>
      )}

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
