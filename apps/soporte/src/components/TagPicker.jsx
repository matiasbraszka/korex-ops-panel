import { useEffect, useRef, useState } from 'react';
import { Plus, X, Pencil } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import TagManager from './TagManager.jsx';

// Etiquetas de la conversación — Diseño A: chips de las asignadas + chip
// "+ Etiqueta" punteado que abre el popover para asignar o administrar.
export default function TagPicker({ conv }) {
  const { tagsCatalog, updateConversation } = useSoporte();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const wrapRef = useRef(null);

  const assignedIds = conv.tags || [];
  const assigned = assignedIds.map((id) => tagsCatalog.find((t) => t.id === id)).filter(Boolean);
  const available = tagsCatalog.filter((t) => !assignedIds.includes(t.id));

  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setPickerOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  const add = (tagId) => {
    updateConversation(conv.id, { tags: [...assignedIds, tagId] });
    setPickerOpen(false);
  };
  const remove = (tagId) => {
    updateConversation(conv.id, { tags: assignedIds.filter((t) => t !== tagId) });
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="flex items-center gap-1.5 flex-wrap">
        {assigned.map((t) => (
          <span key={t.id}
                className="group text-[11px] font-semibold pl-2.5 pr-1.5 py-[3px] rounded-full flex items-center gap-1"
                style={{ background: t.color + '1f', color: t.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.color }} />
            {t.label}
            <button onClick={() => remove(t.id)} title="Quitar etiqueta"
                    className="bg-transparent border-0 cursor-pointer p-0 ml-0.5 opacity-50 hover:opacity-100 flex items-center"
                    style={{ color: t.color }}>
              <X size={11} />
            </button>
          </span>
        ))}
        <button onClick={() => setPickerOpen((v) => !v)}
                className="text-[11px] font-semibold px-2.5 py-[3px] rounded-full border border-dashed border-[#D0D5DD] bg-white text-text2 cursor-pointer hover:border-[#F5D9A8] hover:text-[#B45309] flex items-center gap-1 transition-colors duration-150">
          <Plus size={11} /> Etiqueta
        </button>
      </div>

      {/* Popover de asignación */}
      {pickerOpen && (
        <div className="absolute top-full left-0 mt-1.5 w-[220px] bg-white border border-border rounded-[12px] shadow-[0_12px_32px_rgba(10,22,40,.10),0_4px_12px_rgba(10,22,40,.06)] p-1.5 z-30">
          {available.length === 0 ? (
            <div className="text-[11.5px] text-text3 px-2 py-1.5">
              {tagsCatalog.length === 0 ? 'Todavía no hay etiquetas.' : 'Ya tiene todas las etiquetas.'}
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {available.map((t) => (
                <button key={t.id} onClick={() => add(t.id)}
                        className="flex items-center gap-2 px-2 py-1.5 rounded-lg border-0 bg-transparent hover:bg-surface2 cursor-pointer text-left transition-colors duration-150 w-full">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: t.color }} />
                  <span className="text-[12px] font-medium">{t.label}</span>
                </button>
              ))}
            </div>
          )}
          <button onClick={() => { setPickerOpen(false); setManagerOpen(true); }}
                  className="w-full mt-1 pt-1.5 border-t border-surface2 text-[11px] font-semibold text-[#B45309] bg-transparent border-x-0 border-b-0 cursor-pointer hover:underline flex items-center gap-1 px-2 pb-0.5">
            <Pencil size={10} /> Administrar etiquetas
          </button>
        </div>
      )}

      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
