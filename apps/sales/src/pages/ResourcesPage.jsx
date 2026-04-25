import { useState, useEffect, useMemo, useRef } from 'react';
import { Search, Plus, MessageCircle, Sparkles, Folder, ExternalLink, Trash2, Copy, Check, X } from 'lucide-react';
import { useSalesResources } from '../hooks/useSalesResources.js';
import { useConfirm, useToast } from '../components/ConfirmDialog.jsx';

// Recursos · 3 secciones (Mensajes, Objeciones, Recursos) con tags
// como etiquetas reales (sin #), filtro por tag y edicion inline de TODO.

const TYPES = [
  { id: 'mensajes',   l: 'Mensajes',   Ico: MessageCircle, color: '#5B7CF5', bg: '#EEF2FF' },
  { id: 'objeciones', l: 'Objeciones', Ico: Sparkles,      color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'recursos',   l: 'Recursos',   Ico: Folder,        color: '#22C55E', bg: '#ECFDF5' },
];

// Color de etiqueta determinístico por hash del texto
const TAG_PALETTE = ['#5B7CF5', '#22C55E', '#EAB308', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316', '#EC4899'];
function tagColor(text = '') {
  let h = 0;
  for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
  return TAG_PALETTE[Math.abs(h) % TAG_PALETTE.length];
}

export default function ResourcesPage() {
  const { items, loading, create, update, remove } = useSalesResources();
  const [tab, setTab] = useState('mensajes');
  const [search, setSearch] = useState('');
  const [activeTags, setActiveTags] = useState([]); // filter por tags
  const [modalOpen, setModalOpen] = useState(false);
  const { confirm, dialog } = useConfirm();
  const { showToast, toasts } = useToast();
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  // Reset filtros al cambiar de tab
  useEffect(() => { setActiveTags([]); }, [tab]);

  const itemsByType = useMemo(() => {
    const map = { mensajes: [], objeciones: [], recursos: [] };
    items.forEach((it) => {
      const t = TYPES.find((x) => x.id === it.type)?.id || 'recursos';
      map[t].push(it);
    });
    return map;
  }, [items]);

  const counts = useMemo(() => ({
    mensajes: itemsByType.mensajes.length,
    objeciones: itemsByType.objeciones.length,
    recursos: itemsByType.recursos.length,
  }), [itemsByType]);

  // Tags únicas en el tab activo (para el panel de filtro)
  const uniqueTags = useMemo(() => {
    const set = new Set();
    (itemsByType[tab] || []).forEach((it) => (it.tags || []).forEach((t) => set.add(t)));
    return [...set].sort();
  }, [itemsByType, tab]);

  const tabItems = itemsByType[tab] || [];
  const filtered = useMemo(() => {
    let result = tabItems;
    // Filtro por tags activos (item debe tener TODOS los tags activos)
    if (activeTags.length > 0) {
      result = result.filter((it) => {
        const itTags = it.tags || [];
        return activeTags.every((t) => itTags.includes(t));
      });
    }
    // Search texto
    const q = search.trim().toLowerCase();
    if (q) {
      result = result.filter((it) => {
        const hay = [it.title, it.body, it.body_alt, it.description, it.url, ...(it.tags || [])].filter(Boolean).join(' ');
        return hay.toLowerCase().includes(q);
      });
    }
    return result;
  }, [tabItems, search, activeTags]);

  const toggleTagFilter = (t) => setActiveTags((p) => p.includes(t) ? p.filter((x) => x !== t) : [...p, t]);

  const handleCreate = async (payload) => {
    const res = await create({ ...payload, type: tab });
    if (res.error) { showToast('No se pudo crear: ' + res.error, 'error'); return false; }
    setModalOpen(false);
    showToast('Recurso creado', 'success');
    return true;
  };

  const handleDelete = async (item) => {
    const ok = await confirm({
      title: '¿Eliminar este recurso?',
      message: 'Se borra de la biblioteca compartida del equipo.',
      danger: true,
    });
    if (!ok) return;
    const res = await remove(item);
    if (res.error) showToast('Error: ' + res.error, 'error');
    else showToast('Recurso eliminado', 'success');
  };

  const handleUpdate = async (item, patch) => {
    const res = await update(item, patch);
    if (res.error) showToast('No se pudo guardar: ' + res.error, 'error');
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando recursos…</div>;

  const tdef = TYPES.find((t) => t.id === tab);

  return (
    <div className="flex flex-col">
      {/* Topbar */}
      {!isMobile && (
        <div className="bg-white border border-border rounded-xl shadow-sm p-3 mb-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-[140px]">
              <h1 className="text-[17px] font-bold leading-tight">Recursos</h1>
              <p className="text-[11.5px] text-text3 mt-0.5">Mensajes, objeciones y materiales de venta</p>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-bg border border-border rounded-lg px-3 py-2">
              <Search size={15} className="text-text3 shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder={`Buscar en ${tdef.l.toLowerCase()}…`}
                     className="flex-1 min-w-0 text-[12.5px] text-text bg-transparent border-0 outline-none placeholder:text-text3" />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                        className="text-text3 hover:text-text bg-transparent border-0 p-0.5 cursor-pointer">×</button>
              )}
            </div>

            <button onClick={() => setModalOpen(true)}
                    className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> Nuevo
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="mb-2.5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h1 className="text-[15px] font-bold leading-tight">Recursos</h1>
            <button onClick={() => setModalOpen(true)}
                    className="py-1.5 px-2.5 rounded-md bg-blue text-white text-[11.5px] font-semibold flex items-center gap-1">
              <Plus size={13} /> Nuevo
            </button>
          </div>
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text3" />
            <input value={search} onChange={(e) => setSearch(e.target.value)}
                   placeholder={`Buscar en ${tdef.l.toLowerCase()}…`}
                   className="w-full pl-7 pr-2 py-1.5 text-[12px] text-text bg-white border border-border rounded-md outline-none focus:border-blue" />
          </div>
        </div>
      )}

      {/* Tabs principales (3) */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-white border border-border rounded-xl mb-2.5 p-1">
        {TYPES.map((rt) => {
          const Icon = rt.Ico;
          const isOn = tab === rt.id;
          return (
            <button key={rt.id} type="button" onClick={() => setTab(rt.id)}
                    className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold transition-colors ${
                      isOn ? 'bg-surface2 text-text' : 'text-text3 hover:text-text hover:bg-surface2'
                    }`}>
              <Icon size={14} style={{ color: isOn ? rt.color : undefined }} />
              {rt.l}
              <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${isOn ? 'text-white' : 'bg-surface3 text-text3'}`}
                    style={isOn ? { background: rt.color } : undefined}>
                {counts[rt.id]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Filtro por etiqueta — chips clickeables */}
      {uniqueTags.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3">
          <span className="text-[10.5px] text-text3 font-semibold mr-1">Filtrar:</span>
          {uniqueTags.map((t) => {
            const on = activeTags.includes(t);
            const c = tagColor(t);
            return (
              <button key={t} onClick={() => toggleTagFilter(t)}
                      className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full transition-colors"
                      style={on
                        ? { background: c, color: '#fff' }
                        : { background: c + '1F', color: c }}>
                {t}
              </button>
            );
          })}
          {activeTags.length > 0 && (
            <button onClick={() => setActiveTags([])}
                    className="text-[10.5px] text-text3 hover:text-red bg-transparent border-0 cursor-pointer flex items-center gap-1">
              <X size={11} /> Limpiar
            </button>
          )}
        </div>
      )}

      {/* Body */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center text-text3 py-12 text-[12px] bg-white border border-border rounded-xl">
            {search || activeTags.length > 0
              ? 'No hay resultados con esos filtros'
              : <>Sin {tdef?.l.toLowerCase()} cargados todavía. <button onClick={() => setModalOpen(true)} className="text-blue font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer">Agregá el primero</button></>}
          </div>
        ) : tab === 'mensajes' ? (
          filtered.map((it) => <MensajeCard key={it.id} item={it} onUpdate={handleUpdate} onDelete={() => handleDelete(it)} />)
        ) : tab === 'objeciones' ? (
          filtered.map((it) => <ObjecionCard key={it.id} item={it} onUpdate={handleUpdate} onDelete={() => handleDelete(it)} />)
        ) : (
          filtered.map((it) => <RecursoCard key={it.id} item={it} type={tdef} onUpdate={handleUpdate} onDelete={() => handleDelete(it)} />)
        )}
      </div>

      {modalOpen && (
        <ResourceModal type={tdef} onClose={() => setModalOpen(false)} onCreate={handleCreate} showToast={showToast} />
      )}

      {dialog}
      {toasts}
    </div>
  );
}

// ─── TagEditor: editar etiquetas inline (agregar/quitar) ────────────────────
function TagEditor({ tags = [], onChange }) {
  const [input, setInput] = useState('');
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  const addTag = (raw) => {
    const t = (raw || '').trim().toLowerCase();
    if (!t) return;
    if (tags.includes(t)) { setInput(''); return; }
    onChange([...tags, t]);
    setInput('');
  };

  const removeTag = (t) => onChange(tags.filter((x) => x !== t));

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(input);
    } else if (e.key === 'Backspace' && !input && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    } else if (e.key === 'Escape') {
      setInput('');
      setEditing(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="flex flex-wrap gap-1 items-center">
      {tags.map((t) => {
        const c = tagColor(t);
        return (
          <span key={t} className="inline-flex items-center gap-1 text-[10.5px] font-semibold px-2 py-0.5 rounded-full group/tag"
                style={{ background: c + '1F', color: c }}>
            {t}
            <button type="button" onClick={() => removeTag(t)}
                    className="hover:bg-white/40 rounded-full p-0.5 cursor-pointer transition-colors"
                    title="Quitar etiqueta">
              <X size={9} strokeWidth={2.5} />
            </button>
          </span>
        );
      })}
      {editing ? (
        <input ref={inputRef} autoFocus
               value={input}
               onChange={(e) => setInput(e.target.value)}
               onBlur={() => { addTag(input); setEditing(false); }}
               onKeyDown={handleKey}
               placeholder="nueva etiqueta…"
               className="text-[10.5px] bg-bg border border-border rounded-full px-2 py-0.5 outline-none focus:border-blue placeholder:text-text3 min-w-[80px]" />
      ) : (
        <button type="button" onClick={() => setEditing(true)}
                className="inline-flex items-center gap-0.5 text-[10.5px] text-text3 bg-surface2 hover:bg-surface3 rounded-full px-2 py-0.5 cursor-pointer">
          <Plus size={10} /> etiqueta
        </button>
      )}
    </div>
  );
}

// ─── Modal crear ──────────────────────────────────────────────────────────
function ResourceModal({ type, onClose, onCreate, showToast }) {
  const [form, setForm] = useState({ title: '', body: '', body_alt: '', url: '', description: '', tags: [] });
  const [saving, setSaving] = useState(false);
  const Icon = type.Ico;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) { showToast?.('El título es obligatorio.', 'error'); return; }
    setSaving(true);
    await onCreate(form);
    setSaving(false);
  };

  const renderFields = () => {
    switch (type.id) {
      case 'mensajes':
        return (
          <>
            <Field label="Título descriptivo" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)}
                     placeholder='Ej: "Saludo inicial WhatsApp"' className={inputCls} autoFocus />
            </Field>
            <Field label="Texto del mensaje" required>
              <textarea value={form.body} onChange={(e) => set('body', e.target.value)}
                        rows={6} placeholder="Hola {{nombre}}, …  Usá {{variables}} para personalizar."
                        className={textareaCls} />
            </Field>
            <Field label="Cuándo NO usarlo (notas internas)" hint="Avisos al equipo: contextos donde este mensaje no aplica.">
              <textarea value={form.body_alt} onChange={(e) => set('body_alt', e.target.value)}
                        rows={2} placeholder="Ej: no usar si el lead ya tuvo una llamada previa…"
                        className={textareaCls} />
            </Field>
          </>
        );
      case 'objeciones':
        return (
          <>
            <Field label="Objeción" required hint="Cómo la dice el cliente.">
              <input value={form.title} onChange={(e) => set('title', e.target.value)}
                     placeholder='Ej: "Me parece muy caro"' className={inputCls} autoFocus />
            </Field>
            <Field label="Respuesta corta (1 línea)" required hint="Para usar en chat.">
              <textarea value={form.body} onChange={(e) => set('body', e.target.value)}
                        rows={2} placeholder="Lo entiendo. ¿Comparado con qué te resulta caro?"
                        className={textareaCls} />
            </Field>
            <Field label="Respuesta larga (guion)" hint="Para llamadas. Podés incluir varios pasos.">
              <textarea value={form.body_alt} onChange={(e) => set('body_alt', e.target.value)}
                        rows={5} placeholder="1. Validar la objeción…&#10;2. Pivot al valor…&#10;3. Cierre…"
                        className={textareaCls} />
            </Field>
          </>
        );
      default:
        return (
          <>
            <Field label="Título" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)}
                     placeholder='Ej: "Caso éxito Herbalife"' className={inputCls} autoFocus />
            </Field>
            <Field label="URL del recurso" hint="Drive, YouTube, Loom… Opcional si solo querés guardar una nota.">
              <input value={form.url} onChange={(e) => set('url', e.target.value)}
                     placeholder="https://drive.google.com/…" className={inputCls} type="url" />
            </Field>
            <Field label="Descripción">
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
                        rows={3} placeholder="Para qué sirve, cuándo usarlo…" className={textareaCls} />
            </Field>
          </>
        );
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed z-50 bg-white flex flex-col overflow-hidden
                      inset-0 md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2
                      md:w-[clamp(360px,42vw,560px)] md:max-h-[90vh]
                      md:rounded-2xl md:border md:border-border shadow-2xl">
        <div className="flex items-center gap-3 p-3.5 border-b border-border shrink-0">
          <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: type.bg, color: type.color }}>
            <Icon size={16} />
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-bold">Nuevo {type.l.slice(0, -1).toLowerCase()}</div>
            <div className="text-[10.5px] text-text3">Se guarda en la biblioteca compartida del equipo</div>
          </div>
          <button onClick={onClose} type="button"
                  className="bg-transparent border-0 text-text3 hover:text-text rounded p-1 cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
          {renderFields()}
          <Field label="Etiquetas" hint="Click + etiqueta para agregar. Click × para quitar.">
            <TagEditor tags={form.tags} onChange={(tags) => set('tags', tags)} />
          </Field>
        </form>

        <div className="flex items-center justify-end gap-2 p-3 border-t border-border shrink-0">
          <button onClick={onClose} type="button" disabled={saving}
                  className="py-2 px-3.5 rounded-lg border border-border bg-white text-text2 text-[12px] font-medium hover:bg-surface2">
            Cancelar
          </button>
          <button onClick={handleSave} type="submit" disabled={saving}
                  className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark disabled:opacity-60 flex items-center gap-1.5">
            {saving ? 'Guardando…' : <><Plus size={14} /> Crear</>}
          </button>
        </div>
      </div>
    </>
  );
}

