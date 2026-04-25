import { useState, useEffect, useMemo } from 'react';
import { Search, Plus, MessageCircle, Sparkles, Paperclip, Play, Phone, Image as ImageIcon, ExternalLink, Trash2, Copy, Check } from 'lucide-react';
import { useSalesResources } from '../hooks/useSalesResources.js';

// Recursos · V1 conservadora — tabs por tipo + lista limpia.
// Estructura del handoff: title bar + search + tabs + lista.

// Tipos del catalogo. Map a las categorias existentes en sales_resources
// para no cambiar schema. Cada tipo tiene icono y color propio.
const TYPES = [
  { id: 'mensajes',   l: 'Mensajes',   Ico: MessageCircle, color: '#5B7CF5', bg: '#EEF2FF', cats: ['guion'] },
  { id: 'objeciones', l: 'Objeciones', Ico: Sparkles,      color: '#8B5CF6', bg: '#F5F3FF', cats: ['objecion'] },
  { id: 'docs',       l: 'Documentos', Ico: Paperclip,     color: '#5B7CF5', bg: '#EEF2FF', cats: ['doc', 'pdf', 'presentacion', 'landing', 'folder', 'other'] },
  { id: 'videos',     l: 'Videos',     Ico: Play,          color: '#EF4444', bg: '#FEF2F2', cats: ['video'] },
  { id: 'audios',     l: 'Audios',     Ico: Phone,         color: '#22C55E', bg: '#ECFDF5', cats: ['audio', 'testimonio'] },
  { id: 'imagenes',   l: 'Imágenes',   Ico: ImageIcon,     color: '#EAB308', bg: '#FEFCE8', cats: ['imagen'] },
];

// Categoria default al crear segun el tab activo
const DEFAULT_CAT = {
  mensajes: 'guion', objeciones: 'objecion',
  docs: 'doc', videos: 'video', audios: 'audio', imagenes: 'imagen',
};

export default function ResourcesPage() {
  const { items, loading, add, update, remove } = useSalesResources();
  const [tab, setTab] = useState('mensajes');
  const [search, setSearch] = useState('');
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 767px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const update = () => setIsMobile(mq.matches);
    mq.addEventListener?.('change', update);
    return () => mq.removeEventListener?.('change', update);
  }, []);

  const itemsByType = useMemo(() => {
    const map = {};
    TYPES.forEach((t) => { map[t.id] = []; });
    items.forEach((it) => {
      const t = TYPES.find((x) => x.cats.includes(it.category)) || TYPES.find((x) => x.id === 'docs');
      map[t.id].push(it);
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
      const hay = (it.title || '') + ' ' + (it.description || '') + ' ' + (it.url || '');
      return hay.toLowerCase().includes(q);
    });
  }, [tabItems, search]);

  const handleAdd = () => {
    const title = prompt('Título del recurso:');
    if (!title?.trim()) return;
    const url = prompt('URL (link externo):') || '';
    add({ title: title.trim(), url: url.trim() || null, category: DEFAULT_CAT[tab] || 'other', description: '' });
  };

  if (loading) return <div className="text-text3 text-center py-20">Cargando recursos…</div>;

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

            <button onClick={handleAdd}
                    className="py-2 px-3.5 rounded-lg bg-blue text-white text-[12px] font-semibold hover:bg-blue-dark flex items-center gap-1.5 shrink-0">
              <Plus size={14} /> Nuevo recurso
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <div className="mb-2.5">
          <div className="flex items-start justify-between gap-3 mb-2">
            <h1 className="text-[15px] font-bold leading-tight">Recursos</h1>
            <button onClick={handleAdd}
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
              : `Sin ${TYPES.find((t) => t.id === tab)?.l.toLowerCase()} cargados todavía`}
          </div>
        ) : tab === 'mensajes' ? (
          filtered.map((it) => <MensajeCard key={it.id} item={it} onUpdate={update} onDelete={() => remove(it)} />)
        ) : tab === 'objeciones' ? (
          filtered.map((it) => <ObjecionCard key={it.id} item={it} onUpdate={update} onDelete={() => remove(it)} />)
        ) : (
          filtered.map((it) => {
            const tdef = TYPES.find((x) => x.id === tab);
            return <ResourceCard key={it.id} item={it} type={tdef} onUpdate={update} onDelete={() => remove(it)} />;
          })
        )}
      </div>
    </div>
  );
}

