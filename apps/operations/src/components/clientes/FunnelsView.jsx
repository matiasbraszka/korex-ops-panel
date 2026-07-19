// Pestaña "Funnels": el workspace del cliente. Envuelve TODO en la estrategia:
// contexto del cliente (onboarding), y por estrategia sus documentos (DEL, etc.) +
// sus funnels (con avatares, tracking, material y la spec de cada avatar).
// Rediseño visual 2026-07 (Claude Design): gradientes, tarjetas con header, chips.
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import {
  Plus, X, ExternalLink, Copy, ChevronDown, ChevronRight, ChevronLeft, Users, Megaphone,
  Check, Trash2, Activity, Zap, Globe, Rocket, Clapperboard,
  Brain, Sparkles, FileText, RefreshCw, Target, Search as SearchIcon, Layers, Maximize2, Lock,
  FolderOpen, Film, FolderPlus, Link2, MessageSquare, Clipboard, Package, AlertCircle, LayoutGrid,
  Image as ImageIcon,
} from 'lucide-react';
import Modal from '../Modal';
import FunnelTasksBlock from './funnels/FunnelTasksBlock';
import FunnelConfigBlock from './funnels/FunnelConfigBlock';
import FunnelEstrategiaBlock from './funnels/FunnelEstrategiaBlock';
import FunnelResourceFolder from './funnels/FunnelResourceFolder';
import DelEditor from './funnels/DelEditor';
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
// El TIPO del funnel. Antes se adivinaba con una regex sobre el nombre de la carpeta
// del Drive ("Estrategia #2 | Reclutamiento | ..."), y se equivocaba: los funnels
// "Producto sin pre-landing" y "Producto V2" de Jose Luis Rivas colgaban de una carpeta
// llamada "Reclutamiento" y figuraban como reclutamiento. Ahora es un campo del funnel.
const FUNNEL_TIPO = {
  reclutamiento: { label: 'Reclutamiento', color: '#2E69E0', bg: '#E9F1FF', border: '#C7DBFB', Icon: Users },
  producto:      { label: 'Producto',      color: '#15803D', bg: '#E6F7EE', border: '#BBF0D0', Icon: Package },
};
const TIPO_ORDER = ['reclutamiento', 'producto'];
// Los funnels se agrupan por TIPO: es la unica division que quedo despues de jubilar
// las estrategias. El grupo "Sin tipo" va ULTIMO y solo aparece si hay alguno — es un
// hueco a la vista, no un cajon permanente.
const TIPO_GROUPS = [...TIPO_ORDER, null];

// Chip de tipo, editable con un click. Sin tipo = hueco visible, no escondido:
// es informacion que falta y hay que verla.
function TipoChip({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const t = FUNNEL_TIPO[value];
  return (
    <span className="relative inline-flex" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t ? `Tipo: ${t.label} — click para cambiar` : 'Falta definir el tipo — click para elegir'}
        className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[10px] font-bold uppercase tracking-[0.04em] cursor-pointer font-sans"
        style={t
          ? { background: t.bg, color: t.color, border: `1px solid ${t.border}` }
          : { background: 'transparent', color: '#AEB4BF', border: '1px dashed #D0D5DD' }}
      >{t ? t.label : 'Sin tipo'}</button>
      {open && (
        <>
          <span className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <span className="absolute top-[22px] left-0 z-20 flex flex-col gap-0.5 bg-white border border-[#E2E5EB] rounded-[9px] p-1 min-w-[130px]" style={{ boxShadow: '0 4px 14px rgba(26,29,38,.12)' }}>
            {TIPO_ORDER.map(k => (
              <button key={k} onClick={() => { onChange(k); setOpen(false); }}
                className="inline-flex items-center gap-1.5 py-1.5 px-2 rounded-md text-[11.5px] font-semibold text-left font-sans cursor-pointer border-none bg-transparent hover:bg-[#F4F6F9]"
                style={{ color: FUNNEL_TIPO[k].color }}>
                <span className="w-[7px] h-[7px] rounded-full" style={{ background: FUNNEL_TIPO[k].color }} />{FUNNEL_TIPO[k].label}
              </button>
            ))}
            {value && <button onClick={() => { onChange(null); setOpen(false); }} className="py-1.5 px-2 rounded-md text-[11px] text-left font-sans cursor-pointer border-none bg-transparent text-[#9098A4] hover:bg-[#F4F6F9]">Sin definir</button>}
          </span>
        </>
      )}
    </span>
  );
}
const AVATAR_STATUS = {
  'En grabación': { short: 'Grabación', bg: '#FFF1E7', color: '#C2410C', dot: '#F97316' },
  'En edición':   { short: 'Edición',   bg: '#EEF3FF', color: '#2E69E0', dot: '#2E69E0' },
  'Editados':     { short: 'Editados',  bg: '#ECFDF3', color: '#15803D', dot: '#22C55E' },
};
const AVATAR_OPTS = ['En grabación', 'En edición', 'Editados'];
// Temperatura del avatar (decisión de Matías, 2026-07-15): la otra mitad del "punto
// diferencial". Qué tan preparado viene el público antes de entrar al funnel — cambia
// el tono de todo el mensaje. Es del AVATAR (no de la estrategia). Guardado en el JSON
// del avatar (av.temp), sin migración. Opcional: vacío = sin definir.
const AVATAR_TEMP = {
  frio:     { short: 'Frío',     label: 'Frío · no te conoce',        bg: '#EFF6FF', color: '#2563EB', dot: '#3B82F6' },
  tibio:    { short: 'Tibio',    label: 'Tibio · ya te vio',          bg: '#FFF7ED', color: '#C2410C', dot: '#F97316' },
  caliente: { short: 'Caliente', label: 'Caliente · listo para comprar', bg: '#FEF2F2', color: '#DC2626', dot: '#EF4444' },
};
const AVATAR_TEMP_OPTS = ['frio', 'tibio', 'caliente'];
// Las 4 carpetas por avatar de la pestaña Recursos (como la maqueta). Cada una apunta a
// una carpeta del Drive y sabe cuántos archivos tiene (verde si hay, gris si vacía).
const VID_BUCKETS = [
  { key: 'ad_rec',  label: 'Anuncios · grabación', url: 'rec_folder_url',      files: 'rec_files',      c: '#16A34A', bg: '#ECFDF3', border: '#C9F0D8' },
  { key: 'ad_edit', label: 'Anuncios · edición',   url: 'edit_folder_url',     files: 'edit_files',     c: '#7C3AED', bg: '#F5F3FF', border: '#E4DBFF' },
  { key: 'vsl_rec', label: 'VSL · grabación',      url: 'vsl_rec_folder_url',  files: 'vsl_rec_files',  c: '#16A34A', bg: '#ECFDF3', border: '#C9F0D8' },
  { key: 'vsl_edit', label: 'VSL · edición',       url: 'vsl_edit_folder_url', files: 'vsl_edit_files', c: '#2E69E0', bg: '#EFF6FF', border: '#C7DBFB', voomly: true },
];
// Las 6 categorías estándar de recursos del CLIENTE (Matías 2026-07-18): sirven para
// todos sus funnels, pueden ser foto o video. La migración del Drive ordena el material
// en estas carpetas. "Sin clasificar" recibe lo que no se pudo ubicar solo.
const CLIENT_CATS = [
  { key: 'autoridad',   label: 'Fotos de Autoridad',   c: '#2E69E0', bg: '#EAF1FF' },
  { key: 'estilo_vida', label: 'Fotos Estilo de vida', c: '#0E7490', bg: '#E7FBFE' },
  { key: 'branding',    label: 'Branding (colores, logo)', c: '#7C3AED', bg: '#F3EFFF' },
  { key: 'productos',   label: 'Foto de productos',    c: '#15803D', bg: '#E8F7EE' },
  { key: 'empresa',     label: 'Material de la empresa', c: '#B45309', bg: '#FFF7ED' },
  // Material de anuncios y VSL a nivel cliente (cuando no se pudo asignar avatar).
  { key: 'ad_rec',      label: 'Anuncios · grabaciones', c: '#C2410C', bg: '#FFF3EC' },
  { key: 'ad_edit',     label: 'Anuncios · ediciones',   c: '#EA580C', bg: '#FFF3EC' },
  { key: 'vsl_rec',     label: 'VSL · grabaciones',      c: '#4338CA', bg: '#EEF0FF' },
  { key: 'vsl_edit',    label: 'VSL · ediciones',        c: '#6D28D9', bg: '#F3EFFF' },
  { key: 'sin_clasif',  label: 'Sin clasificar',       c: '#6B7280', bg: '#F1F3F7' },
];
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

// Temperatura del avatar: pill compacto con menú. Vacío = "Temperatura" en hueco, para
// que se vea que falta definirla (como el resto de los campos de la maqueta).
function AvatarTempPill({ temp, onChange }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);
  const cfg = AVATAR_TEMP[temp];
  const toggle = () => {
    if (!open && btnRef.current) { const r = btnRef.current.getBoundingClientRect(); setPos({ left: r.left, top: r.bottom + 4 }); }
    setOpen(o => !o);
  };
  return (
    <span className="inline-block shrink-0" onClick={e => e.stopPropagation()}>
      <button ref={btnRef} onClick={toggle} title={cfg ? cfg.label : 'Definí la temperatura del avatar'}
        className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[10.5px] font-bold cursor-pointer whitespace-nowrap"
        style={cfg ? { background: cfg.bg, color: cfg.color, border: 'none' } : { background: 'transparent', color: '#AEB4BF', border: '1px dashed #D0D5DD' }}>
        {cfg && <span className="w-[6px] h-[6px] rounded-full" style={{ background: cfg.dot }} />}{cfg ? cfg.short : 'Temperatura'}<ChevronDown size={9} />
      </button>
      {open && pos && (<>
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div className="fixed bg-white border border-[#E2E5EB] rounded-lg shadow-lg z-[61] min-w-[190px] overflow-hidden py-0.5" style={{ left: pos.left, top: pos.top }}>
          {AVATAR_TEMP_OPTS.map(o => { const c = AVATAR_TEMP[o]; return (
            <button key={o} onClick={() => { onChange(temp === o ? null : o); setOpen(false); }} className="flex items-center gap-2 w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-[#F5F7FF] bg-transparent border-none cursor-pointer font-medium" style={{ color: c.color }}><span className="w-2 h-2 rounded-full" style={{ background: c.dot }} />{c.label}</button>
          ); })}
        </div>
      </>)}
    </span>
  );
}

// Grid de la tabla de funnels (mismo layout que el mockup; scroll horizontal si no entra).
// La fila cerrada responde UNA pregunta: que es y que le falta. Todo lo demas
// (enlaces, tracking, avatares) vive adentro, al abrirla.
// Antes eran 6 columnas: Funnel / Estado / Enlaces / Tracking / Modificado / v.
// Los chips de enlaces y tracking se fueron: los mismos campos ya se editan
// adentro, asi que en la fila solo eran ruido que competia con el nombre.
const GRID = 'minmax(280px,2fr) 118px minmax(170px,1.3fr) 34px';

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

