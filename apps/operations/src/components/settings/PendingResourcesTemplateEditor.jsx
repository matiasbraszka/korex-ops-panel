import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, X, GripVertical, RotateCcw } from 'lucide-react';
import { DEFAULT_PENDING_RESOURCES } from '../../utils/helpers';
import SaveBar from './SaveBar';

// Editor de la plantilla de "Recursos pendientes" que se siembra automaticamente
// cuando se crea un cliente nuevo. Es la misma idea que TemplateEditor (roadmap)
// pero para el checklist de cosas que el cliente nos debe enviar.
//
// El estado se guarda en app_settings.value.pending_resources_template como un
// array de { id, label, description }.

export default function PendingResourcesTemplateEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const tplFromDb = appSettings?.pending_resources_template;
  const original = (tplFromDb && Array.isArray(tplFromDb) && tplFromDb.length > 0)
    ? tplFromDb
    : DEFAULT_PENDING_RESOURCES;
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      const next = appSettings?.pending_resources_template;
      setDraft(next && next.length > 0 ? next : DEFAULT_PENDING_RESOURCES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const mark = (next) => { setDraft(next); setDirty(true); };

  const updateAt = (idx, patch) => {
    const next = draft.map((it, i) => i === idx ? { ...it, ...patch } : it);
    mark(next);
  };
  const removeAt = (idx) => mark(draft.filter((_, i) => i !== idx));
  const addNew = () => mark([
    ...draft,
    { id: 'tpl_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), label: '', description: '' },
  ]);
  const moveUp = (idx) => {
    if (idx === 0) return;
    const next = [...draft];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    mark(next);
  };
  const moveDown = (idx) => {
    if (idx === draft.length - 1) return;
    const next = [...draft];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    mark(next);
  };

  const resetToDefault = () => {
    if (!window.confirm('¿Restaurar la lista por defecto? Vas a perder los cambios actuales (todavía no guardados).')) return;
    mark(DEFAULT_PENDING_RESOURCES);
  };

  const handleSave = () => {
    // Limpieza: descartar items sin label
    const cleaned = draft
      .filter((it) => (it.label || '').trim())
      .map((it) => ({
        id: it.id || ('tpl_' + Math.random().toString(36).slice(2, 8)),
        label: it.label.trim(),
        description: (it.description || '').trim(),
      }));
    updateAppSettings({ pending_resources_template: cleaned });
    setDraft(cleaned);
    setDirty(false);
  };
  const handleCancel = () => {
    const next = appSettings?.pending_resources_template;
    setDraft(next && next.length > 0 ? next : DEFAULT_PENDING_RESOURCES);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[760px] relative">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-800">Recursos pendientes — plantilla</h2>
          <p className="text-[11px] text-gray-400 mt-0.5 max-w-[520px]">
            Cada vez que crees un cliente nuevo, este checklist se copia automáticamente en su ficha
            (pestaña Recursos → columna derecha). Editalo cuando cambien los materiales que les pedís.
          </p>
        </div>
        <button
          onClick={resetToDefault}
          title="Restaurar al listado por defecto"
          className="shrink-0 flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-500 bg-transparent border border-gray-200 hover:border-blue-300 rounded-md py-1 px-2 cursor-pointer font-sans transition-colors"
        >
          <RotateCcw size={11} /> Restaurar default
        </button>
      </div>

      <div className="space-y-2">
        {draft.length === 0 && (
          <div className="text-xs text-gray-400 italic py-3 text-center">
            Sin items. Agregá uno con el botón de abajo.
          </div>
        )}
        {draft.map((it, i) => (
          <div key={it.id || i} className="flex items-start gap-2 bg-gray-50/60 border border-gray-100 rounded-md p-2.5">
            <div className="flex flex-col items-center gap-0.5 pt-1.5 shrink-0">
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0}
                title="Subir"
                className="text-gray-300 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 text-[10px] leading-none disabled:opacity-30 disabled:cursor-default"
              >▲</button>
              <GripVertical size={12} className="text-gray-300" />
              <button
                onClick={() => moveDown(i)}
                disabled={i === draft.length - 1}
                title="Bajar"
                className="text-gray-300 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 text-[10px] leading-none disabled:opacity-30 disabled:cursor-default"
              >▼</button>
            </div>
            <div className="flex-1 min-w-0 space-y-1.5">
              <input
                type="text"
                className="w-full border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-semibold font-sans outline-none focus:border-blue-400 hover:border-gray-300 bg-white"
                value={it.label || ''}
                onChange={(e) => updateAt(i, { label: e.target.value })}
                placeholder="Nombre del item (ej: Logo en alta resolución)"
              />
              <textarea
                className="w-full border border-gray-200 rounded-md py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400 hover:border-gray-300 bg-white resize-none"
                value={it.description || ''}
                onChange={(e) => updateAt(i, { description: e.target.value })}
                rows={2}
                placeholder="Descripción visible debajo del título (qué pedirle exactamente)"
              />
            </div>
            <button
              className="text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-1.5 rounded hover:bg-red-50 shrink-0 mt-1"
              onClick={() => removeAt(i)}
              title="Eliminar"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>

      <button
        className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-md py-2 px-3 cursor-pointer font-sans w-full justify-center transition-colors"
        onClick={addNew}
      >
        <Plus size={13} /> Agregar item
      </button>

      <p className="text-[10.5px] text-gray-400 mt-3">
        Los clientes existentes ya tienen su checklist propio — editar acá no los toca. Solo afecta a los <strong>clientes nuevos</strong>.
      </p>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
