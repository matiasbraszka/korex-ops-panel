// Pestaña "Carpetas": árbol de Drive por estrategia (la estrategia la define la
// carpeta "Estrategia #N"), con el DEL fijado solo. Diseño "Recursos y Carpetas".
import { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch, supabase } from '@korex/db';
import {
  Search, X, ExternalLink, RefreshCw, ChevronRight, Folder, FileText, Plus, Link2, Key, Pin,
} from 'lucide-react';
import { fmtDate } from '../../utils/helpers';
import {
  CopyButton, NODE_ICON, isDisplayableNode, isDelDoc, isOnboardingDoc, isAutoPinned, pinBadge, buildChildrenMap,
  AccessFormModal, LinkFormModal, openUrl, CredRow,
} from './recursosShared';

// Una fila del árbol (ya aplanado): carpeta o documento.
function TreeRow({ row }) {
  const cfg = NODE_ICON[row.node_type] || NODE_ICON.document;
  const Icon = cfg.Icon;
  return (
    <div className="flex items-center gap-1.5 py-[7px] pr-2 rounded-lg group/tr" style={{ paddingLeft: row.indent, background: row.pinned ? '#FFFCF2' : 'transparent' }}>
      <button onClick={row.onMain} className="flex-1 min-w-0 flex items-center gap-2.5 bg-transparent border-none p-0 font-sans cursor-pointer text-left">
        {row.expandable
          ? <ChevronRight size={13} className="shrink-0 text-[#A8AFBC] transition-transform" style={{ transform: row.open ? 'rotate(90deg)' : 'rotate(0deg)' }} strokeWidth={2.3} />
          : <span className="w-[13px] shrink-0" />}
        <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
          <Icon size={13} style={{ color: cfg.color }} />
        </span>
        <span className="flex-1 min-w-0 text-[12.5px] truncate" style={{ fontWeight: row.node_type === 'folder' ? 600 : 400, color: '#1A1D26' }} title={row.name}>{row.name}</span>
        {row.pinned && (
          <span className="inline-flex items-center gap-1 py-[1px] px-[7px] rounded-full text-[10px] font-bold shrink-0" style={{ background: '#FFF4D6', color: '#B27D0B' }}>
            <Pin size={10} fill="currentColor" stroke="none" />{row.badge}
          </span>
        )}
      </button>
      {!row.locked && (
        <button onClick={row.onPin} title={row.pinned ? 'Quitar de fijados' : 'Fijar arriba'}
          className="w-[26px] h-[26px] rounded-md inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer hover:bg-[#EEF0F4]" style={{ color: row.pinned ? '#E0A93B' : '#C2C7D0' }}>
          <Pin size={13} fill={row.pinned ? '#FBE6B0' : 'none'} />
        </button>
      )}
      <button onClick={row.onOpen} title="Abrir en Drive" className="w-[26px] h-[26px] rounded-md inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer text-[#B0B6C0] hover:bg-[#EEF2FF] hover:text-[#2E69E0]">
        <ExternalLink size={13} />
      </button>
    </div>
  );
}

