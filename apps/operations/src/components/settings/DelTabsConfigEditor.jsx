import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_DEL_CATEGORIES } from '../clientes/funnels/delTabs';
import SaveBar from './SaveBar';

// Config de las pestañas del DEL (P9). Se guarda en app_settings('global').del_tab_template
// y la lee DelEditor (resolveDelTabs) para armar las categorías/pestañas de TODO DEL.
// Estructura: [{ key, label, color, tabs: [{ kind, label, color, bg, standard, versionable }] }]
// - "Aparece siempre" (standard): la pestaña se ve aunque esté vacía al crear el DEL.
// - "Versiona" (versionable): tiene V1/V2/V3.
const input = 'w-full py-2 px-3 text-[13px] border border-gray-200 rounded outline-none focus:border-blue-500 bg-white';
const newKind = () => 'tab_' + Math.random().toString(36).slice(2, 8);
const clone = (x) => JSON.parse(JSON.stringify(x));

export default function DelTabsConfigEditor() {
  const { appSettings, updateAppSettings } = useApp();
  const load = () => {
    const cfg = appSettings?.del_tab_template;
    return Array.isArray(cfg) && cfg.length ? clone(cfg) : clone(DEFAULT_DEL_CATEGORIES);
  };
  const [draft, setDraft] = useState(load);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!dirty) setDraft(load());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appSettings]);

  const commit = (next) => { setDraft(next); setDirty(true); };

  // Categorías
  const setCat = (ci, patch) => commit(draft.map((c, i) => i === ci ? { ...c, ...patch } : c));
  const addCat = () => commit([...draft, { key: newKind(), label: 'Nueva categoría', color: '#6B7280', tabs: [] }]);
  const removeCat = (ci) => commit(draft.filter((_, i) => i !== ci));
  const moveCat = (ci, dir) => {
    const j = ci + dir; if (j < 0 || j >= draft.length) return;
    const arr = [...draft]; [arr[ci], arr[j]] = [arr[j], arr[ci]]; commit(arr);
  };

  // Pestañas dentro de una categoría
  const setTab = (ci, ti, patch) => setCat(ci, { tabs: draft[ci].tabs.map((t, i) => i === ti ? { ...t, ...patch } : t) });
  const addTab = (ci) => setCat(ci, { tabs: [...draft[ci].tabs, { kind: newKind(), label: 'Nueva pestaña', color: draft[ci].color || '#6B7280', bg: '#F4F5F7', standard: true, versionable: false }] });
  const removeTab = (ci, ti) => setCat(ci, { tabs: draft[ci].tabs.filter((_, i) => i !== ti) });
  const moveTab = (ci, ti, dir) => {
    const arr = [...draft[ci].tabs]; const j = ti + dir; if (j < 0 || j >= arr.length) return;
    [arr[ti], arr[j]] = [arr[j], arr[ti]]; setCat(ci, { tabs: arr });
  };

  const handleSave = () => { updateAppSettings({ del_tab_template: draft }); setDirty(false); };
  const handleCancel = () => { setDraft(load()); setDirty(false); };
  const resetDefault = () => commit(clone(DEFAULT_DEL_CATEGORIES));

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[860px] relative space-y-5">
      <div>
        <h2 className="text-[14px] font-bold text-gray-800">Pestañas del DEL</h2>
        <p className="text-[11px] text-gray-400 mt-0.5">
          Las categorías y pestañas que aparecen al crear un DEL. Agregá una categoría (ej. <b>Ventas</b>) con las pestañas que quieras (ej. <b>Playbook</b>).
          Las marcadas como <b>“Aparece siempre”</b> se muestran aunque estén vacías. Los cambios se aplican a todos los DEL, sin tocar código.
        </p>
      </div>

      <div className="space-y-3">
        {draft.map((cat, ci) => (
          <div key={cat.key || ci} className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2.5">
            {/* Encabezado de la categoría */}
            <div className="flex gap-2 items-center">
              <input type="color" value={cat.color || '#6B7280'} onChange={(e) => setCat(ci, { color: e.target.value })} title="Color de la categoría"
                className="w-8 h-8 rounded border border-gray-200 bg-white cursor-pointer shrink-0" />
              <input value={cat.label} onChange={(e) => setCat(ci, { label: e.target.value })} placeholder="Nombre de la categoría"
                className={input + ' font-semibold'} />
              <button type="button" onClick={() => moveCat(ci, -1)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↑</button>
              <button type="button" onClick={() => moveCat(ci, 1)} className="px-2 py-1 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↓</button>
              <button type="button" onClick={() => removeCat(ci)} className="px-2 py-1 text-[12px] text-red-400 hover:text-red-600 border border-gray-200 rounded bg-white">✕</button>
            </div>

            {/* Pestañas */}
            <div className="space-y-2 pl-2 border-l-2" style={{ borderColor: (cat.color || '#6B7280') + '55' }}>
              {(cat.tabs || []).map((tb, ti) => (
                <div key={tb.kind || ti} className="flex gap-2 items-center flex-wrap bg-white border border-gray-200 rounded-md p-2">
                  <input type="color" value={tb.color || cat.color || '#6B7280'} onChange={(e) => setTab(ci, ti, { color: e.target.value })} title="Color de la pestaña"
                    className="w-7 h-7 rounded border border-gray-200 cursor-pointer shrink-0" />
                  <input value={tb.label} onChange={(e) => setTab(ci, ti, { label: e.target.value })} placeholder="Nombre de la pestaña"
                    className={input + ' flex-1 min-w-[140px]'} />
                  <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600 shrink-0 cursor-pointer">
                    <input type="checkbox" checked={!!tb.standard} onChange={(e) => setTab(ci, ti, { standard: e.target.checked })} />
                    Aparece siempre
                  </label>
                  <label className="flex items-center gap-1.5 text-[11.5px] text-gray-600 shrink-0 cursor-pointer">
                    <input type="checkbox" checked={!!tb.versionable} onChange={(e) => setTab(ci, ti, { versionable: e.target.checked })} />
                    Versiona (V1/V2)
                  </label>
                  <div className="flex gap-1 shrink-0 ml-auto">
                    <button type="button" onClick={() => moveTab(ci, ti, -1)} className="px-2 py-0.5 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↑</button>
                    <button type="button" onClick={() => moveTab(ci, ti, 1)} className="px-2 py-0.5 text-[12px] text-gray-400 hover:text-gray-700 border border-gray-200 rounded bg-white">↓</button>
                    <button type="button" onClick={() => removeTab(ci, ti)} className="px-2 py-0.5 text-[12px] text-red-400 hover:text-red-600 border border-gray-200 rounded bg-white">✕</button>
                  </div>
                </div>
              ))}
              <button type="button" onClick={() => addTab(ci)} className="text-[12.5px] text-blue-600 font-medium hover:underline">+ Agregar pestaña</button>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={addCat} className="text-[12.5px] text-blue-600 font-medium hover:underline">+ Agregar categoría</button>
        <button type="button" onClick={resetDefault} className="text-[12.5px] text-gray-400 hover:text-gray-700">Restaurar por defecto</button>
      </div>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
