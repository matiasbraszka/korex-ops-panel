import { useState, useRef, useEffect } from 'react';
import { Check, Plus, Pencil, Trash2, ChevronDown } from 'lucide-react';

// Desplegable de etiqueta configurable: elige una opción Y permite agregar / renombrar /
// quitar etiquetas en el mismo desplegable. Los chips se colorean con el hex de la opción.
const chipStyle = (c) => (c ? { backgroundColor: c + '22', color: c } : { backgroundColor: '#f1f5f9', color: '#475569' });

export default function TagSelect({ value, opts = [], onChange, onAdd, onRename, onRemove, placeholder = '—', className = '' }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState('');
  const [editId, setEditId] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setEditId(null); } };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const cur = opts.find((o) => o.value === value);

  const commitAdd = async () => {
    const v = adding.trim();
    if (!v || !onAdd) return;
    const created = await onAdd(v);
    setAdding('');
    if (created?.value) onChange?.(created.value);
    setOpen(false);
  };

  return (
    <span ref={ref} className={`relative inline-block ${className}`}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 w-full text-left px-1 py-0.5 rounded border border-transparent hover:border-border cursor-pointer">
        {value
          ? <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap" style={chipStyle(cur?.color)}>{value}</span>
          : <span className="text-text3 text-[11px]">{placeholder}</span>}
        <ChevronDown size={11} className="text-text3 ml-auto shrink-0" />
      </button>
      {open && (
        <div className="absolute z-30 mt-1 w-56 bg-white border border-border rounded-lg shadow-lg p-1 max-h-72 overflow-auto">
          {opts.map((o) => (
            <div key={o.id} className="flex items-center gap-1 group rounded hover:bg-surface2 px-1 py-0.5">
              {editId === o.id ? (
                <input autoFocus defaultValue={o.value}
                  onKeyDown={(e) => { if (e.key === 'Enter') { onRename?.(o.id, e.target.value); setEditId(null); } if (e.key === 'Escape') setEditId(null); }}
                  onBlur={(e) => { onRename?.(o.id, e.target.value); setEditId(null); }}
                  className="flex-1 text-[11px] border border-border rounded px-1 py-0.5 outline-none" />
              ) : (
                <button type="button" onClick={() => { onChange?.(o.value); setOpen(false); }}
                  className="flex-1 flex items-center gap-1 text-left bg-transparent border-0 cursor-pointer min-w-0">
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold truncate" style={chipStyle(o.color)}>{o.value}</span>
                  {o.value === value && <Check size={12} className="text-green-600 shrink-0" />}
                </button>
              )}
              {onRename && editId !== o.id && (
                <button type="button" onClick={() => setEditId(o.id)} title="Renombrar"
                  className="opacity-0 group-hover:opacity-100 text-text3 hover:text-text bg-transparent border-0 cursor-pointer p-0.5"><Pencil size={11} /></button>
              )}
              {onRemove && editId !== o.id && (
                <button type="button" onClick={() => onRemove(o.id)} title="Quitar"
                  className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red-600 bg-transparent border-0 cursor-pointer p-0.5"><Trash2 size={11} /></button>
              )}
            </div>
          ))}
          {onAdd && (
            <div className="flex items-center gap-1 border-t border-border mt-1 pt-1.5 px-1">
              <Plus size={12} className="text-text3 shrink-0" />
              <input value={adding} onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); }}
                placeholder="Nueva etiqueta + Enter" className="flex-1 text-[11px] outline-none bg-transparent" />
            </div>
          )}
        </div>
      )}
    </span>
  );
}
