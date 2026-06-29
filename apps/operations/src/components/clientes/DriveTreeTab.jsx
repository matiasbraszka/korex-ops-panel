import { useState, useEffect, useCallback } from 'react';
import { sbFetch, supabase } from '@korex/db';
import { useApp } from '../../context/AppContext';
import {
  Folder, FileText, FileSpreadsheet, Presentation, ChevronRight,
  ExternalLink, RefreshCw, AlertTriangle, FolderOpen,
} from 'lucide-react';

// Pestaña "Carpetas": espejo del árbol de Google Drive del cliente, agrupado por
// estrategia. Lo nutre la rutina diaria `drive-sync` (tabla client_drive_nodes);
// acá solo se lee y se muestra desplegable. Se ven carpetas y documentos de
// Google (los archivos de media no se listan). Cada item abre en Drive.

const NODE_ICON = {
  folder:   { Icon: Folder,          color: '#F59E0B' },
  document: { Icon: FileText,        color: '#3B82F6' },
  sheet:    { Icon: FileSpreadsheet, color: '#10B981' },
  slides:   { Icon: Presentation,    color: '#A855F7' },
};
const DISPLAY_TYPES = Object.keys(NODE_ICON);
const isDisplayable = (n) => DISPLAY_TYPES.includes(n.node_type);

// Extrae el id de Drive de una URL (carpeta o documento).
function driveId(url) {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/\/d\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/); if (m) return m[1];
  return null;
}

// IDs de carpeta que una estrategia tiene linkeados (folders / archivos / legacy).
function strategyFolderIds(s) {
  const ids = [];
  for (const f of (Array.isArray(s.folders) ? s.folders : [])) { const id = driveId(f?.url); if (id) ids.push(id); }
  for (const a of (Array.isArray(s.archivos) ? s.archivos : [])) { if ((a?.category || '') === 'folder') { const id = driveId(a?.url); if (id) ids.push(id); } }
  const d = driveId(s.drive_url); if (d) ids.push(d);
  return ids;
}