// Un bloque = una estrategia (definida por su carpeta de Drive).
function StrategyBlock({ s, nodes, pages, q }) {
  const { updateStrategy } = useApp();
  const [open, setOpen] = useState(true);
  const [folders, setFolders] = useState(() => new Set());
  const toggleFolder = (id) => setFolders(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const myNodes = useMemo(() => nodes.filter(n => n.strategy_id === s.id), [nodes, s.id]);
  const childrenByParent = useMemo(() => buildChildrenMap(myNodes), [myNodes]);
  // Carpeta "Estrategia #N" (entrada): la guardada o el nodo más superficial.
  const entry = useMemo(() => {
    if (s.drive_folder_id && myNodes.some(n => n.id === s.drive_folder_id)) return s.drive_folder_id;
    let e = null;
    for (const n of myNodes) if (!e || (n.depth ?? 0) < (myNodes.find(x => x.id === e)?.depth ?? 99)) e = n.id;
    return e;
  }, [myNodes, s.drive_folder_id]);
  const entryNode = myNodes.find(n => n.id === entry);
  const topLevel = useMemo(() => (childrenByParent.get(entry) || []).filter(isDisplayableNode), [childrenByParent, entry]);

  const pinnedIds = Array.isArray(s.pinned_nodes) ? s.pinned_nodes : [];
  const pinnedSet = new Set(pinnedIds);
  const isPinned = (n) => isAutoPinned(n) || pinnedSet.has(n.id);
  const togglePin = (n) => {
    const next = pinnedSet.has(n.id) ? pinnedIds.filter(x => x !== n.id) : [...pinnedIds, n.id];
    updateStrategy(s.id, { pinned_nodes: next });
  };
  // Orden de fijados: DEL primero, luego onboarding, luego lo fijado a mano.
  const pinRank = (n) => isDelDoc(n) ? 0 : isOnboardingDoc(n) ? 1 : 2;

  const query = (q || '').trim().toLowerCase();

  // Acceso rápido: DEL, onboarding y lo fijado se muestran SIEMPRE arriba (aunque
  // estén anidados dentro de una carpeta cerrada).
  const pinnedFlat = myNodes
    .filter(n => isDisplayableNode(n) && n.id !== entry && isPinned(n))
    .sort((a, b) => pinRank(a) - pinRank(b));
  const pinnedRow = (n) => ({
    key: 'pin-' + n.id, name: n.name, node_type: n.node_type, indent: 12,
    expandable: false, open: false, pinned: true, badge: pinBadge(n), locked: isAutoPinned(n),
    onMain: () => openUrl(n.web_url), onOpen: () => openUrl(n.web_url), onPin: () => togglePin(n),
  });

  // Aplana el subárbol respetando expandidos; fijados (incl. DEL) primero.
  const rows = [];
  const walk = (parentId, depth) => {
    let items = (childrenByParent.get(parentId) || []).filter(isDisplayableNode);
    items = [...items].sort((a, b) => (isPinned(b) ? 1 : 0) - (isPinned(a) ? 1 : 0));
    for (const n of items) {
      const kids = (childrenByParent.get(n.id) || []).filter(isDisplayableNode);
      const expandable = n.node_type === 'folder' && kids.length > 0;
      const opened = expandable && folders.has(n.id);
      rows.push({
        key: n.id, name: n.name, node_type: n.node_type,
        indent: 12 + depth * 22, expandable, open: opened,
        pinned: isPinned(n), badge: pinBadge(n), locked: isAutoPinned(n),
        onMain: expandable ? () => toggleFolder(n.id) : () => openUrl(n.web_url),
        onOpen: () => openUrl(n.web_url), onPin: () => togglePin(n),
      });
      if (opened) walk(n.id, depth + 1);
    }
  };
  const searchRows = [];
  const searchWalk = (parentId) => {
    for (const n of (childrenByParent.get(parentId) || []).filter(isDisplayableNode)) {
      if ((n.name || '').toLowerCase().includes(query)) {
        searchRows.push({ key: n.id, name: n.name, node_type: n.node_type, indent: 12, expandable: false, open: false, pinned: isPinned(n), badge: pinBadge(n), locked: isAutoPinned(n), onMain: () => openUrl(n.web_url), onOpen: () => openUrl(n.web_url), onPin: () => togglePin(n) });
      }
      searchWalk(n.id);
    }
  };
  if (open) { if (query) searchWalk(entry); else walk(entry, 0); }
  const finalRows = query ? searchRows : rows;

  const num = (s.position ?? 0) + 1;
  const created = s.start_date ? fmtDate(s.start_date) : '';

  return (
    <div className="border border-[#E2E5EB] rounded-xl bg-white overflow-hidden">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center gap-2.5 py-3.5 px-4 border-none text-left cursor-pointer font-sans" style={{ background: '#F6F8FE', borderBottom: open ? '1px solid #EAEEF8' : '1px solid transparent' }}>
        <ChevronRight size={15} className="shrink-0 text-[#7C93C8] transition-transform" style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)' }} strokeWidth={2.2} />
        <span className="inline-flex items-center justify-center w-[22px] h-[22px] text-[#2E69E0] shrink-0"><Folder size={18} fill="#DCE6FB" strokeWidth={1.7} /></span>
        <span className="flex-1 min-w-0 text-[14px] font-bold truncate" style={{ color: '#1A1D26' }}>
          Estrategia #{num}{s.name ? <> <span className="text-[#B9C2D6] font-medium">|</span> {s.name}</> : null}{created ? <> <span className="text-[#B9C2D6] font-medium">|</span> {created}</> : null}
        </span>
        <span className="text-[12px] text-[#8FA0C0] font-bold shrink-0 bg-[#E7EDFB] rounded-lg py-0.5 px-2.5">{topLevel.length}</span>
        {entryNode?.web_url && (
          <span onClick={(e) => { e.stopPropagation(); openUrl(entryNode.web_url); }} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[#2E69E0] text-[12.5px] font-semibold cursor-pointer shrink-0 hover:bg-[#DDE7FB]">
            Abrir <ExternalLink size={13} />
          </span>
        )}
      </button>

      {open && (
        <div className="p-2 border-b border-[#F4F5F8]">
          {!query && pinnedFlat.length > 0 && (
            <div className="mb-1.5 pb-1.5 border-b border-dashed border-[#F0E6C8]">
              <div className="flex items-center gap-1.5 px-3 pt-1 pb-0.5 text-[10px] font-bold uppercase tracking-[0.08em]" style={{ color: '#B27D0B' }}><Pin size={11} fill="currentColor" stroke="none" />Fijados</div>
              {pinnedFlat.map(n => <TreeRow key={'pin-' + n.id} row={pinnedRow(n)} />)}
            </div>
          )}
          {finalRows.length > 0
            ? finalRows.map(r => <TreeRow key={r.key} row={r} />)
            : <div className="py-3.5 px-4 text-[12.5px] text-[#AEB4BF]">{query ? 'Sin coincidencias en esta estrategia.' : (myNodes.length ? 'Carpeta vacía.' : 'Sin sincronizar todavía. Tocá "Sincronizar".')}</div>}
        </div>
      )}

      {/* Funnels vinculados */}
      <div className="flex items-center gap-2.5 py-[11px] px-4 flex-wrap">
        <span className="text-[11px] font-bold tracking-[0.06em] uppercase text-[#9CA3AF] shrink-0">Funnels</span>
        {pages.length === 0 && <span className="text-[12px] text-[#AEB4BF]">Sin funnels aún</span>}
        {pages.map(p => (
          <span key={p.id} className="inline-flex items-center gap-1.5 py-[5px] px-2.5 border border-[#E2E5EB] rounded-full bg-white text-[#1A1D26] text-[12px] font-medium">
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: p.status === 'activa' ? '#16A34A' : '#EAB308' }} />{p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function CarpetasView({ client }) {
  const { clients, strategies, strategyPages, updateClient } = useApp();
  const c = (clients || []).find(x => x.id === client?.id) || client || {};
  const [nodes, setNodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [accModal, setAccModal] = useState(null);
  const [linkModal, setLinkModal] = useState(null);
  const [accView, setAccView] = useState(null);

  const fetchNodes = async () => {
    try {
      const rows = await sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(c.id)}&select=*`);
      setNodes(Array.isArray(rows) ? rows : []);
    } catch { setNodes([]); } finally { setLoading(false); }
  };
  useEffect(() => { let alive = true; setLoading(true); (async () => { await fetchNodes(); if (!alive) return; })(); return () => { alive = false; }; /* eslint-disable-next-line */ }, [c.id]);

  const myStrategies = (strategies || []).filter(s => s.client_id === c.id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const pageIds = new Set(myStrategies.map(s => s.id));
  const pagesByStrategy = (sid) => (strategyPages || []).filter(p => p.strategy_id === sid).sort((a, b) => (a.position || 0) - (b.position || 0));

  const lastSync = useMemo(() => {
    let max = null;
    for (const n of nodes) if (n.last_seen_at && (!max || n.last_seen_at > max)) max = n.last_seen_at;
    return max;
  }, [nodes]);

  // Enlaces + accesos a nivel cliente (clients.links).
  const all = Array.isArray(c.links) ? c.links : [];
  const accesos = all.filter(l => l && l.category === 'acceso');
  const enlaces = all.filter(l => l && l.category !== 'acceso');
  const saveAll = (next) => updateClient(c.id, { links: next });
  const upsertEnlace = (data, ref) => { const idx = ref ? all.indexOf(ref) : -1; const item = { label: data.label, url: data.url, category: 'link' }; saveAll(idx >= 0 ? all.map((x, i) => i === idx ? item : x) : [...all, item]); };
  const upsertAcceso = (data, ref) => { const idx = ref ? all.indexOf(ref) : -1; const item = { ...data, category: 'acceso' }; saveAll(idx >= 0 ? all.map((x, i) => i === idx ? item : x) : [...all, item]); };
  const removeItem = (ref) => saveAll(all.filter(x => x !== ref));

  const sync = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('drive-sync', { body: { client_id: c.id } });
      await fetchNodes();
    } catch { /* noop */ } finally { setSyncing(false); }
  };

  return (
    <div style={{ background: '#FAFBFC' }} className="p-[18px] -mx-1 rounded-xl">
      {/* Barra: enlaces + accesos del cliente */}
      <div className="flex items-center gap-3.5 py-[9px] px-3.5 border border-[#E2E5EB] rounded-[11px] bg-white mb-3.5 flex-wrap">
        <div className="flex items-center gap-[7px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9CA3AF]">Enlaces</span>
          {enlaces.map((g, gi) => (
            <button key={gi} onClick={() => openUrl(g.url)} onContextMenu={(e) => { e.preventDefault(); setLinkModal({ initial: g, ref: g }); }} title={g.url}
              className="inline-flex items-center gap-1.5 py-[5px] px-2.5 border border-[#E8EBF0] rounded-full bg-white text-[#1A1D26] text-[12px] font-medium font-sans cursor-pointer hover:bg-[#F5F7FF] hover:border-[#C9D6FF] hover:text-[#2E69E0]">
              <Link2 size={12} className="text-[#2E69E0]" />{g.label || g.url}
            </button>
          ))}
          <button title="Agregar enlace general" onClick={() => setLinkModal({ initial: null })} className="inline-flex items-center justify-center w-[26px] h-[26px] border border-dashed border-[#D0D5DD] rounded-full bg-white text-[#5B7CF5] cursor-pointer hover:border-blue hover:bg-[#F5F7FF]"><Plus size={12} /></button>
        </div>
        <div className="w-px h-5 bg-[#E8EBF0]" />
        <div className="flex items-center gap-[7px] flex-wrap">
          <span className="text-[10px] font-bold tracking-[0.1em] uppercase text-[#9CA3AF]">Accesos</span>
          {accesos.map((a, ai) => (
            <button key={ai} onClick={() => setAccView(a)} onContextMenu={(e) => { e.preventDefault(); setAccModal({ initial: a, ref: a }); }} title={`Ver credenciales · ${a.label}`}
              className="inline-flex items-center gap-1.5 py-[5px] px-2.5 border border-[#E8EBF0] rounded-full bg-white text-[#1A1D26] text-[12px] font-medium font-sans cursor-pointer hover:bg-[#F7F4FE] hover:border-[#E0D4FB] hover:text-[#7C3AED]">
              <Key size={12} className="text-[#7C3AED]" />{a.label}
            </button>
          ))}
          <button title="Agregar acceso general" onClick={() => setAccModal({ initial: null })} className="inline-flex items-center justify-center w-[26px] h-[26px] border border-dashed border-[#D0D5DD] rounded-full bg-white text-[#5B7CF5] cursor-pointer hover:border-blue hover:bg-[#F5F7FF]"><Plus size={12} /></button>
        </div>
      </div>

      {/* Buscador + acciones */}
      <div className="flex items-center gap-2.5 mb-2 flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[220px] py-[9px] px-3 border border-[#E2E5EB] rounded-[10px] bg-white">
          <Search size={15} className="text-[#9CA3AF]" />
          <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar carpeta o documento…" className="flex-1 border-none bg-transparent font-sans text-[13px] text-[#1A1D26] p-0 outline-none" />
          {q && <button onClick={() => setQ('')} className="inline-flex items-center justify-center w-[18px] h-[18px] border-none rounded-full bg-[#EEF0F4] text-[#6B7280] cursor-pointer shrink-0"><X size={11} /></button>}
        </div>
        <button onClick={() => openUrl(c.drive_folder_url)} disabled={!c.drive_folder_url} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border border-[#E2E5EB] rounded-[10px] bg-white text-[#1A1D26] text-[12.5px] font-semibold font-sans cursor-pointer hover:bg-[#F7F8FA] disabled:opacity-40"><ExternalLink size={14} />Carpeta raíz</button>
        <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border border-[#E2E5EB] rounded-[10px] bg-white text-[#1A1D26] text-[12.5px] font-semibold font-sans cursor-pointer hover:bg-[#F7F8FA] disabled:opacity-60"><RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />{syncing ? 'Sincronizando…' : 'Sincronizar'}</button>
      </div>
      <div className="flex items-center gap-[7px] text-[#9CA3AF] text-[11.5px] mb-4">
        <RefreshCw size={13} />Se sincroniza solo todos los días{lastSync ? <> · última actualización <b className="text-[#6B7280]">{fmtDate(lastSync)}</b></> : null}
      </div>

      {/* Bloques de estrategia */}
      <div className="flex flex-col gap-3">
        {loading && <div className="text-[12.5px] text-[#AEB4BF] py-6 text-center">Cargando carpetas…</div>}
        {!loading && myStrategies.length === 0 && (
          <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10 px-5">
            <div className="text-[13px] font-semibold mb-1" style={{ color: '#1A1D26' }}>Todavía no hay estrategias</div>
            <div className="text-[11.5px] text-text2">Pegá la carpeta raíz del cliente en Editar → "Carpeta de Drive" y tocá <b>Sincronizar</b>: las carpetas "Estrategia #N" se crean solas.</div>
          </div>
        )}
        {!loading && myStrategies.map(s => (
          <StrategyBlock key={s.id} s={s} nodes={nodes} pages={pagesByStrategy(s.id)} q={q} />
        ))}
      </div>

      {linkModal && <LinkFormModal open={!!linkModal} onClose={() => setLinkModal(null)} initial={linkModal.initial} onSave={(data) => upsertEnlace(data, linkModal.ref)} />}
      {accModal && <AccessFormModal open={!!accModal} onClose={() => setAccModal(null)} initial={accModal.initial} onSave={(data) => upsertAcceso(data, accModal.ref)} />}
      {accView && (
        <div onClick={() => setAccView(null)} className="fixed inset-0 z-[110] flex items-start justify-center p-[60px] overflow-y-auto" style={{ background: 'rgba(17,20,24,.42)' }}>
          <div onClick={e => e.stopPropagation()} className="w-[440px] max-w-full bg-white rounded-2xl overflow-hidden" style={{ boxShadow: '0 24px 60px rgba(10,22,40,.28)' }}>
            <div className="flex items-center gap-3 py-[17px] px-5 border-b border-[#EEF0F3]">
              <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Key size={17} /></span>
              <div className="flex-1 min-w-0"><div className="text-[15px] font-bold truncate" style={{ color: '#1A1D26' }}>{accView.label}</div><div className="text-[12px] text-[#9CA3AF]">Credenciales de acceso</div></div>
              <button onClick={() => setAccView(null)} className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#6B7280] cursor-pointer shrink-0"><X size={15} /></button>
            </div>
            <div className="py-[18px] px-5 flex flex-col gap-2.5">
              <CredRow label="Correo" value={accView.email || accView.username} />
              <CredRow label="Contraseña" value={accView.password} mono masked />
            </div>
            <div className="flex items-center justify-between gap-2.5 py-3.5 px-5 border-t border-[#EEF0F3]" style={{ background: '#FAFBFC' }}>
              {accView.url ? <button onClick={() => openUrl(accView.url)} className="inline-flex items-center gap-1.5 py-[9px] px-3.5 border border-[#E2E5EB] rounded-[9px] bg-white text-[#1A1D26] text-[12.5px] font-semibold cursor-pointer hover:bg-[#F7F8FA]"><ExternalLink size={13} />Abrir sitio</button> : <span />}
              <button onClick={() => setAccView(null)} className="py-[9px] px-4 border-none rounded-[9px] bg-blue text-white text-[12.5px] font-semibold cursor-pointer hover:bg-blue-dark">Listo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
