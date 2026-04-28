import { useState, useEffect } from 'react';
import { Trash2, Plus } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_EVENT_TYPES } from '../../pages/historial/tokens.js';
import SaveBar from './SaveBar';

// Sugerencias de íconos unicode chiquitos para el dot del tipo
const DOT_OPTIONS = ['◆', '★', '⚠', '◌', '▶', '✓', '▲', '●', '◉', '⬢', '✦'];

function slugify(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 30);
}

export default function HistorialTiposEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const original = Array.isArray(appSettings?.historial_event_types) && appSettings.historial_event_types.length
    ? appSettings.historial_event_types : DEFAULT_EVENT_TYPES;
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) {
      setDraft(Array.isArray(appSettings?.historial_event_types) && appSettings.historial_event_types.length
        ? appSettings.historial_event_types : DEFAULT_EVENT_TYPES);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const update = (idx, patch) => {
    setDraft(prev => prev.map((t, i) => i === idx ? { ...t, ...patch } : t));
    setDirty(true);
  };
  const remove = (idx) => {
    setDraft(prev => prev.filter((_, i) => i !== idx));
    setDirty(true);
  };
  const add = () => {
    setDraft(prev => [
      ...prev,
      { key: 'tipo-' + (prev.length + 1), label: 'Nuevo tipo', color: '#5B7CF5', bg: '#EEF2FF', dot: '●' },
    ]);
    setDirty(true);
  };
  const handleSave = () => {
    // Garantiza keys únicas y no vacías. Slug del label si key vacío.
    const seen = new Set();
    const cleaned = draft.map((t, i) => {
      let key = (t.key || '').trim() || slugify(t.label) || ('tipo-' + (i + 1));
      while (seen.has(key)) key = key + '-' + (i + 1);
      seen.add(key);
      return {
        key,
        label: (t.label || '').trim() || key,
        color: t.color || '#5B7CF5',
        bg: t.bg || '#EEF2FF',
        dot: t.dot || '●',
      };
    });
    updateAppSettings({ historial_event_types: cleaned });
    setDraft(cleaned);
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft(Array.isArray(appSettings?.historial_event_types) && appSettings.historial_event_types.length
      ? appSettings.historial_event_types : DEFAULT_EVENT_TYPES);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[820px] relative">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-800">Tipos de evento del Historial</h2>
          <p className="text-[11px] text-gray-400 mt-0.5">Categorías visuales para clasificar los eventos cargados (Entregable, Hito, Bloqueo, etc.). El <b>color</b> tiñe el borde de la card; el <b>fondo</b> el chip; el <b>símbolo</b> aparece en la pildora.</p>
        </div>
        <button onClick={add} className="flex items-center gap-1 py-1.5 px-3 text-[12px] font-semibold text-white bg-blue-500 hover:bg-blue-600 border-none rounded-md cursor-pointer font-sans">
          <Plus size={14} /> Agregar tipo
        </button>
      </div>

      <div className="space-y-1.5">
        {draft.map((t, idx) => (
          <div key={idx} className="flex items-center gap-2 p-2 border border-gray-200 rounded-md bg-gray-50">
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border"
              style={{ background: t.bg, color: t.color, borderColor: t.color + '55' }}
            >
              <span className="text-[10px]">{t.dot}</span>
              {t.label || 'preview'}
            </span>
            <input
              type="text"
              value={t.key || ''}
              onChange={e => update(idx, { key: e.target.value })}
              placeholder="key"
              className="w-[110px] py-1 px-2 text-[11px] font-mono border border-gray-200 rounded outline-none focus:border-blue-500"
            />
            <input
              type="text"
              value={t.label || ''}
              onChange={e => update(idx, { label: e.target.value })}
              placeholder="Nombre"
              className="flex-1 py-1 px-2 text-[12px] border border-gray-200 rounded outline-none focus:border-blue-500"
            />
            <select
              value={t.dot || '●'}
              onChange={e => update(idx, { dot: e.target.value })}
              className="py-1 px-1.5 text-[12px] border border-gray-200 rounded cursor-pointer outline-none"
            >
              {DOT_OPTIONS.includes(t.dot) ? null : <option value={t.dot}>{t.dot}</option>}
              {DOT_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400">color</span>
              <input type="color" value={t.color || '#5B7CF5'} onChange={e => update(idx, { color: e.target.value })} className="w-7 h-7 p-0 border border-gray-200 rounded cursor-pointer" />
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[9px] text-gray-400">fondo</span>
              <input type="color" value={t.bg || '#EEF2FF'} onChange={e => update(idx, { bg: e.target.value })} className="w-7 h-7 p-0 border border-gray-200 rounded cursor-pointer" />
            </div>
            <button onClick={() => remove(idx)} className="text-red-400 hover:text-red-600 cursor-pointer bg-transparent border-none p-1.5 rounded hover:bg-red-50">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
      </div>

      {draft.length === 0 && (
        <div className="text-center py-8 text-gray-400 text-[12px]">Sin tipos. Hacé click en "Agregar tipo".</div>
      )}

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
