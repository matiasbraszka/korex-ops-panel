import { useEffect, useState } from 'react';

// Componente reutilizable de recursos / links categorizados.
// Usa el mismo diseño que ya tenemos en la ficha del cliente, extraido a
// un paquete compartido para que lo consuman tanto Operaciones como Ventas.
//
// Props:
//   - title: string (header del panel)
//   - icon: string (emoji opcional)
//   - links: array de { id?, label, url, category }
//   - onAdd(link): se invoca al crear un link nuevo
//   - onUpdate(linkOrIdx, patch): se invoca al editar
//   - onDelete(linkOrIdx): se invoca al eliminar
//   - emptyText / emptyHint: textos del estado vacio
//   - allowedCategories: lista de keys permitidas (default: todas)

export const LINK_CATEGORIES = {
  folder:        { label: 'Carpetas',        icon: '📁', color: '#F59E0B' },
  doc:           { label: 'Docs',            icon: '📄', color: '#3B82F6' },
  sheet:         { label: 'Sheets',          icon: '📊', color: '#10B981' },
  landing:       { label: 'Landings',        icon: '🌐', color: '#8B5CF6' },
  pdf:           { label: 'PDFs',            icon: '📄', color: '#EF4444' },
  guion:         { label: 'Guiones',         icon: '📝', color: '#0EA5E9' },
  presentacion:  { label: 'Presentaciones',  icon: '🎯', color: '#A855F7' },
  testimonio:    { label: 'Testimonios',     icon: '💬', color: '#22C55E' },
  video:         { label: 'Videos',          icon: '🎬', color: '#EC4899' },
  other:         { label: 'Otros',           icon: '🔗', color: '#6B7280' },
};

export const LINK_CATEGORY_ORDER = [
  'folder', 'doc', 'sheet', 'landing', 'pdf',
  'guion', 'presentacion', 'testimonio', 'video', 'other',
];

export default function ResourcesPanel({
  title = 'Links y recursos',
  icon = '🔗',
  links = [],
  onAdd, onUpdate, onDelete,
  emptyText = 'Sin links registrados',
  emptyHint = 'Agregá carpetas de Drive, docs, landings, PDFs, etc.',
  allowedCategories = LINK_CATEGORY_ORDER,
}) {
  const [modal, setModal] = useState(null); // null | { mode: 'new'|'edit', initial }

  const openNew = () => setModal({ mode: 'new', initial: { label: '', url: '', category: allowedCategories[0] || 'other' } });
  const openEdit = (link) => setModal({ mode: 'edit', initial: link });
  const close = () => setModal(null);

  const submitForm = async (form) => {
    if (modal.mode === 'new') {
      await onAdd?.({ label: form.label?.trim() || '', url: form.url.trim(), category: form.category || 'other' });
    } else {
      await onUpdate?.(modal.initial, { label: form.label?.trim() || '', url: form.url.trim(), category: form.category || 'other' });
    }
    close();
  };

  // Agrupar por categoría manteniendo el orden definido.
  const grouped = {};
  links.forEach((link, originalIdx) => {
    const cat = link.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push({ ...link, originalIdx });
  });

  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="py-3 px-4 border-b border-border text-[13px] font-bold flex items-center justify-between">
        <span className="inline-flex items-center gap-2">
          <span className="w-6 h-6 rounded-md flex items-center justify-center text-[13px]"
                style={{ background: '#EEF2FF', color: '#5B7CF5' }}>{icon}</span>
          {title}
        </span>
        <button onClick={openNew}
                className="bg-transparent border-none text-text2 cursor-pointer text-xs py-1 px-2 rounded hover:bg-surface2 font-sans">
          + Nuevo
        </button>
      </div>
      <div className="py-3 px-4">
        {links.length === 0 ? (
          <div className="text-center text-text3 text-xs py-6">
            {emptyText}
            {emptyHint && <div className="text-[10px] text-text3 mt-1">{emptyHint}</div>}
          </div>
        ) : (
          <div className="space-y-3">
            {allowedCategories.filter((cat) => grouped[cat]?.length).map((cat) => {
              const catInfo = LINK_CATEGORIES[cat] || LINK_CATEGORIES.other;
              return (
                <div key={cat}>
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: catInfo.color }}>
                      {catInfo.icon} {catInfo.label}
                    </span>
                    <span className="text-[9px] text-text3">({grouped[cat].length})</span>
                  </div>
                  <div className="space-y-0.5">
                    {grouped[cat].map((link) => (
                      <div key={link.originalIdx}
                           className="group/link flex items-center gap-2.5 py-1.5 px-2.5 rounded-md hover:bg-blue-50/50 border border-transparent hover:border-blue-100 transition-colors">
                        <span className="text-sm shrink-0">{catInfo.icon}</span>
                        <a href={link.url} target="_blank" rel="noreferrer"
                           className="flex-1 min-w-0 text-[12px] text-gray-800 hover:text-blue-600 no-underline font-sans font-medium truncate">
                          {link.label || link.url}
                        </a>
                        <button onClick={() => openEdit(link)}
                                title="Editar"
                                className="text-[10px] text-gray-300 hover:text-blue-500 bg-transparent border-none cursor-pointer py-1 px-1.5 rounded opacity-0 group-hover/link:opacity-100 transition-opacity font-sans">
                          ✏️
                        </button>
                        <button onClick={() => onDelete?.(link)}
                                title="Eliminar"
                                className="text-[10px] text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer py-1 px-1.5 rounded opacity-0 group-hover/link:opacity-100 transition-opacity font-sans">
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {modal && (
        <LinkFormModal
          mode={modal.mode}
          initial={modal.initial}
          allowedCategories={allowedCategories}
          onSubmit={submitForm}
          onClose={close}
        />
      )}
    </div>
  );
}

function LinkFormModal({ mode, initial, allowedCategories, onSubmit, onClose }) {
  const [form, setForm] = useState({ label: '', url: '', category: 'folder' });

  useEffect(() => { setForm({ label: initial?.label || '', url: initial?.url || '', category: initial?.category || allowedCategories[0] || 'other' }); }, [initial, allowedCategories]);

  const submit = (e) => {
    e.preventDefault();
    if (!form.url.trim()) { alert('La URL es obligatoria.'); return; }
    onSubmit(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-[440px]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={submit}>
          <div className="p-5 border-b border-border">
            <h2 className="text-[15px] font-bold">{mode === 'new' ? 'Nuevo link' : 'Editar link'}</h2>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Etiqueta</label>
              <input value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                     placeholder="Carpeta de Drive, Guión VSL, …"
                     className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">URL *</label>
              <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                     placeholder="https://…" required
                     className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text2 mb-1">Categoría</label>
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      className="w-full bg-bg border border-border rounded-md py-[9px] px-3 text-[13px] outline-none focus:border-blue cursor-pointer">
                {allowedCategories.map((c) => {
                  const info = LINK_CATEGORIES[c] || LINK_CATEGORIES.other;
                  return <option key={c} value={c}>{info.icon} {info.label}</option>;
                })}
              </select>
            </div>
          </div>
          <div className="p-5 border-t border-border flex justify-end gap-2">
            <button type="button" onClick={onClose}
                    className="py-2 px-4 rounded-md border border-border bg-white text-text2 text-[13px] hover:bg-surface2">
              Cancelar
            </button>
            <button type="submit"
                    className="py-2 px-4 rounded-md bg-blue text-white text-[13px] hover:bg-blue-dark">
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
