// Pestaña "Funnels": el workspace del cliente. Envuelve TODO en la estrategia:
// contexto del cliente (onboarding), y por estrategia sus documentos (DEL, etc.) +
// sus funnels (con avatares, tracking, material y la spec de cada avatar).
import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import {
  Plus, X, ExternalLink, Copy, ChevronDown, ChevronRight, Users, ArrowRight, Megaphone,
  Check, Trash2, Activity, Zap, Link2, Globe, Rocket, Clapperboard,
  Brain, Sparkles, FileText, RefreshCw, Target, Search as SearchIcon, Layers,
} from 'lucide-react';
import Modal from '../Modal';
import { openUrl, copyText } from './recursosShared';
import { fmtDateTime } from '../../utils/helpers';

// Metadatos por tipo de documento de contexto.
const DOC_META = {
  del:           { label: 'DEL', Icon: Sparkles, color: '#C79A3E', bg: '#FCEFD0' },
  onboarding:    { label: 'Onboarding', Icon: FileText, color: '#2E69E0', bg: '#E9F1FF' },
  investigacion: { label: 'Investigación', Icon: SearchIcon, color: '#7C3AED', bg: '#F4F1FE' },
  extra:         { label: 'Contexto', Icon: Brain, color: '#EC4899', bg: '#FDF2F8' },
};

// Tarjeta compacta de un documento de contexto (título, tipo, preview expandible).
function ContextDocCard({ doc }) {
  const [open, setOpen] = useState(false);
  const meta = DOC_META[doc.doc_kind] || DOC_META.extra;
  const { Icon } = meta;
  const text = doc.text || '';
  const hasMore = text.length > 400;
  return (
    <div className="border border-[#E8EBF0] rounded-[11px] bg-white overflow-hidden">
      <div className="flex items-center gap-2 p-2.5">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: meta.bg, color: meta.color }}><Icon size={14} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[12px] font-semibold text-[#1A1D26] truncate" title={doc.title}>{doc.title || meta.label}</div>
          <div className="text-[10.5px] text-[#9CA3AF]">{meta.label} · {(doc.char_count || 0).toLocaleString()} car.</div>
        </div>
        {hasMore && <button onClick={() => setOpen(o => !o)} title={open ? 'Ver menos' : 'Ver texto'} className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-[#9CA3AF] hover:text-[#2E69E0] shrink-0"><ChevronDown size={14} style={{ transform: open ? 'rotate(180deg)' : 'none' }} /></button>}
        {doc.web_url && <button onClick={() => openUrl(doc.web_url)} title="Abrir en Drive" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-[#9CA3AF] hover:text-[#2E69E0] shrink-0"><ExternalLink size={13} /></button>}
      </div>
      {open && text && <div className="px-2.5 pb-2.5 text-[11.5px] leading-relaxed text-[#4B5563] whitespace-pre-wrap max-h-[280px] overflow-y-auto">{text}</div>}
    </div>
  );
}

const FUNNEL_STATUS = {
  activa:   { label: 'Activo', bg: '#ECFDF5', color: '#16A34A', dot: '#16A34A' },
  borrador: { label: 'Borrador', bg: '#FEFCE8', color: '#A16207', dot: '#A16207' },
  pausada:  { label: 'Pausado', bg: '#FEF2F2', color: '#DC2626', dot: '#DC2626' },
  antiguo:  { label: 'Antiguo', bg: '#F1F3F6', color: '#6B7280', dot: '#9CA3AF' },
};
const STATUS_ORDER = ['activa', 'borrador', 'pausada', 'antiguo'];
const AVATAR_STATUS = {
  'En grabación': { short: 'Grabación', bg: '#FEF3E7', color: '#C2630A' },
  'En edición':   { short: 'Edición',   bg: '#EEF2FF', color: '#2E69E0' },
  'Editados':     { short: 'Editados',  bg: '#ECFDF5', color: '#16A34A' },
};
const AVATAR_OPTS = ['En grabación', 'En edición', 'Editados'];
const DEFAULT_NEEDS = ['Imágenes de autoridad', 'Branding / logo', 'Imágenes de empresa o producto', 'Testimonios'];
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
      <button ref={btnRef} onClick={toggle} className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-bold border-none cursor-pointer" style={{ background: cfg.bg, color: cfg.color }}>
        <span className="w-1.5 h-1.5 rounded-full" style={{ background: cfg.color }} />{cfg.label}<ChevronDown size={10} />
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
      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-md text-[11px] font-semibold cursor-pointer"
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
      <button ref={btnRef} onClick={toggle} className="inline-flex items-center gap-1 py-1 px-2 rounded-full text-[10.5px] font-bold border-none cursor-pointer whitespace-nowrap" style={{ background: cfg.bg, color: cfg.color }}>
        <span className="w-[5px] h-[5px] rounded-full" style={{ background: cfg.color }} />{cfg.short}<ChevronDown size={9} />
      </button>
      {open && pos && (<>
        <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} />
        <div className="fixed bg-white border border-[#E2E5EB] rounded-lg shadow-lg z-[61] min-w-[120px] overflow-hidden py-0.5" style={{ left: pos.left, top: pos.top }}>
          {AVATAR_OPTS.map(o => { const c = AVATAR_STATUS[o]; return (
            <button key={o} onClick={() => { onChange(o); setOpen(false); }} className="flex items-center gap-2 w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-[#F5F7FF] bg-transparent border-none cursor-pointer font-medium" style={{ color: c.color }}><span className="w-2 h-2 rounded-full" style={{ background: c.color }} />{c.short}</button>
          ); })}
        </div>
      </>)}
    </span>
  );
}

