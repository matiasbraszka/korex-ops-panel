import { useEffect, useMemo, useRef, useState } from 'react';
import { Zap, Plus, Trash2, ChevronLeft, ChevronRight, Check, X, Tag } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

const CATEGORIES = [
  { id: 'citas', label: 'Citas', bg: '#DCFCE7', color: '#15803D' },
  { id: 'soporte', label: 'Soporte', bg: '#EEF2FF', color: '#4A67D8' },
  { id: 'grupos', label: 'Grupos', bg: '#F3E8FF', color: '#7C3AED' },
];
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || null;

const VARIABLES = ['{nombre}', '{fecha}', '{hora}', '{zoom}', '{cliente}'];

const slugify = (s) => String(s || '').toLowerCase().trim().replace(/\s+/g, '').replace(/[^a-z0-9_]/g, '');
const newId = () => 'tpl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

// Etiquetas libres de plantillas: trim + dedupe case-insensitive (preserva el casing tipeado).
const normTag = (s) => String(s || '').trim();
const dedupeTags = (arr) => {
  const seen = new Set();
  const out = [];
  for (const t of (arr || []).map(normTag).filter(Boolean)) {
    const k = t.toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(t); }
  }
  return out;
};

// Texto con las {variables} resaltadas como tokens ámbar.
function Tokens({ text, resolved = null }) {
  const parts = String(text || '').split(/(\{\w+\})/g);
  return (
    <>
      {parts.map((p, i) => {
        if (!/^\{\w+\}$/.test(p)) return <span key={i}>{p}</span>;
        if (resolved && resolved[p] !== undefined) return <b key={i} className="font-semibold">{resolved[p]}</b>;
        return <b key={i} className="font-semibold text-[#B45309] bg-[#FEF0D7] rounded-[5px] px-1">{p}</b>;
      })}
    </>
  );
}

// Textarea con variables resaltadas: backdrop pintado + textarea transparente
// encima (técnica clásica de highlight overlay).
function HighlightTextarea({ value, onChange, taRef }) {
  const backRef = useRef(null);
  const syncScroll = () => {
    if (backRef.current && taRef.current) backRef.current.scrollTop = taRef.current.scrollTop;
  };
  return (
    <div className="relative rounded-[10px] border border-border focus-within:border-[#F59E0B] focus-within:shadow-[0_0_0_3px_rgba(245,158,11,.12)] transition-all duration-150 bg-white overflow-hidden">
      <div ref={backRef}
           className="absolute inset-0 px-3 py-2.5 text-[13px] leading-relaxed whitespace-pre-wrap break-words overflow-hidden pointer-events-none text-text"
           aria-hidden>
        <Tokens text={value} />
        {'\n'}
      </div>
      <textarea
        ref={taRef}
        value={value}
        onChange={onChange}
        onScroll={syncScroll}
        rows={6}
        className="relative w-full resize-none px-3 py-2.5 text-[13px] leading-relaxed bg-transparent outline-none border-0"
        style={{ color: 'transparent', caretColor: '#1A1D26' }}
      />
    </div>
  );
}

// Editor de etiquetas libres de una plantilla: chips + input para agregar
// (Enter o coma agregan; Backspace con input vacío borra la última).
function TagsField({ value, onChange }) {
  const [text, setText] = useState('');
  const tags = value || [];
  const add = (raw) => { onChange(dedupeTags([...tags, raw])); setText(''); };
  const remove = (t) => onChange(tags.filter((x) => x !== t));
  const onKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && text.trim()) { e.preventDefault(); add(text); }
    else if (e.key === 'Backspace' && !text && tags.length) remove(tags[tags.length - 1]);
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-h-9 px-2 py-1.5 rounded-[10px] border border-border focus-within:border-[#F59E0B] focus-within:shadow-[0_0_0_3px_rgba(245,158,11,.12)] transition-all duration-150 bg-white">
      {tags.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 text-[11px] font-semibold pl-2 pr-1 py-0.5 rounded-full bg-[#EEF2FF] text-[#4A67D8]">
          {t}
          <button type="button" onClick={() => remove(t)} title="Quitar etiqueta"
                  className="w-3.5 h-3.5 flex items-center justify-center rounded-full text-[#4A67D8]/70 hover:text-white hover:bg-[#DC2626] cursor-pointer leading-none">
            <X size={9} strokeWidth={3} />
          </button>
        </span>
      ))}
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKeyDown}
             onBlur={() => { if (text.trim()) add(text); }}
             placeholder={tags.length ? '' : 'onboarding, dudas…'}
             className="flex-1 min-w-[90px] text-[12.5px] outline-none border-0 bg-transparent py-0.5" />
    </div>
  );
}

