import { useState } from 'react';
import { Trash2, Plus, Pencil, Check, X } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import Modal from './Modal.jsx';

const PALETTE = ['#22C55E', '#5B7CF5', '#F59E0B', '#EC4899', '#8B5CF6', '#06B6D4', '#F97316', '#10B981', '#F43F5E', '#6B7280'];

function ColorDots({ value, onChange }) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {PALETTE.map((c) => (
        <button key={c} onClick={() => onChange(c)}
                className="w-6 h-6 rounded-full border-2 cursor-pointer transition-transform"
                style={{ background: c, borderColor: value === c ? '#1A1D26' : 'transparent', transform: value === c ? 'scale(1.15)' : 'none' }} />
      ))}
    </div>
  );
}

// CRUD del catálogo de etiquetas (vive en app_settings.soporte_config.tags):
// crear, renombrar, cambiar color y eliminar.
export default function TagManager({ open, onClose }) {
  const { tagsCatalog, saveTagsCatalog } = useSoporte();
  const [label, setLabel] = useState('');
  const [color, setColor] = useState(PALETTE[0]);
  const [editingId, setEditingId] = useState(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState(PALETTE[0]);

  const addTag = () => {
    const name = label.trim();
    if (!name) return;
    const id = 'tag_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    saveTagsCatalog([...tagsCatalog, { id, label: name, color }]);
    setLabel('');
    setColor(PALETTE[(tagsCatalog.length + 1) % PALETTE.length]);
  };

  const startEdit = (t) => {
    setEditingId(t.id);
    setEditLabel(t.label);
    setEditColor(t.color);
  };

  const saveEdit = () => {
    const name = editLabel.trim();
    if (!name) return;
    saveTagsCatalog(tagsCatalog.map((t) => (t.id === editingId ? { ...t, label: name, color: editColor } : t)));
    setEditingId(null);
  };

  const removeTag = (id) => {
    // Solo se quita del catálogo; los ids huérfanos en conversaciones se
    // ignoran al renderizar, no hace falta limpiar filas.
    saveTagsCatalog(tagsCatalog.filter((t) => t.id !== id));
    if (editingId === id) setEditingId(null);
  };

  return (
    <Modal open={open} onClose={onClose} title="Etiquetas" maxWidth={440}>
      <div className="flex flex-col gap-3">
        {tagsCatalog.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {tagsCatalog.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="px-2.5 py-2.5 rounded-lg border border-[#5B7CF5]/50 bg-[#EEF2FF]/40 flex flex-col gap-2">
                  <input
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); }}
                    autoFocus
                    className="w-full px-2.5 py-1.5 text-[13px] rounded-lg border border-border bg-white outline-none focus:border-[#5B7CF5]"
                  />
                  <ColorDots value={editColor} onChange={setEditColor} />
                  <div className="flex items-center gap-2">
                    <button onClick={saveEdit} disabled={!editLabel.trim()}
                            className="flex-1 py-1.5 rounded-lg border-0 bg-[#5B7CF5] text-white text-[12px] font-bold cursor-pointer hover:bg-[#4A67D8] flex items-center justify-center gap-1">
                      <Check size={13} /> Guardar
                    </button>
                    <button onClick={() => setEditingId(null)}
                            className="py-1.5 px-3 rounded-lg border border-border bg-white text-[12px] font-medium text-text2 cursor-pointer hover:bg-surface2 flex items-center gap-1">
                      <X size={13} /> Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div key={t.id} className="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border hover:border-[#5B7CF5]/40 transition-colors">
                  <span className="text-[11px] font-semibold px-2.5 py-1 rounded-full"
                        style={{ background: t.color, color: '#fff' }}>{t.label}</span>
                  <span className="flex-1" />
                  <button onClick={() => startEdit(t)} title="Editar nombre y color"
                          className="border border-border bg-white rounded-lg text-text2 hover:text-[#5B7CF5] hover:border-[#5B7CF5]/50 cursor-pointer p-1.5 transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => removeTag(t.id)} title="Eliminar etiqueta"
                          className="border border-border bg-white rounded-lg text-text2 cursor-pointer p-1.5 transition-colors hover:border-[#DC2626]/50"
                          onMouseEnter={(e) => { e.currentTarget.style.color = '#DC2626'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.color = ''; }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )
            )}
          </div>
        )}
        <div className={tagsCatalog.length > 0 ? 'border-t border-border pt-3' : ''}>
          <div className="text-[11px] font-bold text-text3 uppercase tracking-wider mb-1.5">Nueva etiqueta</div>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
            placeholder="Nombre (ej: Lead caliente)"
            className="w-full px-3 py-2 text-[13px] rounded-lg border border-border outline-none focus:border-[#5B7CF5] mb-2"
          />
          <div className="mb-3">
            <ColorDots value={color} onChange={setColor} />
          </div>
          <button onClick={addTag} disabled={!label.trim()}
                  className={`w-full py-2.5 rounded-lg border-0 text-[13px] font-bold flex items-center justify-center gap-1.5 transition-colors ${label.trim() ? 'bg-[#5B7CF5] text-white cursor-pointer hover:bg-[#4A67D8]' : 'bg-surface2 text-text3 cursor-default'}`}>
            <Plus size={15} /> Agregar etiqueta
          </button>
        </div>
      </div>
    </Modal>
  );
}