const GRID = '2.3fr 116px 1.5fr 1.5fr 116px 34px';

function FunnelRow({ f, strategyName, strategyOptions = [], onUpdate, onDelete, onTrack, contextDocs = [] }) {
  const [open, setOpen] = useState(false);
  const st = FUNNEL_STATUS[f.status] || FUNNEL_STATUS.activa;
  const needs = Array.isArray(f.visual_resources) ? f.visual_resources : [];
  const avatars = Array.isArray(f.avatars) ? f.avatars : [];
  const doneCount = needs.filter(n => n.done).length;
  const missing = needs.length - doneCount;
  const events = normEvents(f.conversion_events);
  const pOk = !!(f.pixel_code && f.pixel_code.trim());
  const cOk = !!(f.clarity_id && f.clarity_id.trim());

  const links = [];
  if (f.prod_url) links.push({ short: 'Prod', bg: '#EEF2FF', color: '#2E69E0', border: '#DCE3FF', url: f.prod_url });
  if (f.testing_url) links.push({ short: 'Test', bg: '#F1F3F6', color: '#6B7280', border: '#E2E5EB', url: f.testing_url });
  if (f.ads_url) links.push({ short: 'Pub', bg: '#F4F1FE', color: '#7C3AED', border: '#E7E0FB', url: f.ads_url });
  const missingLinks = [];
  if (!f.prod_url) missingLinks.push('Prod'); if (!f.testing_url) missingLinks.push('Test');

  const setNeed = (i, patch) => onUpdate(f.id, { visual_resources: needs.map((n, j) => j === i ? { ...n, ...patch } : n) });
  const setAvatar = (id, patch) => onUpdate(f.id, { avatars: avatars.map(a => a.id === id ? { ...a, ...patch } : a) });
  const addAvatar = () => onUpdate(f.id, { avatars: [...avatars, { id: rid('av'), name: '', audience: '', status: 'En grabación', ad_url: '' }] });
  const removeAvatar = (id) => onUpdate(f.id, { avatars: avatars.filter(a => a.id !== id) });

  const trk = [
    pOk ? { label: 'Pixel', bg: '#ECFDF5', color: '#16A34A', border: 'transparent', solid: true, ok: true }
        : { label: 'Pixel', bg: '#fff', color: '#B0926A', border: '#E6D3A3', solid: false, ok: false },
    cOk ? { label: 'Clarity', bg: '#E0F2FE', color: '#0B6FA8', border: 'transparent', solid: true, ok: true }
        : { label: 'Clarity', bg: '#fff', color: '#B0926A', border: '#E6D3A3', solid: false, ok: false },
    { label: events.length + ' eventos', bg: events.length ? '#F1ECFE' : '#fff', color: events.length ? '#7C3AED' : '#B0926A', border: events.length ? 'transparent' : '#E6D3A3', solid: !!events.length, ok: false },
  ];

  return (
    <div className="border-b border-[#F0F2F5] last:border-b-0">
      <div onClick={() => setOpen(o => !o)} className="w-full grid items-center py-[13px] px-4 bg-white font-sans cursor-pointer text-left hover:bg-[#FAFBFC]" style={{ gridTemplateColumns: GRID, borderLeft: `3px solid ${st.color}` }}>
        <div className="flex items-center gap-[11px] min-w-0">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#EEF2FF', color: '#2E69E0' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" /></svg></span>
          <div className="min-w-0 flex-1">
            <input key={f.id + 'name'} defaultValue={f.name} onClick={e => e.stopPropagation()} onBlur={e => { const v = e.target.value.trim(); if (v && v !== (f.name || '')) onUpdate(f.id, { name: v }); else if (!v) e.target.value = f.name || ''; }} title="Editar nombre del funnel" className="w-full text-[13.5px] font-semibold border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md px-1.5 py-0.5 -ml-1.5 bg-transparent focus:bg-white outline-none" style={{ color: '#1A1D26' }} />
            <div className="flex items-center gap-[7px] mt-0.5">
              <select value={f.strategy_id} onClick={e => e.stopPropagation()} onChange={e => onUpdate(f.id, { strategy_id: e.target.value })} title="Estrategia del funnel (editable)" className="text-[11px] text-[#6B7280] bg-transparent border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded px-1 py-0.5 cursor-pointer outline-none max-w-[150px]">
                {!strategyOptions.some(o => o.id === f.strategy_id) && <option value={f.strategy_id}>{strategyName}</option>}
                {strategyOptions.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              {f.official_domain && <span onClick={(e) => { e.stopPropagation(); copyText(f.official_domain); }} title={`Copiar dominio: ${f.official_domain}`} className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E9384] cursor-pointer hover:underline"><Globe size={11} />{f.official_domain}</span>}
              <span className="inline-flex items-center gap-1 text-[11px] text-[#9CA3AF]" onClick={e => e.stopPropagation()}>Creado
                <input type="date" value={f.created_date || ''} onChange={e => onUpdate(f.id, { created_date: e.target.value || null })} title="Fecha de creación (editable)" className="text-[11px] text-[#6B7280] border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded px-1 py-0.5 bg-transparent cursor-pointer outline-none" />
              </span>
              {missing > 0 && <span className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#A16207] bg-[#FEF9E7] border border-[#F5E6B8] rounded-md py-px px-1.5">Faltan {missing}</span>}
            </div>
          </div>
        </div>
        <div><StatusPill status={f.status || 'activa'} onChange={(v) => onUpdate(f.id, { status: v })} /></div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {links.map((l, i) => <CopyLinkChip key={i} {...l} />)}
          {missingLinks.map((m, i) => <span key={'m' + i} className="inline-flex items-center py-1 px-2.5 border border-dashed border-[#D7DBE2] rounded-md bg-white text-[#AEB4BF] text-[11px] font-semibold">{m}</span>)}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {trk.map((t, i) => <span key={i} onClick={(e) => { e.stopPropagation(); onTrack(f); }} className="inline-flex items-center gap-1 py-1 px-2 rounded-md text-[11px] font-semibold cursor-pointer" style={{ background: t.bg, color: t.color, border: `1px ${t.solid ? 'solid' : 'dashed'} ${t.border}` }}>{t.ok && <Check size={10} strokeWidth={3} />}{t.label}</span>)}
        </div>
        <div className="text-[12px] text-[#6B7280]">{f.updated_at ? new Date(f.updated_at).toLocaleDateString('es-AR') : '—'}</div>
        <div className="flex justify-end"><ChevronDown size={16} className="text-[#B0B6C0] transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} /></div>
      </div>

      {open && (
        <div className="py-1 px-4 pb-[18px] pl-[19px]" style={{ background: '#FCFCFD' }}>
          {/* Enlaces del funnel (editables) */}
          <div className="border border-[#ECEEF2] rounded-xl bg-white p-3 mb-3.5">
            <div className="text-[11px] font-bold tracking-[0.04em] uppercase text-[#9CA3AF] mb-2.5">Enlaces del funnel</div>
            <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr 1fr' }}>
              {[['prod_url', 'Producción', '#2E69E0'], ['testing_url', 'Testing', '#9CA3AF'], ['official_domain', 'Dominio oficial', '#0EA5A0'], ['ads_url', 'Publicidad', '#7C3AED']].map(([k, lbl, col]) => (
                <div key={k}>
                  <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold" style={{ color: col }}>{k === 'official_domain' ? <Globe size={11} /> : <span className="w-2 h-2 rounded-[3px]" style={{ background: col }} />}{lbl}</div>
                  <input defaultValue={f[k] || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f[k] || '')) onUpdate(f.id, { [k]: v || null }); }} placeholder={k === 'official_domain' ? 'tudominio.com' : 'https://…'} className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
                </div>
              ))}
            </div>
            <div className="grid gap-2 mt-2" style={{ gridTemplateColumns: '2fr 1fr' }}>
              <div>
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold" style={{ color: '#EA580C' }}><Rocket size={11} />Boost</div>
                <input defaultValue={f.boost_url || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f.boost_url || '')) onUpdate(f.id, { boost_url: v || null }); }} placeholder="Link para hacer el boost…" className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-[#6B7280]">ID del Pipeline</div>
                <input defaultValue={f.pipeline_id || ''} onBlur={(e) => { const v = e.target.value.trim(); if (v !== (f.pipeline_id || '')) onUpdate(f.id, { pipeline_id: v || null }); }} placeholder="Ej. 9" className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white outline-none focus:border-blue font-mono" />
              </div>
            </div>
            <div className="text-[10.5px] text-[#AEB4BF] mt-1.5">Pegá o editá y hacé clic afuera para guardar. En la tabla, un clic en el chip copia el enlace.</div>
          </div>
          <div className="grid gap-3.5 items-start" style={{ gridTemplateColumns: '1.5fr 1fr' }}>
            {/* Avatares */}
            <div className="border border-[#ECEEF2] rounded-xl bg-white overflow-hidden">
              <div className="flex items-center gap-2.5 py-3 px-3.5 border-b border-[#F0F2F5]">
                <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[7px] shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Users size={14} /></span>
                <div className="flex-1"><div className="text-[12.5px] font-bold text-[#1A1D26]">Variantes de avatar</div><div className="text-[11px] text-[#9CA3AF]">A quién se le publicita · anuncio por avatar</div></div>
                <span className="text-[11px] font-bold text-[#7B8190] bg-[#F0F2F5] rounded-lg py-0.5 px-2">{avatars.length}</span>
              </div>
              <div className="p-2">
                {avatars.map((av, i) => (
                  <div key={av.id} className="rounded-[9px] p-2 hover:bg-[#FAFBFC]">
                    <div className="flex items-center gap-2.5">
                      <span className="inline-flex items-center justify-center w-[30px] h-[30px] rounded-lg bg-[#EEF0F4] text-[#4B5563] text-[13px] font-bold shrink-0">{i + 1}</span>
                      <input key={av.id + 'n'} defaultValue={av.name} onBlur={e => { if (e.target.value !== (av.name || '')) setAvatar(av.id, { name: e.target.value }); }} placeholder="Nombre del avatar" className="flex-1 min-w-0 py-1.5 px-2.5 border border-[#E2E5EB] rounded-lg text-[12.5px] font-semibold text-[#1A1D26] bg-white outline-none focus:border-blue" />
                      <AvatarStatusPill status={av.status} onChange={s => setAvatar(av.id, { status: s })} />
                      <button onClick={() => removeAvatar(av.id)} className="inline-flex items-center justify-center w-7 h-7 border border-[#E2E5EB] rounded-lg bg-white text-[#B0B6C0] cursor-pointer shrink-0 hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 pl-[40px]">
                      <input key={av.id + 'a'} defaultValue={av.audience} onBlur={e => { if (e.target.value !== (av.audience || '')) setAvatar(av.id, { audience: e.target.value }); }} placeholder="¿A quién se le publicita?" className="flex-1 min-w-0 py-1.5 px-2.5 border border-[#E2E5EB] rounded-lg text-[11.5px] text-[#4B5563] bg-white outline-none focus:border-blue" />
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 pl-[40px]">
                      <input key={av.id + 'u'} defaultValue={av.ad_url || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (av.ad_url || '')) setAvatar(av.id, { ad_url: v }); }} placeholder="Link del anuncio (Meta)…" className="flex-1 min-w-0 py-1.5 px-2.5 border border-[#E2E5EB] rounded-lg text-[11.5px] text-[#4B5563] bg-white outline-none focus:border-blue" />
                      {av.ad_url
                        ? <><button onClick={() => openUrl(av.ad_url)} className="inline-flex items-center gap-1.5 py-1.5 px-2.5 border-none rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Megaphone size={12} />Anuncio</button>
                           <button onClick={() => copyText(av.ad_url)} title="Copiar" className="inline-flex items-center justify-center w-7 h-[26px] border border-[#E7E0FB] rounded-lg cursor-pointer shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Copy size={12} /></button></>
                        : <span className="inline-flex items-center py-1.5 px-2.5 border border-dashed border-[#D7DBE2] rounded-lg bg-white text-[#AEB4BF] text-[11px] font-semibold shrink-0">Sin anuncio</span>}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1.5 pl-[40px]">
                      <input key={av.id + 'v'} defaultValue={av.vsl_url || ''} onBlur={e => { const v = e.target.value.trim(); if (v !== (av.vsl_url || '')) setAvatar(av.id, { vsl_url: v }); }} placeholder="Link del VSL…" className="flex-1 min-w-0 py-1.5 px-2.5 border border-[#E2E5EB] rounded-lg text-[11.5px] text-[#4B5563] bg-white outline-none focus:border-blue" />
                      {av.vsl_url
                        ? <><button onClick={() => openUrl(av.vsl_url)} className="inline-flex items-center gap-1.5 py-1.5 px-2.5 border-none rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#EAF7EF', color: '#16A34A' }}><Clapperboard size={12} />VSL</button>
                           <button onClick={() => copyText(av.vsl_url)} title="Copiar" className="inline-flex items-center justify-center w-7 h-[26px] border border-[#CFEBD9] rounded-lg cursor-pointer shrink-0" style={{ background: '#EAF7EF', color: '#16A34A' }}><Copy size={12} /></button></>
                        : <span className="inline-flex items-center py-1.5 px-2.5 border border-dashed border-[#D7DBE2] rounded-lg bg-white text-[#AEB4BF] text-[11px] font-semibold shrink-0">Sin VSL</span>}
                    </div>
                    {/* Especificación del avatar: se vincula un documento de contexto de la estrategia */}
                    <div className="flex items-center gap-1.5 mt-1.5 pl-[40px]">
                      <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold shrink-0" style={{ color: '#EC4899' }}><Brain size={11} />Spec</span>
                      <select value={av.spec_node_id || ''} onChange={e => { const nd = contextDocs.find(d => d.node_id === e.target.value); setAvatar(av.id, { spec_node_id: e.target.value || null, spec_title: nd?.title || null }); }} title="Documento que describe este avatar (entra al cerebro)" className="flex-1 min-w-0 py-1.5 px-2.5 border border-[#E2E5EB] rounded-lg text-[11.5px] text-[#4B5563] bg-white outline-none focus:border-blue cursor-pointer">
                        <option value="">Sin especificación vinculada…</option>
                        {av.spec_node_id && !contextDocs.some(d => d.node_id === av.spec_node_id) && <option value={av.spec_node_id}>{av.spec_title || 'Documento vinculado'}</option>}
                        {contextDocs.map(d => <option key={d.node_id} value={d.node_id}>{d.title}</option>)}
                      </select>
                      {(() => { const nd = contextDocs.find(d => d.node_id === av.spec_node_id); return nd?.web_url
                        ? <button onClick={() => openUrl(nd.web_url)} title="Abrir la spec en Drive" className="inline-flex items-center gap-1.5 py-1.5 px-2.5 border-none rounded-lg text-[11px] font-semibold cursor-pointer shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><FileText size={12} />Ver</button>
                        : null; })()}
                    </div>
                  </div>
                ))}
                <button onClick={addAvatar} className="inline-flex items-center gap-1.5 mt-1 mb-0.5 ml-2 py-[7px] px-2.5 border border-dashed border-[#D0D5DD] rounded-lg bg-white text-[#5B7CF5] text-[11.5px] font-semibold font-sans cursor-pointer hover:bg-[#F5F7FF] hover:border-blue"><Plus size={12} />Agregar variante de avatar</button>
              </div>
            </div>
            {/* Material */}
            <div className="border border-[#ECEEF2] rounded-xl bg-white overflow-hidden">
              <div className="flex items-center gap-2.5 py-3 px-3.5 border-b border-[#F0F2F5]">
                <span className="inline-flex items-center justify-center w-[26px] h-[26px] rounded-[7px] shrink-0" style={{ background: doneCount === needs.length ? '#ECFDF5' : '#FEF9E7', color: doneCount === needs.length ? '#16A34A' : '#C2630A' }}><ArrowRight size={14} /></span>
                <div className="flex-1"><div className="text-[12.5px] font-bold text-[#1A1D26]">Para completar el funnel</div></div>
                <span className="text-[11px] font-bold" style={{ color: doneCount === needs.length ? '#16A34A' : '#A16207' }}>{doneCount} / {needs.length}</span>
              </div>
              <div className="py-1.5 px-2">
                {needs.length === 0 && <div className="text-[11.5px] text-[#AEB4BF] py-2 px-2">Sin material. Agregá con “Material”.</div>}
                {needs.map((n, i) => (
                  <div key={i} className="py-1.5 px-2 rounded-lg hover:bg-[#FAFBFC]">
                    <div className="flex items-center gap-2">
                      <button onClick={() => setNeed(i, { done: !n.done })} title={n.done ? 'Marcar pendiente' : 'Marcar listo'} className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 cursor-pointer border-none" style={n.done ? { background: '#16A34A', color: '#fff' } : { background: '#fff', border: '1.5px dashed #D7B86A' }}>{n.done && <Check size={12} strokeWidth={3} />}</button>
                      <input value={n.label} onChange={e => setNeed(i, { label: e.target.value })} placeholder="Nombre del material" className="flex-1 min-w-0 py-1 px-2 border border-transparent hover:border-[#E2E5EB] focus:border-blue rounded-md text-[12.5px] bg-transparent focus:bg-white outline-none" style={{ color: n.done ? '#1A1D26' : '#6B7280' }} />
                      <button onClick={() => onUpdate(f.id, { visual_resources: needs.filter((_, j) => j !== i) })} title="Borrar material" className="inline-flex items-center justify-center w-6 h-6 rounded-md shrink-0 bg-transparent border-none cursor-pointer text-[#C2C7D0] hover:text-[#DC2626] hover:bg-[#FEECEC]"><Trash2 size={12} /></button>
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 pl-7">
                      <input value={n.url || ''} onChange={e => setNeed(i, { url: e.target.value })} placeholder="Link (Drive)…" className="flex-1 min-w-0 py-1 px-2 border border-[#E2E5EB] rounded-md text-[11px] text-[#4B5563] bg-white outline-none focus:border-blue" />
                      {n.url && <button onClick={() => openUrl(n.url)} className="inline-flex items-center gap-1 py-1 px-2 border border-[#DCE3FF] rounded-md bg-[#F5F7FF] text-[#2E69E0] text-[10.5px] font-semibold font-sans cursor-pointer shrink-0 hover:bg-[#EEF2FF]">Ver</button>}
                    </div>
                  </div>
                ))}
                <button onClick={() => onUpdate(f.id, { visual_resources: [...needs, { label: '', done: false, url: '' }] })} className="inline-flex items-center gap-1.5 mt-1 ml-2 py-1.5 px-2.5 border border-dashed border-[#D0D5DD] rounded-lg bg-white text-[#5B7CF5] text-[11.5px] font-semibold font-sans cursor-pointer hover:bg-[#F5F7FF] hover:border-blue"><Plus size={12} />Material</button>
              </div>
            </div>
          </div>
          <div className="flex justify-end mt-2.5">
            <button onClick={() => { if (window.confirm(`¿Borrar el funnel "${f.name}"?`)) onDelete(f.id); }} className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg bg-transparent border-none text-text3 text-[11.5px] font-semibold cursor-pointer hover:bg-red-bg hover:text-red-500"><Trash2 size={12} />Borrar funnel</button>
          </div>
        </div>
      )}
    </div>
  );
}