// Página Plantillas — master-detail del diseño: lista 400 | editor | preview 320.
// Las respuestas rápidas viven en soporte_config.templates y se insertan
// tipeando "/" en el chat.
export default function PlantillasPage() {
  const { templates, saveTemplates } = useSoporte();
  const [selectedId, setSelectedId] = useState(null); // id | 'new' | null
  const [draft, setDraft] = useState(null); // {name, shortcut, category, body, tags}
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [filterTags, setFilterTags] = useState([]); // etiquetas activas en el filtro (AND)
  const taRef = useRef(null);

  const selected = selectedId === 'new' ? null : templates.find((t) => t.id === selectedId) || null;

  // Catálogo de etiquetas usadas (para la barra de filtro) y lista filtrada.
  const allTags = useMemo(() => dedupeTags(templates.flatMap((t) => t.tags || [])).sort((a, b) => a.localeCompare(b)), [templates]);
  const filtered = useMemo(() => {
    if (!filterTags.length) return templates;
    const want = filterTags.map((t) => t.toLowerCase());
    return templates.filter((t) => {
      const has = (t.tags || []).map((x) => x.toLowerCase());
      return want.every((w) => has.includes(w));
    });
  }, [templates, filterTags]);
  const toggleFilter = (t) => setFilterTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // Cargar el borrador al cambiar la selección.
  useEffect(() => {
    setError('');
    if (selectedId === 'new') setDraft({ name: '', shortcut: '', category: '', body: '', tags: [] });
    else if (selected) setDraft({ name: selected.name || '', shortcut: selected.shortcut || '', category: selected.category || '', body: selected.body || '', tags: selected.tags || [] });
    else setDraft(null);
  }, [selectedId, selected]);

  const dirty = draft && (
    selectedId === 'new'
      ? Boolean(draft.name || draft.shortcut || draft.body)
      : draft.name !== (selected?.name || '') || draft.shortcut !== (selected?.shortcut || '') ||
        draft.category !== (selected?.category || '') || draft.body !== (selected?.body || '') ||
        (draft.tags || []).join('') !== (selected?.tags || []).join('')
  );

  const insertVariable = (v) => {
    const ta = taRef.current;
    if (!ta || !draft) return;
    const pos = ta.selectionStart ?? draft.body.length;
    const body = draft.body.slice(0, pos) + v + draft.body.slice(ta.selectionEnd ?? pos);
    setDraft((d) => ({ ...d, body }));
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = pos + v.length;
    });
  };

  const persist = async (next) => {
    setSaving(true);
    try {
      await saveTemplates(next);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setError('');
    const shortcut = slugify(draft.shortcut);
    if (!shortcut) { setError('Poné un atajo (ej: saludo).'); return; }
    const clash = templates.some((t) => t.shortcut === shortcut && t.id !== selectedId);
    if (clash) { setError(`El atajo /${shortcut} ya existe.`); return; }
    if (!draft.body.trim()) { setError('El mensaje no puede estar vacío.'); return; }
    const data = { name: draft.name.trim() || shortcut, shortcut, category: draft.category || null, body: draft.body.trim(), tags: dedupeTags(draft.tags) };
    if (selectedId === 'new') {
      const t = { id: newId(), ...data };
      await persist([...templates, t]);
      setSelectedId(t.id);
    } else {
      await persist(templates.map((t) => (t.id === selectedId ? { ...t, ...data } : t)));
    }
  };

  const remove = async () => {
    if (!selected) return;
    await persist(templates.filter((t) => t.id !== selected.id));
    setSelectedId(null);
  };

  const editorOpen = Boolean(draft);

  return (
    <div className="h-full min-h-0 flex rounded-[14px] border border-border overflow-hidden bg-white shadow-[0_1px_2px_rgba(10,22,40,.04),0_1px_3px_rgba(10,22,40,.06)]">
      {/* Lista (400px) */}
      <div className={`w-[400px] shrink-0 border-r border-border min-h-0 flex flex-col max-md:w-full max-md:border-r-0 ${editorOpen ? 'max-md:hidden' : ''}`}>
        <div className="px-4 pt-4 pb-3 border-b border-surface2 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-[10px] bg-[#FEF0D7] flex items-center justify-center">
              <Zap size={15} className="text-[#B45309]" />
            </span>
            <div>
              <div className="text-[15px] font-bold leading-tight">Plantillas</div>
              <div className="text-[11px] text-text3">Se insertan con «/» en el chat</div>
            </div>
          </div>
          <button onClick={() => setSelectedId('new')}
                  className="py-2 px-3 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1 shadow-[0_2px_6px_rgba(245,158,11,.35)] transition-colors duration-150">
            <Plus size={13} /> Nueva
          </button>
        </div>
        {allTags.length > 0 && (
          <div className="px-3 py-2 border-b border-surface2 flex items-center gap-1.5 flex-wrap shrink-0">
            <Tag size={12} className="text-text3 shrink-0" />
            {allTags.map((t) => {
              const on = filterTags.includes(t);
              return (
                <button key={t} onClick={() => toggleFilter(t)}
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border cursor-pointer transition-colors duration-150 ${on ? 'bg-[#4A67D8] text-white border-[#4A67D8]' : 'bg-white text-[#4A67D8] border-[#C7D2FE] hover:bg-[#EEF2FF]'}`}>
                  {t}
                </button>
              );
            })}
            {filterTags.length > 0 && (
              <button onClick={() => setFilterTags([])}
                      className="text-[11px] font-medium text-text3 hover:text-[#DC2626] cursor-pointer px-1">
                Limpiar
              </button>
            )}
          </div>
        )}
        <div className="flex-1 overflow-y-auto min-h-0 p-2.5 flex flex-col gap-1.5">
          {templates.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Zap size={24} className="mx-auto text-text3 mb-2" />
              <div className="text-[12.5px] font-semibold text-text2">Todavía no hay plantillas</div>
              <div className="text-[11px] text-text3 mt-1">Creá la primera con el botón Nueva.</div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Tag size={22} className="mx-auto text-text3 mb-2" />
              <div className="text-[12.5px] font-semibold text-text2">Ninguna plantilla con esas etiquetas</div>
              <button onClick={() => setFilterTags([])} className="text-[11px] text-[#4A67D8] font-semibold mt-1 cursor-pointer hover:underline">Limpiar filtro</button>
            </div>
          ) : (
            filtered.map((t) => {
              const on = t.id === selectedId;
              const cat = catOf(t.category);
              return (
                <button key={t.id} onClick={() => setSelectedId(t.id)}
                        className={`w-full text-left p-3 rounded-xl border cursor-pointer transition-all duration-150 ${on ? 'border-[#F59E0B]/65 bg-[#FFFBF2] shadow-[0_2px_10px_rgba(245,158,11,0.12)]' : 'border-border/70 bg-white hover:border-[#F59E0B]/45 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)]'}`}>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] font-bold rounded-md px-2 py-0.5 shrink-0 ${on ? 'bg-[#FEF0D7] text-[#B45309]' : 'bg-surface2 text-text2'}`}>
                      /{t.shortcut}
                    </span>
                    <span className="text-[12.5px] font-semibold truncate flex-1">{t.name}</span>
                    {cat && (
                      <span className="text-[9.5px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
                            style={{ background: cat.bg, color: cat.color }}>{cat.label}</span>
                    )}
                    <ChevronRight size={13} className="text-text3 shrink-0 md:hidden" />
                  </div>
                  <div className="text-[11.5px] text-text3 mt-1 leading-snug line-clamp-2">
                    <Tokens text={t.body} />
                  </div>
                  {(t.tags || []).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {(t.tags || []).map((tg) => (
                        <span key={tg} className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded-full bg-[#EEF2FF] text-[#4A67D8]">{tg}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={`flex-1 min-w-0 min-h-0 overflow-y-auto ${!editorOpen ? 'max-md:hidden' : ''}`}>
        {!draft ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center px-6">
              <Zap size={26} className="mx-auto text-text3 mb-2" />
              <div className="text-[13.5px] font-semibold text-text2">Elegí una plantilla</div>
              <div className="text-[12px] text-text3 mt-1">O creá una nueva para responder más rápido.</div>
            </div>
          </div>
        ) : (
          <div className="p-5 max-md:p-3.5 flex flex-col gap-4 max-w-[560px]">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button onClick={() => setSelectedId(null)}
                        className="md:hidden bg-transparent border-0 text-text2 cursor-pointer p-1 -ml-1">
                  <ChevronLeft size={18} />
                </button>
                <span className="text-[15px] font-bold">{selectedId === 'new' ? 'Nueva plantilla' : 'Editar plantilla'}</span>
              </div>
              {selected && (
                <button onClick={remove} title="Eliminar plantilla"
                        className="border border-border bg-white rounded-[9px] text-text2 hover:text-[#DC2626] hover:border-[#DC2626]/40 cursor-pointer p-2 transition-colors duration-150">
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
              <div>
                <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1.5">Nombre</label>
                <input value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
                       placeholder="Saludo inicial"
                       className="w-full h-9 px-3 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B] transition-colors duration-150" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1.5">Atajo</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-bold text-[#B45309]">/</span>
                    <input value={draft.shortcut} onChange={(e) => setDraft((d) => ({ ...d, shortcut: e.target.value }))}
                           placeholder="saludo"
                           className="w-full h-9 pl-6 pr-3 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B] transition-colors duration-150" />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1.5">Categoría</label>
                  <select value={draft.category} onChange={(e) => setDraft((d) => ({ ...d, category: e.target.value }))}
                          className="w-full h-9 px-2 text-[12.5px] rounded-[10px] border border-border outline-none bg-white cursor-pointer">
                    <option value="">Sin categoría</option>
                    {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1.5">Etiquetas</label>
              <TagsField value={draft.tags} onChange={(tags) => setDraft((d) => ({ ...d, tags }))} />
              <div className="text-[10.5px] text-text3 mt-1.5">Para organizar y filtrar las plantillas (ej. <b className="font-semibold">onboarding</b>, <b className="font-semibold">g-clientes</b>). Enter o coma para agregar.</div>
            </div>

            <div>
              <label className="text-[10px] font-bold tracking-widest text-text3 uppercase block mb-1.5">Mensaje</label>
              <HighlightTextarea value={draft.body} onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))} taRef={taRef} />
              <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                <span className="text-[11px] text-text3 mr-0.5">Insertar variable:</span>
                {VARIABLES.map((v) => (
                  <button key={v} onClick={() => insertVariable(v)}
                          className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-[#F5D9A8] bg-white text-[#B45309] cursor-pointer hover:bg-[#FEF0D7] transition-colors duration-150">
                    {v}
                  </button>
                ))}
              </div>
              <div className="text-[10.5px] text-text3 mt-2">
                <b className="font-semibold">{'{nombre}'}</b> se completa solo con el contacto del chat al insertarla;
                las demás quedan para completar antes de enviar.
              </div>
            </div>

            {error && <div className="text-[12px] font-medium" style={{ color: '#DC2626' }}>{error}</div>}

            <div className="flex items-center gap-2">
              <button onClick={save} disabled={saving || !dirty}
                      className={`py-2 px-4 rounded-[10px] border-0 text-[12.5px] font-bold flex items-center gap-1.5 transition-colors duration-150 ${dirty ? 'bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] shadow-[0_2px_6px_rgba(245,158,11,.35)]' : 'bg-surface2 text-text3 cursor-default'}`}>
                <Check size={14} /> {saving ? 'Guardando…' : savedFlash ? 'Guardado ✓' : 'Guardar plantilla'}
              </button>
              {dirty && (
                <button onClick={() => {
                          setError('');
                          setDraft(selected
                            ? { name: selected.name || '', shortcut: selected.shortcut || '', category: selected.category || '', body: selected.body || '', tags: selected.tags || [] }
                            : { name: '', shortcut: '', category: '', body: '', tags: [] });
                        }}
                        className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-medium text-text2 cursor-pointer hover:bg-surface2 transition-colors duration-150">
                  Descartar cambios
                </button>
              )}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
