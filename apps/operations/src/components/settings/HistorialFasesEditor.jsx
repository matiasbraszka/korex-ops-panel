import { useState, useEffect } from 'react';
import { Trash2, GripVertical, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FASES } from '../../pages/historial/tokens.js';
import SaveBar from './SaveBar';

export default function HistorialFasesEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const original = Array.isArray(appSettings?.historial_fases) && appSettings.historial_fases.length
    ? appSettings.historial_fases : DEFAULT_FASES;
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(Array.isArray(appSettings?.historial_fases) && appSettings.historial_fases.length
        ? appSettings.historial_fases : DEFAULT_FASES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const update = (idx, patch) => {
    setDraft(prev => prev.map((f, i) => i === idx ? { ...f, ...patch } : f));
    setDirty(true);
  };
  const remove = (idx) => {
    setDraft(prev => prev.filter((_, i) => i !== idx).map((f, i) => ({ ...f, n: i + 1 })));
    setDirty(true);
  };
  const add = () => {
    setDraft(prev => [
      ...prev,
      { n: prev.length + 1, short: 'Nuevo', label: 'Nueva fase', color: '#5B7CF5' },
    ]);
    setDirty(true);
  };
  const move = (idx, dir) => {
    setDraft(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((f, i) => ({ ...f, n: i + 1 }));
    });
    setDirty(true);
  };
  const handleSave = () => {
    const cleaned = draft.map((f, i) => ({
      n: i + 1,
      short: (f.short || '').trim() || ('F' + (i + 1)),
      label: (f.label || '').trim() || ('Fase ' + (i + 1)),
      color: f.color || '#5B7CF5',
    }));
    updateAppSettings({ historial_fases: cleaned });
    setDraft(cleaned);
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft(Array.isArray(appSettings?.historial_fases) && appSettings.historial_fases.length
      ? appSettings.historial_fases : DEFAULT_FASES);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[760px] relative">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-800">Fases del Historial</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Las fases del Método Korex que aparecen en la pestaña Historial de cada cliente. <b>No confundir con las fases del Roadmap</b> (otra pestaña, otro flujo).</p>
        </div>
        <button onClick={add} className="flex items-center gap-1 py-1.5 px-3 text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md cursor-pointer font-sans">
          <Plus size={14} /> Agregar fase
        </button>
      </div>

      <div className="space-y-1.5">
        {draft.map((f, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 border border-gray-200 rounded-md bg-gray-50">
            <div className="flex flex-col">
              <button onClick={() => move(idx, -1)} disabled={idx === 0} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer bg-transparent border-none text-[10px] leading-none p-0.5">▲</button>
              <button onClick={() => move(idx, 1)} disabled={idx === draft.length - 1} className="text-gray-400 hover:text-gray-700 disabled:opacity-30 cursor-pointer bg-transparent border-none text-[10px] leading-none p-0.5">▼</button>
            </div>
            <span className="text-[11px] font-bold text-gray-500 w-6 text-center">{idx + 1}</span>
            <input
              type="text"
              value={f.short || ''}
              onChange={e => update(idx, { short: e.target.value })}
              placeholder="Short"
              className="w-[110px] py-1 px-2 text-[12px] border border-gray-200 rounded outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={f.label || ''}
              onChange={e => update(idx, { label: e.target.value })}
              placeholder="Nombre completo"
              className="flex-1 py-1 px-2 text-[12px] border border-gray-200 rounded outline-none focus:border-blue-500"
            />
            <input
              type="color"
              value={f.color || '#5B7CF5'}
              onChange={e => update(idx, { color: e.target.value })}
              className="w-8 h-7 p-0 border border-gray-200 rounded cursor-pointer"
            />
            <button onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 cursor-pointer bg-transparent border-none p-1.5 rounded hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {draft.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-[12px]">Sin fases. Hacé click en "Agregar fase".</div>
      )}

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
