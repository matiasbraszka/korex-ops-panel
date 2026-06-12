import { useState } from 'react';
import { Zap, Plus, Pencil, Trash2, Check, X } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

// Placeholders que el composer resuelve (o deja para completar a mano).
const PLACEHOLDERS = [
  { key: '{nombre}', desc: 'nombre del contacto del chat (se completa solo)' },
  { key: '{fecha}', desc: 'fecha de la reunión' },
  { key: '{hora}', desc: 'hora de la reunión' },
  { key: '{zoom}', desc: 'link de Zoom' },
];

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
const newId = () => 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

// Resalta los {placeholders} dentro del cuerpo.
function Body({ text }) {
  const parts = String(text || '').split(/(\{\w+\})/g);
  return (
    <span>
      {parts.map((p, i) =>
        /^\{\w+\}$/.test(p)
          ? <b key={i} className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1">{p}</b>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}

function TemplateForm({ initial, existingShortcuts, onSave, onCancel, saving }) {
  const [shortcut, setShortcut] = useState(initial?.shortcut || '');
  const [name, setName] = useState(initial?.name || '');
  const [body, setBody] = useState(initial?.body || '');
  const [error, setError] = useState('');

  const submit = () => {
    const s = slugify(shortcut);
    setError('');
    if (!s) { setError('Poné un atajo (ej: saludo).'); return; }
    if (existingShortcuts.includes(s)) { setError(`El atajo /${s} ya existe.`); return; }
    if (!body.trim()) { setError('El mensaje no puede estar vacío.'); return; }
    onSave({ shortcut: s, name: name.trim() || s, body: body.trim() });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <div>
          <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Atajo</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#B45309]">/</span>
            <input value={shortcut} onChange={(e) => setShortcut(e.target.value)}
                   placeholder="saludo"
                   className="w-full pl-6 pr-3 py-2 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B] transition-colors duration-150" />
          </div>
        </div>
        <div>
          <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)}
                 placeholder="Saludo inicial"
                 className="w-full px-3 py-2 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B] transition-colors duration-150" />
        </div>
      </div>
      <div>
        <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1">Mensaje</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3}
                  placeholder="Hola {nombre}! …"
                  className="w-full resize-none px-3 py-2 text-[13px] leading-relaxed rounded-[10px] border border-border outline-none focus:border-[#F59E0B] transition-colors duration-150" />
      </div>
      {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={saving}
                className="py-2 px-4 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 transition-colors duration-150 disabled:opacity-60">
          <Check size={14} /> Guardar
        </button>
        <button onClick={onCancel}
                className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2 flex items-center gap-1 transition-colors duration-150">
          <X size={14} /> Cancelar
        </button>
      </div>
    </div>
  );
}

// Plantillas de respuestas rápidas: se usan tipeando "/" en el chat.
// Viven en soporte_config.templates ({id, shortcut, name, body}).
export default function PlantillasPage() {
  const { templates, saveTemplates } = useSoporte();
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const persist = async (next) => {
    setSaving(true);
    try {
      await saveTemplates(next);
      setCreating(false);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const addTemplate = (data) => persist([...templates, { id: newId(), ...data }]);
  const updateTemplate = (id, data) => persist(templates.map((t) => (t.id === id ? { ...t, ...data } : t)));
  const removeTemplate = (id) => persist(templates.filter((t) => t.id !== id));

  return (
    <div className="h-full min-h-0 overflow-y-auto">
      <div className="max-w-[680px] mx-auto px-4 py-5 max-md:px-3 max-md:py-3">
        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#FEF0D7] flex items-center justify-center">
              <Zap size={17} className="text-[#B45309]" />
            </span>
            <div>
              <div className="text-[16px] font-bold">Plantillas</div>
              <div className="text-[12px] text-text3">Respuestas rápidas para el chat</div>
            </div>
          </div>
          {!creating && (
            <button onClick={() => { setCreating(true); setEditingId(null); }}
                    className="py-2 px-3.5 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 shadow-[0_2px_6px_rgba(245,158,11,.35)] transition-colors duration-150">
              <Plus size={14} /> Nueva plantilla
            </button>
          )}
        </div>
        <div className="text-[12px] text-text2 mb-4 mt-2 px-0.5">
          En cualquier chat, tipeá <b className="font-bold text-[#B45309]">/</b> y elegí una plantilla: se inserta al instante
          con el <b className="font-semibold">{'{nombre}'}</b> del contacto ya completado.
        </div>

        {/* Alta */}
        {creating && (
          <div className="px-4 py-3.5 rounded-2xl border border-[#F5D9A8] bg-[#FFFBF2] mb-3">
            <div className="text-[12.5px] font-bold mb-2.5">Nueva plantilla</div>
            <TemplateForm
              existingShortcuts={templates.map((t) => t.shortcut)}
              onSave={addTemplate}
              onCancel={() => setCreating(false)}
              saving={saving}
            />
          </div>
        )}

        {/* Lista */}
        {templates.length === 0 && !creating ? (
          <div className="text-center py-14 px-6 rounded-2xl border border-dashed border-border bg-white">
            <Zap size={26} className="mx-auto text-text3 mb-2" />
            <div className="text-[13px] font-semibold text-text2">Todavía no hay plantillas</div>
            <div className="text-[11.5px] text-text3 mt-1">Creá la primera con el botón de arriba.</div>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {templates.map((t) =>
              editingId === t.id ? (
                <div key={t.id} className="px-4 py-3.5 rounded-2xl border border-[#F5D9A8] bg-[#FFFBF2]">
                  <TemplateForm
                    initial={t}
                    existingShortcuts={templates.filter((x) => x.id !== t.id).map((x) => x.shortcut)}
                    onSave={(data) => updateTemplate(t.id, data)}
                    onCancel={() => setEditingId(null)}
                    saving={saving}
                  />
                </div>
              ) : (
                <div key={t.id}
                     className="px-4 py-3 rounded-2xl border border-border/70 bg-white hover:border-[#F59E0B]/45 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)] transition-all duration-150 flex items-start gap-3">
                  <span className="text-[11.5px] font-bold rounded-lg px-2.5 py-1 bg-[#FEF0D7] text-[#B45309] shrink-0 mt-0.5">
                    /{t.shortcut}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold truncate">{t.name}</div>
                    <div className="text-[12px] text-text2 leading-relaxed mt-0.5"><Body text={t.body} /></div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => { setEditingId(t.id); setCreating(false); }} title="Editar"
                            className="border border-border bg-white rounded-[9px] text-text2 hover:text-[#B45309] hover:border-[#F5D9A8] cursor-pointer p-2 transition-colors duration-150">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => removeTemplate(t.id)} title="Eliminar"
                            className="border border-border bg-white rounded-[9px] text-text2 hover:text-[#DC2626] hover:border-[#DC2626]/40 cursor-pointer p-2 transition-colors duration-150">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* Placeholders disponibles */}
        <div className="mt-5 px-4 py-3.5 rounded-2xl border border-border bg-white">
          <div className="text-[10px] font-bold tracking-widest text-text3 uppercase mb-2">Comodines disponibles</div>
          <div className="flex flex-col gap-1.5">
            {PLACEHOLDERS.map((p) => (
              <div key={p.key} className="flex items-center gap-2.5 text-[12px]">
                <b className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded px-1.5 py-0.5 shrink-0">{p.key}</b>
                <span className="text-text2">{p.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
