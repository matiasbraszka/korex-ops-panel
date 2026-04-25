import { useState, useEffect } from 'react';
import { X, Users, Crown } from 'lucide-react';

// Modal para crear / editar un CRM (pipeline). Layout fijo en 3 partes:
// header (fijo arriba) · body (scroll interno si hace falta) · footer
// (botones SIEMPRE visibles abajo). Soporta multi-asignación con picker
// de avatares custom (no <select> nativo).
export default function PipelineModal({
  open, onClose, onCreate, onUpdate,
  pipeline,
  isAdmin, currentUserId, salesTeam = [],
}) {
  const isEdit = !!pipeline;
  const [name, setName] = useState('');
  const [ownerId, setOwnerId] = useState('');
  const [memberIds, setMemberIds] = useState([]);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(pipeline?.name || '');
    setOwnerId(pipeline?.owner_id || currentUserId || '');
    setMemberIds(pipeline?.member_ids?.length
      ? [...pipeline.member_ids]
      : [pipeline?.owner_id || currentUserId].filter(Boolean));
    setErrorMsg('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const toggleMember = (uid) => {
    if (uid === ownerId) return;
    setMemberIds((prev) => prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid]);
  };
  const setOwner = (uid) => {
    setOwnerId(uid);
    setMemberIds((prev) => prev.includes(uid) ? prev : [...prev, uid]);
  };

  const handleSave = async (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!name.trim()) { setErrorMsg('Falta el nombre.'); return; }
    setErrorMsg('');
    setSaving(true);
    try {
      if (isEdit) {
        await onUpdate?.(pipeline.id, {
          name: name.trim(),
          owner_id: ownerId || currentUserId || null,
          member_ids: memberIds.filter(Boolean),
        });
      } else {
        const finalOwner = isAdmin ? (ownerId || currentUserId || null) : null;
        const extras = memberIds.filter((id) => id && id !== finalOwner);
        await onCreate?.(name.trim(), finalOwner, extras);
      }
    } catch (err) {
      console.error('PipelineModal save error:', err);
      setErrorMsg(err?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const team = salesTeam.filter((tm) => !!tm.user_id);

  return (
    <>
      {/* Backdrop sutil */}
      <div className="fixed inset-0 z-[60] bg-text/15 backdrop-blur-sm"
           style={{ animation: 'fadeIn .15s ease-out' }}
           onClick={onClose} />

      {/* Modal con LAYOUT FLEX VERTICAL: header / body scroll / footer fijo */}
      <div className="fixed z-[70] bg-white rounded-2xl border border-border
                      flex flex-col overflow-hidden
                      inset-x-4 top-1/2 -translate-y-1/2
                      md:inset-x-auto md:left-1/2 md:-translate-x-1/2
                      md:w-[480px] max-w-[520px]
                      max-h-[88vh]
                      shadow-[0_24px_60px_-12px_rgba(26,29,38,.18),0_8px_24px_-8px_rgba(26,29,38,.12)]"
           style={{ animation: 'scaleIn .18s cubic-bezier(.16,1,.3,1)' }}
           onClick={(e) => e.stopPropagation()}>

        {/* HEADER fijo */}
        <div className="flex items-center gap-3 p-5 pb-4 shrink-0 border-b border-border">
          <span className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-blue-bg text-blue">
            <Users size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold text-text">
              {isEdit ? 'Editar CRM' : 'Nuevo CRM'}
              <span className="ml-1.5 text-[9px] text-text3 font-normal">v3</span>
            </div>
            <div className="text-[11px] text-text2 mt-0.5">
              {isEdit ? 'Cambiá el nombre o las personas asignadas.' : 'Asigná a quién va dirigido.'}
            </div>
          </div>
          <button onClick={onClose} type="button"
                  className="bg-transparent border-0 text-text3 hover:text-text rounded p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* BODY scrolleable */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1.5">
              Nombre del CRM <span className="text-red">*</span>
            </label>
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder='Ej: "Pipeline Marzo", "Prospectos VIP"…'
                   autoFocus
                   onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                   className="w-full text-[13px] text-text bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-blue" />
          </div>

          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1.5">
              Asignar a {isAdmin ? '(podés elegir varias personas)' : ''}
            </label>
            <div className="border border-border rounded-lg bg-bg p-2 max-h-[260px] overflow-y-auto">
              {team.length === 0 ? (
                <div className="text-[11.5px] text-text3 text-center py-4">
                  No hay personas en el equipo de Ventas.
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {team.map((tm) => {
                    const isSelected = memberIds.includes(tm.user_id);
                    const isOwner = tm.user_id === ownerId;
                    const canChangeOwner = isAdmin && !isOwner;
                    const canToggleMember = isAdmin || tm.user_id === currentUserId;
                    return (
                      <div key={tm.user_id}
                           className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg transition-colors ${
                             isSelected ? 'bg-blue-bg' : 'hover:bg-surface2'
                           }`}>
                        <button type="button"
                                onClick={() => canToggleMember && toggleMember(tm.user_id)}
                                disabled={isOwner || !canToggleMember}
                                title={isOwner ? 'Responsable principal' : (isSelected ? 'Quitar' : 'Agregar')}
                                className="flex-1 flex items-center gap-2.5 bg-transparent border-0 p-0 cursor-pointer text-left disabled:cursor-default">
                          <Avatar person={tm} selected={isSelected || isOwner} />
                          <div className="flex-1 min-w-0">
                            <div className={`text-[12.5px] truncate ${isSelected || isOwner ? 'font-semibold text-text' : 'text-text2'}`}>
                              {tm.name}
                              {tm.user_id === currentUserId && <span className="text-text3 font-normal"> · vos</span>}
                            </div>
                            {isOwner && (
                              <div className="text-[10px] text-blue font-semibold flex items-center gap-1">
                                <Crown size={9} /> Responsable principal
                              </div>
                            )}
                          </div>
                          {(isSelected || isOwner) && !isOwner && (
                            <span className="text-[9px] uppercase tracking-wider font-bold text-blue px-1.5 py-0.5 bg-white rounded">
                              asignado
                            </span>
                          )}
                        </button>

                        {canChangeOwner && (
                          <button type="button"
                                  onClick={() => setOwner(tm.user_id)}
                                  title="Hacer responsable principal"
                                  className="text-text3 hover:text-blue bg-transparent border-0 p-1 cursor-pointer rounded hover:bg-white">
                            <Crown size={11} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="text-[10.5px] text-text3 mt-1.5">
              El responsable y los asignados ven y editan este CRM.
              {isAdmin && ' Click 👑 para cambiar responsable.'}
            </div>
          </div>

          {errorMsg && (
            <div className="p-2.5 bg-red-bg text-red text-[11.5px] rounded-lg border border-red/20">
              {errorMsg}
            </div>
          )}
        </div>

        {/* FOOTER fijo abajo — botones SIEMPRE visibles */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-border bg-white shrink-0">
          <button onClick={onClose} type="button" disabled={saving}
                  className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[12px] font-medium hover:bg-surface2">
            Cancelar
          </button>
          <button onClick={handleSave} type="button" disabled={saving || !name.trim()}
                  className="py-2 px-4 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark disabled:opacity-50 disabled:cursor-not-allowed shadow-sm">
            {saving ? 'Guardando…' : (isEdit ? 'Guardar cambios' : '+ Crear CRM')}
          </button>
        </div>
      </div>
    </>
  );
}

function Avatar({ person, selected }) {
  const color = person?.color || '#5B7CF5';
  if (person?.avatar_url) {
    return (
      <img src={person.avatar_url} alt={person.name}
           className={`w-8 h-8 rounded-full object-cover shrink-0 transition-all ${selected ? 'ring-2 ring-blue ring-offset-1' : ''}`} />
    );
  }
  return (
    <span className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[11px] shrink-0 transition-all ${selected ? 'ring-2 ring-blue ring-offset-1' : ''}`}
          style={{ background: color + '24', color }}>
      {person?.initials || person?.name?.slice(0, 2).toUpperCase()}
    </span>
  );
}
