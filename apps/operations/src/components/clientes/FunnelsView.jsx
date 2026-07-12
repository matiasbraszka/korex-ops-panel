// Pestaña "Funnels": el workspace del cliente. Envuelve TODO en la estrategia:
// contexto del cliente (onboarding), y por estrategia sus documentos (DEL, etc.) +
// sus funnels (con avatares, tracking, material y la spec de cada avatar).
// Rediseño visual 2026-07 (Claude Design): gradientes, tarjetas con header, chips.
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import {
  Plus, X, ExternalLink, Copy, ChevronDown, ChevronRight, Users, Megaphone,
  Check, Trash2, Activity, Zap, Globe, Rocket, Clapperboard,
  Brain, Sparkles, FileText, RefreshCw, Target, Search as SearchIcon, Layers, Maximize2, Lock,
  FolderOpen, Film, FolderPlus, Link2,
} from 'lucide-react';
import Modal from '../Modal';
import { openUrl, copyText } from './recursosShared';
import { fmtDateTime } from '../../utils/helpers';

// Metadatos por tipo de documento de contexto.
const DOC_META = {
  del:           { label: 'DEL', Icon: Sparkles, color: '#15803D', bg: '#DCFCE7' },
  onboarding:    { label: 'Onboarding', Icon: FileText, color: '#2E69E0', bg: '#E9F1FF' },
  investigacion: { label: 'Investigación', Icon: SearchIcon, color: '#7C3AED', bg: '#F4F1FE' },
  briefing:      { label: 'Briefing', Icon: Brain, color: '#EC4899', bg: '#FDF2F8' },
  extra:         { label: 'Contexto', Icon: Brain, color: '#EC4899', bg: '#FDF2F8' },
};

// Casilleros de contexto de CLIENTE (nivel: todas las estrategias). Reemplazan el
// "adivino por nombre": el equipo asigna cada documento a su casillero (removible).
const CLIENT_SLOTS = [
  { key: 'investigacion', label: 'Investigaciones', desc: 'Del cliente y/o de la empresa (MLM). Podés asignar varias.', match: /investigaci|empresa|mlm|multinivel/i },
  { key: 'onboarding', label: 'Onboarding', desc: 'Viejo o nuevo (podés quitarlo).', match: /onboarding/i },
  { key: 'briefing', label: 'Briefing · Personalidad · Tono', desc: 'Brief, tono y contexto actual.', match: /brief|personalidad|tono|contexto/i },
];

