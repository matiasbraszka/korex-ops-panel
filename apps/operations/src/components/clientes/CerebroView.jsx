// CerebroView — el "mini-cerebro" de un cliente: el contexto que alimenta al
// cerebro de marketing. Muestra, de forma visual, los pilares:
//   1. Identidad (nicho, servicio, cuello de botella)
//   2. Documentos de contexto con su TEXTO ingerido: DEL · Onboarding · Investigación · Extra
//   3. Fijar documentos a mano (pins) → suma avatares/análisis que no se detectan por nombre
//   4. Estrategia actual (avatares → funnels → VSL/anuncios)
//
// El texto se ingiere con la edge function `client-brain-sync` ("Sincronizar
// contexto"); el panel lee client_brain_docs y administra client_brain_pins.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import {
  Brain, RefreshCw, FileText, Search as SearchIcon, Sparkles, Target,
  Layers, Megaphone, Film, ExternalLink, ChevronDown, ChevronRight, Users, Pin, Plus, X,
} from 'lucide-react';
import { fmtDateTime } from '../../utils/helpers';
import { openUrl } from './recursosShared';

const DOC_META = {
  del:           { label: 'DEL · Documento en limpio', Icon: Sparkles, color: '#C79A3E', bg: '#FCEFD0' },
  onboarding:    { label: 'Onboarding',    Icon: FileText,  color: '#2E69E0', bg: '#E9F1FF' },
  investigacion: { label: 'Investigación', Icon: SearchIcon, color: '#7C3AED', bg: '#F4F1FE' },
  extra:         { label: 'Contexto extra', Icon: Pin,      color: '#EC4899', bg: '#FDF2F8' },
};
const KIND_ORDER = { del: 0, onboarding: 1, investigacion: 2, extra: 3 };

const AVATAR_STATUS_COLOR = { 'En grabación': '#CA8A04', 'En edición': '#2E69E0', 'Editados': '#16A34A' };
const FUNNEL_STATUS_COLOR = { activa: '#16A34A', borrador: '#CA8A04', pausada: '#6B7280', antiguo: '#9CA3AF' };