// Color de cada paso — el MISMO que su sección en el DEL (STAGE_COLOR del handoff), para
// que el riel, la tarjeta de la tarea y el documento se lean como una sola cosa.
const STAGE_LINE_COLOR = {
  estrategia: { c: '#0891B2', bg: '#ECFEFF' },
  del:        { c: '#6B7280', bg: '#F0F2F5' },
  avatares:   { c: '#F97316', bg: '#FFF7ED' },
  vsl:        { c: '#16A34A', bg: '#ECFDF5' },
  anuncios:   { c: '#5B7CF5', bg: '#EEF2FF' },
  landing:    { c: '#8B5CF6', bg: '#F5F3FF' },
};

// El riel del funnel en UNA línea (maqueta): cada paso es punto + nombre; los listos se
// apagan con tilde verde; el próximo pendiente late. A la derecha, "Próximo: X" y "N% listo".
// El riel dice DÓNDE ESTÁ el funnel; el tablero de abajo dice QUÉ HACER. No filtra el tablero
// porque la tarea todavía no tiene "paso" como campo (decisión pendiente de Matías).
function FunnelRail({ stages }) {
  if (!stages || !stages.length) return null;
  const done = stages.filter(s => s.status === 'listo').length;
  const pct = Math.round((done / stages.length) * 100);
  const firstPend = stages.find(s => s.status === 'pendiente') || null;
  return (
    <div className="flex items-center gap-3 flex-wrap py-3 px-[18px] border-b border-[#EDF0F5] bg-white">
      <div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
        {stages.map((s, i) => {
          const col = STAGE_LINE_COLOR[s.stage] || { c: '#9098A4', bg: '#F0F2F5' };
          const isDone = s.status === 'listo';
          const isBlocked = s.status === 'bloqueado';
          const isNext = firstPend && s.stage === firstPend.stage;
          const sub = s.substate ? SUBSTATE[s.substate]?.label : null;
          return (
            <span key={s.stage} className="inline-flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-[#DCE0E7] shrink-0" strokeWidth={2.4} />}
              <span title={`${s.stage_label} — ${s.detail}`}
                className="inline-flex items-center gap-1.5 py-[5px] px-2.5 rounded-lg text-[12px] font-semibold whitespace-nowrap cursor-default"
                style={{
                  background: isNext ? col.bg : isDone ? '#F7F8FA' : '#fff',
                  color: isDone ? '#9CA3AF' : isBlocked ? '#AEB4BF' : col.c,
                  border: `1px solid ${isNext ? col.c : '#EDF0F5'}`,
                  boxShadow: isNext ? `0 0 0 2px ${col.bg}` : 'none',
                }}>
                {isDone
                  ? <span className="inline-flex items-center justify-center w-[15px] h-[15px] rounded-full bg-[#22C55E] text-white shrink-0"><Check size={10} strokeWidth={3.5} /></span>
                  : isBlocked
                    ? <Lock size={11} strokeWidth={2.2} className="shrink-0" />
                    : <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: col.c, animation: isNext ? 'mkPulse 1.8s ease-in-out infinite' : 'none' }} />}
                {STAGE_SHORT[s.stage] || s.stage_label}
                {!isDone && !isBlocked && sub && <span className="opacity-70 font-medium">· {sub}</span>}
              </span>
            </span>
          );
        })}
      </div>
      <div className="flex items-center gap-3 shrink-0">
        {firstPend && (
          <span className="text-[11.5px] text-[#6B7280]" title={firstPend.detail}>
            <b className="text-[#3F4653] font-semibold">Próximo:</b> {STAGE_SHORT[firstPend.stage] || firstPend.stage_label}
          </span>
        )}
        <span className="text-[12.5px] text-[#1A1D26]"><b className="font-extrabold">{pct}%</b> <span className="text-[#9098A4]">listo</span></span>
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

// Las páginas del funnel (strategy_pages.pages_copy). Salen del DEL igual que el guión de VSL:
// candado, solo lectura. Es el RECORRIDO DE LA PERSONA después del anuncio, y lo que leen los
// agentes de marketing para alinear el copy.
// La pre-landing va primera y a lo ancho: es la más importante (la primera pantalla que ve el
// lead apenas hace clic, así que su titular es el que tiene que pegar con el anuncio).
// No está el feedback a propósito: es lo que el EQUIPO anota sobre las páginas, no algo que la
// persona vea. No es parte del recorrido.
const PAGE_SLOTS = [
  { slug: 'prelanding', label: 'Pre-landing', wide: true },
  { slug: 'landing', label: 'Landing VSL' },
  { slug: 'formulario', label: 'Formulario' },
  { slug: 'thankyou', label: 'Thank You Page' },
  { slug: 'testimonios', label: 'Testimonios' },
];

// Preview de guión/descripción con botón "Ampliar". Si `locked`, es solo-lectura (sale del DEL):
// muestra un candadito y abre un visor, no un editor.
// `lockHint` = de dónde sale y con qué botón se actualiza. Por defecto, el generador de
// avatares (que es de donde salen la spec y los copys); las páginas tienen su propio botón.
function ScriptPreview({ Icon, color, label, text, onOpen, emptyHint, locked, lockHint }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em]" style={{ color }}>
          <Icon size={12} />{label}
          {locked && <span className="inline-flex items-center gap-1 py-0.5 px-1.5 rounded-full text-[9px] font-bold normal-case tracking-normal" style={{ background: '#F1F3F7', color: '#9098A4', border: '1px solid #E7EAF0' }} title={lockHint || 'Sale del DEL. Se actualiza con “Generar avatares del DEL”.'}><Lock size={9} strokeWidth={2.6} />del DEL</span>}
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

