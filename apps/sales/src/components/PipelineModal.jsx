import { useState, useEffect } from 'react';
import { X, Users } from 'lucide-react';

// Modal para crear o EDITAR un CRM (pipeline). Si pipeline prop existe → edit.
// Admin puede asignar el CRM a cualquier vendedor del equipo. Sales solo
// puede asignarse a si mismo (selector deshabilitado).
export default function PipelineModal({
  open, onClose, onCreate, onUpdate,
  pipeline, // si viene → modo edicion
  isAdmin, currentUserId, salesTeam = [],
}) {
  const isEdit = !!pipeline;
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(pipeline?.name || '');
    setOwnerId(pipeline?.owner_id || currentUserId || '');
  }, [open, pipeline, currentUserId]);

  if (!open) return null;

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!name.trim()) return;
    setSaving(true);
    if (isEdit) {
      await onUpdate?.(pipeline.id, { name: name.trim(), owner_id: ownerId });
    } else {
      await onCreate?.(name.trim(), isAdmin ? (ownerId || null) : null);
    }
    setSaving(false);
  };

  // El selector "Asignar a" siempre se muestra (mas claro). Si no es admin,
  // queda deshabilitado mostrando "Yo" - el sales no puede asignar a otra persona.
  const ownerSelectDisabled = !isAdmin;

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-text/15 backdrop-blur-sm"
           style={{ animation: 'fadeIn .15s ease-out' }}
           onClick={onClose} />
      <div className="fixed z-[70] bg-white rounded-2xl border border-border
                      inset-x-4 top-1/2 -translate-y-1/2
                      md:inset-x-auto md:left-1/2 md:-translate-x-1/2
                      md:w-[440px] max-w-[460px] p-5
                      shadow-[0_24px_60px_-12px_rgba(26,29,38,.18),0_8px_24px_-8px_rgba(26,29,38,.12)]"
           style={{ animation: 'scaleIn .18s cubic-bezier(.16,1,.3,1)' }}
           onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-blue-bg text-blue">
            <Users size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-text">{isEdit ? 'Editar CRM' : 'Nuevo CRM'}</div>
            <div className="text-[11px] text-text2 mt-0.5">
              {isEdit
                ? 'Cambiá el nombre o el responsable de este CRM.'
                : 'Se crea con etapas por defecto. Podés editarlas después.'}
            </div>
          </div>
          <button onClick={onClose} type="button"
                  className="bg-transparent border-0 text-text3 hover:text-text rounded p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex flex-col gap-3.5">
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1.5">
              Nombre del CRM <span className="text-red">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder='Ej: "Pipeline Marzo", "Prospectos VIP"…'
                   autoFocus
                   className="w-full text-[13px] text-text bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-blue" />
          </div>

          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1.5">
              Asignar a <span className="text-red">*</span>
            </label>
            <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)}
                    disabled={ownerSelectDisabled}
                    className="w-full text-[13px] text-text bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-blue cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed">
              <option value={currentUserId}>
                Yo {isAdmin ? '(admin)' : ''}
              </option>
              {salesTeam
                .filter((tm) => tm.user_id && tm.user_id !== currentUserId)
                .map((tm) => (
                  <option key={tm.user_id} value={tm.user_id}>{tm.name}</option>
                ))}
            </select>
            <div className="text-[10.5px] text-text3 mt-1">
              {ownerSelectDisabled
                ? 'Solo los admins pueden asignar CRMs a otras personas.'
                : 'El asignado y los admins pueden ver y editar este CRM.'}
            </div>
          </div>
        </form>

        <div className="flex items-center justify-end gap-2 mt-5">
          <button onClick={onClose} type="button" disabled={saving}
                  className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[12px] font-medium hover:bg-surface2">
            Cancelar
          </button>
          <button onClick={handleSave} type="submit" disabled={saving || !name.trim()}
                  className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : 'Crear CRM')}
          </button>
        </div>
      </div>
    </>
  );
}
