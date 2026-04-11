import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import SaveBar from './SaveBar';

const SLOTS = [1, 2, 3, 4, 5, 6];
const DEFAULTS = {
  '1': { label: 'SUPER PRIORITARIO', color: '#EF4444' },
  '2': { label: 'IMPORTANTES',       color: '#F97316' },
  '3': { label: 'NORMAL',            color: '#22C55E' },
  '4': { label: 'POCO IMPORTANTES',  color: '#9CA3AF' },
  '5': { label: 'NUEVOS',            color: '#8B5CF6' },
  '6': { label: 'DESCARTADOS',       color: '#6B7280' },
};

export default function PrioritiesEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const original = appSettings?.priority_labels || DEFAULTS;
  const [draft, setDraft] = useState(original);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(appSettings?.priority_labels || DEFAULTS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const updateSlot = (slot, fields) => {
    setDraft(prev => ({ ...prev, [slot]: { ...(prev[slot] || DEFAULTS[slot]), ...fields } }));
    setDirty(true);
  };

  const handleSave = () => {
    updateAppSettings({ priority_labels: draft });
    setDirty(false);
  };
  const handleCancel = () => {
    setDraft(appSettings?.priority_labels || DEFAULTS);
    setDirty(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[600px] relative">
      <div className="mb-3">
        <h2 className="text-[14px] font-bold text-gray-800">Etiquetas de prioridad</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">Renombrá los niveles de prioridad de cada cliente y ajustá sus colores.</p>
      </div>

      <div className="space-y-2">
        {SLOTS.map(slot => {
          const cur = draft[slot] || DEFAULTS[slot];
          return (
            <div key={slot} className="flex items-center gap-3">
              <span className="text-[11px] font-bold text-gray-400 w-4 text-center">{slot}</span>
              <input
                type="color"
                value={cur.color}
                onChange={(e) => updateSlot(slot, { color: e.target.value })}
                className="w-8 h-8 rounded-md border border-gray-200 cursor-pointer p-0 bg-white"
                title="Color"
              />
              <input
                type="text"
                value={cur.label}
                onChange={(e) => updateSlot(slot, { label: e.target.value })}
                className="flex-1 border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-sans outline-none focus:border-blue-400"
              />
              <span
                className="text-[9px] font-bold px-1.5 py-0.5 rounded uppercase whitespace-nowrap"
                style={{ background: cur.color + '18', color: cur.color }}
              >
                {cur.label}
              </span>
            </div>
          );
        })}
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