function Field({ label, required, hint, children }) {
  return (
    <div>
      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1.5">
        {label}{required && <span className="text-red ml-1">*</span>}
      </label>
      {children}
      {hint && <div className="text-[10.5px] text-text3 mt-1">{hint}</div>}
    </div>
  );
}

const inputCls = 'w-full text-[13px] text-text bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-blue';
const textareaCls = inputCls + ' resize-none leading-relaxed';

// ─── Card Mensaje ─────────────────────────────────────────────────────────
function MensajeCard({ item, onUpdate, onDelete }) {
  const [copied, setCopied] = useState(false);
  const [showAlt, setShowAlt] = useState(!!item.body_alt);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.body || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onUpdate(item, { used_count: (item.used_count || 0) + 1 });
    } catch {}
  };

  return (
    <div className="bg-white border border-border rounded-xl p-3.5 group">
      <div className="flex items-center gap-2 mb-2">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-blue-bg text-blue">
          <MessageCircle size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <input defaultValue={item.title || ''}
                 onBlur={(e) => e.target.value !== item.title && onUpdate(item, { title: e.target.value })}
                 placeholder="Título"
                 className="w-full text-[13px] font-semibold text-text bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none" />
          <div className="text-[10.5px] text-text3 mt-0.5">{(item.used_count || 0)}× copiado</div>
        </div>
        <button onClick={copy} type="button"
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-semibold transition-colors ${
                  copied ? 'bg-green text-white' : 'bg-surface2 text-text2 hover:bg-surface3'
                }`}>
          {copied ? <><Check size={11} /> Copiado</> : <><Copy size={11} /> Copiar</>}
        </button>
        <button onClick={onDelete} type="button" title="Eliminar"
                className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>

      <div className="bg-bg border border-dashed border-border rounded-lg p-2.5">
        <textarea defaultValue={item.body || ''}
                  onBlur={(e) => e.target.value !== item.body && onUpdate(item, { body: e.target.value })}
                  placeholder="Texto del mensaje. Usá {{variables}} para personalizar."
                  rows={Math.max(2, Math.min(6, ((item.body || '').match(/\n/g) || []).length + 1))}
                  className="w-full text-[12px] leading-relaxed text-text bg-transparent border-0 outline-none resize-none placeholder:text-text3" />
      </div>

      {/* Notas "cuando NO usarlo" — toggleable */}
      <div className="mt-2">
        {showAlt || item.body_alt ? (
          <div className="p-2.5 rounded-lg" style={{ background: '#FEF3C7', border: '1px solid #FDE68A' }}>
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-1 flex items-center justify-between" style={{ color: '#B45309' }}>
              ⚠ Cuándo NO usarlo
              {!item.body_alt && (
                <button type="button" onClick={() => setShowAlt(false)}
                        className="text-[9px] hover:underline bg-transparent border-0 cursor-pointer" style={{ color: '#B45309' }}>×</button>
              )}
            </div>
            <textarea defaultValue={item.body_alt || ''}
                      onBlur={(e) => e.target.value !== item.body_alt && onUpdate(item, { body_alt: e.target.value || null })}
                      placeholder="Notas para el equipo…"
                      rows={2}
                      className="w-full text-[11px] leading-relaxed bg-transparent border-0 outline-none resize-none"
                      style={{ color: '#92400E' }} />
          </div>
        ) : (
          <button type="button" onClick={() => setShowAlt(true)}
                  className="text-[10.5px] text-text3 hover:text-text2 bg-transparent border-0 cursor-pointer flex items-center gap-1">
            <Plus size={10} /> Agregar nota "cuándo NO usarlo"
          </button>
        )}
      </div>

      <div className="mt-2.5 pt-2.5 border-t border-border">
        <TagEditor tags={item.tags || []} onChange={(tags) => onUpdate(item, { tags })} />
      </div>
    </div>
  );
}

// ─── Card Objeción ────────────────────────────────────────────────────────
function ObjecionCard({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(!!item.body_alt);

  return (
    <div className="bg-white border border-border rounded-xl p-3.5 group">
      <div className="flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-purple-bg text-purple">
          <Sparkles size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <input defaultValue={item.title || ''}
                 onBlur={(e) => e.target.value !== item.title && onUpdate(item, { title: e.target.value })}
                 placeholder='Objeción ej: "es muy caro"'
                 className="w-full text-[13.5px] font-semibold text-text bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none mb-1.5" />

          <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 mb-1">Respuesta corta</div>
          <textarea defaultValue={item.body || ''}
                    onBlur={(e) => e.target.value !== item.body && onUpdate(item, { body: e.target.value })}
                    placeholder="1 línea para chat"
                    rows={2}
                    className="w-full text-[12px] text-text bg-blue-bg2 border border-blue-bg rounded-lg p-2 outline-none resize-none focus:border-blue" />

          {open ? (
            <>
              <div className="text-[9.5px] font-bold uppercase tracking-wider text-text3 mb-1 mt-3">Respuesta larga (guion)</div>
              <textarea defaultValue={item.body_alt || ''}
                        onBlur={(e) => e.target.value !== item.body_alt && onUpdate(item, { body_alt: e.target.value })}
                        placeholder="Pasos para llamada…"
                        rows={5}
                        className="w-full text-[12px] text-text bg-bg border border-border rounded-lg p-2 outline-none resize-none focus:border-blue" />
            </>
          ) : (
            <button type="button" onClick={() => setOpen(true)}
                    className="text-[10.5px] text-blue hover:underline bg-transparent border-0 cursor-pointer mt-2 flex items-center gap-1">
              <Plus size={10} /> Agregar respuesta larga
            </button>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {open && (
            <button onClick={() => setOpen(false)} type="button"
                    className="text-[10.5px] text-text3 hover:text-text bg-transparent border-0 cursor-pointer px-2 py-1 hover:bg-surface2 rounded">
              Cerrar
            </button>
          )}
          <button onClick={onDelete} type="button" title="Eliminar"
                  className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      <div className="mt-3 pt-2.5 border-t border-border ml-9">
        <TagEditor tags={item.tags || []} onChange={(tags) => onUpdate(item, { tags })} />
      </div>
    </div>
  );
}

// ─── Card Recurso (genérico: docs/videos/audios/imagenes/links) ──────────
function RecursoCard({ item, type, onUpdate, onDelete }) {
  const Icon = type.Ico;
  return (
    <div className="bg-white border border-border rounded-xl p-3 group">
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: type.bg, color: type.color }}>
          <Icon size={16} />
        </span>
        <div className="flex-1 min-w-0">
          <input defaultValue={item.title || ''}
                 onBlur={(e) => e.target.value !== item.title && onUpdate(item, { title: e.target.value })}
                 placeholder="Título"
                 className="w-full text-[13px] font-semibold text-text bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none" />
          <input defaultValue={item.url || ''}
                 onBlur={(e) => e.target.value !== item.url && onUpdate(item, { url: e.target.value || null })}
                 placeholder="URL (Drive, YouTube, Loom…)"
                 className="w-full text-[11px] text-text3 bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none mt-0.5 truncate" />
        </div>
        {item.url && (
          <a href={item.url} target="_blank" rel="noreferrer" title="Abrir"
             onClick={() => onUpdate(item, { used_count: (item.used_count || 0) + 1 })}
             className="bg-surface2 text-text2 hover:bg-surface3 rounded-md px-2.5 py-1.5 text-[11px] font-semibold inline-flex items-center gap-1.5 no-underline">
            <ExternalLink size={11} /> Abrir
          </a>
        )}
        <button onClick={onDelete} type="button" title="Eliminar"
                className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>

      {/* Descripción opcional */}
      <textarea defaultValue={item.description || ''}
                onBlur={(e) => e.target.value !== item.description && onUpdate(item, { description: e.target.value || null })}
                placeholder="Descripción / notas (opcional)"
                rows={1}
                className="w-full text-[11.5px] text-text2 bg-transparent border border-transparent hover:border-border focus:border-blue rounded px-1 py-0.5 outline-none resize-none mt-2 placeholder:text-text3" />

      <div className="mt-2 pt-2 border-t border-border">
        <TagEditor tags={item.tags || []} onChange={(tags) => onUpdate(item, { tags })} />
      </div>
    </div>
  );
}
