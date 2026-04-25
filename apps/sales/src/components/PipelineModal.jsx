import { useState, useEffect } from 'react';

// PipelineModal v4: ultra simple. Layout natural sin fixed positioning loco.
// Solo: nombre del CRM + checkboxes de vendedores + botones.
// No muestra admins (se asume que ven todo). No hay "responsable principal":
// el creador queda como owner internamente, los vendedores marcados son members.
export default function PipelineModal({
  open, onClose, onCreate, onUpdate,
  pipeline,             // si viene → modo edicion
  currentUserId,        // user actual (para marcar al creator como owner)
  sellers = [],         // SOLO vendedores (sin admins)
  isAdmin,              // mantener compat con el flujo de update
}) {
  const isEdit = !!pipeline;
  const [name, setName] = useState('');
  const [selectedIds, setSelectedIds] = useState([]); // user_ids de vendedores marcados
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(pipeline?.name || '');
    // Vendedores asignados = los member_ids actuales que sean vendedores.
    const memberIds = pipeline?.member_ids || [];
    const sellerIds = sellers.map((s) => s.user_id);
    setSelectedIds(memberIds.filter((id) => sellerIds.includes(id)));
    setErrorMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggleSeller = (uid) => {
    setSelectedIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  };

  const handleSave = async () => {
    if (!name.trim()) { setErrorMsg('Falta el nombre del CRM.'); return; }
    setErrorMsg('');
    setSaving(true);
    try {
      // Members = creator (currentUserId) + vendedores seleccionados
      const allMembers = [currentUserId, ...selectedIds].filter(Boolean);
      const uniqueMembers = [...new Set(allMembers)];

      if (isEdit) {
        await onUpdate?.(pipeline.id, {
          name: name.trim(),
          member_ids: uniqueMembers,
        });
      } else {
        // Owner = currentUser. Members = currentUser + vendedores marcados.
        const extras = uniqueMembers.filter((id) => id !== currentUserId);
        await onCreate?.(name.trim(), currentUserId || null, extras);
      }
    } catch (err) {
      console.error('PipelineModal save error:', err);
      setErrorMsg(err?.message || 'Error al guardar. Revisá la consola.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4"
         style={{ background: 'rgba(26,29,38,0.35)' }}
         onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md flex flex-col"
           style={{ maxHeight: '90vh' }}
           onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-text">
              {isEdit ? 'Editar CRM' : 'Nuevo CRM'}
            </h2>
            <p className="text-[11px] text-text2 mt-0.5">
              {isEdit ? 'Cambiá el nombre o los vendedores asignados.' : 'Asigná vendedores al CRM.'}
            </p>
          </div>
          <button type="button" onClick={onClose}
                  className="text-text3 hover:text-text bg-transparent border-0 text-2xl leading-none cursor-pointer w-8 h-8 flex items-center justify-center rounded hover:bg-surface2">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-[11px] font-semibold text-text2 mb-1.5">
              Nombre del CRM
            </label>
            <input type="text" value={name}
                   onChange={(e) => setName(e.target.value)}
                   onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                   placeholder='Ej: Pipeline Bogard'
                   autoFocus
                   className="w-full text-[14px] text-text bg-white border-2 border-border rounded-lg px-3 py-2.5 outline-none focus:border-blue" />
          </div>

          {/* Vendedores */}
          <div>
            <label className="block text-[11px] font-semibold text-text2 mb-1.5">
              Asignar a vendedores
            </label>
            {sellers.length === 0 ? (
              <div className="text-[12px] text-text3 bg-bg border border-border rounded-lg p-3 text-center">
                No hay vendedores cargados en el equipo. Agregalos desde Configuración.
              </div>
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border bg-white">
                {sellers.map((s) => {
                  const checked = selectedIds.includes(s.user_id);
                  return (
                    <label key={s.user_id}
                           className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${
                             checked ? 'bg-blue-bg' : 'hover:bg-surface2'
                           }`}>
                      <input type="checkbox"
                             checked={checked}
                             onChange={() => toggleSeller(s.user_id)}
                             className="w-4 h-4 cursor-pointer" />
                      <span className="text-[13px] text-text">{s.name}</span>
                    </label>
                  );
                })}
              </div>
            )}
            <p className="text-[10.5px] text-text3 mt-1.5">
              Los vendedores marcados podrán ver y editar este CRM.
            </p>
          </div>

          {errorMsg && (
            <div className="bg-red-bg border border-red/30 text-red text-[12px] rounded-lg p-2.5">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Footer SIEMPRE visible */}
        <div className="px-5 py-3 border-t border-border bg-white flex items-center justify-end gap-2 rounded-b-xl">
          <button type="button" onClick={onClose} disabled={saving}
                  className="py-2 px-4 rounded-lg border border-border bg-white text-text2 text-[13px] font-medium hover:bg-surface2 disabled:opacity-50">
            Cancelar
          </button>
          <button type="button" onClick={handleSave} disabled={saving || !name.trim()}
                  className="py-2 px-4 rounded-lg bg-blue text-white text-[13px] font-bold hover:bg-blue-dark disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {saving ? 'Guardando…' : (isEdit ? 'Guardar' : 'Crear CRM')}
          </button>
        </div>
      </div>
    </div>
  );
}
