import { useState } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import Modal from './Modal.jsx';

const PALETTE = ['#22C55E', '#5B7CF5', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#F97316', '#10B981', '#F43F5E', '#6B7280'];

// CRUD del catálogo de etiquetas (vive en app_settings.soporte_config.tags).
export default function TagManager({ open, onClose }) {
  const { tagsCatalog, saveTagsCatalog } = useSoporte();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(PALETTE[0]);

  const addTag = () => {
    const name = label.trim();
    if (!name) return;
    const id = 'tag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    saveTagsCatalog([...tagsCatalog, { id, label: name, color }]);
    setLabel('');
    setColor(PALETTE[(tagsCatalog.length + 1) % PALETTE.length]);
  };

  const removeTag = (id) => {
    // Solo se quita del catálogo; los ids huérfanos en conversaciones se
    // ignoran al renderizar (filter por catálogo), no hace falta limpiar filas.
    saveTagsCatalog(tagsCatalog.filter((t) => t.id !== id));
  };

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas" maxWidth={420}>
      <div className="flex flex-col gap-3">
        {tagsCatalog.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {tagsCatalog.map((t) => (
              <div key={t.id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border">
                <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: t.color }} />
                <span className="text-[13px] font-medium flex-1 truncate">{t.label}</span>
                <button onClick={() => removeTag(t.id)}
                        className="bg-transparent border-0 text-text3 hover:text-red-500 cursor-pointer p-1" style={{ color: undefined }}>
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="border-t border-border pt-3">
          <div className="text-[11px] font-bold text-text3 uppercase tracking-wider mb-1.5">Nueva etiqueta</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
            placeholder="Nombre (ej: Lead caliente)"
            className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#F59E0B] mb-2"
          />
          <div className="flex items-center gap-1.5 mb-3 flex-wrap">
            {PALETTE.map((c) => (
              <button key={c} onClick={() => setColor(c)}
                      className="w-6 h-6 rounded-full border-2 cursor-pointer transition-transform"
                      style={{ background: c, borderColor: color === c ? '#1A1D26' : 'transparent', transform: color === c ? 'scale(1.15)' : 'none' }} />
            ))}
          </div>
          <button onClick={addTag} disabled={!label.trim()}
                  className={`w-full py-2 rounded-lg border-0 text-[13px] font-semibold flex items-center justify-center gap-1.5 transition-colors ${label.trim() ? 'bg-[#F59E0B] text-white cursor-pointer hover:opacity-90' : 'bg-surface2 text-text3 cursor-default'}`}>
            <Plus size={14} /> Agregar etiqueta
          </button>
        </div>
      </div>
    </Modal>
  );
}
