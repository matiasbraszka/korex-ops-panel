import { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Plus, X, RotateCcw, ListChecks } from 'lucide-react';
import { DEFAULT_CHECKLIST_TEMPLATES } from '../../utils/helpers';
import SaveBar from './SaveBar';

// Tandas de checklist pre-armadas para las tareas.
//
// El equipo repite las mismas subtareas todo el tiempo ("Testimonios, Fotos de
// autoridad, VSL editado, Branding" cada vez que se diseña una landing). Acá se
// guardan esas tandas con nombre, y en la ficha de la tarea se cargan de una.
//
// Vive en app_settings.value.checklist_templates (clave 'global'), igual que la
// plantilla de roadmap y la de recursos pendientes. Forma: { id, nombre, items[] }.
//
// Los ítems se escriben uno por línea: es lo más rápido para cargar diez de golpe,
// y evita una fila con botón de borrar por cada subtarea.

const mkId = () => 'ctpl_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

export default function ChecklistTemplatesEditor() {
  const { appSettings, updateAppSettings } = useApp();

  // Lo guardado en la base. Mientras nadie edite, la pantalla lo muestra tal cual:
  // si otra sesión guarda una tanda, aparece sola. Apenas se toca algo, `edicion`
  // deja de ser null y pasa a mandar hasta que se guarde o se cancele.
  // (Derivarlo así en vez de sincronizar con un useEffect evita renders en cascada.)
  const guardado = useMemo(() => {
    const next = appSettings?.checklist_templates;
    return Array.isArray(next) && next.length > 0 ? next : DEFAULT_CHECKLIST_TEMPLATES;
  }, [appSettings]);
  const [edicion, setEdicion] = useState(null);
  const draft = edicion ?? guardado;
  const dirty = edicion !== null;

  const mark = (next) => setEdicion(next);
  const updateAt = (idx, patch) => mark(draft.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeAt = (idx) => mark(draft.filter((_, i) => i !== idx));
  const addNew = () => mark([...draft, { id: mkId(), nombre: '', items: [] }]);
  const moveUp = (idx) => { if (idx === 0) return; const n = [...draft]; [n[idx - 1], n[idx]] = [n[idx], n[idx - 1]]; mark(n); };
  const moveDown = (idx) => { if (idx === draft.length - 1) return; const n = [...draft]; [n[idx], n[idx + 1]] = [n[idx + 1], n[idx]]; mark(n); };

  const resetToDefault = () => {
    if (!window.confirm('¿Volver a la tanda de ejemplo? Vas a perder los cambios que todavía no guardaste.')) return;
    mark(DEFAULT_CHECKLIST_TEMPLATES);
  };

  const handleSave = () => {
    // Se descartan las tandas sin nombre o sin ningún ítem: cargar una tanda vacía
    // en una tarea no haría nada y solo ensuciaría el desplegable.
    const cleaned = draft
      .map((t) => ({
        id: t.id || mkId(),
        nombre: String(t.nombre || '').trim(),
        items: (Array.isArray(t.items) ? t.items : []).map((x) => String(x || '').trim()).filter(Boolean),
      }))
      .filter((t) => t.nombre && t.items.length > 0);
    updateAppSettings({ checklist_templates: cleaned });
    setEdicion(null);
  };
  const handleCancel = () => setEdicion(null);

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 max-w-[760px] relative">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[14px] font-bold text-gray-800">Checklists de tareas — tandas pre-armadas</h2>
          <p className="text-[11px] text-gray-400 mt-0.5 max-w-[540px]">
            Guardá acá las listas de subtareas que se repiten. Después, en cualquier tarea, se cargan
            de una desde «Cargar tanda». Los ítems se agregan al final: nunca pisan lo que ya haya.
          </p>
        </div>
        <button
          onClick={resetToDefault}
          title="Volver a la tanda de ejemplo"
          className="shrink-0 flex items-center gap-1 text-[11px] text-gray-500 hover:text-blue-500 bg-transparent border border-gray-200 hover:border-blue-300 rounded-md py-1 px-2 cursor-pointer font-sans transition-colors"
        >
          <RotateCcw size={11} /> Restaurar ejemplo
        </button>
      </div>

      <div className="space-y-2.5">
        {draft.length === 0 && (
          <div className="text-xs text-gray-400 italic py-3 text-center">
            Sin tandas. Agregá una con el botón de abajo.
          </div>
        )}
        {draft.map((t, i) => {
          const nItems = (Array.isArray(t.items) ? t.items : []).filter((x) => String(x || '').trim()).length;
          return (
            <div key={t.id || i} className="flex items-start gap-2 bg-gray-50/60 border border-gray-100 rounded-md p-2.5">
              <div className="flex flex-col items-center gap-0.5 pt-1.5 shrink-0">
                <button onClick={() => moveUp(i)} disabled={i === 0} title="Subir"
                  className="text-gray-300 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 text-[10px] leading-none disabled:opacity-30 disabled:cursor-default">▲</button>
                <ListChecks size={12} className="text-gray-300" />
                <button onClick={() => moveDown(i)} disabled={i === draft.length - 1} title="Bajar"
                  className="text-gray-300 hover:text-gray-600 bg-transparent border-none cursor-pointer p-0 text-[10px] leading-none disabled:opacity-30 disabled:cursor-default">▼</button>
              </div>
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    className="flex-1 border border-gray-200 rounded-md py-1.5 px-2.5 text-[13px] font-semibold font-sans outline-none focus:border-blue-400 hover:border-gray-300 bg-white"
                    value={t.nombre || ''}
                    onChange={(e) => updateAt(i, { nombre: e.target.value })}
                    placeholder="Nombre de la tanda (ej: Diseño de landings)"
                  />
                  <span className="shrink-0 text-[10.5px] font-semibold text-gray-500 bg-white border border-gray-200 rounded-full py-0.5 px-2">
                    {nItems} {nItems === 1 ? 'ítem' : 'ítems'}
                  </span>
                </div>
                <textarea
                  className="w-full border border-gray-200 rounded-md py-1.5 px-2.5 text-[12px] font-sans outline-none focus:border-blue-400 hover:border-gray-300 bg-white resize-y leading-relaxed"
                  value={(Array.isArray(t.items) ? t.items : []).join('\n')}
                  onChange={(e) => updateAt(i, { items: e.target.value.split('\n') })}
                  rows={Math.min(12, Math.max(4, nItems + 1))}
                  placeholder={'Una subtarea por línea:\nTestimonios\nFotos de autoridad\nVSL editado\nBranding'}
                />
              </div>
              <button
                className="text-gray-400 hover:text-red-500 bg-transparent border-none cursor-pointer p-1.5 rounded hover:bg-red-50 shrink-0 mt-1"
                onClick={() => removeAt(i)}
                title="Eliminar tanda"
              >
                <X size={14} />
              </button>
            </div>
          );
        })}
      </div>

      <button
        className="mt-3 flex items-center gap-1.5 text-[12px] text-gray-500 hover:text-blue-500 bg-transparent border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50/30 rounded-md py-2 px-3 cursor-pointer font-sans w-full justify-center transition-colors"
        onClick={addNew}
      >
        <Plus size={13} /> Agregar tanda
      </button>

      <p className="text-[10.5px] text-gray-400 mt-3">
        Editar una tanda no toca las tareas donde ya se cargó: una vez adentro, los ítems son de esa tarea.
      </p>

      <SaveBar dirty={dirty} onSave={handleSave} onCancel={handleCancel} />
    </div>
  );
}