function DocCard({ doc }) {
  const [open, setOpen] = useState(false);
  const meta = DOC_META[doc.doc_kind] || DOC_META.extra;
  const { Icon } = meta;
  const text = doc.text || '';
  const preview = text.slice(0, 600);
  const hasMore = text.length > 600;

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center gap-2.5 p-3.5 border-b border-[#F0F2F5]">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: meta.bg, color: meta.color }}>
          <Icon size={17} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-[#1A1D26] truncate">{doc.title || meta.label}</div>
          <div className="text-[11px] text-[#9CA3AF] truncate">
            {meta.label} · {(doc.char_count || 0).toLocaleString()} caracteres · {doc.synced_at ? fmtDateTime(doc.synced_at) : '—'}
          </div>
        </div>
        {doc.web_url && (
          <button onClick={() => openUrl(doc.web_url)} title="Abrir en Drive" className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-white border border-[#E2E8FA] cursor-pointer text-[#9CA3AF] hover:bg-[#F5F7FF] hover:text-[#2E69E0] shrink-0">
            <ExternalLink size={14} />
          </button>
        )}
      </div>
      {text ? (
        <div className="p-3.5">
          <div className="text-[12.5px] leading-relaxed text-[#4B5563] whitespace-pre-wrap">
            {open ? text : preview}{!open && hasMore ? '…' : ''}
          </div>
          {hasMore && (
            <button onClick={() => setOpen(o => !o)} className="mt-2 inline-flex items-center gap-1 text-[12px] font-semibold text-[#2E69E0] bg-transparent border-none cursor-pointer p-0 hover:underline">
              {open ? <><ChevronDown size={13} className="rotate-180" /> Ver menos</> : <><ChevronRight size={13} /> Ver todo</>}
            </button>
          )}
        </div>
      ) : (
        <div className="p-3.5 text-[12px] text-[#9CA3AF]">El documento existe pero no tiene texto extraído.</div>
      )}
    </div>
  );
}

function Fact(props) {
  const { Icon, label, value, color = '#1A1D26' } = props;
  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5 flex flex-col">
      <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#9CA3AF' }}>
        <Icon size={12} /> {label}
      </div>
      <div className="text-[13.5px] font-semibold leading-snug" style={{ color: value ? color : '#C4C9D2' }}>{value || '—'}</div>
    </div>
  );
}

function AvatarRow({ av }) {
  const stColor = AVATAR_STATUS_COLOR[av.status] || '#6B7280';
  return (
    <div className="flex items-center gap-2 py-2 px-2.5 rounded-lg bg-[#FAFBFC] border border-[#F0F2F5]">
      <Users size={13} className="text-[#9CA3AF] shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-[#1A1D26] truncate">{av.name || 'Avatar sin nombre'}</div>
        {av.audience && <div className="text-[11px] text-[#6B7280] truncate">{av.audience}</div>}
      </div>
      {av.status && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full shrink-0" style={{ color: stColor, background: stColor + '18' }}>{av.status}</span>}
      {av.ad_url && <button onClick={() => openUrl(av.ad_url)} title="Anuncio" className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED', border: 'none', cursor: 'pointer' }}><Megaphone size={12} /></button>}
      {av.vsl_url && <button onClick={() => openUrl(av.vsl_url)} title="VSL" className="inline-flex items-center justify-center w-7 h-7 rounded-md shrink-0" style={{ background: '#E9F1FF', color: '#2E69E0', border: 'none', cursor: 'pointer' }}><Film size={12} /></button>}
    </div>
  );
}

// Selector para FIJAR documentos del Drive al contexto (los que no se detectan por nombre).
function PinPicker({ driveDocs, pinned, onToggle }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return driveDocs
      .filter(d => !needle || (d.name || '').toLowerCase().includes(needle))
      .sort((a, b) => {
        const ap = pinned.has(a.id) ? 0 : 1, bp = pinned.has(b.id) ? 0 : 1;
        if (ap !== bp) return ap - bp;
        return (a.name || '').localeCompare(b.name || '', 'es');
      });
  }, [driveDocs, q, pinned]);

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden mb-4">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2 p-3.5 bg-transparent border-none cursor-pointer text-left">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><Pin size={15} /></div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-semibold text-[#1A1D26]">Sumar documentos al contexto</div>
          <div className="text-[11px] text-[#9CA3AF]">Fijá a mano avatares, análisis o cualquier doc que el cerebro deba conocer{pinned.size ? ` · ${pinned.size} fijado(s)` : ''}</div>
        </div>
        {open ? <ChevronDown size={16} className="text-[#9CA3AF]" /> : <ChevronRight size={16} className="text-[#9CA3AF]" />}
      </button>
      {open && (
        <div className="border-t border-[#F0F2F5] p-3.5">
          <div className="flex items-center gap-2 mb-2.5 py-2 px-3 border border-[#E2E5EB] rounded-[10px] bg-[#FAFBFC]">
            <SearchIcon size={14} className="text-[#9CA3AF]" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar documento del Drive…" className="flex-1 border-none bg-transparent text-[13px] text-[#1A1D26] p-0 outline-none" />
            {q && <button onClick={() => setQ('')} className="inline-flex items-center justify-center w-[18px] h-[18px] border-none rounded-full bg-[#EEF0F4] text-[#6B7280] cursor-pointer shrink-0"><X size={11} /></button>}
          </div>
          <div className="grid gap-1.5 max-h-[340px] overflow-y-auto pr-1">
            {list.length === 0 && <div className="text-[12px] text-[#9CA3AF] py-2">Sin documentos.</div>}
            {list.map(d => {
              const isPinned = pinned.has(d.id);
              return (
                <div key={d.id} className="flex items-center gap-2 py-2 px-2.5 rounded-lg border" style={isPinned ? { background: '#FDF2F8', borderColor: '#FBCFE8' } : { background: '#fff', borderColor: '#F0F2F5' }}>
                  <FileText size={13} className="shrink-0" style={{ color: isPinned ? '#EC4899' : '#9CA3AF' }} />
                  <span className="flex-1 min-w-0 text-[12.5px] text-[#1A1D26] truncate" title={d.name}>{d.name}</span>
                  {d.web_url && <button onClick={() => openUrl(d.web_url)} title="Abrir" className="inline-flex items-center justify-center w-6 h-6 rounded-md border-none bg-transparent text-[#9CA3AF] hover:text-[#2E69E0] cursor-pointer shrink-0"><ExternalLink size={12} /></button>}
                  <button onClick={() => onToggle(d, !isPinned)} className="inline-flex items-center gap-1 py-1 px-2 rounded-md text-[11px] font-semibold cursor-pointer border shrink-0" style={isPinned ? { background: '#EC4899', color: '#fff', borderColor: '#EC4899' } : { background: '#fff', color: '#6B7280', borderColor: '#E2E5EB' }}>
                    {isPinned ? <><Pin size={11} /> Fijado</> : <><Plus size={11} /> Fijar</>}
                  </button>
                </div>
              );
            })}
          </div>
          <div className="text-[11px] text-[#9CA3AF] mt-2.5 flex items-center gap-1.5">
            <RefreshCw size={11} /> Después de fijar, tocá "Sincronizar contexto" arriba para traer el texto.
          </div>
        </div>
      )}
    </div>
  );
}

export default function CerebroView({ client }) {
  const { clients, strategies, strategyPages } = useApp();
  const c = (clients || []).find(x => x.id === client?.id) || client || {};

  const [docs, setDocs] = useState([]);
  const [driveDocs, setDriveDocs] = useState([]);
  const [pinned, setPinned] = useState(() => new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [d, nodes, pins] = await Promise.all([
        sbFetch(`client_brain_docs?client_id=eq.${encodeURIComponent(c.id)}&select=*`),
        sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(c.id)}&node_type=in.(document,sheet,slides,pdf)&select=id,name,node_type,web_url`),
        sbFetch(`client_brain_pins?client_id=eq.${encodeURIComponent(c.id)}&select=node_id`),
      ]);
      setDocs(Array.isArray(d) ? d : []);
      setDriveDocs(Array.isArray(nodes) ? nodes : []);
      setPinned(new Set((Array.isArray(pins) ? pins : []).map(p => p.node_id)));
    } catch { /* noop */ } finally { setLoading(false); }
  }, [c.id]);
  useEffect(() => { fetchAll(); }, [fetchAll]);

  const orderedDocs = useMemo(
    () => [...docs].sort((a, b) => (KIND_ORDER[a.doc_kind] ?? 9) - (KIND_ORDER[b.doc_kind] ?? 9) || (b.char_count || 0) - (a.char_count || 0)),
    [docs],
  );
  const lastSync = useMemo(() => {
    let max = null;
    for (const d of docs) if (d.synced_at && (!max || d.synced_at > max)) max = d.synced_at;
    return max;
  }, [docs]);

  const myStrategies = (strategies || []).filter(s => s.client_id === c.id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const pagesByStrategy = (sid) => (strategyPages || []).filter(p => p.strategy_id === sid).sort((a, b) => (a.position || 0) - (b.position || 0));

  const togglePin = async (doc, pin) => {
    // Optimista
    setPinned(prev => { const n = new Set(prev); if (pin) n.add(doc.id); else n.delete(doc.id); return n; });
    try {
      if (pin) await supabase.from('client_brain_pins').insert({ client_id: c.id, node_id: doc.id, label: doc.name || null });
      else await supabase.from('client_brain_pins').delete().eq('client_id', c.id).eq('node_id', doc.id);
    } catch { fetchAll(); /* revertir con la verdad del server */ }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('client-brain-sync', { body: { client_id: c.id } });
      await fetchAll();
    } catch { /* noop */ } finally { setSyncing(false); }
  };

  return (
    <div style={{ background: '#FAFBFC' }} className="p-[18px] -mx-1 rounded-xl">
      {/* Header */}
      <div className="flex items-center gap-2.5 mb-4 flex-wrap">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><Brain size={18} /></div>
        <div className="flex-1 min-w-[180px]">
          <div className="text-[14px] font-bold text-[#1A1D26] leading-tight">Cerebro del cliente</div>
          <div className="text-[11.5px] text-[#9CA3AF]">El contexto que alimenta al cerebro de marketing{lastSync ? ` · sincronizado ${fmtDateTime(lastSync)}` : ''}</div>
        </div>
        <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border-none rounded-[10px] text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: '#EC4899' }}>
          <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Sincronizando…' : 'Sincronizar contexto'}
        </button>
      </div>

      {/* 1. Identidad */}
      <div className="grid gap-3 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
        <Fact Icon={Target} label="Nicho" value={c.niche} color="#EC4899" />
        <Fact Icon={Sparkles} label="Servicio" value={c.service} />
        <Fact Icon={Target} label="Cuello de botella" value={c.bottleneck} color="#CA8A04" />
      </div>
      {c.notes && (
        <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5 mb-4">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-1.5" style={{ color: '#9CA3AF' }}><FileText size={12} /> Notas internas</div>
          <div className="text-[12.5px] leading-relaxed text-[#4B5563] whitespace-pre-wrap">{c.notes}</div>
        </div>
      )}

      {/* 2. Documentos de contexto */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-2">Documentos de contexto</div>
      {loading ? (
        <div className="text-[12.5px] text-[#9CA3AF] py-6 text-center">Cargando…</div>
      ) : orderedDocs.length === 0 ? (
        <div className="bg-white border border-[#E2E5EB] rounded-xl p-4 text-[12.5px] text-[#9CA3AF] mb-2">
          Todavía no hay contexto ingerido. Tocá "Sincronizar contexto" para leer el DEL y el onboarding del Drive del cliente.
        </div>
      ) : (
        <div className="grid gap-3 mb-2" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
          {orderedDocs.map(d => <DocCard key={d.id} doc={d} />)}
        </div>
      )}
      <div className="text-[11px] text-[#9CA3AF] mb-4 flex items-center gap-1.5">
        <Sparkles size={11} /> El briefing, la personalidad y el objetivo del cliente viven dentro del DEL. El cerebro los lee de ahí.
      </div>

      {/* 3. Fijar documentos a mano */}
      {!loading && <PinPicker driveDocs={driveDocs} pinned={pinned} onToggle={togglePin} />}

      {/* 4. Estrategia actual */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF] mb-2">Estrategia actual · avatares → funnels → VSL/anuncios</div>
      {myStrategies.length === 0 ? (
        <div className="bg-white border border-[#E2E5EB] rounded-xl p-4 text-[12.5px] text-[#9CA3AF]">Todavía no hay estrategias cargadas para este cliente.</div>
      ) : (
        <div className="grid gap-3">
          {myStrategies.map((s, i) => {
            const pages = pagesByStrategy(s.id);
            const stColor = FUNNEL_STATUS_COLOR[s.status] || '#6B7280';
            return (
              <div key={s.id} className="bg-white border border-[#E2E5EB] rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 p-3.5 border-b border-[#F0F2F5]">
                  <div className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={{ background: '#FDF2F8', color: '#EC4899' }}><Layers size={14} /></div>
                  <div className="text-[13px] font-semibold text-[#1A1D26] flex-1 min-w-0 truncate">#{(s.position || i) + 1} · {s.name || 'Estrategia'}</div>
                  {s.status && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full shrink-0" style={{ color: stColor, background: stColor + '18' }}>{s.status}</span>}
                </div>
                <div className="p-3.5 grid gap-2.5">
                  {pages.length === 0 && <div className="text-[12px] text-[#9CA3AF]">Sin funnels cargados.</div>}
                  {pages.map(p => {
                    const avatars = Array.isArray(p.avatars) ? p.avatars : [];
                    const pColor = FUNNEL_STATUS_COLOR[p.status] || '#6B7280';
                    return (
                      <div key={p.id} className="border border-[#F0F2F5] rounded-lg p-2.5">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="text-[12.5px] font-semibold text-[#1A1D26] flex-1 min-w-0 truncate">{p.name || 'Funnel'}</span>
                          {p.status && <span className="text-[10px] font-bold py-0.5 px-1.5 rounded-full shrink-0" style={{ color: pColor, background: pColor + '18' }}>{p.status}</span>}
                          <span className="text-[10.5px] font-semibold text-[#9CA3AF] shrink-0">{avatars.length} avatar{avatars.length === 1 ? '' : 'es'}</span>
                        </div>
                        {avatars.length > 0 && <div className="grid gap-1.5">{avatars.map(av => <AvatarRow key={av.id} av={av} />)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