function fmtWhen(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

// Una fila del árbol (carpeta desplegable o documento hoja).
function TreeRow({ node, childrenByParent, expanded, onToggle, depth }) {
  const cfg = NODE_ICON[node.node_type] || NODE_ICON.document;
  const Icon = cfg.Icon;
  const isFolder = node.node_type === 'folder';
  const isOpen = expanded.has(node.id);
  const kids = (childrenByParent.get(node.id) || []).filter(isDisplayable);
  const pad = 6 + depth * 16;

  return (
    <div>
      <div
        className="flex items-center gap-1.5 py-1.5 pr-2 rounded-md hover:bg-[#F7F9FC] group"
        style={{ paddingLeft: pad }}
      >
        {isFolder ? (
          <button
            type="button"
            onClick={() => onToggle(node.id)}
            className="w-5 h-5 rounded inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer text-text3 hover:text-blue"
            title={isOpen ? 'Plegar' : 'Desplegar'}
          >
            <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
        ) : (
          <span className="w-5 h-5 shrink-0" />
        )}
        <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: cfg.color + '1A' }}>
          {isFolder && isOpen ? <FolderOpen size={13} style={{ color: cfg.color }} /> : <Icon size={13} style={{ color: cfg.color }} />}
        </span>
        <a
          href={node.web_url}
          target="_blank"
          rel="noreferrer"
          className="flex-1 min-w-0 text-[12.5px] font-medium no-underline truncate hover:text-blue"
          style={{ color: '#1A1D26' }}
          title={node.name}
        >
          {node.name}
        </a>
        {isFolder && kids.length > 0 && (
          <span className="text-[10px] text-text3 shrink-0">{kids.length}</span>
        )}
        <a
          href={node.web_url}
          target="_blank"
          rel="noreferrer"
          className="opacity-0 group-hover:opacity-100 shrink-0 w-6 h-6 rounded inline-flex items-center justify-center text-text3 hover:bg-blue-bg hover:text-blue no-underline transition-opacity"
          title="Abrir en Drive"
        >
          <ExternalLink size={12} />
        </a>
      </div>
      {isFolder && isOpen && kids.length > 0 && (
        <div>
          {kids.map((ch) => (
            <TreeRow key={ch.id} node={ch} childrenByParent={childrenByParent} expanded={expanded} onToggle={onToggle} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function DriveTreeTab({ client }) {
  const { strategies } = useApp();
  const [nodes, setNodes] = useState(null); // null = cargando
  const [error, setError] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  const load = useCallback(async () => {
    setError(null);
    try {
      const rows = await sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(client.id)}&select=*`);
      setNodes(Array.isArray(rows) ? rows : []);
    } catch (e) {
      setError(String(e?.message || e));
      setNodes([]);
    }
  }, [client.id]);

  useEffect(() => { setNodes(null); setExpanded(new Set()); load(); }, [load]);

  const toggle = useCallback((id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const syncNow = async () => {
    setSyncing(true);
    try {
      await supabase.functions.invoke('drive-sync', { body: { client_id: client.id } });
      await load();
    } catch (e) {
      setError('No se pudo sincronizar: ' + String(e?.message || e));
    } finally {
      setSyncing(false);
    }
  };

  const myStrategies = (strategies || [])
    .filter((s) => s.client_id === client.id)
    .sort((a, b) => (a.position || 0) - (b.position || 0));

  // ── Sin link raíz ──
  if (!client.driveFolderUrl) {
    return (
      <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10 mb-4">
        <div className="text-[13px] font-medium mb-1" style={{ color: '#1A1D26' }}>Falta el link de la carpeta raíz</div>
        <div className="text-[11.5px] text-text2">Agregá la carpeta de Drive del cliente desde <b>Editar cliente</b> para que el panel la sincronice sola.</div>
      </div>
    );
  }

  if (nodes === null) {
    return <div className="text-center text-text3 text-xs py-12">Cargando carpetas…</div>;
  }

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const childrenByParent = new Map();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    if (!childrenByParent.has(n.parent_id)) childrenByParent.set(n.parent_id, []);
    childrenByParent.get(n.parent_id).push(n);
  }
  // Orden estable: carpetas primero, después por nombre.
  for (const list of childrenByParent.values()) {
    list.sort((a, b) => {
      const af = a.node_type === 'folder' ? 0 : 1, bf = b.node_type === 'folder' ? 0 : 1;
      if (af !== bf) return af - bf;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }

  const root = nodes.find((n) => n.is_root) || nodes.find((n) => !n.parent_id);
  const lastSync = nodes.reduce((mx, n) => (n.last_seen_at > mx ? n.last_seen_at : mx), '');

  // Nodos "entrada" de una estrategia: tienen su strategy_id pero su padre no
  // (la raíz de su subárbol). De ahí colgamos el contenido en la sección.
  const entryNodesFor = (sid) => nodes.filter((n) =>
    n.strategy_id === sid && (!n.parent_id || nodeById.get(n.parent_id)?.strategy_id !== sid));

  // Hijos directos de la raíz que no pertenecen a ninguna estrategia → "Otras carpetas".
  const looseTop = (root ? (childrenByParent.get(root.id) || []) : [])
    .filter((n) => !n.strategy_id && isDisplayable(n));

  const Section = ({ title, openLink, stale, children }) => (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden mb-3">
      <div className="flex items-center gap-2 py-2.5 px-3 border-b border-[#F0F2F5]" style={{ background: '#F5F7FF' }}>
        <Folder size={14} className="text-blue shrink-0" />
        <span className="text-[13px] font-bold flex-1 min-w-0 truncate" style={{ color: '#1A1D26' }}>{title}</span>
        {stale ? (
          <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold py-[2px] px-2 rounded-full" style={{ background: '#FEF2F2', color: '#EF4444' }}>
            <AlertTriangle size={11} /> carpeta no encontrada
          </span>
        ) : openLink ? (
          <a href={openLink} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11px] no-underline py-1 px-2 rounded-md shrink-0" style={{ background: '#EEF2FF', color: '#5B7CF5' }}>
            Abrir <ExternalLink size={11} />
          </a>
        ) : null}
      </div>
      <div className="py-1.5">{children}</div>
    </div>
  );

  const renderChildrenOf = (parentId) => {
    const kids = (childrenByParent.get(parentId) || []).filter(isDisplayable);
    if (!kids.length) return <div className="text-[11.5px] italic px-3 py-2" style={{ color: '#9CA3AF' }}>Carpeta vacía (o solo con archivos de media).</div>;
    return kids.map((ch) => (
      <TreeRow key={ch.id} node={ch} childrenByParent={childrenByParent} expanded={expanded} onToggle={toggle} depth={0} />
    ));
  };

  return (
    <div className="mb-4">
      {/* Encabezado: estado de sincronización */}
      <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
        <div className="text-[11.5px]" style={{ color: '#6B7280' }}>
          <span className="inline-flex items-center gap-1.5">
            <RefreshCw size={12} className="text-[#9CA3AF]" />
            Se sincroniza solo todos los días · última actualización <b>{fmtWhen(lastSync)}</b>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a href={client.driveFolderUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#E2E5EB] bg-white text-[12px] font-medium no-underline hover:border-blue hover:text-blue" style={{ color: '#6B7280' }}>
            <ExternalLink size={13} /> Carpeta raíz
          </a>
          <button
            onClick={syncNow}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-[#E2E5EB] bg-white text-[12px] font-medium cursor-pointer hover:border-blue hover:text-blue disabled:opacity-50"
            style={{ color: '#1A1D26' }}
          >
            <RefreshCw size={13} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Sincronizando…' : 'Sincronizar ahora'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-[11.5px] py-2 px-3 rounded-lg mb-3" style={{ background: '#FEF2F2', color: '#B91C1C' }}>{error}</div>
      )}

      {nodes.length === 0 ? (
        <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10">
          <div className="text-[13px] font-medium mb-1" style={{ color: '#1A1D26' }}>Todavía no hay carpetas sincronizadas</div>
          <div className="text-[11.5px] text-text2 mb-3">La sincronización corre automáticamente cada día. Si querés verlas ya, tocá "Sincronizar ahora".</div>
        </div>
      ) : (
        <>
          {/* Una sección por estrategia del panel */}
          {myStrategies.map((s) => {
            const entries = entryNodesFor(s.id);
            const linkedIds = strategyFolderIds(s);
            const stale = linkedIds.length > 0 && !linkedIds.some((id) => nodeById.has(id));
            // Si no hay carpeta vinculada ni link, no mostramos la sección.
            if (!entries.length && !stale) return null;
            const head = entries[0];
            return (
              <Section key={s.id} title={s.name} openLink={head?.web_url} stale={stale && !entries.length}>
                {entries.length
                  ? entries.map((en) => (
                      <div key={en.id}>{renderChildrenOf(en.id)}</div>
                    ))
                  : (
                    <div className="text-[11.5px] italic px-3 py-2" style={{ color: '#9CA3AF' }}>
                      El link de carpeta de esta estrategia ya no existe en Drive. Revisá el link en la pestaña Recursos.
                    </div>
                  )}
              </Section>
            );
          })}

          {/* Carpetas/documentos no vinculados a ninguna estrategia */}
          {looseTop.length > 0 && (
            <Section title="Otras carpetas" openLink={root?.web_url}>
              {looseTop.map((n) => (
                <TreeRow key={n.id} node={n} childrenByParent={childrenByParent} expanded={expanded} onToggle={toggle} depth={0} />
              ))}
            </Section>
          )}
        </>
      )}
    </div>
  );
}