function SlotCard({ slot, assigned, driveDocs, docsByNode, onAssign, onRemove }) {
  const assignedIds = new Set(assigned.map(a => a.node_id));
  const options = driveDocs.filter(d => !assignedIds.has(d.id));
  const suggested = options.filter(d => slot.match.test(d.name || ''));
  const rest = options.filter(d => !slot.match.test(d.name || ''));
  const complete = assigned.length > 0;
  return (
    <div className="rounded-xl p-3.5 bg-white border border-[#EDF0F5] flex flex-col">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <span className="text-[13px] font-semibold text-[#1A1D26] min-w-0">{slot.label}</span>
        {complete
          ? <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[10px] font-bold shrink-0" style={{ background: '#ECFDF3', color: '#15803D', border: '1px solid #C9F0D8' }}><Check size={10} strokeWidth={3.5} />Listo</span>
          : <span className="inline-flex items-center py-0.5 px-2 rounded-full text-[10px] font-bold shrink-0" style={{ background: '#FEF3C7', color: '#B45309', border: '1px solid #FBE6BE' }}>Falta</span>}
      </div>
      <div className="text-[11px] text-[#9098A4] mb-3">{slot.desc}</div>
      {assigned.length === 0
        ? <div className="border-[1.5px] border-dashed border-[#D8DDE6] rounded-[9px] p-4 text-center text-[#AEB4BF] text-[12px] mb-2.5 flex-1 flex flex-col items-center justify-center gap-1">
            <FileText size={18} />Sin documentos asignados
          </div>
        : <div className="flex flex-col gap-2 mb-2.5">
            {assigned.map(a => {
              const doc = docsByNode[a.node_id];
              return (
                <div key={a.node_id} className="flex items-center gap-2.5 border border-[#EDF0F5] rounded-[9px] py-2 px-2.5 bg-[#FBFCFE]">
                  <FileText size={15} className="text-[#6B7280] shrink-0" />
                  <span className="flex-1 min-w-0 text-[12px] font-medium text-[#1A1D26] truncate" title={a.label || doc?.title}>{a.label || doc?.title || 'Documento'}</span>
                  {doc ? <span className="text-[10.5px] text-[#16A34A] font-semibold shrink-0 whitespace-nowrap">{(doc.char_count || 0).toLocaleString()} car.</span> : <span className="text-[10.5px] text-[#B45309] font-semibold shrink-0">sincronizá</span>}
                  {doc?.web_url && <button onClick={() => openUrl(doc.web_url)} title="Abrir en Drive" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-[#9098A4] hover:text-[#2E69E0] shrink-0"><ExternalLink size={13} /></button>}
                  <button onClick={() => onRemove(slot.key, a.node_id)} title="Quitar" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-[#C3C9D4] hover:text-[#DC2626] shrink-0"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>}
      <div className="relative mt-auto">
        <select value="" onChange={e => { if (e.target.value) { const nd = driveDocs.find(d => d.id === e.target.value); onAssign(slot.key, nd); } }}
          className="w-full appearance-none border border-[#DBE6FF] rounded-[9px] py-[9px] pl-9 pr-8 bg-[#F7FAFF] text-[#2E69E0] font-semibold text-[12px] outline-none cursor-pointer hover:bg-[#EFF5FF]">
          <option value="">Asignar documento…</option>
          {suggested.length > 0 && <optgroup label="Sugeridos">{suggested.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
          {rest.length > 0 && <optgroup label="Todos los documentos">{rest.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</optgroup>}
        </select>
        <Plus size={14} strokeWidth={2.4} className="text-[#2E69E0] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <ChevronDown size={14} className="text-[#2E69E0] absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    </div>
  );
}

function ClientContextSlots({ clientId, driveDocs, docsByNode, slotPins, onChanged }) {
  const bySlot = (key) => slotPins.filter(p => p.slot === key);
  const assign = async (slotKey, nd) => {
    if (!nd) return;
    await supabase.from('client_brain_pins').upsert({ client_id: clientId, node_id: nd.id, slot: slotKey, label: nd.name || null }, { onConflict: 'client_id,node_id' });
    onChanged();
  };
  const remove = async (slotKey, nodeId) => {
    await supabase.from('client_brain_pins').delete().eq('client_id', clientId).eq('node_id', nodeId);
    onChanged();
  };
  return (
    <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
      {CLIENT_SLOTS.map(slot => (
        <SlotCard key={slot.key} slot={slot} assigned={bySlot(slot.key)} driveDocs={driveDocs} docsByNode={docsByNode} onAssign={assign} onRemove={remove} />
      ))}
    </div>
  );
}

// Links de webs de contexto (sitio del cliente, web de la empresa MLM, etc.).
function WebLinks({ clientId, webs, onChanged }) {
  const [url, setUrl] = useState('');
  const [label, setLabel] = useState('');
  const add = async () => {
    const u = url.trim(); if (!u) return;
    await supabase.from('client_brain_webs').insert({ id: rid('web'), client_id: clientId, url: /^https?:\/\//i.test(u) ? u : 'https://' + u, label: label.trim() || null });
    setUrl(''); setLabel(''); onChanged();
  };
  const remove = async (id) => { await supabase.from('client_brain_webs').delete().eq('id', id); onChanged(); };
  return (
    <div>
      {webs.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2.5">
          {webs.map(w => (
            <span key={w.id} className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg bg-[#F0F7FF] border border-[#DCE7FB] text-[11.5px]">
              <Globe size={11} className="text-[#2E69E0]" />
              <button onClick={() => openUrl(w.url)} className="bg-transparent border-none p-0 cursor-pointer text-[#2E69E0] font-semibold hover:underline max-w-[220px] truncate" title={w.url}>{w.label || w.url}</button>
              <button onClick={() => remove(w.id)} title="Quitar" className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-transparent border-none cursor-pointer text-[#9098A4] hover:text-[#DC2626]"><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2.5 flex-wrap">
        <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Nombre (opcional)" className="w-[180px] py-[9px] px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
        <input value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); }} placeholder="https://sitio.com" className="flex-1 min-w-[200px] py-[9px] px-3 border border-[#E2E5EB] rounded-[9px] text-[12.5px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
        <button onClick={add} disabled={!url.trim()} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border-none rounded-[9px] bg-[#2E69E0] text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 hover:bg-[#1D4FD8]"><Plus size={14} strokeWidth={2.4} />Agregar web</button>
      </div>
    </div>
  );
}

const FUNNEL_STATUS = {
  activa:   { label: 'Activo', bg: '#ECFDF3', color: '#15803D', dot: '#22C55E', border: '#C9F0D8', side: '#22C55E' },
  borrador: { label: 'Borrador', bg: '#FEF3C7', color: '#B45309', dot: '#EAB308', border: '#FBE6BE', side: '#EAB308' },
  pausada:  { label: 'Pausado', bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444', border: '#F5C2C2', side: '#EF4444' },
  antiguo:  { label: 'Antiguo', bg: '#F1F3F7', color: '#6B7280', dot: '#94A3B8', border: '#E2E5EB', side: '#C3C9D4' },
};
const STATUS_ORDER = ['activa', 'borrador', 'pausada', 'antiguo'];
const AVATAR_STATUS = {
  'En grabación': { short: 'Grabación', bg: '#FFF1E7', color: '#C2410C', dot: '#F97316' },
  'En edición':   { short: 'Edición',   bg: '#EEF3FF', color: '#2E69E0', dot: '#2E69E0' },
  'Editados':     { short: 'Editados',  bg: '#ECFDF3', color: '#15803D', dot: '#22C55E' },
};
const AVATAR_OPTS = ['En grabación', 'En edición', 'Editados'];
// Eventos de conversión estándar: se pre-cargan en cada funnel nuevo; los demás son personalizados.
const STD_EVENTS = ['Visitas', 'Registro lead', 'Thank you page'];
const stdEvents = () => STD_EVENTS.map(n => ({ id: rid('ev'), name: n, purpose: '', code: '' }));
const inputCls = 'w-full py-2.5 px-3 border border-[#E2E5EB] rounded-[9px] font-sans text-[13px] text-[#1A1D26] bg-white outline-none focus:border-blue';
const rid = (p) => p + Math.random().toString(36).slice(2, 8);

// Normaliza eventos viejos {label,meta_name} -> {name,purpose,code}.
function normEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map((e, i) => ({
    id: e.id || 'ev' + i,
    name: e.name || '', purpose: e.purpose || e.label || '', code: e.code || e.meta_name || '',
  }));
}

// ── Editor de tracking (reusado en modal nuevo funnel y modal tracking) ──────────
function TrackingEditor({ value, onChange }) {
  const pOk = !!(value.pixel_code && value.pixel_code.trim());
  const cOk = !!(value.clarity_id && value.clarity_id.trim());
  const events = value.events || [];
  const setEvent = (id, patch) => onChange({ ...value, events: events.map(e => e.id === id ? { ...e, ...patch } : e) });
  return (
    <div className="flex flex-col gap-[18px]">
      <div>
        <div className="flex items-center gap-2 mb-1.5"><span className="text-[12px] font-bold text-[#1A1D26]">Pixel de Meta</span>
          <span className="inline-flex items-center py-0.5 px-2 rounded-full text-[10px] font-bold" style={pOk ? { background: '#ECFDF5', color: '#16A34A' } : { background: '#F0F2F5', color: '#9CA3AF' }}>{pOk ? 'Configurado' : 'Sin configurar'}</span>
        </div>
        <textarea value={value.pixel_code || ''} onChange={e => onChange({ ...value, pixel_code: e.target.value })} rows={3} placeholder="Pegá el código del pixel o solo el ID…" className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-[9px] text-[12px] leading-[1.55] text-[#1A1D26] bg-[#FBFCFE] resize-y outline-none focus:border-blue" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} />
      </div>
      <div>
        <div className="flex items-center gap-2 mb-1.5"><span className="text-[12px] font-bold text-[#1A1D26]">Microsoft Clarity</span>
          <span className="inline-flex items-center py-0.5 px-2 rounded-full text-[10px] font-bold" style={cOk ? { background: '#E0F2FE', color: '#0B6FA8' } : { background: '#F0F2F5', color: '#9CA3AF' }}>{cOk ? 'Conectado' : 'Sin conectar'}</span>
        </div>
        <input type="text" value={value.clarity_id || ''} onChange={e => onChange({ ...value, clarity_id: e.target.value })} placeholder="ID o código de Clarity (ej. abc123def)" className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-[9px] text-[12px] text-[#1A1D26] bg-[#FBFCFE] outline-none focus:border-blue" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} />
      </div>
      <div>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[12px] font-bold text-[#1A1D26]">Eventos de conversión <span className="text-[11.5px] text-[#9CA3AF] font-normal">· {events.length}</span></span>
          <button onClick={() => onChange({ ...value, events: [...events, { id: rid('ev'), name: '', purpose: '', code: '' }] })} className="inline-flex items-center gap-1.5 py-1.5 px-2.5 border border-[#DCE3FF] rounded-lg bg-[#F5F7FF] text-[#2E69E0] text-[11.5px] font-semibold font-sans cursor-pointer hover:bg-[#EEF2FF]"><Plus size={12} />Agregar evento</button>
        </div>
        {STD_EVENTS.some(n => !events.some(e => (e.name || '').trim().toLowerCase() === n.toLowerCase())) && (
          <div className="flex items-center gap-1.5 flex-wrap mb-2.5">
            <span className="text-[10.5px] font-semibold text-[#9CA3AF]">Estándar:</span>
            {STD_EVENTS.filter(n => !events.some(e => (e.name || '').trim().toLowerCase() === n.toLowerCase())).map(n => (
              <button key={n} onClick={() => onChange({ ...value, events: [...events, { id: rid('ev'), name: n, purpose: '', code: '' }] })} className="inline-flex items-center gap-1 py-1 px-2 border border-dashed border-[#C9D6FF] rounded-full bg-white text-[#2E69E0] text-[11px] font-semibold font-sans cursor-pointer hover:bg-[#F5F7FF]"><Plus size={10} />{n}</button>
            ))}
          </div>
        )}
        {events.length === 0
          ? <div className="py-3.5 px-4 text-center text-[12.5px] text-[#6B7280] border border-dashed border-[#E2E5EB] rounded-[11px] bg-[#FBFCFE]">Aún no hay eventos. Definí cada conversión con su nombre, para qué es y su código.</div>
          : <div className="flex flex-col gap-2.5">
              {events.map(ev => (
                <div key={ev.id} className="border border-[#E8EBF0] rounded-[11px] bg-[#FBFCFE] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <input type="text" value={ev.name} onChange={e => setEvent(ev.id, { name: e.target.value })} placeholder="¿Qué trackea? (ej. Visita a la página)" className="flex-1 min-w-0 py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[13px] font-semibold text-[#1A1D26] bg-white outline-none focus:border-blue" />
                    <button onClick={() => onChange({ ...value, events: events.filter(e => e.id !== ev.id) })} title="Eliminar" className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#B0B6C0] cursor-pointer shrink-0 hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={14} /></button>
                  </div>
                  <input type="text" value={ev.purpose} onChange={e => setEvent(ev.id, { purpose: e.target.value })} placeholder="Nombre del evento (ej. Registro lead)" className="w-full mb-2 py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12px] text-[#4B5563] bg-white outline-none focus:border-blue" />
                  <textarea value={ev.code} onChange={e => setEvent(ev.id, { code: e.target.value })} rows={2} placeholder="fbq('track','Lead')" className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[11.5px] text-[#1A1D26] bg-white resize-y leading-[1.5] outline-none focus:border-blue" style={{ fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} />
                </div>
              ))}
            </div>}
      </div>
    </div>
  );
}

function StatusPill({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const cfg = FUNNEL_STATUS[status] || FUNNEL_STATUS.activa;
  const toggle = () => {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ left: r.left, top: r.bottom + 4 });
    }
    setOpen(o => !o);
  };
  return (
    <span className="inline-block" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={toggle} className="inline-flex items-center gap-1.5 py-[5px] px-2.5 rounded-full text-[11.5px] font-semibold border cursor-pointer" style={{ background: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.dot }} />{cfg.label}<ChevronDown size={11} />
      </button>
      {open && pos && (<>
        {/* menú con position:fixed para que no lo corte el borde de la tabla */}
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div className="fixed bg-white border border-[#E2E5EB] rounded-lg shadow-lg z-[61] min-w-[130px] overflow-hidden py-0.5" style={{ left: pos.left, top: pos.top }}>
          {STATUS_ORDER.map(k => { const v = FUNNEL_STATUS[k]; return (
            <button key={k} onClick={() => { onChange(k); setOpen(false); }} className="flex items-center gap-2 w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-blue-bg2 bg-transparent border-none cursor-pointer font-medium" style={{ color: v.color }}><span className="w-2 h-2 rounded-full" style={{ background: v.dot }} />{v.label}</button>
          ); })}
        </div>
      </>)}
    </span>
  );
}

// Chip de enlace: al clickear COPIA la URL (no abre la página).
function CopyLinkChip({ short, url, bg, color, border }) {
  const [done, setDone] = useState(false);
  return (
    <span onClick={(e) => { e.stopPropagation(); copyText(url); setDone(true); setTimeout(() => setDone(false), 1200); }}
      title={`Copiar ${short}: ${url}`}
      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-[7px] text-[10.5px] font-semibold cursor-pointer"
      style={{ background: bg, color, border: `1px solid ${border}` }}>
      {short}{done ? <Check size={10} strokeWidth={3} /> : <Copy size={10} />}
    </span>
  );
}

// Estado del avatar: pill compacto con menú (position:fixed para no cortarse).
function AvatarStatusPill({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const cfg = AVATAR_STATUS[status] || AVATAR_STATUS['En grabación'];
  const toggle = () => {
    if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setPos({ left: r.left, top: r.bottom + 4 }); }
    setOpen(o => !o);
  };
  return (
    <span className="inline-block shrink-0" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={toggle} className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10.5px] font-bold border-none cursor-pointer whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color }}>
        <span className="w-[6px] h-[6px] rounded-full" style={{ background: cfg.dot }} />{cfg.short}<ChevronDown size={9} />
      </button>
      {open && pos && (<>
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div className="fixed bg-white border border-[#E2E5EB] rounded-lg shadow-lg z-[61] min-w-[120px] overflow-hidden py-0.5" style={{ left: pos.left, top: pos.top }}>
          {AVATAR_OPTS.map(o => { const c = AVATAR_STATUS[o]; return (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }} className="flex items-center gap-2 w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-[#F5F7FF] bg-transparent border-none cursor-pointer font-medium" style={{ color: c.color }}><span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />{c.short}</button>
          ); })}
        </div>
      </>)}
    </span>
  );
}

// Grid de la tabla de funnels (mismo layout que el mockup; scroll horizontal si no entra).
const GRID = 'minmax(230px,1.6fr) 120px 150px 210px 100px 34px';

// Nota: la extracción del DEL (descripción, copys y guión de VSL por avatar/funnel) la hace
// ahora la edge function `cerebro-generate-avatars` (IA + corte verbatim). El panel solo MUESTRA
// esos campos en modo lectura; para actualizarlos se aprieta "Generar avatares del DEL".

// Modal grande tipo nota, reutilizable: descripción del avatar, guión del anuncio, guión del VSL.
// Si recibe `onSave`, es editable (título/segmentación). Si `readOnly`, es un visor: el texto
// sale del DEL y solo se actualiza apretando "Generar avatares del DEL" (fuente de verdad = documento).
function NoteModal({ title, initial, placeholder, readOnly, onClose, onSave }) {
  const [text, setText] = useState(initial || '');
  if (readOnly) {
    const empty = !((initial || '').trim());
    return (
      <Modal open onClose={onClose} title={title} maxWidth={820}
        footer={<div className="flex justify-between items-center gap-2 w-full">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#9098A4] font-medium"><Lock size={12} />Sale del DEL · se actualiza con “Generar avatares del DEL”</span>
          <div className="flex gap-2">
            {(initial || '').trim() && <button onClick={() => copyText(initial)} className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2 inline-flex items-center gap-1.5"><Copy size={13} />Copiar</button>}
            <button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={onClose}>Cerrar</button>
          </div>
        </div>}>
        {empty
          ? <div className="flex flex-col items-center justify-center gap-2 text-center text-[#9098A4]" style={{ minHeight: '40vh' }}><FileText size={26} className="text-[#C3C9D4]" /><div className="text-[13px] font-semibold text-[#6B7280]">Todavía no hay este contenido</div><div className="text-[12px] max-w-[420px]">Se completa desde el DEL. Tocá <b>“Generar avatares del DEL”</b> para traerlo (o revisá que el documento tenga esa sección).</div></div>
          : <div className="w-full py-3.5 px-4 border border-[#EDF0F5] rounded-xl text-[13px] text-[#1A1D26] bg-[#FBFCFE] leading-relaxed overflow-auto" style={{ minHeight: '40vh', maxHeight: '62vh', whiteSpace: 'pre-wrap' }}>{initial}</div>}
      </Modal>
    );
  }
  return (
    <Modal open onClose={onClose} title={title} maxWidth={820}
      footer={<div className="flex justify-end items-center gap-2 w-full">
        <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
        <button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark inline-flex items-center gap-1.5" onClick={() => onSave(text)}><Check size={14} />Guardar</button>
      </div>}>
      <textarea value={text} onChange={e => setText(e.target.value)} autoFocus placeholder={placeholder} className="w-full py-3.5 px-4 border border-[#E2E5EB] rounded-xl text-[13px] text-[#1A1D26] bg-white resize-y outline-none focus:border-blue leading-relaxed" style={{ minHeight: '58vh', whiteSpace: 'pre-wrap' }} />
    </Modal>
  );
}

// Semáforo del pipeline Korex por funnel (gates duros: cerebro_pipeline_status).
// Etapas base (estrategia/DEL/avatares): color por estado. Piezas de producción (VSL/Anuncios/
// Landing): color por SUB-ESTADO real → 0 (sin empezar) · guión/copy · grabado · editado/diseñado.
const STAGE_SHORT = { estrategia: 'Estrategia', del: 'DEL', avatares: 'Avatares', vsl: 'VSL', anuncios: 'Anuncios', landing: 'Landing' };
const GATE_STYLE = {
  listo: { dot: '#16A34A', bg: '#ECFDF5', color: '#15803D', border: '#C7EBD4' },
  pendiente: { dot: '#CA8A04', bg: '#FEF9E7', color: '#A16207', border: '#F1E3B0' },
  bloqueado: { dot: '#B0B6C0', bg: '#F4F5F7', color: '#9CA3AF', border: '#E7E9ED' },
};
// Sub-estado de cada pieza de producción: define color + etiqueta corta.
const SUBSTATE = {
  nada:     { label: '0',        dot: '#C4C9D2', bg: '#F4F5F7', color: '#9CA3AF', border: '#E7E9ED' },
  guion:    { label: 'guión',    dot: '#2563EB', bg: '#EEF3FF', color: '#1D4FD8', border: '#D5E1FF' },
  copy:     { label: 'copy',     dot: '#2563EB', bg: '#EEF3FF', color: '#1D4FD8', border: '#D5E1FF' },
  grabado:  { label: 'grabado',  dot: '#D97706', bg: '#FEF3E2', color: '#B45309', border: '#F6E0B8' },
  editado:  { label: 'editado',  dot: '#16A34A', bg: '#ECFDF5', color: '#15803D', border: '#C7EBD4' },
  disenado: { label: 'diseñado', dot: '#16A34A', bg: '#ECFDF5', color: '#15803D', border: '#C7EBD4' },
};
function PipelineSemaforo({ stages }) {
  if (!stages || !stages.length) return null;
  const firstPend = stages.find(s => s.status === 'pendiente');
  return (
    <div className="flex items-center gap-3 flex-wrap py-[11px] px-4" style={{ borderTop: '1px dashed #EDF0F5' }}>
      <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-[#C3C9D4] shrink-0">Pipeline</span>
      <div className="flex items-center gap-1.5 flex-wrap flex-1 min-w-0">
        {stages.map((s, i) => {
          const blocked = s.status === 'bloqueado';
          // Color: bloqueado = gris+candado; piezas de producción = por sub-estado; resto = por estado.
          const g = blocked ? GATE_STYLE.bloqueado : (s.substate ? SUBSTATE[s.substate] : GATE_STYLE[s.status]) || GATE_STYLE.bloqueado;
          const subLabel = s.substate ? SUBSTATE[s.substate]?.label : null;
          const isNext = firstPend && s.stage === firstPend.stage;
          return (
            <span key={s.stage} className="inline-flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={11} className="text-[#DCE0E7] shrink-0" strokeWidth={2.4} />}
              <span title={`${s.stage_label} — ${s.detail}`} className="inline-flex items-center gap-1.5 py-[3px] px-2 rounded-md text-[11px] font-semibold cursor-default whitespace-nowrap" style={{ background: g.bg, color: g.color, border: `1px solid ${isNext ? '#E8B93E' : g.border}`, boxShadow: isNext ? '0 0 0 2px rgba(234,179,8,.18)' : 'none' }}>
                {blocked ? <Lock size={10} strokeWidth={2.2} /> : <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: g.dot, animation: isNext ? 'mkPulse 1.8s ease-in-out infinite' : 'none' }} />}
                {STAGE_SHORT[s.stage] || s.stage_label}
                {!blocked && subLabel && <span className="opacity-70">· {subLabel}</span>}
                {isNext && <span className="text-[8.5px] font-bold uppercase tracking-[0.04em]" style={{ color: '#B8860B' }}>· próximo</span>}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Encabezado de tarjeta interna (icono en chip de color + título + subtítulo).
function CardHead({ Icon, iconBg, iconColor, title, subtitle, children }) {
  return (
    <div className="flex items-center justify-between gap-3 flex-wrap py-3 px-[15px] border-b border-[#EDF0F5]" style={{ background: '#FBFCFE' }}>
      <div className="flex items-center gap-2.5 min-w-0">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: iconBg, color: iconColor }}><Icon size={15} /></span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-bold text-[#1A1D26] truncate">{title}</div>
          {subtitle && <div className="text-[10.5px] text-[#9098A4]">{subtitle}</div>}
        </div>
      </div>
      {children && <div className="flex items-center gap-2 flex-wrap">{children}</div>}
    </div>
  );
}

// Preview de guión/descripción con botón "Ampliar". Si `locked`, es solo-lectura (sale del DEL):
// muestra un candadito y abre un visor, no un editor.
function ScriptPreview({ Icon, color, label, text, onOpen, emptyHint, locked }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>
          <Icon size={12} />{label}
          {locked && <span className="inline-flex items-center gap-1 py-0.5 px-1.5 rounded-full text-[9px] font-bold normal-case tracking-normal" style={{ background: '#F1F3F7', color: '#9098A4', border: '1px solid #E7EAF0' }} title="Sale del DEL. Se actualiza con “Generar avatares del DEL”."><Lock size={9} strokeWidth={2.6} />del DEL</span>}
        </span>
        <button onClick={onOpen} className="inline-flex items-center gap-1.5 text-[11px] font-semibold bg-transparent border-none cursor-pointer p-0 hover:underline" style={{ color }}><Maximize2 size={12} />{locked ? 'Ampliar / ver' : 'Ampliar / editar'}</button>
      </div>
      <button onClick={onOpen} className="w-full text-left border border-[#EDF0F5] rounded-lg py-[11px] px-[13px] bg-[#FBFCFE] cursor-pointer transition-colors" style={{ borderColor: '#EDF0F5' }} onMouseEnter={e => e.currentTarget.style.borderColor = color} onMouseLeave={e => e.currentTarget.style.borderColor = '#EDF0F5'}>
        <div className="text-[12px] text-[#3F4653] leading-relaxed whitespace-pre-wrap" style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {text ? text.slice(0, 320) + (text.length > 320 ? '…' : '') : <span className="text-[#AEB4BF]">{emptyHint}</span>}
        </div>
      </button>
    </div>
  );
}

// Normaliza un nombre de video/cliente para matchear (sin extensión, sin "vsl", sin acentos).
function normVoomly(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.(mp4|mov|webm|m4v)$/i, '').replace(/\bvsl\b/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
}
const voomlyUrl = (r) => (r?.embed_id ? `https://embed.voomly.com/b/${r.embed_id}` : '');

// Selector de VSL de Voomly: cruza la tabla vsl_voomly (que no tiene client_id) por NOMBRE
// contra el cliente + el funnel, sugiere los más parecidos y deja buscar. Al elegir, arma el
// link embed.voomly.com/b/<embed_id>. No inventa: el equipo confirma cuál es.
function VoomlyPicker({ clientName, funnelName, current, onPick, onClose }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from('vsl_voomly')
          .select('voomly_id,name,kind,embed_id,total_plays,play_rate,uploaded_at')
          .order('uploaded_at', { ascending: false, nullsFirst: false });
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, []);
  const cTokens = useMemo(() => new Set(normVoomly(`${clientName || ''} ${funnelName || ''}`).split(' ').filter(t => t.length > 2)), [clientName, funnelName]);
  const scored = useMemo(() => {
    const list = (rows || []).map(r => {
      const n = normVoomly(r.name);
      const toks = new Set(n.split(' ').filter(Boolean));
      let score = 0;
      for (const t of cTokens) { if (toks.has(t)) score += 2; else if (n.includes(t)) score += 1; }
      if ((r.kind || '') === 'VSL') score += 0.5;
      return { r, n, score };
    });
    const ql = normVoomly(q);
    const filtered = ql ? list.filter(x => x.n.includes(ql)) : list;
    return filtered.sort((a, b) => b.score - a.score || (b.r.total_plays || 0) - (a.r.total_plays || 0));
  }, [rows, cTokens, q]);
  const curUrl = current || '';
  return (
    <Modal open onClose={onClose} title="Traer link del VSL desde Voomly" maxWidth={640}
      footer={<div className="flex justify-between items-center gap-2 w-full">
        <span className="text-[11px] text-[#9098A4]">Cruce por nombre con «{clientName || 'cliente'}». Confirmá cuál es el VSL de este funnel.</span>
        <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
      </div>}>
      <div className="p-1">
        <div className="relative mb-3">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9098A4] pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar por nombre del video…" className="w-full py-2.5 pl-9 pr-3 border border-[#E2E5EB] rounded-[9px] text-[13px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
        </div>
        {rows === null
          ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">Cargando videos de Voomly…</div>
          : scored.length === 0
            ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">No encontré videos{q ? ' para esa búsqueda' : ''}.</div>
            : <div className="flex flex-col gap-2 max-h-[52vh] overflow-auto pr-1">
                {scored.slice(0, 40).map(({ r, score }) => {
                  const url = voomlyUrl(r);
                  const isCur = url && url === curUrl;
                  const suggested = score >= 2;
                  return (
                    <div key={r.voomly_id} className="flex items-center gap-2.5 border rounded-[10px] py-2.5 px-3" style={{ borderColor: isCur ? '#C9F0D8' : suggested ? '#FBCFE8' : '#EDF0F5', background: isCur ? '#F4FDF7' : suggested ? '#FDF2F8' : '#fff' }}>
                      <Clapperboard size={15} className="shrink-0" style={{ color: (r.kind === 'VSL') ? '#16A34A' : '#9098A4' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-[#1A1D26] truncate" title={r.name}>{r.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full" style={(r.kind === 'VSL') ? { background: '#DCFCE7', color: '#15803D' } : { background: '#F1F3F7', color: '#9098A4' }}>{r.kind || 'Otro'}</span>
                          <span className="text-[10.5px] text-[#9098A4]">{(r.total_plays || 0).toLocaleString()} plays · {r.play_rate || 0}% play rate</span>
                          {suggested && !isCur && <span className="text-[10px] font-bold text-[#DB2777]">sugerido</span>}
                        </div>
                      </div>
                      {isCur
                        ? <span className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[11px] font-bold shrink-0" style={{ background: '#ECFDF3', color: '#15803D' }}><Check size={12} strokeWidth={3} />Actual</span>
                        : <button onClick={() => { onPick(url); onClose(); }} disabled={!url} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11.5px] font-semibold cursor-pointer shrink-0 disabled:opacity-40" style={{ background: '#DB2777', color: '#fff', border: 'none' }}>Usar este</button>}
                    </div>
                  );
                })}
              </div>}
      </div>
    </Modal>
  );
}

// Selector MANUAL de carpeta del Drive (fallback cuando "Traer carpeta" no la encuentra sola):
// lista las carpetas ya sincronizadas del cliente, prioriza las de "ediciones/editado" que matcheen
// el avatar, deja buscar, y muestra la ruta (carpeta padre / carpeta) para no confundirse. Evita ir al Drive.
function FolderPicker({ clientId, avatarName, current, onPick, onClose }) {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&node_type=eq.folder&select=id,name,web_url,parent_id&order=name`);
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, [clientId]);
  const parentName = useMemo(() => { const m = {}; for (const r of (rows || [])) m[r.id] = r.name; return m; }, [rows]);
  const aTokens = useMemo(() => new Set(normVoomly(avatarName || '').split(' ').filter(t => t.length > 2)), [avatarName]);
  const scored = useMemo(() => {
    const list = (rows || []).map(r => {
      const n = normVoomly(r.name);
      let score = 0;
      if (/edici|editad|termina|final|listo/.test(n)) score += 3;
      for (const t of aTokens) if (n.includes(t)) score += 2;
      if (/anuncio|ads/.test(n)) score += 0.5;
      return { r, n, score };
    });
    const ql = normVoomly(q);
    const filtered = ql ? list.filter(x => x.n.includes(ql) || normVoomly(parentName[x.r.parent_id] || '').includes(ql)) : list;
    return filtered.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
  }, [rows, aTokens, q, parentName]);
  return (
    <Modal open onClose={onClose} title={`Elegir la carpeta de ediciones · ${avatarName || 'avatar'}`} maxWidth={640}
      footer={<div className="flex justify-between items-center gap-2 w-full">
        <span className="text-[11px] text-[#9098A4]">Elegí la carpeta donde están los anuncios editados de este avatar.</span>
        <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
      </div>}>
      <div className="p-1">
        <div className="relative mb-3">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9098A4] pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar carpeta por nombre…" className="w-full py-2.5 pl-9 pr-3 border border-[#E2E5EB] rounded-[9px] text-[13px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
        </div>
        {rows === null
          ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">Cargando carpetas del Drive…</div>
          : scored.length === 0
            ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">No hay carpetas{q ? ' para esa búsqueda' : ''}. Sincronizá la pestaña Carpetas.</div>
            : <div className="flex flex-col gap-2 max-h-[52vh] overflow-auto pr-1">
                {scored.slice(0, 60).map(({ r, score }) => {
                  const isCur = r.web_url && r.web_url === current;
                  const suggested = score >= 3;
                  const parent = parentName[r.parent_id];
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 border rounded-[10px] py-2.5 px-3" style={{ borderColor: isCur ? '#C9F0D8' : suggested ? '#E4DBFF' : '#EDF0F5', background: isCur ? '#F4FDF7' : suggested ? '#F7F3FF' : '#fff' }}>
                      <FolderOpen size={15} className="shrink-0" style={{ color: suggested ? '#7C3AED' : '#9098A4' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-[#1A1D26] truncate" title={r.name}>{r.name}</div>
                        {parent && <div className="text-[10.5px] text-[#9098A4] truncate">en: {parent}</div>}
                      </div>
                      {suggested && !isCur && <span className="text-[10px] font-bold text-[#7C3AED] shrink-0">sugerida</span>}
                      {isCur
                        ? <span className="inline-flex items-center gap-1 py-1.5 px-3 rounded-lg text-[11px] font-bold shrink-0" style={{ background: '#ECFDF3', color: '#15803D' }}><Check size={12} strokeWidth={3} />Actual</span>
                        : <button onClick={() => { onPick(r.web_url); onClose(); }} disabled={!r.web_url} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[11.5px] font-semibold cursor-pointer shrink-0 disabled:opacity-40" style={{ background: '#7C3AED', color: '#fff', border: 'none' }}>Usar esta</button>}
                    </div>
                  );
                })}
              </div>}
      </div>
    </Modal>
  );
}

function FunnelRow({ f, stages, delText = '', clientId, clientName = '', onUpdate, onDelete, onTrack, onRefreshPage, last }) {
  const [note, setNote] = useState(null);
  const [open, setOpen] = useState(false);
  const [voomlyOpen, setVoomlyOpen] = useState(false);
  const [folderPick, setFolderPick] = useState(null); // avatar para el que se elige carpeta a mano
  const st = FUNNEL_STATUS[f.status] || FUNNEL_STATUS.activa;
  const avatars = Array.isArray(f.avatars) ? f.avatars : [];
  const events = normEvents(f.conversion_events);
  const pOk = !!(f.pixel_code && f.pixel_code.trim());
  const cOk = !!(f.clarity_id && f.clarity_id.trim());

  const links = [];
  if (f.prod_url) links.push({ short: 'Prod', bg: '#EEF3FF', color: '#2E69E0', border: '#DBE6FF', url: f.prod_url });
  if (f.testing_url) links.push({ short: 'Test', bg: '#F1F3F7', color: '#6B7280', border: '#E2E5EB', url: f.testing_url });
  if (f.ads_url) links.push({ short: 'Pub', bg: '#F5F3FF', color: '#7C3AED', border: '#E4DBFF', url: f.ads_url });
  const missingLinks = [];
  if (!f.prod_url) missingLinks.push('Prod'); if (!f.testing_url) missingLinks.push('Test');

  const setAvatar = (id, patch) => onUpdate(f.id, { avatars: avatars.map(a => a.id === id ? { ...a, ...patch } : a) });

  // Carpetas por avatar (Anuncios › Grabaciones|Ediciones › <avatar>). SON DOS COSAS DISTINTAS:
  //  · TRAER (mode 'read'): solo VINCULA las carpetas que ya existen en el Drive sincronizado y lee
  //    su estado (grabado/editado). No crea nada → cero riesgo.
  //  · CREAR (mode 'create'): arma la estructura que falte (vía Apps Script). Acción explícita, aparte.
  // En ambos casos mergeamos los links/conteos en cada avatar.
  const [folderBusy, setFolderBusy] = useState('idle'); // idle | read | create
  const runFolders = async (mode) => {
    const named = avatars.filter(a => (a.name || '').trim());
    if (!named.length) { window.alert('Poné el nombre de al menos un avatar primero.'); return; }
    setFolderBusy(mode);
    try {
      const { data, error } = await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode } });
      if (error || !data?.ok) { window.alert(data?.hint || `No se pudieron ${mode === 'read' ? 'traer' : 'crear'} las carpetas` + (data?.error ? ` (${data.error})` : '')); return; }
      if (mode === 'read' && data.found === false) { window.alert('No encontré las carpetas por avatar en el Drive. Sincronizá la pestaña Carpetas, o usá "Crear carpetas" para armarlas.'); return; }
      const merged = avatars.map(a => { const info = data.byName?.[(a.name || '').trim()]; return info ? { ...a, ...info } : a; });
      onUpdate(f.id, { avatars: merged });
    } catch { window.alert(`Error al ${mode === 'read' ? 'traer' : 'crear'} las carpetas.`); }
    finally { setFolderBusy('idle'); }
  };
  const fetchFolders = () => runFolders('read');
  const createFolders = () => runFolders('create');
  // Trae la carpeta de EDICIONES de UN avatar: intenta encontrarla sola (mode read); si no la
  // encuentra, abre el selector manual para que el equipo la elija sin ir al Drive.
  const bringEditFolder = async (av) => {
    const name = (av.name || '').trim();
    if (!name) { window.alert('Poné el nombre del avatar primero.'); return; }
    setFolderBusy('read');
    try {
      const { data, error } = await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode: 'read' } });
      if (!error && data?.ok) {
        const merged = avatars.map(a => { const info = data.byName?.[(a.name || '').trim()]; return info ? { ...a, ...info } : a; });
        onUpdate(f.id, { avatars: merged });
        if (data.byName?.[name]?.edit_folder_url) { setFolderBusy('idle'); return; } // la encontró sola ✓
      }
    } catch { /* cae al selector manual */ }
    setFolderBusy('idle');
    setFolderPick(av); // no la encontró → elegir a mano
  };
  const namedAvatars = avatars.filter(a => (a.name || '').trim());
  const foldersReady = namedAvatars.length > 0 && namedAvatars.every(a => a.rec_folder_url && a.edit_folder_url);

  // Visores tipo nota (modal grande, SOLO LECTURA). Descripción + copys de anuncios (por avatar)
  // + guión de VSL (funnel) salen del DEL: para cambiarlos se actualiza el documento y se aprieta
  // "Generar avatares del DEL". Editable a mano solo el título y la segmentación del avatar.
  const openDesc = (av) => setNote({
    title: `Descripción del avatar · ${av.name || 'Avatar'}`, initial: av.spec_text || '', readOnly: true,
  });
  const openAdScript = (av, idx) => setNote({
    title: `Copys de anuncios · ${av.name || 'Avatar ' + (idx + 1)}`, initial: av.ad_script || '', readOnly: true,
  });
  const openVslScript = () => setNote({
    title: `Guión del VSL · ${f.name || 'Funnel'}`, initial: f.vsl_script || '', readOnly: true,
  });

  const addAvatar = () => onUpdate(f.id, { avatars: [...avatars, { id: rid('av'), name: '', audience: '', status: 'En grabación', ad_url: '' }] });
  const removeAvatar = (id) => onUpdate(f.id, { avatars: avatars.filter(a => a.id !== id) });

  // ── Generador de avatares del DEL (API de Anthropic · a pedido, instantáneo) ──
  // Toca una edge function que lee el DEL, la IA identifica los avatares y señala
  // qué sección tiene la descripción/anuncios de cada uno; el TEXTO se copia tal
  // cual del DEL. Sincrónico: en unos segundos aparecen. Nada corre en segundo plano.
  const [gen, setGen] = useState({ status: 'idle' }); // idle | running | done | error
  const generateAvatars = async (mode = 'append') => {
    if (!delText) { window.alert('No hay DEL sincronizado para esta estrategia. Tocá “Sincronizar contexto” primero.'); return; }
    if (avatars.length && !window.confirm(mode === 'replace'
      ? 'La IA va a leer el DEL y REEMPLAZAR los avatares actuales. ¿Seguir?'
      : 'La IA va a leer el DEL y AGREGAR los avatares nuevos que encuentre (sin borrar los actuales). ¿Seguir?')) return;
    setGen({ status: 'running' });
    // Red de seguridad: guardamos el estado ACTUAL antes de que la IA lo pise, para poder deshacer.
    try { await onUpdate(f.id, { avatars_backup: avatars, vsl_script_backup: f.vsl_script || null, backup_at: new Date().toISOString() }); } catch { /* noop */ }
    try {
      const { data, error } = await supabase.functions.invoke('cerebro-generate-avatars', {
        body: { client_id: clientId, strategy_id: f.strategy_id, funnel_id: f.id, funnel_name: f.name || '', mode },
      });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { setGen({ status: 'error', msg: payload?.detail || error?.message || 'No pude generar los avatares.' }); return; }
      await onRefreshPage?.(f.id);
      setGen({ status: 'done', cost: payload.cost_usd, n: payload.detected });
      setTimeout(() => setGen({ status: 'idle' }), 7000);
    } catch (e) { setGen({ status: 'error', msg: String(e?.message || e) }); }
  };
  const genActive = gen.status === 'running';
  // Deshacer: restaura los avatares + VSL que había ANTES de la última generación (red de seguridad).
  const canUndo = Array.isArray(f.avatars_backup);
  const undoGenerate = () => {
    if (!canUndo) return;
    if (!window.confirm('¿Restaurar los avatares y la VSL que había ANTES de la última generación? Se pierde lo que generó la IA en esa corrida.')) return;
    onUpdate(f.id, { avatars: f.avatars_backup, vsl_script: (f.vsl_script_backup ?? f.vsl_script) || null });
  };

  const trk = [
    pOk ? { label: 'Pixel', bg: '#ECFDF3', color: '#15803D', border: '#C9F0D8', solid: true, ok: true }
        : { label: 'Pixel', bg: '#F5F6F9', color: '#AEB4BF', border: '#EDF0F5', solid: true, ok: false },
    cOk ? { label: 'Clarity', bg: '#ECFDF3', color: '#15803D', border: '#C9F0D8', solid: true, ok: true }
        : { label: 'Clarity', bg: '#F5F6F9', color: '#AEB4BF', border: '#EDF0F5', solid: true, ok: false },
    { label: events.length + ' eventos', bg: events.length ? '#F5F3FF' : '#F5F6F9', color: events.length ? '#7C3AED' : '#AEB4BF', border: events.length ? '#E4DBFF' : '#EDF0F5', solid: true, ok: false },
  ];

  return (
    <div style={{ borderLeft: `3px solid ${st.side}`, borderBottom: last ? 'none' : '1px solid #EDF0F5' }}>
      <div onClick={() => setOpen(o => !o)} className="grid items-center py-3 px-4 font-sans cursor-pointer text-left hover:bg-[#FCFCFD]" style={{ gridTemplateColumns: GRID, gap: 12, background: open ? '#FCFCFD' : '#fff' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[#94A3B8] shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg></span>
          <div className="min-w-0 flex-1">
            <input key={f.id + 'name'} defaultValue={f.name} onClick={e => e.stopPropagation()} onBlur={e => { const v = e.target.value.trim(); if (v && v !== (f.name || '')) onUpdate(f.id, { name: v }); else if (!v) e.target.value = f.name || ''; }} title="Editar nombre del funnel" className="w-full text-[15px] font-bold border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md px-1.5 py-0.5 -ml-1.5 bg-transparent focus:bg-white outline-none tracking-[-.01em]" style={{ color: '#1A1D26' }} />
            <div className="flex items-center gap-[7px] mt-0.5 flex-wrap">
              {f.official_domain && <><span onClick={(e) => { e.stopPropagation(); copyText(f.official_domain); }} title={`Copiar dominio: ${f.official_domain}`} className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#2E69E0] cursor-pointer hover:underline"><Globe size={11} />{f.official_domain}</span><span className="text-[#C3C9D4]">·</span></>}
              <span className="inline-flex items-center gap-1 text-[10.5px] text-[#9098A4]" onClick={e => e.stopPropagation()}>Creado
                <input type="date" value={f.created_date || ''} onChange={e => onUpdate(f.id, { created_date: e.target.value || null })} title="Fecha de creación (editable)" className="text-[10.5px] text-[#9098A4] border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded px-1 py-0.5 bg-transparent cursor-pointer outline-none" />
              </span>
            </div>
          </div>
        </div>
        <div><StatusPill status={f.status || 'activa'} onChange={(v) => onUpdate(f.id, { status: v })} /></div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {links.map((l, i) => <CopyLinkChip key={i} {...l} />)}
          {missingLinks.map((m, i) => <span key={'m' + i} className="inline-flex items-center py-1 px-2.5 rounded-[7px] bg-[#F5F6F9] border border-[#EDF0F5] text-[#AEB4BF] text-[10.5px] font-semibold">{m}</span>)}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {trk.map((t, i) => <span key={i} onClick={(e) => { e.stopPropagation(); onTrack(f); }} className="inline-flex items-center gap-1 py-[3px] px-2 rounded-md text-[10px] font-semibold cursor-pointer" style={{ background: t.bg, color: t.color, border: `1px solid ${t.border}` }}>{t.ok && <Check size={9} strokeWidth={3.5} />}{t.label}</span>)}
        </div>
        <div className="text-[11px] text-[#9098A4]">{f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-AR') : '—'}</div>
        <div className="flex justify-end"><ChevronDown size={16} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: open ? '#2E69E0' : '#C3C9D4' }} /></div>
      </div>

      <div style={{ background: open ? '#FCFCFD' : '#fff' }}><PipelineSemaforo stages={stages} /></div>

      {open && (
        <div className="pt-1 px-4 pb-[18px]" style={{ background: '#FCFCFD' }}>
          {/* Enlaces del funnel (editables) */}
          <div className="border border-[#E7EAF0] rounded-xl bg-white overflow-hidden mb-3.5">
            <CardHead Icon={Link2} iconBg="#EEF3FF" iconColor="#2E69E0" title="Enlaces del funnel" subtitle="Producción, testing, dominio y publicidad" />
            <div className="p-[14px]">
              <div className="grid gap-3 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
                {[['prod_url', 'Producción', '#2E69E0'], ['testing_url', 'Testing', '#94A3B8'], ['official_domain', 'Dominio oficial', '#22C55E'], ['ads_url', 'Publicidad', '#8B5CF6']].map(([k, lbl, col]) => (
                  <div key={k}>
                    <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold" style={{ color: col }}>{k === 'official_domain' ? <span className="w-[7px] h-[7px] rounded-full" style={{ background: col }} /> : <span className="w-[7px] h-[7px] rounded-full" style={{ background: col }} />}{lbl}</div>
                    <input defaultValue={f[k] || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f[k] || '')) onUpdate(f.id, { [k]: v || null }); }} placeholder={k === 'official_domain' ? 'tudominio.com' : 'https://…'} className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                  </div>
                ))}
              </div>
              <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 200px' }}>
                <div>
                  <div className="flex items-center gap-1.5 mb-1.5 text-[11px] font-semibold" style={{ color: '#F97316' }}><Rocket size={12} />Boost</div>
                  <input defaultValue={f.boost_url || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f.boost_url || '')) onUpdate(f.id, { boost_url: v || null }); }} placeholder="Link para hacer el boost…" className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">ID del Pipeline</div>
                  <input defaultValue={f.pipeline_id || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f.pipeline_id || '')) onUpdate(f.id, { pipeline_id: v || null }); }} placeholder="Ej. 9" className="w-full py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue font-mono" />
                </div>
              </div>
              <div className="text-[10.5px] text-[#AEB4BF] mt-2.5">Pegá o editá y hacé clic afuera para guardar. En la tabla, un clic en el chip copia el enlace.</div>
            </div>
          </div>

          {/* VSL del funnel — 1 por funnel (el corazón: de acá salen los anuncios) */}
          <div className="border border-[#E7EAF0] rounded-xl bg-white overflow-hidden mb-3.5">
            <CardHead Icon={Clapperboard} iconBg="#ECFDF3" iconColor="#16A34A" title="VSL del funnel" subtitle="1 video por funnel · con su guión" />

            <div className="p-[14px] flex flex-col gap-3.5">
              <div>
                <div className="text-[10.5px] font-bold text-[#16A34A] uppercase tracking-[0.06em] mb-1.5">Link del VSL</div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <input key={f.id + 'vslurl'} defaultValue={f.vsl_url || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f.vsl_url || '')) onUpdate(f.id, { vsl_url: v || null }); }} placeholder="Link del VSL de este funnel…" className="flex-1 min-w-[180px] py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                  <button onClick={() => setVoomlyOpen(true)} title="Buscar el VSL en la tabla de Voomly y traer su link automáticamente." className="inline-flex items-center gap-1.5 py-2 px-2.5 border rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#FDF2F8', color: '#DB2777', borderColor: '#FBCFE8' }}><SearchIcon size={12} />Traer de Voomly</button>
                  {f.vsl_url && <><button onClick={() => openUrl(f.vsl_url)} className="inline-flex items-center gap-1.5 py-2 px-2.5 border-none rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#ECFDF3', color: '#16A34A' }}><Clapperboard size={12} />Ver</button>
                    <button onClick={() => copyText(f.vsl_url)} title="Copiar" className="inline-flex items-center justify-center w-8 h-8 border border-[#C9F0D8] rounded-lg cursor-pointer shrink-0" style={{ background: '#ECFDF3', color: '#16A34A' }}><Copy size={12} /></button></>}
                </div>
              </div>
              <ScriptPreview Icon={FileText} color="#16A34A" label="Guión del VSL" text={f.vsl_script} onOpen={openVslScript} locked emptyHint="Sin guión. Sale del DEL: tocá “Generar avatares del DEL”." />
            </div>
          </div>

          {/* Variantes de avatar */}
          <div className="border border-[#E7EAF0] rounded-xl bg-white overflow-hidden">
            <CardHead Icon={Users} iconBg="#FCE7F3" iconColor="#DB2777" title="Variantes de avatar" subtitle="A quién se le publicita · un anuncio por avatar">
              <button onClick={() => generateAvatars('append')} disabled={genActive} title="La IA lee el DEL (aunque esté desordenado), identifica los avatares con su segmentación y les engancha los copys de anuncios por significado. Tarda 1-2 minutos." className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold rounded-lg py-[7px] px-[11px] cursor-pointer disabled:opacity-60 disabled:cursor-default" style={{ background: genActive ? '#FCE7F3' : '#DB2777', color: genActive ? '#DB2777' : '#fff', border: 'none' }}>{genActive ? <RefreshCw size={12} className="animate-spin" /> : <Sparkles size={12} />}{genActive ? 'Generando…' : 'Generar avatares del DEL'}</button>
              {namedAvatars.length > 0 && <>
                <button onClick={fetchFolders} disabled={folderBusy !== 'idle'} title="Vincula las carpetas por avatar que YA existen en el Drive y lee su estado (grabado/editado). No crea nada." className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold bg-white border rounded-lg py-[7px] px-[11px] cursor-pointer hover:bg-[#F7F8FA] disabled:opacity-50" style={foldersReady ? { color: '#15803D', borderColor: '#C9F0D8' } : { color: '#3F4653', borderColor: '#D8DDE6' }}>{folderBusy === 'read' ? <RefreshCw size={12} className="animate-spin" /> : foldersReady ? <Check size={12} strokeWidth={3} /> : <FolderOpen size={12} />}{folderBusy === 'read' ? 'Trayendo…' : 'Traer carpeta'}</button>
                <button onClick={createFolders} disabled={folderBusy !== 'idle'} title="Crea en el Drive lo que falte: Anuncios › Grabaciones|Ediciones › una subcarpeta por avatar. Acción aparte de traer." className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold bg-[#F5F3FF] border border-[#E4DBFF] rounded-lg py-[7px] px-[11px] text-[#7C3AED] cursor-pointer hover:bg-[#EEE9FE] disabled:opacity-50">{folderBusy === 'create' ? <RefreshCw size={12} className="animate-spin" /> : <FolderPlus size={12} />}{folderBusy === 'create' ? 'Creando…' : 'Crear carpetas'}</button>
              </>}
              {canUndo && <button onClick={undoGenerate} title="Restaurar los avatares y la VSL que había antes de la última generación de la IA." className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold bg-white border border-[#D8DDE6] rounded-lg py-[7px] px-[11px] text-[#B45309] cursor-pointer hover:bg-[#FFFBEB]"><RefreshCw size={12} style={{ transform: 'scaleX(-1)' }} />Deshacer</button>}
              <span className="text-[10.5px] font-bold text-[#6B7280] bg-[#F1F3F7] border border-[#E7EAF0] w-[22px] h-[22px] rounded-full inline-flex items-center justify-center">{avatars.length}</span>
            </CardHead>
            {genActive && (
              <div className="mx-[14px] mt-[14px] -mb-1 flex items-center gap-2 text-[11.5px] font-semibold py-2.5 px-3 rounded-lg" style={{ background: '#FDF2F8', color: '#BE185D', border: '1px solid #FBCFE8' }}>
                <RefreshCw size={13} className="animate-spin shrink-0" />
                La IA está leyendo el DEL y armando los avatares… unos segundos.
              </div>
            )}
            {gen.status === 'done' && (
              <div className="mx-[14px] mt-[14px] -mb-1 flex items-center gap-2 text-[11.5px] font-semibold py-2.5 px-3 rounded-lg" style={{ background: '#ECFDF3', color: '#15803D', border: '1px solid #C9F0D8' }}>
                <Check size={13} className="shrink-0" strokeWidth={3} />
                Listo — {gen.n} avatar{gen.n === 1 ? '' : 'es'} del DEL{typeof gen.cost === 'number' ? ` · costo US$${gen.cost.toFixed(4)}` : ''}. Revisalos y ajustá lo que quieras.
              </div>
            )}
            {gen.status === 'error' && (
              <div className="mx-[14px] mt-[14px] -mb-1 flex items-start gap-2 text-[11.5px] py-2.5 px-3 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
                <X size={13} className="shrink-0 mt-px" />
                <span>{gen.msg || 'No pude generar los avatares.'} <button onClick={() => generateAvatars('append')} className="underline font-semibold cursor-pointer bg-transparent border-none p-0 text-[#B91C1C]">Reintentar</button></span>
              </div>
            )}
            <div className="p-[14px] flex flex-col gap-3">
              {avatars.map((av, i) => {
                const acfg = AVATAR_STATUS[av.status] || AVATAR_STATUS['En grabación'];
                return (
                  <div key={av.id} className="border border-[#EDF0F5] rounded-[11px] p-[14px] bg-white" style={{ borderLeft: '3px solid #EC4899' }}>
                    <div className="flex items-start gap-2.5 mb-2.5">
                      <span className="inline-flex items-center justify-center w-6 h-6 rounded-[7px] bg-[#FCE7F3] text-[#DB2777] text-[12px] font-bold shrink-0">{i + 1}</span>
                      <input key={av.id + 'n'} defaultValue={av.name} onBlur={e => { if (e.target.value !== (av.name || '')) setAvatar(av.id, { name: e.target.value }); }} placeholder="Nombre del avatar" className="flex-1 min-w-0 text-[13.5px] font-semibold text-[#1A1D26] leading-snug border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md px-1.5 py-0.5 -ml-1.5 bg-transparent focus:bg-white outline-none" />
                      <span className="inline-flex items-center gap-1.5 py-[3px] px-2.5 rounded-full text-[10.5px] font-bold shrink-0 whitespace-nowrap" style={{ background: acfg.bg, color: acfg.color }}><span className="w-[6px] h-[6px] rounded-full" style={{ background: acfg.dot }} /></span>
                      <AvatarStatusPill status={av.status} onChange={s => setAvatar(av.id, { status: s })} />
                      <button onClick={() => removeAvatar(av.id)} className="inline-flex items-center justify-center w-7 h-7 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer shrink-0 hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={13} /></button>
                    </div>

                    <div className="flex flex-col gap-3">
                      {/* Segmentación */}
                      <div>
                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#DB2777] mb-1.5"><Target size={12} />Segmentación</div>
                        <input key={av.id + 'a'} defaultValue={av.audience} onBlur={e => { if (e.target.value !== (av.audience || '')) setAvatar(av.id, { audience: e.target.value }); }} placeholder="¿A quién se le publicita? (edad, sexo, ubicación, intereses…)" className="w-full py-2 px-[11px] border border-[#EDF0F5] rounded-lg text-[11.5px] text-[#3F4653] bg-[#FAFBFD] outline-none focus:border-blue focus:bg-white" />
                      </div>

                      {/* Descripción */}
                      <ScriptPreview Icon={FileText} color="#DB2777" label="Descripción" text={av.spec_text} onOpen={() => openDesc(av)} locked emptyHint="Sin descripción. Sale del DEL: tocá “Generar avatares del DEL”." />

                      {/* Anuncios (editado): la CARPETA de ediciones de este avatar (ahí viven los anuncios editados). */}
                      <div>
                        <div className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-[#7C3AED] mb-1.5"><Megaphone size={12} />Anuncios <span className="text-[#A78BFA] normal-case tracking-normal">(editado)</span></div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <input key={av.id + 'edit'} defaultValue={av.edit_folder_url || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (av.edit_folder_url || '')) setAvatar(av.id, { edit_folder_url: v || null }); }} placeholder="Carpeta de ediciones de este avatar…" className="flex-1 min-w-[180px] py-2 px-[11px] border border-[#E2E5EB] rounded-lg text-[12px] text-[#3F4653] bg-white outline-none focus:border-blue" />
                          <button onClick={() => bringEditFolder(av)} disabled={folderBusy !== 'idle'} title="Trae la carpeta de ediciones de este avatar. Si no la encuentra sola, la elegís vos (sin ir al Drive)." className="inline-flex items-center gap-1.5 py-2 px-2.5 border rounded-lg text-[11px] font-semibold cursor-pointer shrink-0 disabled:opacity-50" style={{ background: '#F5F3FF', color: '#7C3AED', borderColor: '#E4DBFF' }}>{folderBusy === 'read' ? <RefreshCw size={12} className="animate-spin" /> : <FolderOpen size={12} />}Traer carpeta</button>
                          {av.edit_folder_url
                            ? <><button onClick={() => openUrl(av.edit_folder_url)} className="inline-flex items-center gap-1.5 py-2 px-2.5 border-none rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#F5F3FF', color: '#7C3AED' }}><FolderOpen size={12} />Abrir</button>
                               <button onClick={() => copyText(av.edit_folder_url)} title="Copiar" className="inline-flex items-center justify-center w-8 h-8 border border-[#E4DBFF] rounded-lg cursor-pointer shrink-0" style={{ background: '#F5F3FF', color: '#7C3AED' }}><Copy size={12} /></button></>
                            : <span className="inline-flex items-center py-2 px-2.5 rounded-lg bg-[#F5F6F9] border border-[#EDF0F5] text-[#AEB4BF] text-[10.5px] font-semibold shrink-0 whitespace-nowrap">Sin carpeta</span>}
                        </div>
                        {(av.edit_folder_url || av.rec_folder_url) && (
                          <div className="flex items-center gap-2 mt-2 flex-wrap">
                            {av.edit_folder_url && <span className="inline-flex items-center gap-1 py-1 px-2 rounded-lg text-[10.5px] font-semibold" style={av.edit_files > 0 ? { background: '#F5F3FF', color: '#7C3AED', border: '1px solid #E4DBFF' } : { background: '#fff', color: '#9098A4', border: '1px solid #E7EAF0' }}>{av.edit_files > 0 ? <><Check size={9} strokeWidth={3.5} />editado · {av.edit_files} arch.</> : 'carpeta vacía'}</span>}
                            {av.rec_folder_url && (
                              <button onClick={() => openUrl(av.rec_folder_url)} title="Carpeta de grabaciones de este avatar" className="inline-flex items-center gap-1.5 py-1 px-2 border rounded-lg text-[10.5px] font-semibold cursor-pointer shrink-0" style={av.rec_files > 0 ? { background: '#ECFDF3', color: '#15803D', borderColor: '#C9F0D8' } : { background: '#fff', color: '#9098A4', borderColor: '#E7EAF0' }}>
                                <Film size={11} />Grabaciones{av.rec_files > 0 ? <span className="inline-flex items-center gap-0.5"><Check size={9} strokeWidth={3.5} />grabado</span> : <span className="text-[#C3C9D4]">vacía</span>}
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Copys de anuncios */}
                      <ScriptPreview Icon={FileText} color="#2E69E0" label="Copys de anuncios" text={av.ad_script} onOpen={() => openAdScript(av, i)} locked emptyHint="Sin copys. Salen del DEL: tocá “Generar avatares del DEL”." />
                    </div>
                  </div>
                );
              })}
              <button onClick={addAvatar} className="flex items-center justify-center gap-2.5 w-full border-[1.5px] border-dashed border-[#F0C4DD] rounded-[11px] bg-[#FDF5FA] text-[#DB2777] text-[12.5px] font-semibold py-3 px-3.5 cursor-pointer hover:bg-[#FCEBF4] hover:border-[#DB2777] transition-colors"><span className="w-5 h-5 rounded-full bg-[#DB2777] text-white inline-flex items-center justify-center shrink-0"><Plus size={12} strokeWidth={2.6} /></span>Agregar variante de avatar</button>
            </div>
          </div>

          <div className="flex justify-end mt-3">
            <button onClick={() => { if (window.confirm(`¿Borrar el funnel "${f.name}"?`)) onDelete(f.id); }} className="inline-flex items-center gap-1.5 py-[7px] px-3 rounded-lg bg-white border border-[#F5C2C2] text-[#DC2626] text-[11.5px] font-semibold cursor-pointer hover:bg-[#FEF2F2]"><Trash2 size={13} />Borrar funnel</button>
          </div>
        </div>
      )}
      {note && <NoteModal {...note} onClose={() => setNote(null)} />}
      {voomlyOpen && <VoomlyPicker clientName={clientName} funnelName={f.name || ''} current={f.vsl_url || ''} onPick={(url) => onUpdate(f.id, { vsl_url: url || null })} onClose={() => setVoomlyOpen(false)} />}
      {folderPick && <FolderPicker clientId={clientId} avatarName={folderPick.name || ''} current={folderPick.edit_folder_url || ''} onPick={(url) => setAvatar(folderPick.id, { edit_folder_url: url || null })} onClose={() => setFolderPick(null)} />}
    </div>
  );
}

// Una estrategia "envuelve" sus documentos + sus funnels (con avatares).
function StrategyGroup({ s, funnels, docs, pipeline, clientName, onUpdate, onUpdateStrategy, onDelete, onTrack, onNew, onRefreshPage }) {
  const [open, setOpen] = useState(true);
  const num = (s.position ?? 0) + 1;
  const st = FUNNEL_STATUS[s.status] || FUNNEL_STATUS.borrador;
  const cleanName = (s.name || '').replace(/^estrategia\s*#?\s*\d+\s*\|?\s*/i, '').trim();
  const delText = (docs.find(d => d.doc_kind === 'del')?.text) || '';
  const masterDocs = docs.filter(d => d.doc_kind !== 'extra');

  // Recursos de la estrategia (subcarpetas de "Recursos" en Drive) — los comparten todos los funnels.
  const [recursos, setRecursos] = useState(null);
  const [loadingRec, setLoadingRec] = useState(false);
  // Marca MANUAL de entregado por carpeta (folder_id -> bool). Si existe, manda sobre files>0.
  const [overrides, setOverrides] = useState(s.recursos_overrides || {});
  useEffect(() => { setOverrides(s.recursos_overrides || {}); }, [s.recursos_overrides]);
  const isDone = useCallback((r) => (r.folder_id in overrides ? !!overrides[r.folder_id] : r.files > 0), [overrides]);
  const toggleDone = (r) => {
    const next = { ...overrides, [r.folder_id]: !isDone(r) };
    setOverrides(next);
    try { onUpdateStrategy?.(s.id, { recursos_overrides: next }); } catch { /* noop */ }
  };
  // Sincronizar = relee el Drive (drive-sync) para que aparezcan carpetas nuevas, y recarga.
  const loadRecursos = useCallback(async () => {
    try { const { data } = await supabase.rpc('cerebro_recursos', { p_strategy_id: s.id }); setRecursos(data || []); }
    catch { setRecursos([]); }
  }, [s.id]);
  const syncRecursos = useCallback(async () => {
    setLoadingRec(true);
    try {
      if (s.client_id) await supabase.functions.invoke('drive-sync', { body: { client_id: s.client_id } });
      await loadRecursos();
    } catch { /* noop */ } finally { setLoadingRec(false); }
  }, [s.client_id, loadRecursos]);
  useEffect(() => { if (open && recursos === null) loadRecursos(); }, [open, recursos, loadRecursos]);
  const recDone = (recursos || []).filter(isDone).length;

  return (
    <div className="bg-white rounded-2xl overflow-hidden mb-5" style={{ border: '1px solid #E7EAF0', borderLeft: '3px solid #EC4899', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
      <div onClick={() => setOpen(o => !o)} className="flex items-center gap-3 py-4 px-5 cursor-pointer border-b border-[#F1F3F7]" style={{ background: 'linear-gradient(180deg,#FDF2F8 0%,#fff 100%)' }}>
        <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0" style={{ background: '#FCE7F3', color: '#DB2777' }}><Layers size={18} /></span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <span className="text-[15px] font-bold text-[#1A1D26]">Estrategia #{num}</span>
            {cleanName && <><span className="text-[#C3C9D4]">·</span><span className="text-[14px] font-semibold text-[#3F4653]">{cleanName}</span></>}
            <span className="inline-flex items-center gap-1.5 py-0.5 px-2 rounded-full text-[10px] font-bold uppercase tracking-[0.04em]" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}><span className="w-[6px] h-[6px] rounded-full" style={{ background: st.dot }} />{st.label}</span>
          </div>
        </div>
        <span className="text-[11.5px] text-[#9098A4] font-medium shrink-0">{funnels.length} funnel{funnels.length === 1 ? '' : 's'}</span>
        <ChevronDown size={18} className="text-[#C3C9D4] shrink-0 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'none' }} />
      </div>

      {open && (
        <div className="py-[18px] px-5">
          {/* Recursos de la estrategia — el documento maestro (DEL) + las carpetas de "Recursos" del Drive, juntos. */}
          <div className="mb-4">
            <div className="flex items-center justify-between gap-2.5 flex-wrap mb-3">
              <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4]">Recursos de la estrategia <span className="text-[#C3C9D4] normal-case font-medium tracking-normal">· los comparten todos los funnels</span></span>
              <div className="flex items-center gap-2.5">
                {recursos && recursos.length > 0 && <span className="inline-flex items-center py-[3px] px-2.5 rounded-full text-[11px] font-semibold" style={recDone === recursos.length ? { background: '#ECFDF3', color: '#15803D', border: '1px solid #C9F0D8' } : { background: '#FEF3C7', color: '#B45309', border: '1px solid #FBE6BE' }}>{recDone}/{recursos.length} entregados</span>}
                <button onClick={syncRecursos} disabled={loadingRec} title="Relee la carpeta Recursos del Drive (trae carpetas nuevas). El check lo marcás vos a mano." className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-[#2E69E0] bg-[#EEF3FF] border border-[#DBE6FF] rounded-lg py-[5px] px-2.5 cursor-pointer hover:bg-[#DFEAFF] disabled:opacity-50"><RefreshCw size={12} className={loadingRec ? 'animate-spin' : ''} />{loadingRec ? 'Sincronizando…' : 'Sincronizar'}</button>
              </div>
            </div>
            <div className="flex gap-2.5 flex-wrap">
              {/* Documento maestro (DEL / master docs) como chip verde con su tag */}
              {masterDocs.map(d => {
                const meta = DOC_META[d.doc_kind] || DOC_META.extra;
                return (
                  <div key={d.id} className="inline-flex items-center gap-2.5 border rounded-[10px] py-2 px-3" style={{ borderColor: '#C9F0D8', background: '#F4FDF7' }} title={`${meta.label} · ${(d.char_count || 0).toLocaleString()} caracteres`}>
                    <span className="w-[19px] h-[19px] rounded-md bg-[#22C55E] text-white inline-flex items-center justify-center shrink-0"><Check size={12} strokeWidth={3.5} /></span>
                    <span className="text-[9px] font-extrabold tracking-[0.06em] text-[#15803D] bg-[#DCFCE7] py-0.5 px-1.5 rounded-[5px]">{meta.label.toUpperCase()}</span>
                    <span className="font-semibold text-[12.5px] text-[#1A1D26] max-w-[160px] truncate">{d.title || meta.label}</span>
                    <span className="text-[10.5px] text-[#9098A4] whitespace-nowrap">{(d.char_count || 0).toLocaleString()} car.</span>
                    {d.web_url && <button onClick={() => openUrl(d.web_url)} title="Abrir en Drive" className="text-[#9098A4] hover:text-[#2E69E0] inline-flex"><ExternalLink size={13} /></button>}
                  </div>
                );
              })}
              {/* Subcarpetas de "Recursos" (chips con check manual + conteo) */}
              {recursos === null ? <div className="text-[11.5px] text-[#AEB4BF] py-1.5">Cargando recursos…</div>
                : (recursos.length === 0 && masterDocs.length === 0) ? <div className="text-[11.5px] text-[#AEB4BF] py-1.5">No encontré subcarpetas dentro de “Recursos”. Tocá “Sincronizar” o revisá la pestaña Carpetas del cliente.</div>
                : recursos.map(r => { const done = isDone(r); const auto = r.files > 0; return (
                    <div key={r.folder_id} className="inline-flex items-center gap-2.5 border rounded-[10px] py-2 px-3" style={done ? { borderColor: '#C9F0D8', background: '#F4FDF7' } : { border: '1.5px dashed #D8DDE6', background: '#FBFCFE' }}>
                      <button onClick={() => toggleDone(r)} title={done ? 'Marcar como NO entregado' : 'Marcar como entregado'} className="w-[19px] h-[19px] rounded-md inline-flex items-center justify-center shrink-0 cursor-pointer p-0" style={done ? { background: '#22C55E', color: '#fff', border: 'none' } : { background: '#fff', border: '1.5px dashed #C3C9D4' }}>{done && <Check size={12} strokeWidth={3.5} />}</button>
                      <span className="font-semibold text-[12.5px] max-w-[160px] truncate" style={{ color: done ? '#1A1D26' : '#6B7280' }} title={r.name}>{r.name}</span>
                      <span className="text-[10.5px] font-bold py-0.5 px-1.5 rounded-full whitespace-nowrap" title={`${r.files} archivo${r.files === 1 ? '' : 's'} en la carpeta`} style={auto ? { background: '#DCFCE7', color: '#15803D' } : { background: '#F1F3F7', color: '#AEB4BF' }}>{r.files}</span>
                      {r.url && <button onClick={() => openUrl(r.url)} title="Abrir carpeta" className="hover:text-[#2E69E0] inline-flex" style={{ color: done ? '#9098A4' : '#C3C9D4' }}><ExternalLink size={13} /></button>}
                    </div>
                  ); })}
            </div>
            {recursos && recursos.length > 0 && <div className="text-[11px] text-[#AEB4BF] mt-2">El número es lo que hay en la carpeta; el check lo marcás vos (por si el conteo no refleja bien lo entregado).</div>}
          </div>

          {/* Tabla de funnels (scroll horizontal si no entra) */}
          <div className="border border-[#EDF0F5] rounded-xl overflow-x-auto">
            <div style={{ minWidth: 820 }}>
              <div className="grid items-center py-[9px] px-4 border-b border-[#EDF0F5]" style={{ gridTemplateColumns: GRID, gap: 12, background: '#FAFBFD' }}>
                {['Funnel · página', 'Estado', 'Enlaces', 'Tracking', 'Modificado', ''].map((h, i) => <div key={i} className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-[#AEB4BF]">{h}</div>)}
              </div>
              {funnels.length === 0
                ? <div className="text-[12px] text-[#9098A4] py-7 text-center">Sin funnels en esta estrategia.</div>
                : funnels.map((f, i) => <FunnelRow key={f.id} f={f} stages={pipeline?.[f.id]} delText={delText} clientId={s.client_id} clientName={clientName} onUpdate={onUpdate} onDelete={onDelete} onTrack={onTrack} onRefreshPage={onRefreshPage} last={i === funnels.length - 1} />)}
            </div>
          </div>

          <button onClick={() => onNew(s.id)} className="flex items-center justify-center gap-2.5 w-full mt-3.5 border-[1.5px] border-dashed border-[#B9CCFB] rounded-xl bg-[#F5F9FF] text-[#2E69E0] text-[13px] font-semibold py-3.5 px-4 cursor-pointer hover:bg-[#EAF1FF] hover:border-[#2E69E0] transition-colors"><span className="w-[22px] h-[22px] rounded-full bg-[#2E69E0] text-white inline-flex items-center justify-center shrink-0"><Plus size={13} strokeWidth={2.6} /></span>Nuevo funnel en esta estrategia</button>
        </div>
      )}
    </div>
  );
}

export default function FunnelsView({ clientId }) {
  const { clients, strategies, strategyPages, updateStrategy, addStrategyPage, updateStrategyPage, deleteStrategyPage, refreshStrategyPage } = useApp();
  const client = useMemo(() => (clients || []).find(c => c.id === clientId) || {}, [clients, clientId]);
  const myStrategies = useMemo(() => (strategies || []).filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0)), [strategies, clientId]);
  const funnelsOf = (sid) => (strategyPages || []).filter(p => p.strategy_id === sid);

  // Contexto (client_brain_docs ingerido) + Drive docs (para asignar) + casilleros.
  const [docs, setDocs] = useState([]);
  const [driveDocs, setDriveDocs] = useState([]);
  const [slotPins, setSlotPins] = useState([]);
  const [webs, setWebs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const fetchContext = useCallback(async () => {
    try {
      const [d, nodes, pins, webRows] = await Promise.all([
        sbFetch(`client_brain_docs?client_id=eq.${encodeURIComponent(clientId)}&select=*`),
        sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&node_type=in.(document,sheet,slides,pdf)&select=id,name,node_type,web_url`),
        sbFetch(`client_brain_pins?client_id=eq.${encodeURIComponent(clientId)}&slot=not.is.null&select=node_id,slot,label`),
        sbFetch(`client_brain_webs?client_id=eq.${encodeURIComponent(clientId)}&select=*&order=created_at`),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setDriveDocs(Array.isArray(nodes) ? nodes : []);
      setSlotPins(Array.isArray(pins) ? pins : []);
      setWebs(Array.isArray(webRows) ? webRows : []);
    } catch { /* noop */ }
  }, [clientId]);
  useEffect(() => { fetchContext(); }, [fetchContext]);

  // Semáforo del pipeline (gates duros) por funnel, calculado por la base.
  const [pipeline, setPipeline] = useState({});
  const loadPipeline = useCallback(async () => {
    try {
      const { data } = await supabase.rpc('cerebro_pipeline_status', { p_client_id: clientId });
      const byFunnel = {};
      for (const r of (data || [])) (byFunnel[r.funnel_id] ||= []).push(r);
      for (const k in byFunnel) byFunnel[k].sort((a, b) => a.ord - b.ord);
      setPipeline(byFunnel);
    } catch { /* noop */ }
  }, [clientId]);
  useEffect(() => { loadPipeline(); }, [loadPipeline, docs, strategyPages, strategies]);

  const docsByNode = useMemo(() => { const m = {}; for (const d of docs) m[d.node_id] = d; return m; }, [docs]);
  const docsOf = (sid) => docs.filter(d => d.strategy_id === sid);
  const lastSync = useMemo(() => { let m = null; for (const d of docs) if (d.synced_at && (!m || d.synced_at > m)) m = d.synced_at; return m; }, [docs]);
  const sync = async () => { setSyncing(true); try { await supabase.functions.invoke('client-brain-sync', { body: { client_id: clientId } }); await fetchContext(); } catch { /* noop */ } finally { setSyncing(false); } };

  const [modal, setModal] = useState(false);
  const [trackFunnel, setTrackFunnel] = useState(null);
  const openTrack = (f) => setTrackFunnel({ ...f, _edit: { pixel_code: f.pixel_code || '', clarity_id: f.clarity_id || '', events: normEvents(f.conversion_events) } });
  const blankForm = (sid) => ({ name: '', strategy_id: sid || myStrategies[0]?.id || '', status: 'borrador', prod_url: '', testing_url: '', ads_url: '', avatars: [], pixel_code: '', clarity_id: '', events: stdEvents() });
  const [form, setForm] = useState(blankForm);
  const openNew = (sid) => { setForm(blankForm(sid)); setModal(true); };

  const create = () => {
    if (!form.name.trim() || !form.strategy_id) return;
    addStrategyPage({
      strategy_id: form.strategy_id, name: form.name.trim(), status: form.status,
      prod_url: form.prod_url || null, testing_url: form.testing_url || null, ads_url: form.ads_url || null,
      pixel_code: form.pixel_code || null, clarity_id: form.clarity_id || null,
      conversion_events: form.events, avatars: form.avatars,
    });
    setModal(false); setForm(blankForm());
  };
  const saveTrack = (val) => { updateStrategyPage(trackFunnel.id, { pixel_code: val.pixel_code || null, clarity_id: val.clarity_id || null, conversion_events: val.events }); setTrackFunnel(null); };

  return (
    <div className="rounded-2xl p-[18px] -mx-1" style={{ background: '#F4F6F9' }}>
      {/* Contexto del cliente (alimenta todas las estrategias) */}
      <div className="bg-white rounded-2xl overflow-hidden mb-6" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div className="flex items-start justify-between gap-4 flex-wrap py-[18px] px-5 border-b border-[#F1F3F7]" style={{ background: 'linear-gradient(180deg,#FDF2F8 0%,#fff 100%)' }}>
          <div className="flex gap-3 items-center">
            <span className="inline-flex items-center justify-center w-[38px] h-[38px] rounded-[11px] shrink-0" style={{ background: '#FCE7F3', color: '#DB2777' }}><Sparkles size={20} /></span>
            <div>
              <div className="text-[15px] font-bold text-[#1A1D26] tracking-[-.01em]">Contexto del cliente</div>
              <div className="text-[11.5px] text-[#9098A4] mt-px">Alimenta a todas las estrategias{lastSync ? ` · sincronizado ${fmtDateTime(lastSync)}` : ''}</div>
            </div>
          </div>
          <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border-none rounded-[10px] text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50 hover:brightness-95" style={{ background: '#EC4899', boxShadow: '0 1px 2px rgba(236,72,153,.35)' }}><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Sincronizando…' : 'Sincronizar contexto'}</button>
        </div>

        <div className="py-[18px] px-5">
          {/* Nicho + cuello */}
          <div className="grid gap-3.5 mb-5" style={{ gridTemplateColumns: 'minmax(200px,1fr) minmax(280px,1.6fr)' }}>
            <div className="border border-[#EDF0F5] rounded-xl py-[13px] px-[15px] bg-[#FBFCFE]">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#9098A4] mb-2"><Target size={13} />Nicho</div>
              <div className="text-[13px] font-semibold leading-snug" style={{ color: client.niche ? '#EC4899' : '#C3C9D4' }}>{client.niche || '—'}</div>
            </div>
            <div className="border rounded-xl py-[13px] px-[15px]" style={{ borderColor: '#FBE6BE', background: '#FFFBEB' }}>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.1em] mb-2" style={{ color: '#B45309' }}><Activity size={13} />Cuello de botella</div>
              <div className="text-[13px] leading-snug font-medium" style={{ color: client.bottleneck ? '#78350F' : '#C3C9D4' }}>{client.bottleneck || '—'}</div>
            </div>
          </div>

          {/* Documentos */}
          <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4] mb-3">Documentos del cliente</div>
          <ClientContextSlots clientId={clientId} driveDocs={driveDocs} docsByNode={docsByNode} slotPins={slotPins} onChanged={fetchContext} />
          <div className="flex items-center gap-2 text-[11.5px] text-[#9098A4] mt-3.5"><RefreshCw size={13} />Asigná el documento de cada casillero; después tocá "Sincronizar contexto" para que el cerebro lo lea.</div>

          {/* Webs de contexto */}
          <div className="mt-5 pt-[18px] border-t border-[#F1F3F7]">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4] mb-3">Webs de contexto</div>
            <WebLinks clientId={clientId} webs={webs} onChanged={fetchContext} />
            <div className="flex items-center gap-2 text-[11.5px] text-[#9098A4] mt-2.5 leading-snug"><Globe size={13} className="shrink-0" />Sumá el sitio del cliente o de la empresa MLM. Los dominios de tus funnels también nutren el contexto (el funnel es donde llega el prospecto tras el anuncio).</div>
          </div>
        </div>
      </div>

      {/* Estrategias, cada una envolviendo sus documentos y funnels */}
      {myStrategies.length === 0
        ? <div className="bg-white rounded-2xl flex flex-col items-center justify-center text-center py-12 px-5 gap-2" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}><Zap size={26} className="text-[#C7CCD6]" /><div className="text-[13px] font-semibold text-[#4B5563]">Todavía no hay estrategias</div><div className="text-[11.5px] text-text2">Sincronizá las carpetas del cliente (pestaña Carpetas): las "Estrategia #N" se crean solas.</div></div>
        : myStrategies.map(s => <StrategyGroup key={s.id} s={s} funnels={funnelsOf(s.id)} docs={docsOf(s.id)} pipeline={pipeline} clientName={client.name} onUpdate={updateStrategyPage} onUpdateStrategy={updateStrategy} onDelete={deleteStrategyPage} onTrack={openTrack} onNew={openNew} onRefreshPage={refreshStrategyPage} />)}

      {/* Nueva estrategia (informativo: se crean solas desde las carpetas del Drive) */}
      {myStrategies.length > 0 && (
        <div className="flex items-center gap-2 justify-center text-[11.5px] text-[#9098A4] mt-1">
          <Layers size={13} />Las estrategias se crean solas al sincronizar las carpetas "Estrategia #N" del Drive (pestaña Carpetas).
        </div>
      )}

      {/* Modal nuevo funnel */}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title="Nuevo funnel" maxWidth={560}
          footer={<div className="flex justify-end gap-2 w-full"><button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={() => setModal(false)}>Cancelar</button><button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.name.trim() || !form.strategy_id} onClick={create}>Crear funnel</button></div>}>
          <div className="flex flex-col gap-[18px] p-1">
            <div className="grid gap-3.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Nombre del funnel</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Profesionales V1" className={inputCls} autoFocus /></div>
              <div><label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Estrategia</label><select value={form.strategy_id} onChange={e => setForm({ ...form, strategy_id: e.target.value })} className={inputCls + ' cursor-pointer'}>{myStrategies.map(s => <option key={s.id} value={s.id}>Estrategia #{(s.position ?? 0) + 1}{s.name ? ' · ' + s.name : ''}</option>)}</select></div>
            </div>
            <div><label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Estado</label>
              <div className="inline-flex items-center gap-1 p-1 border border-[#E2E5EB] rounded-[10px] bg-[#F7F8FA]">
                {STATUS_ORDER.map(k => { const v = FUNNEL_STATUS[k]; const sel = form.status === k; return <button key={k} onClick={() => setForm({ ...form, status: k })} className="inline-flex items-center gap-1.5 py-[7px] px-3.5 border-none rounded-[7px] text-[12.5px] font-semibold font-sans cursor-pointer" style={{ background: sel ? '#fff' : 'transparent', color: sel ? '#1A1D26' : '#6B7280', boxShadow: sel ? '0 1px 2px rgba(10,22,40,.12)' : 'none' }}><span className="w-[7px] h-[7px] rounded-full" style={{ background: v.dot }} />{v.label}</button>; })}
              </div>
            </div>
            <div><div className="text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-2.5">Enlaces</div>
              <div className="flex flex-col gap-2.5">
                {[['prod_url', 'Producción', '#2E69E0'], ['testing_url', 'Testing', '#9CA3AF'], ['ads_url', 'Publicidad', '#7C3AED']].map(([k, lbl, col]) => (
                  <div key={k} className="flex items-center gap-2.5"><span className="inline-flex items-center gap-1.5 w-24 shrink-0 text-[12px] font-semibold" style={{ color: col }}><span className="w-2 h-2 rounded-[3px]" style={{ background: col }} />{lbl}</span><input value={form[k]} onChange={e => setForm({ ...form, [k]: e.target.value })} placeholder="https://…" className="flex-1 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[13px] text-[#1A1D26] bg-white outline-none focus:border-blue" /></div>
                ))}
              </div>
            </div>
            <div><div className="text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-2.5">Tracking</div>
              <div className="border border-[#EEF0F3] rounded-[11px] bg-[#FBFCFE] p-3.5"><TrackingEditor value={{ pixel_code: form.pixel_code, clarity_id: form.clarity_id, events: form.events }} onChange={(v) => setForm({ ...form, pixel_code: v.pixel_code, clarity_id: v.clarity_id, events: v.events })} /></div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal tracking de un funnel */}
      {trackFunnel && (
        <Modal open={!!trackFunnel} onClose={() => setTrackFunnel(null)} title={`Tracking · ${trackFunnel.name}`} maxWidth={580}
          footer={<div className="flex justify-end gap-2 w-full"><button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={() => setTrackFunnel(null)}>Cerrar</button><button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark inline-flex items-center gap-1.5" onClick={() => saveTrack(trackFunnel._edit)}><Check size={14} />Guardar tracking</button></div>}>
          <div className="p-1"><TrackingEditor value={trackFunnel._edit} onChange={(v) => setTrackFunnel(tf => ({ ...tf, _edit: v }))} /></div>
        </Modal>
      )}
    </div>
  );
}
