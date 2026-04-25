import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, Check, Pencil, Trash2, Users, Globe, Settings2 } from 'lucide-react';

// Selector sutil de pipeline (CRM) en el topbar.
// Click en el nombre -> dropdown con la lista de pipelines visibles + boton
// "+ Nuevo CRM". Boton engranaje (Settings2) abre el modal de edit (nombre +
// owner). Boton trash elimina (admin/owner, no shared).
export default function PipelineSwitcher({
  pipelines, pipelineId, onSelect,
  onNew, onEdit, onDelete,
  isAdmin, currentUserId,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const active = pipelines.find((p) => p.id === pipelineId);
  const canEdit = (p) => isAdmin || p.owner_id === currentUserId;
  const canDelete = (p) => !p.is_shared && (isAdmin || p.owner_id === currentUserId);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(!open)}
              className="flex items-center gap-1.5 py-1 px-2 -ml-1 rounded-md hover:bg-surface2 transition-colors group">
        <span className="text-[17px] font-bold leading-tight">{active?.name || 'CRM'}</span>
        <ChevronDown size={14} className="text-text3 group-hover:text-text2 transition-colors mt-0.5" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 bg-white border border-border rounded-xl shadow-xl overflow-hidden min-w-[280px] max-w-[360px]">
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 px-3 py-2 border-b border-border bg-surface2">
            Mis CRMs
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {pipelines.length === 0 && (
              <div className="text-[11px] text-text3 px-3 py-3 text-center">No hay CRMs todavía</div>
            )}
            {pipelines.map((p) => {
              const isOn = p.id === pipelineId;
              return (
                <div key={p.id}
                     className={`group/item flex items-center gap-1 px-2 py-2 transition-colors ${
                       isOn ? 'bg-blue-bg' : 'hover:bg-surface2'
                     }`}>
                  <button type="button"
                          onClick={() => { onSelect(p.id); setOpen(false); }}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left bg-transparent border-0 p-0 cursor-pointer">
                    <span className={`shrink-0 ${isOn ? 'text-blue' : 'text-text3'}`}>
                      {p.is_shared ? <Globe size={12} /> : <Users size={12} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className={`text-[12.5px] truncate ${isOn ? 'font-semibold text-text' : 'text-text2'}`}>
                        {p.name}
                      </div>
                      <div className="text-[10px] text-text3 truncate">
                        {p.is_shared
                          ? `Compartido · ${p.lead_count} leads`
                          : `${p.owner_name || 'Sin asignar'} · ${p.lead_count} leads`}
                      </div>
                    </div>
                    {isOn && <Check size={14} className="text-blue shrink-0" />}
                  </button>
                  {canEdit(p) && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); setOpen(false); onEdit?.(p); }}
                            title="Editar (nombre + asignado)"
                            className="text-text3 hover:text-text hover:bg-surface3 bg-transparent border-0 p-1.5 rounded cursor-pointer transition-colors">
                      <Settings2 size={12} />
                    </button>
                  )}
                  {canDelete(p) && (
                    <button type="button" onClick={(e) => { e.stopPropagation(); onDelete?.(p); }}
                            title="Eliminar CRM"
                            className="text-text3 hover:text-red hover:bg-red-bg bg-transparent border-0 p-1.5 rounded cursor-pointer transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button"
                  onClick={() => { setOpen(false); onNew?.(); }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-[12.5px] font-semibold text-blue hover:bg-blue-bg border-t border-border bg-transparent cursor-pointer">
            <Plus size={13} /> Nuevo CRM
          </button>
        </div>
      )}
    </div>
  );
}
