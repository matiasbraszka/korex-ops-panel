import { useState } from 'react';
import { Plus, Settings2 } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import TagManager from './TagManager.jsx';

// Toggle de etiquetas del catálogo sobre la conversación abierta.
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
                    className="text-[11px] font-semibold px-2 py-1 rounded-full border cursor-pointer transition-all"
                    style={on
                      ? { background: t.color, borderColor: t.color, color: '#fff' }
                      : { background: t.color + '12', borderColor: t.color + '50', color: t.color }}>
              {t.label}
            </button>
          );
        })}
        <button onClick={() => setManagerOpen(true)}
                className="text-[11px] font-semibold px-2 py-1 rounded-full border border-dashed border-border text-text3 bg-transparent cursor-pointer hover:text-text2 hover:border-text3 flex items-center gap-1">
          {tagsCatalog.length === 0 ? (<><Plus size={11} /> Crear etiqueta</>) : <Settings2 size={11} />}
        </button>
      </div>
      <TagManager open={managerOpen} onClose={() => setManagerOpen(false)} />
    </div>
  );
}
