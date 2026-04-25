import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, MessageCircle, Sparkles, Paperclip, Play, Phone, Image as ImageIcon, ExternalLink, Trash2, Copy, Check, X } from 'lucide-react';
import { useSalesResources } from '../hooks/useSalesResources.js';

// Recursos · V1 conservadora del handoff — tabs por tipo + lista limpia.

const TYPES = [
  { id: 'mensajes',   l: 'Mensajes',   Ico: MessageCircle, color: '#5B7CF5', bg: '#EEF2FF' },
  { id: 'objeciones', l: 'Objeciones', Ico: Sparkles,      color: '#8B5CF6', bg: '#F5F3FF' },
  { id: 'docs',       l: 'Documentos', Ico: Paperclip,     color: '#5B7CF5', bg: '#EEF2FF' },
  { id: 'videos',     l: 'Videos',     Ico: Play,          color: '#EF4444', bg: '#FEF2F2' },
  { id: 'audios',     l: 'Audios',     Ico: Phone,         color: '#22C55E', bg: '#ECFDF5' },
  { id: 'imagenes',   l: 'Imágenes',   Ico: ImageIcon,     color: '#EAB308', bg: '#FEFCE8' },
];

export default function ResourcesPage() {
  const { items, loading, create, update, remove } = useSalesResources();
  const [tab, setTab] = useState('mensajes');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, []);

  const itemsByType = useMemo(() => {
    const map = {};
    TYPES.forEach((t) => { map[t.id] = []; });
    items.forEach((it) => {
      const t = it.type && map[it.type] ? it.type : 'docs';
      map[t].push(it);
    });
    return map;
  }, [items]);

  const counts = useMemo(() => {
    const c = {};
    TYPES.forEach((t) => { c[t.id] = (itemsByType[t.id] || []).length; });
    return c;
  }, [itemsByType]);

  const tabItems = itemsByType[tab] || [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tabItems;
    return tabItems.filter((it) => {
      const hay = [it.title, it.body, it.body_alt, it.description, it.url, ...(it.tags || [])].filter(Boolean).join(' ');
      return hay.toLowerCase().includes(q);
    });
  }, [tabItems, search]);

  const handleCreate = async (payload) => {
    await create({ ...payload, type: tab });
    setModalOpen(false);
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando recursos…</div>;

  const tdef = TYPES.find((t) => t.id === tab);

  return (
    <div className="flex flex-col">
      {/* Topbar — alineado al CRM */}
      {!isMobile && (
        <div className="bg-white border border-border rounded-xl shadow-sm p-3 mb-2.5">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="min-w-[140px]">
              <h1 className="text-[17px] font-bold leading-tight">Recursos</h1>
              <p className="text-[11.5px] text-text3 mt-0.5">Mensajes, objeciones y materiales para vender</p>
            </div>

            <div className="flex items-center gap-2 flex-1 min-w-[220px] bg-bg border border-border rounded-lg px-3 py-2">
              <Search size={15} className="text-text3 shrink-0" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                     placeholder="Buscar en mensajes, objeciones, documentos…"
                     className="flex-1 min-w-0 text-[12.5px] text-text bg-transparent border-0 outline-none placeholder:text-text3" />
              {search && (
                <button type="button" onClick={() => setSearch('')}
                        className="text-text3 hover:text-text bg-transparent border-0 p-0.5 cursor-pointer">×</button>
              )}
            </div>

            <button onClick={() => setModalOpen(true)}
                    className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> Nuevo {tdef?.l.slice(0, -1).toLowerCase()}
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
                   placeholder="Buscar mensaje, objeción…"
                   className="w-full pl-7 pr-2 py-1.5 text-[12px] text-text bg-white border border-border rounded-md outline-none focus:border-blue" />
          </div>
        </div>
      )}

      {/* Tabs por tipo */}
      <div className="flex gap-1 overflow-x-auto scrollbar-hide bg-white border border-border rounded-xl mb-3 p-1">
        {TYPES.map((rt) => {
          const Icon = rt.Ico;
          const isOn = tab === rt.id;
          const n = counts[rt.id] || 0;
          return (
            <button key={rt.id} type="button" onClick={() => setTab(rt.id)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[12.5px] font-semibold whitespace-nowrap transition-colors ${
                      isOn ? 'bg-surface2 text-text' : 'text-text3 hover:text-text hover:bg-surface2'
                    }`}>
              <Icon size={14} style={{ color: isOn ? rt.color : undefined }} />
              {rt.l}
              <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${isOn ? 'text-white' : 'bg-surface3 text-text3'}`}
                    style={isOn ? { background: rt.color } : undefined}>
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Body */}
      <div className="flex flex-col gap-2">
        {filtered.length === 0 ? (
          <div className="text-center text-text3 py-12 text-[12px] bg-white border border-border rounded-xl">
            {search
              ? `No hay resultados para "${search}"`
              : <>Sin {tdef?.l.toLowerCase()} cargados todavía. <button onClick={() => setModalOpen(true)} className="text-blue font-semibold hover:underline bg-transparent border-0 p-0 cursor-pointer">Agregá el primero</button></>}
          </div>
        ) : tab === 'mensajes' ? (
          filtered.map((it) => <MensajeCard key={it.id} item={it} onUpdate={update} onDelete={() => remove(it)} />)
        ) : tab === 'objeciones' ? (
          filtered.map((it) => <ObjecionCard key={it.id} item={it} onUpdate={update} onDelete={() => remove(it)} />)
        ) : (
          filtered.map((it) => <ResourceCard key={it.id} item={it} type={tdef} onUpdate={update} onDelete={() => remove(it)} />)
        )}
      </div>

      {modalOpen && (
        <ResourceModal type={tdef} onClose={() => setModalOpen(false)} onCreate={handleCreate} />
      )}
    </div>
  );
}

// Modal para crear un recurso del tipo activo. Campos varian segun el tipo.
function ResourceModal({ type, onClose, onCreate }) {
  const [form, setForm] = useState({ title: '', body: '', body_alt: '', url: '', description: '', tags: '' });
  const [saving, setSaving] = useState(false);
  const Icon = type.Ico;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSave = async (e) => {
    e?.preventDefault?.();
    if (!form.title.trim()) { alert('El título es obligatorio.'); return; }
    setSaving(true);
    const tags = form.tags.split(',').map((t) => t.trim()).filter(Boolean);
    await onCreate({ ...form, tags });
    setSaving(false);
  };

  // Renderiza el form correcto segun el tipo
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
            <Field label="Tags (separados por coma)">
              <input value={form.tags} onChange={(e) => set('tags', e.target.value)}
                     placeholder="opener, frio, whatsapp" className={inputCls} />
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
            <Field label="Tags (separados por coma)">
              <input value={form.tags} onChange={(e) => set('tags', e.target.value)}
                     placeholder="precio, cierre" className={inputCls} />
            </Field>
          </>
        );
      default:
        // docs / videos / audios / imagenes — link externo
        return (
          <>
            <Field label="Título" required>
              <input value={form.title} onChange={(e) => set('title', e.target.value)}
                     placeholder={`Ej: "${type.id === 'videos' ? 'Caso éxito Herbalife' : type.id === 'audios' ? 'Llamada modelo cierre' : type.id === 'imagenes' ? 'Reel testimonios' : 'PDF Programa Acelerador'}"`}
                     className={inputCls} autoFocus />
            </Field>
            <Field label="URL del recurso" required hint="Link de Drive, YouTube, Loom, etc.">
              <input value={form.url} onChange={(e) => set('url', e.target.value)}
                     placeholder="https://drive.google.com/…" className={inputCls} type="url" />
            </Field>
            <Field label="Descripción">
              <textarea value={form.description} onChange={(e) => set('description', e.target.value)}
                        rows={3} placeholder="Para qué sirve, cuándo usarlo…" className={textareaCls} />
            </Field>
            <Field label="Tags (separados por coma)">
              <input value={form.tags} onChange={(e) => set('tags', e.target.value)}
                     placeholder="discovery, caso, testimonio" className={inputCls} />
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
        {/* Header */}
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

        {/* Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-4 flex flex-col gap-3.5">
          {renderFields()}
        </form>

        {/* Footer */}
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
      <label className="block text-[10.5px] font-bold uppercase tracking-wider text-text3 mb-1">
        {label}{required && <span className="text-red ml-1">*</span>}
      </label>
      {children}
      {hint && <div className="text-[10.5px] text-text3 mt-1">{hint}</div>}
    </div>
  );
}

const inputCls = 'w-full text-[13px] text-text bg-bg border border-border rounded-lg px-3 py-2 outline-none focus:border-blue';
const textareaCls = inputCls + ' resize-none leading-relaxed';

// Card mensaje
function MensajeCard({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = item.body || '';
  const preview = body.length > 140 && !open ? body.slice(0, 140) + '…' : body;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
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
        <textarea defaultValue={body}
                  onBlur={(e) => e.target.value !== body && onUpdate(item, { body: e.target.value })}
                  placeholder="Texto del mensaje. Usá {{variables}} para personalizar."
                  rows={Math.min(8, Math.max(2, (preview.match(/\n/g) || []).length + 1))}
                  className="w-full text-[12px] leading-relaxed text-text bg-transparent border-0 outline-none resize-none placeholder:text-text3" />
      </div>

      {body.length > 140 && (
        <button onClick={() => setOpen(!open)} type="button"
                className="text-[11px] text-blue font-semibold bg-transparent border-0 cursor-pointer mt-2">
          {open ? 'Ver menos' : 'Ver completo'}
        </button>
      )}

      {item.body_alt && (
        <div className="mt-2 p-2.5 rounded-lg text-[11px] leading-relaxed"
             style={{ background: '#FEF3C7', border: '1px solid #FDE68A', color: '#92400E' }}>
          <div className="text-[9.5px] font-bold uppercase tracking-wider mb-1" style={{ color: '#B45309' }}>
            ⚠ Cuándo NO usarlo
          </div>
          {item.body_alt}
        </div>
      )}

      {(item.tags || []).length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {item.tags.map((t) => (
            <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-surface2 text-text2">#{t}</span>
          ))}
        </div>
      )}
    </div>
  );
}

// Card objeción
function ObjecionCard({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);

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
          <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-1">Respuesta corta</div>
          <textarea defaultValue={item.body || ''}
                    onBlur={(e) => e.target.value !== item.body && onUpdate(item, { body: e.target.value })}
                    placeholder="1 línea para chat"
                    rows={2}
                    className="w-full text-[12px] text-text bg-blue-bg2 border border-blue-bg rounded-lg p-2 outline-none resize-none focus:border-blue" />

          {open && (
            <>
              <div className="text-[10px] font-bold uppercase tracking-wider text-text3 mb-1 mt-3">Respuesta larga (guion)</div>
              <textarea defaultValue={item.body_alt || ''}
                        onBlur={(e) => e.target.value !== item.body_alt && onUpdate(item, { body_alt: e.target.value })}
                        placeholder="Pasos para llamada…"
                        rows={5}
                        className="w-full text-[12px] text-text bg-bg border border-border rounded-lg p-2 outline-none resize-none focus:border-blue" />
            </>
          )}
        </div>
        <button onClick={() => setOpen(!open)} type="button"
                className="text-[10.5px] text-blue font-semibold bg-transparent border-0 cursor-pointer shrink-0 px-2 py-1 hover:bg-blue-bg rounded">
          {open ? 'Cerrar' : 'Ver más'}
        </button>
        <button onClick={onDelete} type="button" title="Eliminar"
                className="opacity-0 group-hover:opacity-100 text-text3 hover:text-red bg-transparent border-0 p-1 cursor-pointer transition-opacity">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

// Card genérico — link externo
function ResourceCard({ item, type, onUpdate, onDelete }) {
  const Icon = type.Ico;
  return (
    <div className="bg-white border border-border rounded-xl p-3 flex items-center gap-3 group">
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
               onBlur={(e) => e.target.value !== item.url && onUpdate(item, { url: e.target.value })}
               placeholder="https://…"
               className="w-full text-[11px] text-text3 bg-transparent border-0 outline-none mt-0.5 truncate" />
        {item.description && (
          <div className="text-[10.5px] text-text2 mt-0.5 line-clamp-1">{item.description}</div>
        )}
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
  );
}