// Una estrategia "envuelve" sus documentos + sus funnels (con avatares).
function StrategyGroup({ s, funnels, docs, stratOptions, onUpdate, onDelete, onTrack, onNew }) {
  const [open, setOpen] = useState(true);
  const num = (s.position ?? 0) + 1;
  const st = FUNNEL_STATUS[s.status] || FUNNEL_STATUS.borrador;
  const cleanName = (s.name || '').replace(/^estrategia\s*#?\s*\d+\s*\|?\s*/i, '').trim();
  return (
    <div className="border border-[#E2E5EB] rounded-xl bg-white overflow-hidden mb-3.5">
      <div className="flex items-center gap-2.5 py-3 px-4" style={{ background: '#FBF5FA', borderBottom: open ? '1px solid #F1E5EE' : 'none' }}>
        <button onClick={() => setOpen(o => !o)} className="flex items-center gap-2.5 flex-1 min-w-0 bg-transparent border-none cursor-pointer text-left p-0">
          <ChevronRight size={15} className="shrink-0 text-[#C58BB0] transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'none' }} strokeWidth={2.2} />
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><Layers size={15} /></span>
          <span className="text-[14px] font-bold truncate" style={{ color: '#1A1D26' }}>Estrategia #{num}{cleanName ? <> <span className="text-[#D8C3D2] font-medium">·</span> {cleanName}</> : null}</span>
          <span className="inline-flex items-center py-0.5 px-2 rounded-full text-[10px] font-bold shrink-0" style={{ background: st.bg, color: st.color }}>{st.label}</span>
        </button>
        <span className="text-[11px] text-[#9CA3AF] font-semibold shrink-0">{funnels.length} funnel{funnels.length === 1 ? '' : 's'}</span>
      </div>
      {open && (
        <div className="p-3.5">
          {docs.length > 0 && (
            <div className="mb-3.5">
              <div className="text-[10px] font-bold tracking-[0.06em] uppercase text-[#9CA3AF] mb-2">Documentos de la estrategia</div>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
                {docs.map(d => <ContextDocCard key={d.id} doc={d} />)}
              </div>
            </div>
          )}
          <div className="border border-[#ECEEF2] rounded-xl overflow-hidden">
            <div className="grid items-center py-[10px] px-4 border-b border-[#ECEEF2]" style={{ gridTemplateColumns: GRID, background: '#FAFBFC' }}>
              {['Funnel · página', 'Estado', 'Enlaces', 'Tracking', 'Modificado', ''].map((h, i) => <div key={i} className="text-[10px] font-bold tracking-[0.08em] uppercase text-[#9CA3AF]">{h}</div>)}
            </div>
            {funnels.length === 0
              ? <div className="text-[12px] text-[#9CA3AF] py-6 text-center">Sin funnels en esta estrategia.</div>
              : funnels.map(f => <FunnelRow key={f.id} f={f} strategyName={`Estrategia #${num}`} strategyOptions={stratOptions} onUpdate={onUpdate} onDelete={onDelete} onTrack={onTrack} contextDocs={docs} />)}
          </div>
          <button onClick={() => onNew(s.id)} className="inline-flex items-center gap-1.5 mt-2.5 py-2 px-3 border border-dashed border-[#D0D5DD] rounded-lg bg-white text-[#5B7CF5] text-[12px] font-semibold cursor-pointer hover:bg-[#F5F7FF] hover:border-blue"><Plus size={13} />Nuevo funnel en esta estrategia</button>
        </div>
      )}
    </div>
  );
}

export default function FunnelsView({ clientId }) {
  const { clients, strategies, strategyPages, addStrategyPage, updateStrategyPage, deleteStrategyPage } = useApp();
  const client = useMemo(() => (clients || []).find(c => c.id === clientId) || {}, [clients, clientId]);
  const myStrategies = useMemo(() => (strategies || []).filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0)), [strategies, clientId]);
  const stratOptions = myStrategies.map(s => ({ id: s.id, label: `Estrategia #${(s.position ?? 0) + 1}` }));
  const funnelsOf = (sid) => (strategyPages || []).filter(p => p.strategy_id === sid);

  // Documentos de contexto (client_brain_docs) por nivel.
  const [docs, setDocs] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const fetchDocs = useCallback(async () => {
    try { const d = await sbFetch(`client_brain_docs?client_id=eq.${encodeURIComponent(clientId)}&select=*`); setDocs(Array.isArray(d) ? d : []); } catch { /* noop */ }
  }, [clientId]);
  useEffect(() => { fetchDocs(); }, [fetchDocs]);
  const clientDocs = useMemo(() => docs.filter(d => d.scope === 'client'), [docs]);
  const docsOf = (sid) => docs.filter(d => d.strategy_id === sid);
  const lastSync = useMemo(() => { let m = null; for (const d of docs) if (d.synced_at && (!m || d.synced_at > m)) m = d.synced_at; return m; }, [docs]);
  const sync = async () => { setSyncing(true); try { await supabase.functions.invoke('client-brain-sync', { body: { client_id: clientId } }); await fetchDocs(); } catch { /* noop */ } finally { setSyncing(false); } };

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
      visual_resources: DEFAULT_NEEDS.map(l => ({ label: l, done: false, url: '' })),
    });
    setModal(false); setForm(blankForm());
  };
  const saveTrack = (val) => { updateStrategyPage(trackFunnel.id, { pixel_code: val.pixel_code || null, clarity_id: val.clarity_id || null, conversion_events: val.events }); setTrackFunnel(null); };

  return (
    <div style={{ background: '#FAFBFC' }} className="p-[18px] -mx-1 rounded-xl">
      {/* Contexto del cliente (alimenta todas las estrategias) */}
      <div className="border border-[#E2E5EB] rounded-xl bg-white p-4 mb-4">
        <div className="flex items-center gap-2.5 mb-3 flex-wrap">
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><Brain size={17} /></span>
          <div className="flex-1 min-w-[160px]">
            <div className="text-[13.5px] font-bold text-[#1A1D26]">Contexto del cliente</div>
            <div className="text-[11px] text-[#9CA3AF]">Alimenta a todas las estrategias{lastSync ? ` · sincronizado ${fmtDateTime(lastSync)}` : ''}</div>
          </div>
          <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 py-2 px-3 border-none rounded-[9px] text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: '#EC4899' }}><RefreshCw size={13} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Sincronizando…' : 'Sincronizar contexto'}</button>
        </div>
        <div className="grid gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
          {[['Nicho', client.niche, '#EC4899', Target], ['Servicio', client.service, '#1A1D26', Sparkles], ['Cuello de botella', client.bottleneck, '#CA8A04', Activity]].map((row) => {
            const [lbl, val, col, Ic] = row;
            return (
              <div key={lbl} className="border border-[#F0F2F5] rounded-lg p-2.5 bg-[#FAFBFC]">
                <div className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-wider mb-1 text-[#9CA3AF]"><Ic size={11} />{lbl}</div>
                <div className="text-[12px] font-semibold leading-snug" style={{ color: val ? col : '#C4C9D2' }}>{val || '—'}</div>
              </div>
            );
          })}
        </div>
        {clientDocs.length > 0
          ? <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>{clientDocs.map(d => <ContextDocCard key={d.id} doc={d} />)}</div>
          : <div className="text-[11.5px] text-[#9CA3AF]">Sin documentos de cliente. Marcá el onboarding con 🧠 en Carpetas y tocá Sincronizar.</div>}
      </div>

      {/* Estrategias, cada una envolviendo sus documentos y funnels */}
      {myStrategies.length === 0
        ? <div className="border border-[#E2E5EB] rounded-xl bg-white flex flex-col items-center justify-center text-center py-12 px-5 gap-2"><Zap size={26} className="text-[#C7CCD6]" /><div className="text-[13px] font-semibold text-[#4B5563]">Todavía no hay estrategias</div><div className="text-[11.5px] text-text2">Sincronizá las carpetas del cliente (pestaña Carpetas): las "Estrategia #N" se crean solas.</div></div>
        : myStrategies.map(s => <StrategyGroup key={s.id} s={s} funnels={funnelsOf(s.id)} docs={docsOf(s.id)} stratOptions={stratOptions} onUpdate={updateStrategyPage} onDelete={deleteStrategyPage} onTrack={openTrack} onNew={openNew} />)}

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
