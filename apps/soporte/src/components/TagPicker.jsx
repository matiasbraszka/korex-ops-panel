import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import TagManager from './TagManager.jsx';

// Toggle de etiquetas del catálogo sobre la conversación abierta.
// Click en un chip = asignar/quitar. "+ Nueva" / lápiz = administrar catálogo.
export default function TagPicker({ conv }) {
  const { tagsCatalog, updateConversation } = useSoporte();
  const [managerOpen, setManagerOpen] = useState(false);
  const active = new Set(conv.tags || []);

  const toggle = (tagId) => {
    const next = active.has(tagId)
      ? (conv.tags || []).filter((t) => t !== tagId)
      : [...(conv.tags || []), tagId];
    updateConversation(conv.id, { tags: next });
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 flex-wrap">
        {tagsCatalog.map((t) => {
          const on = active.has(t.id);
          return (
            <button key={t.id} onClick={() => toggle(t.id)}
                    title={on ? 'Quitar etiqueta' : 'Asignar etiqueta'}
                    className="text-[11px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer transition-all"
                    style={on
                      ? { background: t.color, borderColor: t.color, color: '#fff' }
                      : { background: t.color + '14', borderColor: t.color + '66', color: t.color }}>
              {on ? '✓ ' : ''}{t.label}
            </button>
          );
        })}
        <button onClick={() => setManagerOpen(true)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full border border-[#4A67D8]/40 bg-[#EEF2FF] text-[#4A67D8] cursor-pointer hover:bg-[#E0E7FF] flex items-center gap-1 transition-colors">
          {tagsCatalog.length === 0 ? (<><Plus size={12} /> Crear etiqueta</>) : (<><Pencil size={11} /> Administrar</>)}
        </button>
      </div>
      {tagsCatalog.length > 0 && (
        <div className="text-[10px] text-text3 mt-1.5">Tocá una etiqueta para asignarla o quitarla de este chat.</div>
      )}
      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