// Selector MANUAL de carpeta del Drive (fallback cuando "Traer carpeta" no la encuentra sola).
// Muestra SOLO lo que cuelga de una carpeta "Anuncios" (dentro de Anuncios › Grabaciones/Ediciones/
// Terminados…), con la RUTA completa (Estrategia 2 › Anuncios › Editados) y la fecha, prioriza las de
// "ediciones/editado" que matcheen el avatar, y deja buscar. Así el equipo no tiene que ir al Drive.
function FolderPicker({ clientId, avatarName, current, onPick, onClose, kind = 'edit' }) {
  const isRec = kind === 'rec';
  // Bucket que se prioriza según qué carpeta se busca (grabaciones vs ediciones).
  const buckRe = isRec ? /grabaci|grabado|record|crudo|raw/i : /edici|editad|termina|final|listo/i;
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const data = await sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&node_type=eq.folder&select=id,name,web_url,parent_id,is_root,modified_time&order=name`);
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, [clientId]);
  const byId = useMemo(() => { const m = {}; for (const r of (rows || [])) m[r.id] = r; return m; }, [rows]);
  // Cadena de ancestros (de arriba hacia la carpeta), sin la raíz del cliente.
  const chainOf = useCallback((r) => {
    const segs = []; let cur = r, g = 0;
    while (cur && g++ < 25) { if (!cur.is_root) segs.unshift(cur); cur = cur.parent_id ? byId[cur.parent_id] : null; }
    return segs;
  }, [byId]);
  const insideAnuncios = useCallback((r) => chainOf(r).slice(0, -1).some(n => /anuncios/i.test(n.name)), [chainOf]);
  const aTokens = useMemo(() => new Set(normVoomly(avatarName || '').split(' ').filter(t => t.length > 2)), [avatarName]);
  const scored = useMemo(() => {
    const all = rows || [];
    // Solo lo que cuelga de "Anuncios"; si no hay nada (naming raro), caemos a todas para no dejar vacío.
    let pool = all.filter(insideAnuncios);
    const scoped = pool.length > 0;
    if (!scoped) pool = all;
    const list = pool.map(r => {
      const chain = chainOf(r);
      const ancestors = chain.slice(0, -1);
      const inEdit = ancestors.some(n => buckRe.test(n.name));
      const n = normVoomly(r.name);
      let score = 0;
      if (inEdit || buckRe.test(n)) score += 3;
      for (const t of aTokens) if (n.includes(t)) score += 2;
      const path = ancestors.map(a => a.name);
      return { r, n, score, path };
    });
    const ql = normVoomly(q);
    const filtered = ql ? list.filter(x => x.n.includes(ql) || normVoomly(x.path.join(' ')).includes(ql)) : list;
    filtered.sort((a, b) => b.score - a.score || a.n.localeCompare(b.n));
    return { list: filtered, scoped };
  }, [rows, aTokens, q, chainOf, insideAnuncios, isRec]);
  const fmtDay = (d) => { if (!d) return ''; try { return new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch { return ''; } };
  return (
    <Modal open onClose={onClose} title={`Elegir la carpeta de ${isRec ? 'grabaciones' : 'ediciones'} · ${avatarName || 'avatar'}`} maxWidth={660}
      footer={<div className="flex justify-between items-center gap-2 w-full">
        <span className="text-[11px] text-[#9098A4]">{scored.scoped ? 'Carpetas dentro de “Anuncios”.' : 'No encontré “Anuncios”: muestro todas.'} Elegí dónde están los anuncios {isRec ? 'grabados' : 'editados'}.</span>
        <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
      </div>}>
      <div className="p-1">
        <div className="relative mb-3">
          <SearchIcon size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9098A4] pointer-events-none" />
          <input value={q} onChange={e => setQ(e.target.value)} autoFocus placeholder="Buscar carpeta por nombre o ruta…" className="w-full py-2.5 pl-9 pr-3 border border-[#E2E5EB] rounded-[9px] text-[13px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
        </div>
        {rows === null
          ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">Cargando carpetas del Drive…</div>
          : scored.list.length === 0
            ? <div className="text-[12.5px] text-[#9098A4] py-8 text-center">No hay carpetas{q ? ' para esa búsqueda' : ''}. Sincronizá la pestaña Carpetas.</div>
            : <div className="flex flex-col gap-2 max-h-[52vh] overflow-auto pr-1">
                {scored.list.slice(0, 80).map(({ r, score, path }) => {
                  const isCur = r.web_url && r.web_url === current;
                  const suggested = score >= 3;
                  const crumb = path.slice(-3).join(' › ');
                  const day = fmtDay(r.modified_time);
                  return (
                    <div key={r.id} className="flex items-center gap-2.5 border rounded-[10px] py-2.5 px-3" style={{ borderColor: isCur ? '#C9F0D8' : suggested ? '#E4DBFF' : '#EDF0F5', background: isCur ? '#F4FDF7' : suggested ? '#F7F3FF' : '#fff' }}>
                      <FolderOpen size={15} className="shrink-0" style={{ color: suggested ? '#7C3AED' : '#9098A4' }} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[12.5px] font-semibold text-[#1A1D26] truncate" title={r.name}>{r.name}</div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {crumb && <span className="text-[10.5px] text-[#9098A4] truncate max-w-[320px]" title={path.join(' › ')}>{crumb}</span>}
                          {day && <span className="text-[10px] text-[#B0B6C0]">· {day}</span>}
                        </div>
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

// Cuenta HOOKS y TEXTOS BASE dentro de los copys de anuncios (av.ad_script) que salen del DEL.
// Convención Korex: cada cuerpo va como "Texto base 1)" y cada gancho como "Hook 1)". Si el DEL
// no usa esos rótulos, cae a contar bloques "ANUNCIO" como piezas completas (0 recortes).
function countPieces(adScript) {
  const t = String(adScript || '');
  if (!t.trim()) return { hooks: 0, base: 0 };
  const hooks = (t.match(/(?:^|[\n\r])\s*hook\s*\d*\s*[)\-:.]/gi) || []).length;
  const base = (t.match(/(?:^|[\n\r])\s*texto\s*base\s*\d*\s*[)\-:.]/gi) || []).length;
  if (hooks || base) return { hooks, base };
  // Fallback: "ANUNCIO" (singular, no "Anuncios") como pieza completa suelta.
  const anuncios = (t.match(/\banuncio\b/gi) || []).length;
  return { hooks: anuncios, base: anuncios };
}

// Modal del mensaje para el editor: muestra el mensaje ya armado (editable) + botón "Copiar".
// El texto se puede retocar antes de copiar (algunas partes son variables: Loom, estilo, pestañas).
function EditorMessageModal({ initial, onClose }) {
  const [text, setText] = useState(initial || '');
  const [done, setDone] = useState(false);
  return (
    <Modal open onClose={onClose} title="Mensaje para el editor" maxWidth={760}
      footer={<div className="flex justify-between items-center gap-2 w-full">
        <span className="text-[11px] text-[#9098A4]">Revisá y completá lo que esté entre corchetes […] antes de enviarlo.</span>
        <div className="flex gap-2">
          <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cerrar</button>
          <button onClick={() => { copyText(text); setDone(true); setTimeout(() => setDone(false), 1500); }} className="inline-flex items-center gap-1.5 text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark">{done ? <Check size={14} strokeWidth={3} /> : <Clipboard size={14} />}{done ? '¡Copiado!' : 'Copiar mensaje'}</button>
        </div>
      </div>}>
      <textarea value={text} onChange={e => setText(e.target.value)} className="w-full py-3.5 px-4 border border-[#E2E5EB] rounded-xl text-[12.5px] text-[#1A1D26] bg-[#FBFCFE] resize-y outline-none focus:border-blue leading-relaxed" style={{ minHeight: '56vh', whiteSpace: 'pre-wrap', fontFamily: 'ui-monospace,SFMono-Regular,Menlo,monospace' }} />
    </Modal>
  );
}

// Dos modos:
//  · lista (navigate=true): la fila es un boton que ENTRA al funnel (onOpen). No hay
//    desplegable — al clickear se va a la pantalla del funnel.
//  · pantalla (forcePage=true): el cuerpo del funnel (tareas, DEL, config, avatares)
//    se muestra entero, sin cabecera clickeable. La navegacion la maneja el padre.
function FunnelRow({ f, stages, delText = '', delDocUrl = '', delDocId = '', clientId, clientName = '', onUpdate, onDelete, onTrack, onRefreshPage, last, navigate = false, onOpen, onBack, forcePage = false }) {
  const { currentUser } = useApp();
  const meId = currentUser?.id || null;
  const [note, setNote] = useState(null);
  const [open, setOpen] = useState(false);
  const isOpen = forcePage || open; // en pantalla, el cuerpo siempre se ve
  const [voomlyOpen, setVoomlyOpen] = useState(false);
  const [folderPick, setFolderPick] = useState(null); // { av, kind } — carpeta que se elige a mano
  const [editorMsg, setEditorMsg] = useState(null); // texto del mensaje para el editor (o null)
  const [delOpen, setDelOpen] = useState(false);    // lector del DEL a pantalla completa
  const [clientResTick, setClientResTick] = useState(0); // sube al mover un recurso → recarga todas las carpetas
  const st = FUNNEL_STATUS[f.status] || FUNNEL_STATUS.activa;
  const avatars = Array.isArray(f.avatars) ? f.avatars : [];
  const events = normEvents(f.conversion_events);

  // El primer paso PENDIENTE: es lo unico del riel que la fila cerrada necesita mostrar.
  // Si no hay ninguno, el funnel esta terminado.
  const nextStage = (stages || []).find(s => s.status === 'pendiente') || null;

  const setAvatar = (id, patch) => onUpdate(f.id, { avatars: avatars.map(a => a.id === id ? { ...a, ...patch } : a) });

  // Carpetas por avatar (Anuncios › Grabaciones|Ediciones › <avatar>). SON DOS COSAS DISTINTAS:
  //  · TRAER (mode 'read'): solo VINCULA las carpetas que ya existen en el Drive sincronizado y lee
  //    su estado (grabado/editado). No crea nada → cero riesgo.
  //  · CREAR (mode 'create'): arma la estructura que falte (vía Apps Script). Acción explícita, aparte.
  // En ambos casos mergeamos los links/conteos en cada avatar.
  const [folderBusy, setFolderBusy] = useState('idle'); // idle | read | create
  const runFolders = async (mode, target = 'anuncios') => {
    const named = avatars.filter(a => (a.name || '').trim());
    if (!named.length) { window.alert('Poné el nombre de al menos un avatar primero.'); return; }
    setFolderBusy(target === 'vsl' ? 'vsl' : mode);
    try {
      const { data, error } = await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode, target } });
      if (error || !data?.ok) { window.alert(data?.hint || `No se pudieron ${mode === 'read' ? 'traer' : 'crear'} las carpetas` + (data?.error ? ` (${data.error})` : '')); return; }
      if (mode === 'read' && data.found === false) { window.alert('No encontré las carpetas por avatar en el Drive. Sincronizá la pestaña Carpetas, o usá "Crear carpetas" para armarlas.'); return; }
      const merged = avatars.map(a => {
        const info = data.byName?.[(a.name || '').trim()];
        if (!info) return a;
        return target === 'vsl'
          ? { ...a, vsl_rec_folder_url: info.rec_folder_url, vsl_edit_folder_url: info.edit_folder_url, vsl_rec_files: info.rec_files, vsl_edit_files: info.edit_files }
          : { ...a, ...info };
      });
      onUpdate(f.id, { avatars: merged });
    } catch { window.alert(`Error al ${mode === 'read' ? 'traer' : 'crear'} las carpetas.`); }
    finally { setFolderBusy('idle'); }
  };
  const fetchFolders = () => runFolders('read', 'anuncios');
  const createFolders = () => runFolders('create', 'anuncios');
  const createVslFolders = () => runFolders('create', 'vsl');
  // Trae la carpeta de GRABACIONES ('rec') o EDICIONES ('edit') de UN avatar: intenta encontrarla
  // sola (mode read); si no la encuentra, abre el selector manual para elegirla sin ir al Drive.
  const bringFolder = async (av, kind) => {
    const name = (av.name || '').trim();
    if (!name) { window.alert('Poné el nombre del avatar primero.'); return; }
    const field = kind === 'rec' ? 'rec_folder_url' : 'edit_folder_url';
    setFolderBusy('read');
    try {
      const { data, error } = await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode: 'read' } });
      if (!error && data?.ok) {
        const merged = avatars.map(a => { const info = data.byName?.[(a.name || '').trim()]; return info ? { ...a, ...info } : a; });
        onUpdate(f.id, { avatars: merged });
        if (data.byName?.[name]?.[field]) { setFolderBusy('idle'); return; } // la encontró sola ✓
      }
    } catch { /* cae al selector manual */ }
    setFolderBusy('idle');
    setFolderPick({ av, kind }); // no la encontró → elegir a mano
  };
  const namedAvatars = avatars.filter(a => (a.name || '').trim());
  const foldersReady = namedAvatars.length > 0 && namedAvatars.every(a => a.rec_folder_url && a.edit_folder_url);

  // ── Mensaje para el editor ──────────────────────────────────────────────────
  // Arma el mensaje que se le manda al editor para editar los anuncios + VSL. Rellena TODO lo que
  // el sistema conoce: guiones (=DEL), pestañas (Anuncios/VSL), carpeta de Recursos + Branding,
  // estilo del cliente (redactado por la personalidad → clients.editor_style) y las carpetas de
  // subida por avatar. Las piezas se DETECTAN SOLAS de los copys (countPieces): completas = textos
  // base; recortadas = hooks − base. Lo ÚNICO que queda [entre corchetes] es el Loom (cambia siempre).
  const buildEditorMessage = ({ recursosUrl = '', brandingUrl = '', editorStyle = '' } = {}) => {
    const per = namedAvatars.map((a, i) => {
      const { hooks, base } = countPieces(a.ad_script);
      const variaciones = Math.max(0, hooks - base);
      const total = base + variaciones; // = hooks cuando hooks ≥ base
      return { n: i + 1, name: (a.name || '').trim(), hooks, base, variaciones, total, edit: a.edit_folder_url || '', vslEdit: a.vsl_edit_folder_url || '' };
    });
    const totBase = per.reduce((s, p) => s + p.base, 0);
    const totVar = per.reduce((s, p) => s + p.variaciones, 0);
    const totTotal = per.reduce((s, p) => s + p.total, 0);
    const porAvatar = per.map(p => `  • Avatar ${p.n} (${p.name || 's/nombre'}): ${p.total} en total → ${p.base} completas y ${p.variaciones} recortadas${p.total === 0 ? '   [revisá los copys de este avatar]' : ''}`).join('\n');
    const subirAnuncios = per.length
      ? per.map(p => `  Avatar ${p.n} (${p.name || 's/nombre'}) → ${p.edit || '[pegá la carpeta de este avatar]'}`).join('\n')
      : '  [definí los avatares]';
    const hasVsl = per.some(p => p.vslEdit);
    const subirVsl = hasVsl
      ? per.filter(p => p.vslEdit).map(p => `  ${p.name || 's/nombre'} → ${p.vslEdit}`).join('\n')
      : '  [pegá la carpeta de la VSL editada]';
    const estilo = editorStyle
      ? `Estilo del cliente: ${editorStyle}`
      : 'Estilo del cliente: [generá la personalidad del cliente para que se complete solo]';
    return `Guiones: ${delDocUrl || '[pegá el link del documento de guiones]'}. Las partes en negrita son las que hay que resaltar en pantalla.
Pestaña en la que se encuentra los guiones de anuncios: Anuncios
Pestaña en la que se encuentra los guiones de VSL: VSL

Carpeta de Recursos (fotos/videos del cliente): ${recursosUrl || '[pegá la carpeta de Recursos]'}.
Branding (colores, logo): ${brandingUrl || '[pegá la carpeta de Branding]'}.

Loom explicativo: [link]. Ahí te explico qué grabación va con cuál y qué unir.

${estilo}
Piezas a entregar: ${totTotal} en total → ${totBase} completas y ${totVar} recortadas (mismo cuerpo con distintos hooks).
Por avatar:
${porAvatar}
Formato: MP4 4k

Dónde subir:
Anuncios en esta carpeta:
${subirAnuncios}

y VSL en esta otra:
${subirVsl}
*No subas nada por fuera de esas carpetas.*
¿Para cuándo podés tenerlo listo, siendo realista? Necesito una fecha concreta.
Importante: trabajamos con plazos que hay que cumplir. Si en algún momento ves que no llegás, avisame con antelación. Si pasan 24 horas sin novedades tuyas, tengo que reasignar el pedido.
Quedo a la espera de tu respuesta`;
  };
  // Al abrir, busca la carpeta de Recursos + Branding del cliente y su estilo redactado, y arma todo.
  const [msgBusy, setMsgBusy] = useState(false);
  const openEditorMsg = async () => {
    setMsgBusy(true);
    let recursosUrl = '', brandingUrl = '', editorStyle = '';
    try {
      const [recRes, rootRows, cliRows] = await Promise.all([
        supabase.rpc('cerebro_recursos_cliente', { p_client_id: clientId }),
        sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&node_type=eq.folder&name=ilike.*recursos*&is_root=eq.false&select=name,web_url,depth&order=depth`),
        sbFetch(`clients?id=eq.${encodeURIComponent(clientId)}&select=editor_style`),
      ]);
      const subs = Array.isArray(recRes?.data) ? recRes.data : [];
      brandingUrl = (subs.find(r => /brand|logo/i.test(r.name || ''))?.url) || '';
      recursosUrl = (Array.isArray(rootRows) && rootRows[0]?.web_url) || '';
      editorStyle = (Array.isArray(cliRows) && cliRows[0]?.editor_style) || '';
    } catch { /* si algo falla, quedan los placeholders */ }
    setMsgBusy(false);
    setEditorMsg(buildEditorMessage({ recursosUrl, brandingUrl, editorStyle }));
  };

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

  // ── Copy de las páginas del funnel (sale del DEL, solo lectura) ──
  // Colapsado por defecto: el contador del header ya dice todo sin comerse alto. Se muestran
  // las 6 aunque falten: ver el hueco es la señal de que hay que arreglar el DEL.
  const [copyOpen, setCopyOpen] = useState(false);
  const pagesCopy = (f.pages_copy && typeof f.pages_copy === 'object' && !Array.isArray(f.pages_copy)) ? f.pages_copy : {};
  const pagesFound = PAGE_SLOTS.filter(p => pagesCopy[p.slug]?.text).length;
  // En el título del visor va la pestaña real del DEL: si la extracción se equivocó de sección,
  // acá se ve de dónde salió.
  const openPageCopy = (slot) => setNote({
    title: `${slot.label} · ${f.name || 'Funnel'}${pagesCopy[slot.slug]?.title ? ` — «${pagesCopy[slot.slug].title}» del DEL` : ''}`,
    initial: pagesCopy[slot.slug]?.text || '', readOnly: true,
  });

  // Traer el copy de las páginas del DEL. Pasada dedicada: la IA ve un vistazo de cada pestaña
  // y deduce cuál es cada página (los nombres varían y el copy puede estar repartido). Si una
  // está vacía o dice "en construcción", la deja afuera en vez de forzarla.
  const [pagesBusy, setPagesBusy] = useState(false);
  const syncPages = async (e) => {
    e?.stopPropagation?.(); // el header togglea el acordeón; el botón no debe hacerlo
    if (!delText) { window.alert('No hay DEL sincronizado para esta estrategia. Tocá “Sincronizar contexto” primero.'); return; }
    if (pagesFound && !window.confirm('La IA va a releer el DEL y REEMPLAZAR el copy de las páginas por lo que encuentre ahora. ¿Seguir?')) return;
    setPagesBusy(true);
    // Red de seguridad: guardamos lo que hay antes de que la IA lo pise (lo restaura "Deshacer").
    try { await onUpdate(f.id, { pages_copy_backup: f.pages_copy || null, backup_at: new Date().toISOString() }); } catch { /* noop */ }
    try {
      const { data, error } = await supabase.functions.invoke('cerebro-generate-avatars', {
        body: { client_id: clientId, strategy_id: f.strategy_id, del_doc_id: f.del_doc_id || null, funnel_id: f.id, funnel_name: f.name || '', mode: 'pages' },
      });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { window.alert(payload?.detail || error?.message || 'No pude traer el copy de las páginas.'); return; }
      await onRefreshPage?.(f.id);
      setCopyOpen(true); // que se vea el resultado sin tener que abrirlo a mano
    } catch (e2) { window.alert(String(e2?.message || e2)); }
    finally { setPagesBusy(false); }
  };
  // La pasada de páginas PISA todo (si la IA dice que una no está, tiene que desaparecer),
  // así que necesita su propia vuelta atrás.
  const canUndoPages = !!f.pages_copy_backup;
  const undoPages = (e) => {
    e?.stopPropagation?.();
    if (!canUndoPages) return;
    if (!window.confirm('¿Restaurar el copy de las páginas que había ANTES de la última lectura del DEL?')) return;
    onUpdate(f.id, { pages_copy: f.pages_copy_backup });
  };

  const addAvatar = () => onUpdate(f.id, { avatars: [...avatars, { id: rid('av'), name: '', audience: '', status: 'En grabación', ad_url: '' }] });
  const removeAvatar = (id) => onUpdate(f.id, { avatars: avatars.filter(a => a.id !== id) });
  // Borrar avatar CON DESHACER (Ctrl+Z de datos): guarda el avatar borrado unos segundos
  // y lo puede restaurar en su lugar. Las carpetas del Drive NO se borran solas a
  // propósito (podrían tener grabaciones); sus links se van con el avatar.
  const [deletedAv, setDeletedAv] = useState(null); // { av, idx }
  const delAvTimer = useRef(null);
  const removeAvatarUndoable = (av) => {
    const idx = avatars.findIndex(a => a.id === av.id);
    onUpdate(f.id, { avatars: avatars.filter(a => a.id !== av.id) });
    setDeletedAv({ av, idx });
    clearTimeout(delAvTimer.current);
    delAvTimer.current = setTimeout(() => setDeletedAv(null), 12000);
  };
  const undoRemoveAvatar = () => {
    if (!deletedAv) return;
    const next = [...avatars];
    next.splice(Math.min(deletedAv.idx, next.length), 0, deletedAv.av);
    onUpdate(f.id, { avatars: next });
    setDeletedAv(null);
  };

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
        body: { client_id: clientId, strategy_id: f.strategy_id, del_doc_id: f.del_doc_id || null, funnel_id: f.id, funnel_name: f.name || '', mode },
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
  // Deshacer: restaura los avatares + VSL que había ANTES de la última generación (red de
  // seguridad). El copy de las páginas tiene su propio deshacer: lo genera otro botón.
  const canUndo = Array.isArray(f.avatars_backup);
  const undoGenerate = () => {
    if (!canUndo) return;
    if (!window.confirm('¿Restaurar los avatares y la VSL que había ANTES de la última generación? Se pierde lo que generó la IA en esa corrida.')) return;
    onUpdate(f.id, { avatars: f.avatars_backup, vsl_script: (f.vsl_script_backup ?? f.vsl_script) || null });
  };

  // Traer SOLO el guión del VSL de este funnel desde el DEL (por código, SIN IA → gratis).
  const [vslBusy, setVslBusy] = useState(false);
  const syncVsl = async () => {
    if (!delText) { window.alert('No hay DEL sincronizado para esta estrategia. Tocá “Sincronizar contexto” primero.'); return; }
    setVslBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('cerebro-generate-avatars', {
        body: { client_id: clientId, strategy_id: f.strategy_id, del_doc_id: f.del_doc_id || null, funnel_id: f.id, funnel_name: f.name || '', mode: 'vsl' },
      });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { window.alert(payload?.detail || error?.message || 'No pude traer el guión del VSL.'); return; }
      await onRefreshPage?.(f.id);
    } catch (e) { window.alert(String(e?.message || e)); }
    finally { setVslBusy(false); }
  };

  // Los chips de tracking (Pixel · Clarity · N eventos) se fueron: eran un semaforo
  // que decia SI el dato estaba, sin decir cual. FunnelConfigBlock muestra el valor
  // y el hueco, que es estrictamente mas informacion en el mismo lugar.

  // Crear un avatar DESDE el DEL: el título que insertás en el documento es el avatar.
  // Al crearlo, se registra en el funnel (por orden) y se le crean AUTOMÁTICAMENTE las
  // carpetas del Drive (anuncios grabación/edición + VSL grabación/edición), que es lo
  // que hay que diferenciar bien. Después re-lee los links/conteos.
  const onAvatarCreate = async (rawName) => {
    const name = (rawName || '').trim();
    if (!name) return;
    // Si ya existe un avatar con ese nombre, no lo duplico.
    if (avatars.some(a => (a.name || '').trim().toLowerCase() === name.toLowerCase())) return;
    const next = [...avatars, { id: rid('av'), name, status: 'En grabación' }];
    await onUpdate(f.id, { avatars: next }); // persiste primero (el edge fn lee de la base)
    try {
      await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode: 'create', target: 'anuncios' } });
      await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode: 'create', target: 'vsl' } });
      const { data } = await supabase.functions.invoke('avatar-folders', { body: { funnel_id: f.id, mode: 'read' } });
      if (data?.ok && data.byName) {
        const merged = next.map(a => {
          const info = data.byName[(a.name || '').trim()];
          const vsl = info ? { vsl_rec_folder_url: info.vsl_rec_folder_url, vsl_edit_folder_url: info.vsl_edit_folder_url, vsl_rec_files: info.vsl_rec_files, vsl_edit_files: info.vsl_edit_files } : {};
          return info ? { ...a, ...info, ...vsl } : a;
        });
        onUpdate(f.id, { avatars: merged });
      }
    } catch { /* si falla crear carpetas, el avatar igual quedó registrado */ }
  };

  // ── Bloques que la maqueta movió del funnel al DEL ───────────────────────────
  // En PANTALLA (forcePage) el funnel muestra SOLO el riel + tareas; estos bloques
  // (config, VSL, copy, avatares) viven adentro del DEL, en sus pestañas. Se definen
  // como nodos acá (con todos sus handlers en scope) y se pasan a DelWorkspace.
  const funnelConfigNode = <FunnelConfigBlock f={f} onUpdate={onUpdate} events={events} onTrack={onTrack} />;
  const funnelEstrategiaNode = <FunnelEstrategiaBlock f={f} onUpdate={onUpdate} />;

  const funnelRecursosNode = (
    <div className="flex flex-col gap-3.5">
      {/* Barra de acciones de carpetas del Drive quitada a pedido (no aportaba). */}
      {genActive && (
        <div className="flex items-center gap-2 text-[11.5px] font-semibold py-2.5 px-3 rounded-lg" style={{ background: '#FDF2F8', color: '#BE185D', border: '1px solid #FBCFE8' }}>
          <RefreshCw size={13} className="animate-spin shrink-0" />La IA está leyendo el DEL y armando los avatares… unos segundos.
        </div>
      )}
      {gen.status === 'error' && (
        <div className="flex items-start gap-2 text-[11.5px] py-2.5 px-3 rounded-lg" style={{ background: '#FEF2F2', color: '#B91C1C', border: '1px solid #FECACA' }}>
          <X size={13} className="shrink-0 mt-px" /><span>{gen.msg || 'No pude generar los avatares.'}</span>
        </div>
      )}

      {deletedAv && (
        <div className="flex items-center justify-between gap-3 flex-wrap py-2.5 px-3.5 rounded-xl border" style={{ background: '#FFFBEB', borderColor: '#FBE6BE' }}>
          <span className="text-[12px] font-medium text-[#78350F]">Borraste el avatar <b>{(deletedAv.av.name || 's/nombre')}</b>. Sus carpetas del Drive no se tocaron.</span>
          <button onClick={undoRemoveAvatar} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#E7C98A] bg-white text-[#B45309] text-[12px] font-semibold cursor-pointer hover:bg-[#FEF9E7]"><RefreshCw size={12} style={{ transform: 'scaleX(-1)' }} />Deshacer</button>
        </div>
      )}

      {avatars.length === 0 && !genActive && (
        <div className="rounded-xl border border-dashed border-[#E2E5EB] bg-white py-8 px-4 text-center text-[12.5px] text-[#9098A4]">Este funnel todavía no tiene avatares. Generalos del DEL con el botón de arriba.</div>
      )}

      {/* Una tarjeta por avatar, con sus 4 carpetas (como la maqueta): verde si tiene
          archivos, gris si está vacía; un clic abre la carpeta en el Drive. */}
      {avatars.map((av, i) => {
        const nombre = (av.name || '').trim();
        return (
          <div key={av.id} className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
            <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#FCE7F3] text-[#DB2777] text-[12px] font-bold shrink-0">{i + 1}</span>
              <span className="text-[13.5px] font-bold truncate flex-1 min-w-0" style={{ color: nombre ? '#1A1D26' : '#DC2626' }}>{nombre || 'Falta el nombre del avatar'}</span>
              <AvatarTempPill temp={av.temp} onChange={t => setAvatar(av.id, { temp: t })} />
              <AvatarStatusPill status={av.status} onChange={s => setAvatar(av.id, { status: s })} />
              <button onClick={() => removeAvatarUndoable(av)} title="Borrar este avatar (se puede deshacer)" className="inline-flex items-center justify-center w-7 h-7 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer shrink-0 hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={13} /></button>
            </div>
            {/* Las 4 carpetas del avatar, alojadas en la plataforma: se suben los archivos
                acá mismo (no más link de Drive). Un clic abre la carpeta y ahí se ven. */}
            <div className="p-2.5 flex flex-col gap-1.5">
              {VID_BUCKETS.map(b => (
                <FunnelResourceFolder key={b.key} strategyId={f.strategy_id} clientId={clientId} avatarId={av.id}
                  bucketKey={b.key} label={b.label} color={b.c} bg={b.bg} by={meId}
                  extra={b.voomly ? <span className="text-[9.5px] font-bold py-0.5 px-1.5 rounded-full" style={{ background: '#FDF2F8', color: '#DB2777' }}>Voomly</span> : null} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Testimonios: van POR FUNNEL (no al apartado general del cliente). Una carpeta por
          este funnel, compartida por todos sus avatares. */}
      <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#FCE7F3] text-[#DB2777] shrink-0"><ImageIcon size={15} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#1A1D26]">Testimonios de este funnel</div>
            <div className="text-[11px] text-[#9098A4]">Fotos o videos de testimonios, propios de este funnel.</div>
          </div>
        </div>
        <div className="p-2.5">
          <FunnelResourceFolder strategyId={f.strategy_id} clientId={clientId} bucketKey="testimonios"
            label="Testimonios" color="#DB2777" bg="#FDF2F8" by={meId} />
        </div>
      </div>

      {/* Recursos del CLIENTE: las categorías estándar (fotos + videos), compartidas por
          todos sus funnels. Acá ordena la migración del Drive. */}
      <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EEF2FF] text-[#4F46E5] shrink-0"><ImageIcon size={15} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#1A1D26]">Recursos del cliente</div>
            <div className="text-[11px] text-[#9098A4]">Branding, autoridad, productos, anuncios y VSL (fotos o videos). Sirven para todos los funnels de {clientName || 'este cliente'}.</div>
          </div>
        </div>
        <div className="p-2.5 flex flex-col gap-1.5">
          {CLIENT_CATS.map(cat => (
            <FunnelResourceFolder key={cat.key} clientScope clientId={clientId} bucketKey={cat.key}
              label={cat.label} color={cat.c} bg={cat.bg} by={meId} moveTargets={CLIENT_CATS}
              reloadTick={clientResTick} onMoved={() => setClientResTick(t => t + 1)} />
          ))}
        </div>
        <div className="px-4 pb-3 -mt-1 text-[11px] text-[#AEB4BF] flex items-center gap-1.5">
          <ImageIcon size={13} className="shrink-0" />
          <span>Tip: arrastrá un recurso de una carpeta a otra para reordenarlo.</span>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ borderLeft: forcePage ? 'none' : `3px solid ${st.side}`, borderBottom: last ? 'none' : '1px solid #EDF0F5' }}>
      {/* En PANTALLA (forcePage) la cabecera es el topbar de la maqueta: Volver · título
          grande · tipo + estado + dominio · y a la derecha los dos botones de acción
          ("Abrir el DEL" y "Generar con IA"). En la LISTA sigue siendo la fila-grid. */}
      {forcePage && (
        <div className="flex items-center gap-3 flex-wrap py-3.5 px-[18px] border-b border-[#EDF0F5] bg-white">
          <button onClick={() => onBack?.()} className="inline-flex items-center gap-1.5 py-2 px-3 rounded-[10px] border border-[#E2E5EB] bg-white text-[12.5px] font-semibold text-[#4B5563] cursor-pointer hover:border-[#2E69E0] hover:text-[#2E69E0] shrink-0"><ChevronLeft size={15} />Volver</button>
          <div className="min-w-0 flex-1">
            <input key={f.id + 'nametop'} defaultValue={f.name} onBlur={e => { const v = e.target.value.trim(); if (v && v !== (f.name || '')) onUpdate(f.id, { name: v }); else if (!v) e.target.value = f.name || ''; }} title="Editar nombre del funnel" className="w-full text-[19px] font-extrabold border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md px-1.5 py-0.5 -ml-1.5 bg-transparent focus:bg-white outline-none tracking-[-.015em]" style={{ color: '#1A1D26' }} />
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <TipoChip value={f.tipo} onChange={(v) => onUpdate(f.id, { tipo: v })} />
              <StatusPill status={f.status || 'activa'} onChange={(v) => onUpdate(f.id, { status: v })} />
              {f.official_domain
                ? <span onClick={() => copyText(f.official_domain)} title={`Copiar dominio: ${f.official_domain}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#2E69E0] cursor-pointer hover:underline"><Globe size={11} />{f.official_domain}</span>
                : <span className="inline-flex items-center gap-1 text-[11px] text-[#AEB4BF]"><Globe size={11} />sin dominio</span>}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => setDelOpen(true)} className="inline-flex items-center gap-1.5 py-2.5 px-3.5 rounded-[10px] border bg-white text-[12.5px] font-semibold cursor-pointer hover:bg-[#F5F3FF]" style={{ color: '#7C3AED', borderColor: '#E4DCFB' }}><FileText size={15} />Abrir el DEL</button>
            <button onClick={() => generateAvatars('append')} disabled={genActive} title="La IA lee el DEL y arma/actualiza los avatares con su segmentación y copys. Tarda 1-2 minutos." className="inline-flex items-center gap-1.5 py-2.5 px-3.5 rounded-[10px] border-none bg-[#2E69E0] text-white text-[12.5px] font-semibold cursor-pointer hover:bg-[#1D4FD8] disabled:opacity-60">{genActive ? <RefreshCw size={15} className="animate-spin" /> : <Sparkles size={15} />}{genActive ? 'Generando…' : 'Generar con IA'}</button>
          </div>
        </div>
      )}
      {!forcePage && (
      <div onClick={() => { if (navigate) onOpen?.(); else setOpen(o => !o); }} className="grid items-center py-3 px-4 font-sans text-left cursor-pointer hover:bg-[#FCFCFD]" style={{ gridTemplateColumns: GRID, gap: 12, background: open ? '#FCFCFD' : '#fff' }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-[#94A3B8] shrink-0"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg></span>
          <div className="min-w-0 flex-1">
            <input key={f.id + 'name'} defaultValue={f.name} onClick={e => e.stopPropagation()} onBlur={e => { const v = e.target.value.trim(); if (v && v !== (f.name || '')) onUpdate(f.id, { name: v }); else if (!v) e.target.value = f.name || ''; }} title="Editar nombre del funnel" className="w-full text-[15px] font-bold border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md px-1.5 py-0.5 -ml-1.5 bg-transparent focus:bg-white outline-none tracking-[-.01em]" style={{ color: '#1A1D26' }} />
            <div className="flex items-center gap-[7px] mt-0.5 flex-wrap">
              <TipoChip value={f.tipo} onChange={(v) => onUpdate(f.id, { tipo: v })} />
              <span className="text-[#C3C9D4]">·</span>
              {f.official_domain && <><span onClick={(e) => { e.stopPropagation(); copyText(f.official_domain); }} title={`Copiar dominio: ${f.official_domain}`} className="inline-flex items-center gap-1 text-[10.5px] font-medium text-[#2E69E0] cursor-pointer hover:underline"><Globe size={11} />{f.official_domain}</span><span className="text-[#C3C9D4]">·</span></>}
              <span className="inline-flex items-center gap-1 text-[10.5px] text-[#9098A4]" onClick={e => e.stopPropagation()}>Creado
                <input type="date" value={f.created_date || ''} onChange={e => onUpdate(f.id, { created_date: e.target.value || null })} title="Fecha de creación (editable)" className="text-[10.5px] text-[#9098A4] border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded px-1 py-0.5 bg-transparent cursor-pointer outline-none" />
              </span>
            </div>
          </div>
        </div>
        <div><StatusPill status={f.status || 'activa'} onChange={(v) => onUpdate(f.id, { status: v })} /></div>
        {/* Que lo frena. Sale del motor de pasos (cerebro_pipeline_status), no de un
            texto a mano: es el primer paso pendiente y su motivo en castellano. */}
        <div className="min-w-0">
          {nextStage
            ? <div className="flex items-center gap-1.5 min-w-0" title={`${nextStage.stage_label} — ${nextStage.detail}`}>
                <span className="w-[6px] h-[6px] rounded-full shrink-0" style={{ background: '#EAB308' }} />
                <span className="text-[11.5px] text-[#6B7280] truncate"><b className="font-semibold text-[#3F4653]">{STAGE_SHORT[nextStage.stage] || nextStage.stage_label}</b> · {nextStage.detail}</span>
              </div>
            : <span className="text-[11.5px] text-[#22C55E] font-semibold inline-flex items-center gap-1.5"><Check size={11} strokeWidth={3} />Todo listo</span>}
        </div>
        <div className="flex justify-end">
          {navigate
            ? <ChevronRight size={16} className="text-[#C3C9D4]" />
            : <ChevronDown size={16} className="transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)', color: open ? '#2E69E0' : '#C3C9D4' }} />}
        </div>
      </div>
      )}

      {/* El riel: en PANTALLA es la línea de la maqueta (dónde está + Próximo + % listo).
          En la lista (acordeón viejo) queda el semáforo detallado. */}
      {forcePage
        ? <FunnelRail stages={stages} />
        : isOpen && <div style={{ background: '#FCFCFD' }}><PipelineSemaforo stages={stages} /></div>}

      {isOpen && (
        <div className="pt-1 px-4 pb-[18px]" style={{ background: '#FCFCFD' }}>
          {/* Las tareas de este funnel, arriba de todo: el riel dice DONDE ESTA el
              funnel y el tablero QUE HAY QUE HACER. Es el mismo tablero del Sprint,
              filtrado — la tarea sigue viviendo en la pestaña Tareas. */}
          <div className="flex items-center gap-2.5 mb-3">
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#EAF1FF', color: '#1D4FD8' }}><LayoutGrid size={16} /></span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-bold text-[#1A1D26]">Tareas de este funnel</div>
              <div className="text-[11px] text-[#9098A4]">El mismo tablero del Sprint, pero sólo lo de este funnel.</div>
            </div>
          </div>
          <FunnelTasksBlock funnelId={f.id} />

          {/* El DEL, adentro del panel. En PANTALLA el botón ya está en el topbar, así que
              esta caja solo aparece en el acordeón viejo (lista). Es SOLO LECTURA a
              propósito hasta el cutover — dos fuentes escribibles a la vez es el fracaso
              que la migración viene a arreglar. */}
          {!forcePage && (
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5 border rounded-xl py-2.5 px-3.5 bg-white" style={{ borderColor: '#E4DCFB' }}>
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: '#F5F3FF', color: '#7C3AED' }}><FileText size={15} /></span>
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold text-[#1A1D26]">El DEL de este funnel</div>
                <div className="text-[10.5px] text-[#9098A4]">Leelo por secciones acá, sin abrir el Drive</div>
              </div>
            </div>
            <button onClick={() => setDelOpen(true)} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[9px] border-none bg-[#7C3AED] text-white text-[12px] font-semibold cursor-pointer hover:brightness-95 shrink-0"><FileText size={14} />Abrir el DEL</button>
          </div>
          )}

          {/* Estos bloques ahora viven dentro del DEL (pestañas Configuración y Recursos).
              En el acordeón viejo (lista) se siguen mostrando; en la pantalla no. */}
          {!forcePage && (<>{funnelConfigNode}{funnelRecursosNode}</>)}
          <div className="flex justify-end mt-3">
            <button onClick={() => { if (window.confirm(`¿Borrar el funnel "${f.name}"?`)) onDelete(f.id); }} className="inline-flex items-center gap-1.5 py-[7px] px-3 rounded-lg bg-white border border-[#F5C2C2] text-[#DC2626] text-[11.5px] font-semibold cursor-pointer hover:bg-[#FEF2F2]"><Trash2 size={13} />Borrar funnel</button>
          </div>
        </div>
      )}
      {note && <NoteModal {...note} onClose={() => setNote(null)} />}
      {voomlyOpen && <VoomlyPicker clientName={clientName} funnelName={f.name || ''} current={f.vsl_url || ''} onPick={(url) => onUpdate(f.id, { vsl_url: url || null })} onClose={() => setVoomlyOpen(false)} />}
      {folderPick && (() => { const field = folderPick.kind === 'rec' ? 'rec_folder_url' : 'edit_folder_url'; return (
        <FolderPicker clientId={clientId} avatarName={folderPick.av?.name || ''} kind={folderPick.kind} current={folderPick.av?.[field] || ''} onPick={(url) => setAvatar(folderPick.av.id, { [field]: url || null })} onClose={() => setFolderPick(null)} />
      ); })()}
      {editorMsg !== null && <EditorMessageModal initial={editorMsg} onClose={() => setEditorMsg(null)} />}

      {/* El lector va a pantalla completa: un DEL promedia 56.000 caracteres —
          adentro del acordeon de la fila no se lee. */}
      <Modal open={delOpen} onClose={() => setDelOpen(false)} fullScreen title={`DEL · ${f.name}`}>
        <DelEditor strategyId={f.strategy_id} docId={delDocId} docUrl={delDocUrl} clientId={clientId}
          estrategiaNode={funnelEstrategiaNode} configNode={funnelConfigNode} recursosNode={funnelRecursosNode} onAvatarCreate={onAvatarCreate} />
      </Modal>
    </div>
  );
}

// La pestaña Funnels del cliente: contexto arriba, y despues los FUNNELS planos.
//
// Ya NO se muestra la "estrategia". Se jubilo el concepto, no la tabla: `strategy_id`
// sobrevive porque nunca fue una estrategia -- es el puntero a la CARPETA DEL DRIVE
// (drive-sync la deriva del nombre "Estrategia #N | Tipo | fecha" y de ella cuelga el DEL).
// Tampoco existe mas el boton "Borrar estrategia": era un gatillo de ON DELETE CASCADE
// que se llevaba puestos los funnels con sus avatares y guiones adentro, y encima
// drive-sync recreaba la carpeta vacia en el sync de las 06:00.
export default function FunnelsView({ clientId }) {
  const { clients, strategies, strategyPages, addStrategyPage, updateStrategyPage, deleteStrategyPage, refreshStrategyPage } = useApp();
  const client = useMemo(() => (clients || []).find(c => c.id === clientId) || {}, [clients, clientId]);
  // Los FUNNELS del cliente, PLANOS. La "estrategia" dejo de ser una capa de navegacion:
  // de 40 estrategias, 26 de 33 clientes tenian una sola -> no agrupaba nada, y su nombre
  // solo guardaba el tipo (que ahora es un campo del funnel).
  const myFunnels = useMemo(() => (strategyPages || []).filter(p => p.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0)), [strategyPages, clientId]);
  // Las carpetas de Drive del cliente. NO se muestran, pero se siguen necesitando:
  // strategy_id es NOT NULL (un funnel vive en una carpeta) y de ahi cuelga su DEL.
  const myStrategies = useMemo(() => (strategies || []).filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0)), [strategies, clientId]);

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

  // Recursos a nivel CLIENTE (branding, testimonios, imágenes) — compartidos por todas las estrategias.
  const [recursos, setRecursos] = useState(null);
  const loadRecursos = useCallback(async () => {
    try { const { data } = await supabase.rpc('cerebro_recursos_cliente', { p_client_id: clientId }); setRecursos(Array.isArray(data) ? data : []); }
    catch { setRecursos([]); }
  }, [clientId]);
  useEffect(() => { loadRecursos(); }, [loadRecursos]);

  const docsByNode = useMemo(() => { const m = {}; for (const d of docs) m[d.node_id] = d; return m; }, [docs]);
  // El DEL sigue viviendo en la CARPETA del Drive (strategy_id), no en el funnel: por eso
  // dos funnels de la misma carpeta comparten DEL. Ya era asi; el aplanado solo lo deja a la
  // vista. Reanclarlo al funnel es la Fase 3 (del_documents con FK propia).
  // El DEL de un funnel: primero SU DEL propio (del_doc_id → la "Fase 3"), y si no
  // tiene uno asignado, fallback por strategy_id (la carpeta), que es como resolvía
  // antes. Así los funnels 1:1 no cambian y los multi-funnel se separan cuando se les
  // asigna/parte el DEL. Sin del_doc_id, el comportamiento es idéntico al de hoy.
  const delOf = useCallback((f) =>
    (f.del_doc_id && docs.find(d => d.id === f.del_doc_id && d.doc_kind === 'del'))
    || docs.find(d => d.strategy_id === f.strategy_id && d.doc_kind === 'del')
    || null, [docs]);
  const lastSync = useMemo(() => { let m = null; for (const d of docs) if (d.synced_at && (!m || d.synced_at > m)) m = d.synced_at; return m; }, [docs]);
  // Sincronizar contexto = relee documentos (client-brain-sync) Y el árbol de Drive (drive-sync,
  // para traer carpetas nuevas de Recursos), y recarga todo.
  const sync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('client-brain-sync', { body: { client_id: clientId } });
      await supabase.functions.invoke('drive-sync', { body: { client_id: clientId } });
      await Promise.all([fetchContext(), loadRecursos()]);
    } catch { /* noop */ } finally { setSyncing(false); }
  };

  // Contexto detras de un boton (ya no ocupa el arranque de la vista) + navegacion
  // por funnel: al abrir uno se entra a SU pantalla, no un desplegable.
  const [ctxOpen, setCtxOpen] = useState(false);
  const [pageFunnelId, setPageFunnelId] = useState(null);
  useEffect(() => { setPageFunnelId(null); }, [clientId]); // al cambiar de cliente, volver a la lista
  const pageFunnel = useMemo(() => myFunnels.find(f => f.id === pageFunnelId) || null, [myFunnels, pageFunnelId]);

  const [modal, setModal] = useState(false);
  const [trackFunnel, setTrackFunnel] = useState(null);
  const openTrack = (f) => setTrackFunnel({ ...f, _edit: { pixel_code: f.pixel_code || '', clarity_id: f.clarity_id || '', events: normEvents(f.conversion_events) } });
  // strategy_id = la carpeta del Drive donde vive el funnel. Es NOT NULL, asi que hay que
  // elegir una; pero el 90% de los clientes tiene UNA sola, y ahi no se pregunta nada.
  // El alta arranca con el TIPO ya puesto cuando se entra por el boton de un grupo
  // ("Funnel de reclutamiento"): el dato que el grupo ya dice no se vuelve a preguntar.
  // La carpeta del Drive sigue siendo la primera del cliente; no se elige acá.
  const blankForm = (tipo) => ({ name: '', tipo: tipo || null, strategy_id: myStrategies[0]?.id || '', status: 'borrador', prod_url: '', testing_url: '', ads_url: '', avatars: [], pixel_code: '', clarity_id: '', events: stdEvents() });
  const [form, setForm] = useState(blankForm);
  const openNew = (tipo) => { setForm(blankForm(tipo)); setModal(true); };

  const create = () => {
    if (!form.name.trim() || !form.strategy_id) return;
    addStrategyPage({
      strategy_id: form.strategy_id, client_id: clientId, name: form.name.trim(), status: form.status, tipo: form.tipo,
      prod_url: form.prod_url || null, testing_url: form.testing_url || null, ads_url: form.ads_url || null,
      pixel_code: form.pixel_code || null, clarity_id: form.clarity_id || null,
      conversion_events: form.events, avatars: form.avatars,
    });
    setModal(false); setForm(blankForm());
  };
  const saveTrack = (val) => { updateStrategyPage(trackFunnel.id, { pixel_code: val.pixel_code || null, clarity_id: val.clarity_id || null, conversion_events: val.events }); setTrackFunnel(null); };

  // ── Briefing / Personalidad: el equipo escribe el brief del cliente → se guarda como Google Doc,
  //    se ingiere al cerebro y se fija SOLO en el casillero "Briefing · Personalidad" de arriba.
  const [briefModal, setBriefModal] = useState(false);
  const [briefText, setBriefText] = useState('');
  const [briefBusy, setBriefBusy] = useState(false);
  const openBrief = () => { setBriefText((docs.find(d => d.doc_kind === 'briefing')?.text) || ''); setBriefModal(true); };
  const saveBrief = async () => {
    if (!briefText.trim()) return;
    setBriefBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('save-brief', { body: { client_id: clientId, content: briefText } });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { window.alert(payload?.detail || error?.message || 'No pude guardar el briefing.'); return; }
      setBriefModal(false);
      await fetchContext();
    } catch (e) { window.alert(String(e?.message || e)); }
    finally { setBriefBusy(false); }
  };
  // Generar la personalidad AUTOMÁTICO con IA desde onboarding + investigación + DEL + llamadas.
  const [briefGenBusy, setBriefGenBusy] = useState(false);
  const generateBrief = async () => {
    setBriefGenBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-brief', { body: { client_id: clientId } });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { window.alert(payload?.detail || error?.message || 'No pude generar la personalidad.'); return; }
      setBriefText(payload.text || '');
      await fetchContext();
    } catch (e) { window.alert(String(e?.message || e)); }
    finally { setBriefGenBusy(false); }
  };

  // ── Agregar estrategia: crea en el Drive la carpeta "Estrategia #N | Tipo | fecha" con el
  //    esqueleto estándar (Anuncios/VSL/Recursos/…) + un DEL en blanco, y la trae al panel.
  const [stratModal, setStratModal] = useState(false);
  const [stratTipo, setStratTipo] = useState('Reclutamiento');
  const [stratOtro, setStratOtro] = useState('');
  const [stratBusy, setStratBusy] = useState(false);
  const nextStratN = myStrategies.length + 1;
  const stratTipoFinal = stratTipo === 'Otro' ? (stratOtro.trim() || 'A DEFINIR') : stratTipo;
  const createStrategy = async () => {
    setStratBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-strategy', { body: { client_id: clientId, tipo: stratTipoFinal } });
      let payload = data;
      if (error?.context && typeof error.context.json === 'function') { try { payload = await error.context.json(); } catch { /* noop */ } }
      if (!payload?.ok) { window.alert(payload?.detail || error?.message || 'No pude crear la estrategia.'); return; }
      setStratModal(false); setStratOtro('');
      await fetchContext();
      window.alert(`Estrategia creada en el Drive: “${payload.strategyName}”, con sus carpetas y un DEL en blanco.\n\nRecargá el panel para verla en la lista.`);
    } catch (e) { window.alert(String(e?.message || e)); }
    finally { setStratBusy(false); }
  };

  // ── PANTALLA de un funnel ── al entrar a un funnel se ve SU pantalla (tareas +
  // DEL + config + avatares), no un desplegable. La navegacion es un return propio.
  if (pageFunnel) {
    const del = delOf(pageFunnel);
    return (
      <div className="rounded-2xl p-[18px] -mx-1" style={{ background: '#F4F6F9' }}>
        <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
          <FunnelRow f={pageFunnel} stages={pipeline?.[pageFunnel.id]} delText={del?.text || ''} delDocUrl={del?.web_url || ''} delDocId={del?.id || ''} clientId={clientId} clientName={client.name} onUpdate={updateStrategyPage} onDelete={(id) => { deleteStrategyPage(id); setPageFunnelId(null); }} onTrack={openTrack} onRefreshPage={refreshStrategyPage} onBack={() => setPageFunnelId(null)} forcePage last />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-[18px] -mx-1" style={{ background: '#F4F6F9' }}>
      {/* Contexto del cliente: ya NO arranca la vista (la maqueta deja solo los
          funnels). Sigue vivo porque alimenta a los agentes (onboarding, investigacion,
          personalidad); vive detras del boton "Contexto" del header de Funnels. */}
      {ctxOpen && (
      <Modal open onClose={() => setCtxOpen(false)} title="Contexto del cliente" maxWidth={940}>
      <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #E7EAF0' }}>
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
          <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
            <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4]">Documentos del cliente</span>
            <button onClick={openBrief} title="Escribir/actualizar el briefing y la personalidad del cliente; se fija solo en su casillero" className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border text-[11.5px] font-semibold cursor-pointer hover:bg-[#FDF2F8]" style={{ color: '#DB2777', borderColor: '#F5C2DD', background: '#fff' }}><Brain size={13} />Escribir briefing / personalidad</button>
          </div>
          <ClientContextSlots clientId={clientId} driveDocs={driveDocs} docsByNode={docsByNode} slotPins={slotPins} onChanged={fetchContext} />
          <div className="flex items-center gap-2 text-[11.5px] text-[#9098A4] mt-3.5"><RefreshCw size={13} />Asigná el documento de cada casillero; después tocá "Sincronizar contexto" para que el cerebro lo lea.</div>

          {/* Recursos del cliente (branding, testimonios, imágenes, info empresa) — compartidos por TODAS las estrategias */}
          <div className="mt-5 pt-[18px] border-t border-[#F1F3F7]">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4] mb-3">Recursos del cliente <span className="text-[#C3C9D4] normal-case font-medium tracking-normal">· los comparten todas las estrategias</span></div>
            {recursos === null
              ? <div className="text-[11.5px] text-[#AEB4BF] py-1.5">Cargando recursos…</div>
              : recursos.length === 0
                ? <div className="text-[11.5px] text-[#AEB4BF] py-1.5">No encontré subcarpetas dentro de “Recursos”. Tocá “Sincronizar contexto” o revisá la pestaña Carpetas.</div>
                : <div className="flex gap-2.5 flex-wrap">
                    {recursos.map(r => { const has = r.files > 0; return (
                      <div key={r.folder_id} className="inline-flex items-center gap-2.5 border rounded-[10px] py-2 px-3" style={has ? { borderColor: '#C9F0D8', background: '#F4FDF7' } : { border: '1.5px dashed #D8DDE6', background: '#FBFCFE' }}>
                        <FolderOpen size={15} className="shrink-0" style={{ color: has ? '#16A34A' : '#C3C9D4' }} />
                        <span className="font-semibold text-[12.5px] max-w-[170px] truncate" style={{ color: has ? '#1A1D26' : '#6B7280' }} title={r.name}>{r.name}</span>
                        <span className="text-[10.5px] font-bold py-0.5 px-1.5 rounded-full whitespace-nowrap" title={`${r.files} archivo${r.files === 1 ? '' : 's'} en la carpeta`} style={has ? { background: '#DCFCE7', color: '#15803D' } : { background: '#F1F3F7', color: '#AEB4BF' }}>{r.files}</span>
                        {r.url && <button onClick={() => openUrl(r.url)} title="Abrir carpeta" className="hover:text-[#2E69E0] inline-flex" style={{ color: has ? '#9098A4' : '#C3C9D4' }}><ExternalLink size={13} /></button>}
                      </div>
                    ); })}
                  </div>}
            <div className="flex items-center gap-2 text-[11.5px] text-[#9098A4] mt-2.5"><FolderOpen size={13} className="shrink-0" />Logo, colores, fotos/imágenes y testimonios del cliente. El número es lo que hay en cada carpeta del Drive.</div>
          </div>

          {/* Webs de contexto */}
          <div className="mt-5 pt-[18px] border-t border-[#F1F3F7]">
            <div className="text-[10px] font-bold tracking-[0.12em] uppercase text-[#9098A4] mb-3">Webs de contexto</div>
            <WebLinks clientId={clientId} webs={webs} onChanged={fetchContext} />
            <div className="flex items-center gap-2 text-[11.5px] text-[#9098A4] mt-2.5 leading-snug"><Globe size={13} className="shrink-0" />Sumá el sitio del cliente o de la empresa MLM. Los dominios de tus funnels también nutren el contexto (el funnel es donde llega el prospecto tras el anuncio).</div>
          </div>
        </div>
      </div>
      </Modal>
      )}

      {/* Los funnels del cliente, planos: la unidad de trabajo es el FUNNEL. */}
      <div className="bg-white rounded-2xl overflow-hidden mb-5" style={{ border: '1px solid #E7EAF0', boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
        <div className="flex items-center gap-3 py-4 px-5 border-b border-[#F1F3F7]">
          <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[10px] shrink-0" style={{ background: '#EAF1FF', color: '#2E69E0' }}><Zap size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="text-[15px] font-bold text-[#1A1D26] tracking-[-.01em]">Funnels</div>
            <div className="text-[11.5px] text-[#9098A4] mt-px">{myFunnels.length === 0 ? 'Todavía no hay ninguno' : `${myFunnels.length} funnel${myFunnels.length === 1 ? '' : 's'} de ${client.name || 'este cliente'}`}</div>
          </div>
          {/* El contexto (onboarding, investigacion, personalidad) ya no ocupa la vista:
              vive detras de este boton. Sigue alimentando a los agentes. */}
          <button onClick={() => setCtxOpen(true)} title="Onboarding, investigación, personalidad y webs del cliente" className="inline-flex items-center gap-1.5 py-[9px] px-3 border rounded-[10px] text-[12px] font-semibold cursor-pointer shrink-0 hover:bg-[#FDF2F8]" style={{ color: '#DB2777', borderColor: '#F5C2DD', background: '#fff' }}><Sparkles size={14} />Contexto</button>
          {myFunnels.length > 0 && (
            <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border-none rounded-[10px] text-white text-[12px] font-semibold cursor-pointer hover:brightness-95 shrink-0" style={{ background: '#2E69E0', boxShadow: '0 1px 2px rgba(46,105,224,.35)' }}><Plus size={14} strokeWidth={2.6} />Nuevo funnel</button>
          )}
        </div>

        <div className="py-[18px] px-5">
          {myFunnels.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-center py-10 px-5 gap-2.5">
              <Zap size={26} className="text-[#C7CCD6]" />
              <div className="text-[13px] font-semibold text-[#4B5563]">Este cliente todavía no tiene funnels</div>
              <div className="text-[11.5px] text-text2 max-w-[430px]">
                {myStrategies.length === 0
                  ? 'Primero hay que crearle la carpeta en el Drive: arma sola su estructura y un DEL en blanco.'
                  : 'Crealo acá. Va a la carpeta del Drive que ya tiene.'}
              </div>
              {myStrategies.length === 0
                ? <button onClick={() => setStratModal(true)} className="inline-flex items-center gap-1.5 mt-1.5 py-2.5 px-4 rounded-[10px] border-none text-white text-[12.5px] font-semibold cursor-pointer hover:brightness-95" style={{ background: '#DB2777' }}><FolderPlus size={14} />Crear la carpeta del Drive</button>
                : <button onClick={() => openNew()} className="inline-flex items-center gap-1.5 mt-1.5 py-2.5 px-4 rounded-[10px] border-none text-white text-[12.5px] font-semibold cursor-pointer hover:brightness-95" style={{ background: '#2E69E0' }}><Plus size={14} strokeWidth={2.6} />Nuevo funnel</button>}
            </div>
          ) : (
            /* Agrupados por TIPO: es la unica division que sobrevive a las estrategias.
               Un grupo vacio no se dibuja, salvo los dos tipos reales (que muestran su
               hueco con el boton de alta). "Sin tipo" solo aparece si hay alguno. */
            <div className="flex flex-col gap-4">
              {TIPO_GROUPS.map(tipo => {
                const group = myFunnels.filter(f => (f.tipo || null) === tipo);
                if (tipo === null && !group.length) return null;
                const meta = tipo ? FUNNEL_TIPO[tipo] : null;
                const Icon = meta ? meta.Icon : AlertCircle;
                return (
                  <div key={tipo || 'sin-tipo'}>
                    <div className="flex items-center gap-2.5 mb-2">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0"
                        style={meta ? { background: meta.bg, color: meta.color } : { background: '#F4F5F7', color: '#AEB4BF' }}>
                        <Icon size={15} />
                      </span>
                      <span className="text-[14px] font-extrabold tracking-[-.01em]" style={{ color: meta ? '#1A1D26' : '#9098A4' }}>
                        {meta ? meta.label : 'Sin tipo definido'}
                      </span>
                      <span className="text-[11px] font-bold rounded-full py-0.5 px-2" style={{ background: '#F0F2F5', color: '#6B7280' }}>{group.length}</span>
                      {tipo === null && <span className="text-[11px] text-[#AEB4BF]">— elegí el tipo en el chip de cada funnel</span>}
                      {meta && <button onClick={() => openNew(tipo)} className="ml-auto inline-flex items-center gap-1 py-1 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-[11px] font-semibold cursor-pointer text-[#6B7280] hover:border-[#2E69E0] hover:text-[#2E69E0] shrink-0"><Plus size={11} strokeWidth={2.6} />Funnel de {meta.label.toLowerCase()}</button>}
                    </div>
                    {!group.length ? (
                      <div className="rounded-xl py-4 px-4 text-center text-[12px] text-[#AEB4BF]" style={{ border: '1.5px dashed #E2E5EB', background: '#fff' }}>
                        Todavía no hay funnels de {meta.label.toLowerCase()}
                      </div>
                    ) : (
                      <div className="border border-[#EDF0F5] rounded-xl overflow-x-auto">
                        <div style={{ minWidth: 820 }}>
                          <div className="grid items-center py-[9px] px-4 border-b border-[#EDF0F5]" style={{ gridTemplateColumns: GRID, gap: 12, background: '#FAFBFD' }}>
                            {['Funnel', 'Estado', 'Qué falta', ''].map((h, i) => <div key={i} className="text-[9.5px] font-bold tracking-[0.09em] uppercase text-[#AEB4BF]">{h}</div>)}
                          </div>
                          {group.map((f, i) => {
                            const del = delOf(f);
                            return <FunnelRow key={f.id} f={f} stages={pipeline?.[f.id]} delText={del?.text || ''} delDocUrl={del?.web_url || ''} delDocId={del?.id || ''} clientId={clientId} clientName={client.name} onUpdate={updateStrategyPage} onDelete={deleteStrategyPage} onTrack={openTrack} onRefreshPage={refreshStrategyPage} last={i === group.length - 1} navigate onOpen={() => setPageFunnelId(f.id)} />;
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* La carpeta del Drive: se sigue pudiendo crear, pero es plomeria, no una capa de trabajo.
          Va discreto abajo, no como una decision que haya que tomar antes de empezar. */}
      {myFunnels.length > 0 && (
        <div className="flex justify-center">
          <button onClick={() => setStratModal(true)} title="Crea en el Drive una carpeta nueva con su estructura y un DEL en blanco" className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none bg-transparent text-[11px] font-medium cursor-pointer text-[#AEB4BF] hover:text-[#DB2777]"><FolderPlus size={12} />Crear otra carpeta en el Drive</button>
        </div>
      )}

      {/* Modal nuevo funnel */}
      {modal && (
        <Modal open={modal} onClose={() => setModal(false)} title="Nuevo funnel" maxWidth={560}
          footer={<div className="flex justify-end gap-2 w-full"><button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={() => setModal(false)}>Cancelar</button><button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.name.trim() || !form.strategy_id} onClick={create}>Crear funnel</button></div>}>
          <div className="flex flex-col gap-[18px] p-1">
            <div className="grid gap-3.5" style={{ gridTemplateColumns: '1fr 1fr' }}>
              <div><label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Nombre del funnel</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Ej. Profesionales V1" className={inputCls} autoFocus /></div>
              <div><label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Tipo</label>
                <div className="inline-flex items-center gap-1 p-1 border border-[#E2E5EB] rounded-[10px] bg-[#F7F8FA]">
                  {TIPO_ORDER.map(k => { const v = FUNNEL_TIPO[k]; const sel = form.tipo === k; return <button key={k} onClick={() => setForm({ ...form, tipo: sel ? null : k })} className="inline-flex items-center gap-1.5 py-[7px] px-3 border-none rounded-[7px] text-[12.5px] font-semibold font-sans cursor-pointer" style={{ background: sel ? '#fff' : 'transparent', color: sel ? v.color : '#6B7280', boxShadow: sel ? '0 1px 2px rgba(10,22,40,.12)' : 'none' }}><span className="w-[7px] h-[7px] rounded-full" style={{ background: sel ? v.color : '#C3C9D4' }} />{v.label}</button>; })}
                </div>
              </div>
            </div>

            {/* La carpeta del Drive solo se pregunta si hay mas de una: si no, es ruido. */}
            {myStrategies.length > 1 && (
              <div>
                <label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-1.5">Carpeta del Drive</label>
                <select value={form.strategy_id} onChange={e => setForm({ ...form, strategy_id: e.target.value })} className={inputCls + ' cursor-pointer'}>
                  {myStrategies.map(s => <option key={s.id} value={s.id}>{s.name || `Carpeta #${(s.position ?? 0) + 1}`}</option>)}
                </select>
                <div className="text-[11px] text-[#9098A4] mt-1.5">Dónde vive el funnel en el Drive. De ahí sale su DEL.</div>
              </div>
            )}
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

      {/* Modal agregar estrategia */}
      {stratModal && (
        <Modal open={stratModal} onClose={() => setStratModal(false)} title="Agregar estrategia" maxWidth={480}
          footer={<div className="flex justify-end gap-2 w-full"><button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2 disabled:opacity-50" onClick={() => setStratModal(false)} disabled={stratBusy}>Cancelar</button><button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none text-white font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5" style={{ background: '#DB2777' }} disabled={stratBusy} onClick={createStrategy}>{stratBusy ? <RefreshCw size={14} className="animate-spin" /> : <FolderPlus size={14} />}{stratBusy ? 'Creando…' : 'Crear estrategia'}</button></div>}>
          <div className="flex flex-col gap-4 p-1">
            <div>
              <label className="block text-[11px] font-bold tracking-[0.04em] uppercase text-[#6B7280] mb-2">Tipo de estrategia</label>
              <div className="flex gap-2 flex-wrap">
                {['Reclutamiento', 'Producto', 'Otro'].map(t => (
                  <button key={t} onClick={() => setStratTipo(t)} className="py-2 px-3.5 rounded-lg text-[12.5px] font-semibold border cursor-pointer" style={stratTipo === t ? { background: '#FCE7F3', color: '#BE185D', borderColor: '#F5C2DD' } : { background: '#fff', color: '#4B5563', borderColor: '#E2E5EB' }}>{t}</button>
                ))}
              </div>
              {stratTipo === 'Otro' && <input value={stratOtro} onChange={e => setStratOtro(e.target.value)} placeholder="Nombre del tipo (ej. Evento, Webinar…)" autoFocus className="w-full mt-2.5 py-2 px-3 border border-[#E2E5EB] rounded-[9px] text-[13px] bg-white outline-none focus:border-blue" />}
            </div>
            <div className="border border-[#EDF0F5] rounded-xl bg-[#FBFCFE] p-3.5">
              <div className="text-[11px] text-[#6B7280]">Se creará en el Drive del cliente la carpeta:</div>
              <div className="text-[13px] font-bold text-[#1A1D26] mt-1">Estrategia #{nextStratN} | {stratTipoFinal} | (hoy)</div>
              <div className="text-[11px] text-[#9098A4] mt-1.5 leading-relaxed">…con las subcarpetas estándar (Anuncios, Estrategia, VSL, Mural, Auditorías, Otros) y una copia del DEL en blanco. Los Recursos (branding, testimonios, imágenes) son del cliente y se comparten con todas las estrategias.</div>
            </div>
          </div>
        </Modal>
      )}

      {/* Modal briefing / personalidad del cliente */}
      {briefModal && (
        <Modal open={briefModal} onClose={() => setBriefModal(false)} title="Briefing y personalidad del cliente" maxWidth={720}
          footer={<div className="flex justify-between items-center gap-2 w-full">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] text-[#9098A4] font-medium"><Brain size={13} />Se guarda como Google Doc, lo lee el cerebro y se fija solo en el casillero de personalidad.</span>
            <div className="flex gap-2">
              <button className="text-[13px] py-2.5 px-4 rounded-[9px] border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2 disabled:opacity-50" onClick={() => setBriefModal(false)} disabled={briefBusy}>Cancelar</button>
              <button className="text-[13px] py-2.5 px-4 rounded-[9px] border-none text-white font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5" style={{ background: '#DB2777' }} disabled={briefBusy || !briefText.trim()} onClick={saveBrief}>{briefBusy ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}{briefBusy ? 'Guardando…' : 'Guardar briefing'}</button>
            </div>
          </div>}>
          <div className="p-1">
            {/* Generación automática con IA desde toda la data del cliente */}
            <div className="flex items-center justify-between gap-3 flex-wrap mb-3 p-3 rounded-xl border" style={{ borderColor: '#F0D6EA', background: 'linear-gradient(180deg,#FDF2F8 0%,#fff 100%)' }}>
              <div className="min-w-0">
                <div className="text-[12.5px] font-bold text-[#1A1D26]">Generar automático con IA</div>
                <div className="text-[11px] text-[#9098A4]">Lee las llamadas, el onboarding, la investigación y el DEL, y escribe la personalidad solo. Podés editarla después.</div>
              </div>
              <button onClick={generateBrief} disabled={briefGenBusy || briefBusy} className="inline-flex items-center gap-1.5 py-2.5 px-4 rounded-[10px] border-none text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50 shrink-0 hover:brightness-95" style={{ background: '#DB2777' }}>{briefGenBusy ? <RefreshCw size={14} className="animate-spin" /> : <Sparkles size={14} />}{briefGenBusy ? 'Generando…' : 'Generar con IA'}</button>
            </div>
            <div className="text-[12px] text-[#6B7280] mb-2.5 leading-relaxed">O escribí/editá a mano la <b>personalidad, el tono y el contexto</b> del cliente (cómo habla, qué valores transmite, qué evitar, referencias de marca).</div>
            <textarea value={briefText} onChange={e => setBriefText(e.target.value)} placeholder="Tocá “Generar con IA” para que la escriba sola desde la data del cliente, o escribila acá…" className="w-full py-3.5 px-4 border border-[#E2E5EB] rounded-xl text-[13px] text-[#1A1D26] bg-white resize-y outline-none focus:border-blue leading-relaxed" style={{ minHeight: '42vh', whiteSpace: 'pre-wrap' }} />
          </div>
        </Modal>
      )}
    </div>
  );
}
