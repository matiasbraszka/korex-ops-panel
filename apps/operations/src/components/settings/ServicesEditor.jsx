import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, X } from 'lucide-react';
import SaveBar from './SaveBar';

export default function ServicesEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const original = appSettings?.services || [];
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);

  // Resync si el contexto cambia desde afuera y no estamos editando
  useEffect(() => {
    if (!dirty) setDraft(appSettings?.services || []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const mark = (next) => { setDraft(next); setDirty(true); };

  const updateAt = (idx, value) => {
    const next = [...draft];
    next[idx] = value;
    mark(next);
  };
  const removeAt = (idx) => mark(draft.filter((_, i) => i !== idx));
  const addNew = () => mark([...draft, 'Nuevo servicio']);

  const handleSave = () => {
    updateAppSettings({ services: draft });
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft(appSettings?.services || []);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[600px] relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Servicios ofrecidos</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Aparecen en el dropdown al crear un cliente nuevo.</p>
      </div>

      <div className="space-y-2">
        {draft.length === 0 && (
          <div className="text-xs text-gray-400 italic py-3 text-center">Sin servicios. Agregá uno con el botón de abajo.</div>
        )}
        {draft.map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="text"
              className="flex-1 border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-blue-400 hover:border-gray-300"
              value={s}
              onChange={(e) => updateAt(i, e.target.value)}
              placeholder="Nombre del servicio"
            />
            <button
              className="text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-1.5 rounded hover:bg-red-50"
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
        <Plus size={13} /> Agregar servicio
      </button>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