// Card mensaje: titulo + body con boton copiar
function MensajeCard({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const body = item.description || '';
  const preview = body.length > 140 && !open ? body.slice(0, 140) + '…' : body;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(body);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      onUpdate(item, { used_count: (item.used_count || 0) + 1 }).catch(() => {});
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
                 placeholder="Título del mensaje"
                 className="w-full text-[13px] font-semibold text-text bg-transparent border-0 outline-none" />
          <div className="text-[10.5px] text-text3 mt-0.5">
            {item.category} · {(item.used_count || 0)}× usado
          </div>
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

      {/* Body editable */}
      <div className="bg-bg border border-dashed border-border rounded-lg p-2.5 text-[12px] leading-relaxed text-text whitespace-pre-wrap font-sans cursor-text">
        <textarea defaultValue={body}
                  onBlur={(e) => e.target.value !== body && onUpdate(item, { description: e.target.value })}
                  placeholder="Texto del mensaje. Usá {{variables}} para personalizar."
                  rows={Math.min(8, Math.max(2, preview.split('\n').length))}
                  className="w-full text-[12px] leading-relaxed text-text bg-transparent border-0 outline-none resize-none placeholder:text-text3" />
      </div>

      {body.length > 140 && (
        <button onClick={() => setOpen(!open)} type="button"
                className="text-[11px] text-blue font-semibold bg-transparent border-0 cursor-pointer mt-2">
          {open ? 'Ver menos' : 'Ver completo'}
        </button>
      )}
    </div>
  );
}

// Card objeción: titulo + respuesta corta + (open) respuesta larga
function ObjecionCard({ item, onUpdate, onDelete }) {
  const [open, setOpen] = useState(false);
  const respuesta = item.description || '';

  return (
    <div className="bg-white border border-border rounded-xl p-3.5 group">
      <div className="flex items-start gap-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-purple-bg text-purple">
          <Sparkles size={14} />
        </span>
        <div className="flex-1 min-w-0">
          <input defaultValue={item.title || ''}
                 onBlur={(e) => e.target.value !== item.title && onUpdate(item, { title: e.target.value })}
                 placeholder="¿Qué objeción aborda?"
                 className="w-full text-[13.5px] font-semibold text-text bg-transparent border-0 outline-none mb-1.5" />
          {!open ? (
            <div className="text-[11.5px] text-text2 leading-relaxed line-clamp-2">
              {respuesta || <span className="text-text3 italic">Sin respuesta cargada</span>}
            </div>
          ) : (
            <textarea defaultValue={respuesta}
                      onBlur={(e) => e.target.value !== respuesta && onUpdate(item, { description: e.target.value })}
                      placeholder="Respuesta para esta objeción…"
                      rows={5}
                      className="w-full text-[12px] text-text bg-bg border border-border rounded-lg p-2 outline-none resize-none focus:border-blue mt-1" />
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

// Card genérico: doc / video / audio / imagen — link externo
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
               className="w-full text-[13px] font-semibold text-text bg-transparent border-0 outline-none" />
        <input defaultValue={item.url || ''}
               onBlur={(e) => e.target.value !== item.url && onUpdate(item, { url: e.target.value })}
               placeholder="https://…"
               className="w-full text-[11px] text-text3 bg-transparent border-0 outline-none mt-0.5 truncate" />
      </div>
      {item.url && (
        <a href={item.url} target="_blank" rel="noreferrer" title="Abrir"
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
