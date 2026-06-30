import { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { sbFetch } from '@korex/db';
import Modal from '../Modal';
import {
  ExternalLink, FileText, Folder, FolderOpen, FileSpreadsheet, Presentation,
  Plus, ChevronDown, ChevronRight, Trash2, Pencil, Check, X, Image as ImageIcon,
  Key, Copy, Eye, EyeOff, Mail, Calendar, Link2, Pin, Star,
} from 'lucide-react';
import { fmtDate } from '../../utils/helpers';

const inputClass = 'text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg bg-white w-full';

function copyText(v) { try { if (v && navigator.clipboard) navigator.clipboard.writeText(v); } catch { /* noop */ } }
function openUrl(url) { if (url) window.open(url, '_blank', 'noopener'); }

// ── Botones reutilizables ───────────────────────────────────────────────────────
function CopyButton({ value, title = 'Copiar' }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e?.preventDefault?.(); e?.stopPropagation?.();
    if (!value) return;
    copyText(value); setCopied(true); setTimeout(() => setCopied(false), 1400);
  };
  return (
    <button type="button" onClick={copy} title={copied ? '¡Copiado!' : title}
      className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#E2E8FA] cursor-pointer text-[#9CA3AF] hover:bg-[#F5F7FF] hover:text-[#2E69E0] transition-colors shrink-0">
      {copied ? <Check size={12} className="text-[#16A34A]" strokeWidth={3} /> : <Copy size={12} />}
    </button>
  );
}

function CopyableRow({ icon: Icon, label, value, masked }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  const display = masked ? (show ? value : '•'.repeat(Math.min(10, value.length))) : value;
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-white border border-[#F0F2F5]">
      <Icon size={11} className="text-text3 shrink-0" />
      <span className="text-[10px] uppercase font-bold tracking-wider shrink-0" style={{ color: '#9CA3AF' }}>{label}</span>
      <span className="flex-1 text-[12px] font-mono truncate" style={{ color: '#1A1D26' }} title={value}>{display}</span>
      {masked && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setShow(s => !s); }}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue shrink-0"
          title={show ? 'Ocultar' : 'Mostrar'}>
          {show ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      <CopyButton value={value} />
    </div>
  );
}

// ── Modal: acceso (cliente o estrategia) ─────────────────────────────────────────
function AccessFormModal({ open, onClose, initial, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({ label: '', url: '', email: '', password: '', notes: '' });
  if (open && form._k !== (initial?.label || 'new')) {
    setForm({
      label: initial?.label || '', url: initial?.url || '',
      email: initial?.email || initial?.username || '', password: initial?.password || '',
      notes: initial?.notes || '', _k: initial?.label || 'new',
    });
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.label.trim()) return;
    onSave({ label: form.label.trim(), url: form.url.trim(), email: form.email.trim(), password: form.password, notes: form.notes.trim() });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar acceso · ${initial?.label}` : 'Nuevo acceso'} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.label.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar acceso'}</button>
        </div>
      }>
      <div className="grid gap-3 p-1">
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre del acceso *</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder="Meta Business Suite, CRM…" autoFocus /></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL de login</label>
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputClass} placeholder="https://app.tucliente.com/login" /></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Email / Usuario</label>
          <input type="text" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} placeholder="usuario@dominio.com" /></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Contraseña</label>
          <input type="text" value={form.password} onChange={e => set('password', e.target.value)} className={inputClass + ' font-mono'} placeholder="••••••••" />
          <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Se guarda tal cual. Visible solo para el equipo.</span></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Notas (opcional)</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className={inputClass + ' resize-y min-h-[60px]'} placeholder="2FA por SMS, pin, etc." /></div>
      </div>
    </Modal>
  );
}

// ── Modal: archivo / enlace (categoría) ──────────────────────────────────────────
const ARCHIVO_CATS = {
  folder: { label: 'Carpeta',      Icon: Folder,       bg: '#EEF2FF', color: '#5B7CF5', placeholder: 'Carpeta de Drive…' },
  doc:    { label: 'Documento',    Icon: FileText,     bg: '#F5F3FF', color: '#8B5CF6', placeholder: 'Guion VSL, Copy…' },
  link:   { label: 'Link externo', Icon: ExternalLink, bg: '#ECFDF5', color: '#16A34A', placeholder: 'Landing, Notion…' },
};
const ARCHIVO_CAT_ORDER = ['folder', 'doc', 'link'];

function LinkFormModal({ open, onClose, initial, defaultCategory = 'folder', onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({ label: '', url: '', category: 'folder' });
  const k = initial?.url || ('new-' + defaultCategory);
  if (open && form._k !== k) {
    setForm({ label: initial?.label || '', url: initial?.url || '', category: initial?.category || defaultCategory, _k: k });
  }
  const set = (key, v) => setForm(f => ({ ...f, [key]: v }));
  const catInfo = ARCHIVO_CATS[form.category] || ARCHIVO_CATS.folder;
  const save = () => {
    if (!form.url.trim()) return;
    onSave({ label: form.label.trim() || catInfo.label, url: form.url.trim(), category: form.category || 'folder' });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar · ${initial?.label}` : 'Nuevo enlace'} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.url.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      }>
      <div className="grid gap-3 p-1">
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Categoría</label>
          <select value={form.category} onChange={e => set('category', e.target.value)} className={inputClass + ' cursor-pointer'}>
            {ARCHIVO_CAT_ORDER.map(c => <option key={c} value={c}>{ARCHIVO_CATS[c].label}</option>)}
          </select></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder={catInfo.placeholder} autoFocus /></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL *</label>
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputClass} placeholder="https://..." /></div>
      </div>
    </Modal>
  );
}

// ── Tracking ─────────────────────────────────────────────────────────────────────
const EVENT_PRESETS = ['Visitas', 'Registro lead', 'Thank you page', 'WhatsApp'];
function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(e => typeof e === 'string' ? { label: e, meta_name: '' } : { label: e?.label || '', meta_name: e?.meta_name || '' });
}

function TrackingModal({ page, onClose, onPatch }) {
  const initialEvents = (() => {
    const events = normalizeEvents(page.conversion_events);
    const byLabel = new Map(events.map(e => [e.label, e.meta_name]));
    const rows = EVENT_PRESETS.map(label => ({ label, meta_name: byLabel.get(label) || '', preset: true }));
    events.forEach(e => { if (!EVENT_PRESETS.includes(e.label) && e.label) rows.push({ label: e.label, meta_name: e.meta_name || '', preset: false }); });
    return rows;
  })();
  const [clarityId, setClarityId] = useState(page.clarity_id || '');
  const [rows, setRows] = useState(initialEvents);
  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addCustom = () => setRows(rs => [...rs, { label: '', meta_name: '', preset: false }]);
  const removeRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));
  const save = () => {
    const cleaned = rows.filter(r => r.label.trim() && (r.meta_name.trim() || !r.preset)).map(r => ({ label: r.label.trim(), meta_name: r.meta_name.trim() }));
    onPatch({ clarity_id: clarityId.trim() || null, conversion_events: cleaned });
    onClose();
  };
  return (
    <Modal open={true} onClose={onClose} title="Configuración de tracking" maxWidth={580}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={save}>Guardar</button>
        </div>
      }>
      <div className="p-1 flex flex-col gap-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Microsoft Clarity</div>
          <div className="grid gap-1">
            <label className="text-[11.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#1A1D26' }}><span className="w-2 h-2 rounded-full" style={{ background: '#0891B2' }} /> Project ID</label>
            <input type="text" value={clarityId} onChange={e => setClarityId(e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="abc12defgh" />
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Eventos de conversión</div>
          <div className="text-[11.5px] mb-3 py-2 px-3 rounded-lg" style={{ background: '#FEFCE8', color: '#92400E' }}>
            Pegá el <b>nombre exacto</b> del evento en Meta. Ej.: si "Visitas" aparece como <span className="font-mono bg-white px-1 rounded">eventos_pre-landing</span>, pegá eso.
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="grid items-center gap-2 p-1.5 rounded-lg" style={{ gridTemplateColumns: '1fr 1.4fr 32px', background: r.preset ? '#F7F9FC' : 'transparent', border: r.preset ? '1px solid #F0F2F5' : '1px dashed #E2E5EB' }}>
                <input type="text" value={r.label} onChange={e => setRow(i, { label: e.target.value })} disabled={r.preset}
                  className={`text-[12.5px] py-1.5 px-2 rounded-md border outline-none ${r.preset ? 'bg-transparent border-transparent font-semibold' : 'bg-white border-[#E2E5EB] focus:border-blue'}`} placeholder="Nombre interno" style={{ color: '#1A1D26' }} />
                <input type="text" value={r.meta_name} onChange={e => setRow(i, { meta_name: e.target.value })}
                  className="text-[12.5px] py-1.5 px-2 rounded-md border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="ej. eventos_pre-landing" style={{ color: '#7C3AED' }} />
                {r.preset ? <span /> : <button type="button" onClick={() => removeRow(i)} className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" title="Quitar"><Trash2 size={12} /></button>}
              </div>
            ))}
          </div>
          <button type="button" onClick={addCustom} className="mt-3 inline-flex items-center gap-1 text-[11.5px] py-1.5 px-3 rounded-md border border-dashed border-[#D0D5DD] text-text3 hover:text-blue hover:border-blue cursor-pointer bg-transparent">
            <Plus size={12} /> Agregar evento custom
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Estados ──────────────────────────────────────────────────────────────────────
const STRAT_STATUS = {
  activa:   { bg: '#ECFDF5', fg: '#16A34A', label: 'Activa' },
  borrador: { bg: '#FEFCE8', fg: '#A16207', label: 'En preparación' },
  pausada:  { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pausada' },
};
const PAGE_STATUS = {
  activa:            { bg: '#ECFDF5', fg: '#16A34A', label: 'Activa' },
  pausada:           { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pausada' },
  'en-construccion': { bg: '#EEF2FF', fg: '#5B7CF5', label: 'En construcción' },
  cambios:           { bg: '#F5F3FF', fg: '#7C3AED', label: 'Haciendo cambios' },
  vieja:             { bg: '#F0F2F5', fg: '#6B7280', label: 'Vieja' },
};

function PageStatusPill({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const cfg = PAGE_STATUS[status] || PAGE_STATUS.activa;
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen(o => !o)} title="Cambiar estado"
        className="inline-flex items-center gap-1 py-[3px] px-2 rounded-full text-[11px] font-bold cursor-pointer hover:opacity-80 border-none max-w-full" style={{ background: cfg.bg, color: cfg.fg }}>
        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.fg }} />
        <span className="truncate">{cfg.label}</span>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full mt-1 bg-white border border-[#E2E5EB] rounded-lg shadow-md z-20 min-w-[150px] overflow-hidden">
            {Object.entries(PAGE_STATUS).map(([k, v]) => (
              <button key={k} className="flex items-center gap-2 w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-blue-bg2 bg-transparent border-none cursor-pointer font-medium" style={{ color: v.fg }} onClick={() => { onChange(k); setOpen(false); }}>
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: v.fg }} />{v.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── Drive (espejo sincronizado) ──────────────────────────────────────────────────
// Colores bien distintos para reconocer de un vistazo carpeta vs documento.
const NODE_ICON = {
  folder:   { Icon: Folder,          color: '#E0922E', bg: '#FDF2DE' }, // ámbar = carpeta
  document: { Icon: FileText,        color: '#2E69E0', bg: '#E9F1FF' }, // azul  = documento
  sheet:    { Icon: FileSpreadsheet, color: '#16A34A', bg: '#E6F7EE' }, // verde = hoja de cálculo
  slides:   { Icon: Presentation,    color: '#A855F7', bg: '#F4ECFE' }, // violeta = presentación
};
const isDisplayableNode = (n) => ['folder', 'document', 'sheet', 'slides'].includes(n.node_type);

// Normaliza un nombre para comparar (minúsculas, sin tildes, sin extensión ni puntuación).
function normLabel(v) {
  return (v || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
// El DEL es el documento clave de la estrategia: lleva el acrónimo "DEL" en mayúsculas.
// El documento clave puede titularse "DEL" (acrónimo en mayúsculas) o "Documento en limpio…".
function isDelDoc(n) {
  if (!n || n.node_type === 'folder') return false;
  const name = n.name || '';
  return /\bDEL\b/.test(name) || /documento\s+en\s+limpio/i.test(name);
}

// Carpetas de la estrategia (para pickers de material / auto-match), las menos profundas primero.
function strategyFolders(nodes) {
  return nodes.filter(n => n.node_type === 'folder')
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0) || (a.name || '').localeCompare(b.name || '', 'es'));
}
// Busca la carpeta cuyo nombre mejor coincide con el label de un material (logo, testimonios…).
function matchFolderForLabel(label, folders) {
  const q = normLabel(label);
  if (!q) return null;
  const qWords = q.split(' ').filter(w => w.length >= 4);
  let best = null, score = 0;
  for (const f of folders) {
    const fn = normLabel(f.name);
    if (!fn) continue;
    let sc = 0;
    if (fn === q) sc = 100;
    else if (fn.includes(q) || q.includes(fn)) sc = 70;
    else { const shared = qWords.filter(w => fn.includes(w)).length; if (shared) sc = 25 + shared * 15; }
    if (sc > score) { score = sc; best = f; }
  }
  return score >= 40 ? best : null;
}

// Carpeta raíz de la estrategia + sus hijos directos (carpetas/documentos) ya sincronizados.
function strategyDriveItems(driveNodes, s) {
  const mine = driveNodes.filter(n => n.strategy_id === s.id);
  if (!mine.length) return { entry: null, items: [] };
  let entry = mine[0];
  for (const n of mine) if ((n.depth ?? 0) < (entry.depth ?? 0)) entry = n;
  const items = mine
    .filter(n => n.parent_id === entry.id && isDisplayableNode(n))
    .sort((a, b) => {
      const af = a.node_type === 'folder' ? 0 : 1, bf = b.node_type === 'folder' ? 0 : 1;
      if (af !== bf) return af - bf;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  return { entry, items };
}

// Mapa parent_id -> hijos (solo nodos de la estrategia), carpetas primero.
function buildChildrenMap(nodes) {
  const map = new Map();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    if (!map.has(n.parent_id)) map.set(n.parent_id, []);
    map.get(n.parent_id).push(n);
  }
  for (const list of map.values()) {
    list.sort((a, b) => {
      const af = a.node_type === 'folder' ? 0 : 1, bf = b.node_type === 'folder' ? 0 : 1;
      if (af !== bf) return af - bf;
      return (a.name || '').localeCompare(b.name || '', 'es');
    });
  }
  return map;
}

// Fila del árbol de Drive: carpeta desplegable (chevron) o documento (hoja). Abre en Drive.
// Cada fila se puede "fijar" (pin) para destacarla arriba del desplegable.
function DriveTreeRow({ node, childrenByParent, openSet, onToggle, depth, pinnedSet, onTogglePin }) {
  const cfg = NODE_ICON[node.node_type] || NODE_ICON.document;
  const Icon = cfg.Icon;
  const isFolder = node.node_type === 'folder';
  const isOpen = openSet.has(node.id);
  const isPinned = pinnedSet?.has(node.id);
  const kids = (childrenByParent.get(node.id) || []).filter(isDisplayableNode);
  const pad = 4 + depth * 15;
  return (
    <div>
      <div className="flex items-center gap-1.5 py-1.5 pr-1.5 rounded-md hover:bg-[#F7F8FA] group/tr" style={{ paddingLeft: pad }}>
        {isFolder ? (
          <button type="button" onClick={() => onToggle(node.id)} title={isOpen ? 'Plegar' : 'Desplegar'}
            className="w-5 h-5 rounded inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer text-text3 hover:text-blue">
            <ChevronRight size={14} className={`transition-transform ${isOpen ? 'rotate-90' : ''}`} />
          </button>
        ) : <span className="w-5 h-5 shrink-0" />}
        <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: cfg.bg }}>
          {isFolder && isOpen ? <FolderOpen size={13} style={{ color: cfg.color }} /> : <Icon size={13} style={{ color: cfg.color }} />}
        </span>
        <a href={node.web_url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-[12px] font-medium no-underline truncate hover:text-blue" style={{ color: '#1A1D26' }} title={node.name}>{node.name}</a>
        {isFolder && kids.length > 0 && <span className="text-[10px] text-text3 shrink-0">{kids.length}</span>}
        {onTogglePin && (
          <button type="button" onClick={() => onTogglePin(node.id)} title={isPinned ? 'Quitar de destacados' : 'Fijar / destacar'}
            className={`w-7 h-7 rounded inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer transition-opacity ${isPinned ? 'text-[#E0922E]' : 'opacity-0 group-hover/tr:opacity-100 text-text3 hover:text-[#E0922E]'}`}>
            <Pin size={12} fill={isPinned ? '#E0922E' : 'none'} />
          </button>
        )}
        <span className="opacity-0 group-hover/tr:opacity-100 transition-opacity"><CopyButton value={node.web_url} title="Copiar enlace" /></span>
      </div>
      {isFolder && isOpen && kids.length > 0 && (
        <div>{kids.map(ch => <DriveTreeRow key={ch.id} node={ch} childrenByParent={childrenByParent} openSet={openSet} onToggle={onToggle} depth={depth + 1} pinnedSet={pinnedSet} onTogglePin={onTogglePin} />)}</div>
      )}
    </div>
  );
}

// ── Página: enlaces (prod/testing/meta) ──────────────────────────────────────────
function PageLinks({ p }) {
  const links = [];
  if (p.prod_url) links.push({ key: 'prod', short: 'Prod', url: p.prod_url, bg: '#EEF2FF', color: '#2E69E0', border: '#DCE3FF' });
  if (p.testing_url) links.push({ key: 'test', short: 'Test', url: p.testing_url, bg: '#F1F3F6', color: '#6B7280', border: '#E2E5EB' });
  if (p.ads_url) links.push({ key: 'meta', short: 'Meta', url: p.ads_url, bg: '#F4F1FE', color: '#7C3AED', border: '#E7E0FB' });
  if (!links.length) return <span style={{ fontSize: 12, color: '#C2C7D0' }}>—</span>;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {links.map(l => (
        <div key={l.key} style={{ display: 'inline-flex', alignItems: 'stretch', border: `1px solid ${l.border}`, borderRadius: 7, overflow: 'hidden' }}>
          <a href={l.url} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: l.bg, color: l.color, fontSize: 11, fontWeight: 600, textDecoration: 'none' }}>{l.short}<ExternalLink size={10} /></a>
          <button onClick={() => copyText(l.url)} title="Copiar" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 24, border: 'none', borderLeft: `1px solid ${l.border}`, background: l.bg, color: l.color, cursor: 'pointer' }}><Copy size={11} /></button>
        </div>
      ))}
    </div>
  );
}

function PageTracking({ p, onPatch }) {
  const [open, setOpen] = useState(false);
  const list = normalizeEvents(p.conversion_events);
  const count = list.length + (p.clarity_id ? 1 : 0);
  return (
    <>
      {count > 0 ? (
        <button onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid #E2E5EB', borderRadius: 8, background: '#fff', color: '#6B7280', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
          {count} evento{count !== 1 ? 's' : ''}<Pencil size={11} />
        </button>
      ) : (
        <button onClick={() => setOpen(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 10px', border: '1px dashed #D0D5DD', borderRadius: 8, background: '#fff', color: '#9CA3AF', fontSize: 11.5, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer' }}>
          <Plus size={11} /> Configurar
        </button>
      )}
      {open && <TrackingModal page={p} onClose={() => setOpen(false)} onPatch={onPatch} />}
    </>
  );
}

const PAGE_GRID = '1.9fr 110px 1.6fr 130px 60px';

function PageRow({ p, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: p.name, testing_url: p.testing_url || '', prod_url: p.prod_url || '', ads_url: p.ads_url || '' });
  const status = p.status || 'activa';
  const save = () => { onUpdate(p.id, form); setEditing(false); };
  const patchTracking = (patch) => onUpdate(p.id, patch);

  if (editing) {
    return (
      <div className="flex flex-col gap-2 py-3 px-4 border-b border-[#F0F2F5]" style={{ background: '#F5F7FF' }}>
        <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="text-[12.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="Nombre de la página" />
        <div className="grid gap-2" style={{ gridTemplateColumns: '1fr 1fr 1fr' }}>
          <input type="text" value={form.prod_url} onChange={e => setForm({ ...form, prod_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL producción" />
          <input type="text" value={form.testing_url} onChange={e => setForm({ ...form, testing_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL testing" />
          <input type="text" value={form.ads_url} onChange={e => setForm({ ...form, ads_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL campaña Meta" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px]" style={{ color: '#6B7280' }}>Estado:</span>
          <PageStatusPill status={status} onChange={(v) => onUpdate(p.id, { status: v })} />
          <div className="flex-1" />
          <button className="text-[12px] py-1.5 px-3 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={save}>Guardar</button>
          <button className="text-[12px] py-1.5 px-3 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setEditing(false)}>Cancelar</button>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:grid items-center py-3 px-4 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group gap-2" style={{ gridTemplateColumns: PAGE_GRID }}>
        <div className="flex items-center gap-2.5 min-w-0">
          <FileText size={15} style={{ color: '#8A93A3' }} className="shrink-0" />
          <span className="text-[13px] font-semibold truncate" style={{ color: '#1A1D26' }}>{p.name}</span>
        </div>
        <div className="min-w-0"><PageStatusPill status={status} onChange={(v) => onUpdate(p.id, { status: v })} /></div>
        <div className="min-w-0"><PageLinks p={p} /></div>
        <div className="min-w-0"><PageTracking p={p} onPatch={patchTracking} /></div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setEditing(true)} title="Editar"><Pencil size={12} /></button>
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar esta página?')) onDelete(p.id); }} title="Eliminar"><Trash2 size={12} /></button>
        </div>
      </div>
      {/* Mobile */}
      <div className="md:hidden py-3 px-4 border-b border-[#F0F2F5] last:border-b-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} style={{ color: '#8A93A3' }} className="shrink-0" />
          <span className="flex-1 truncate text-[13px] font-semibold" style={{ color: '#1A1D26' }}>{p.name}</span>
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setEditing(true)} title="Editar"><Pencil size={12} /></button>
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar esta página?')) onDelete(p.id); }} title="Eliminar"><Trash2 size={12} /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <PageStatusPill status={status} onChange={(v) => onUpdate(p.id, { status: v })} />
          <PageLinks p={p} />
          <PageTracking p={p} onPatch={patchTracking} />
        </div>
      </div>
    </>
  );
}

// ── Panel de recursos de la estrategia (rieles: Archivos / Enlaces / Accesos / Material) ──
const railColor = (active) => active ? '#2E69E0' : '#6B7280';
const railBorder = (active) => active ? '2px solid #2E69E0' : '2px solid transparent';

function StrategyResourcePanel({ s, drive, driveNodes, onUpdate }) {
  const [tab, setTab] = useState('archivos');
  const [linkModal, setLinkModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const [delEdit, setDelEdit] = useState(null);
  const [expanded, setExpanded] = useState({});
  // Árbol desplegable de Drive (solo los nodos de esta estrategia).
  const [treeOpen, setTreeOpen] = useState(new Set());
  const toggleTree = (id) => setTreeOpen(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const myNodes = (driveNodes || []).filter(n => n.strategy_id === s.id);
  const childrenByParent = buildChildrenMap(myNodes);

  // DEL: documento clave de la estrategia (se aparta arriba de todo, destacado).
  // del_overrides permite OCULTAR un DEL auto-detectado o EDITAR su etiqueta/link.
  const delOv = (s.del_overrides && typeof s.del_overrides === 'object' && !Array.isArray(s.del_overrides)) ? s.del_overrides : {};
  const allDel = myNodes.filter(isDelDoc);
  const delIds = new Set(allDel.map(d => d.id));
  const delDocs = allDel
    .filter(d => !(delOv[d.id] && delOv[d.id].hidden))
    .map(d => ({ ...d, name: delOv[d.id]?.label || d.name, web_url: delOv[d.id]?.url || d.web_url }))
    .sort((a, b) => (a.depth ?? 0) - (b.depth ?? 0));
  const hideDel = (id) => onUpdate(s.id, { del_overrides: { ...delOv, [id]: { ...(delOv[id] || {}), hidden: true } } });
  const saveDelEdit = (id, data) => onUpdate(s.id, { del_overrides: { ...delOv, [id]: { hidden: false, label: data.label, url: data.url } } });

  // Fijados ("Destacados"): nodos que el equipo pin-eó; se apartan debajo del DEL.
  const pinnedIds = Array.isArray(s.pinned_nodes) ? s.pinned_nodes : [];
  const pinnedSet = new Set(pinnedIds);
  const pinnedNodes = pinnedIds.map(id => myNodes.find(n => n.id === id))
    .filter(n => n && isDisplayableNode(n) && !delIds.has(n.id));
  const togglePin = (id) => {
    const next = pinnedSet.has(id) ? pinnedIds.filter(x => x !== id) : [...pinnedIds, id];
    onUpdate(s.id, { pinned_nodes: next });
  };

  // Enlaces propios de la estrategia (manuales). Las carpetas/documentos ahora salen del espejo de Drive.
  const manualAll = Array.isArray(s.archivos) ? s.archivos : [];
  const saveManual = (next) => onUpdate(s.id, { archivos: next });
  const upsertManual = (data, ref) => { const idx = ref ? manualAll.indexOf(ref) : -1; const next = idx >= 0 ? manualAll.map((x, i) => i === idx ? data : x) : [...manualAll, data]; saveManual(next); };
  const removeManual = (ref) => saveManual(manualAll.filter(x => x !== ref));
  const links = manualAll.filter(a => (a.category || 'folder') === 'link');     // enlaces externos
  const accesos = s.accesos || [];
  const needs = Array.isArray(s.visual_resources) ? s.visual_resources : [];
  const doneCount = needs.filter(n => n.ok).length;

  const RAILS = [
    { id: 'archivos', label: 'Archivos' },
    { id: 'enlaces', label: 'Enlaces' },
    { id: 'accesos', label: 'Accesos' },
    { id: 'necesarios', label: 'Material' },
  ];

  const toggleNeed = (idx) => onUpdate(s.id, { visual_resources: needs.map((n, i) => i === idx ? { ...n, ok: !n.ok } : n) });

  return (
    <div className="border border-[#E2E5EB] rounded-xl bg-white overflow-hidden">
      <div className="pt-3 px-4">
        <div className="text-[13px] font-bold mb-2.5" style={{ color: '#1A1D26' }}>Recursos de la estrategia</div>
        <div className="flex flex-wrap border-b border-[#EEF0F3]">
          {RAILS.map(r => (
            <button key={r.id} onClick={() => setTab(r.id)} className="inline-flex items-center gap-1.5 whitespace-nowrap bg-transparent border-none py-2.5 mr-4 text-[12.5px] font-semibold cursor-pointer"
              style={{ color: railColor(tab === r.id), borderBottom: railBorder(tab === r.id) }}>
              {r.label}
              {r.id === 'necesarios' && needs.length > 0 && <span className="text-[10px] font-bold" style={{ color: doneCount === needs.length ? '#16A34A' : '#EAB308' }}>{doneCount}/{needs.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4">
        {/* ARCHIVOS */}
        {tab === 'archivos' && (
          <div className="flex flex-col gap-1.5">
            {/* DEL — documento clave de la estrategia (destacado, editable) */}
            {delDocs.map(d => (
              <div key={d.id} className="flex items-stretch gap-1.5 mb-0.5 group/del">
                <a href={d.web_url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] no-underline" style={{ border: '1px solid #F1D08B', background: 'linear-gradient(90deg,#FFFBF0,#FFF4DA)' }}>
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0 text-white" style={{ background: '#E0922E' }}><Star size={17} fill="#fff" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[9px] font-extrabold uppercase tracking-wider py-0.5 px-1.5 rounded" style={{ background: '#E0922E', color: '#fff' }}>DEL</span>
                      <span className="text-[10.5px] font-semibold" style={{ color: '#9A6A1A' }}>Documento clave de la estrategia</span>
                    </span>
                    <span className="block text-[13px] font-bold truncate mt-0.5" style={{ color: '#1A1D26' }}>{d.name}</span>
                  </span>
                </a>
                <CopyButton value={d.web_url} title="Copiar enlace" />
                <button className="opacity-0 group-hover/del:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center shrink-0" onClick={() => setDelEdit({ id: d.id, label: d.name, url: d.web_url })} title="Editar nombre/link del DEL"><Pencil size={12} /></button>
                <button className="opacity-0 group-hover/del:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center shrink-0" onClick={() => { if (window.confirm(`¿Quitar este DEL de los destacados?\n"${d.name}"`)) hideDel(d.id); }} title="Quitar de DEL destacado"><X size={12} /></button>
              </div>
            ))}

            {/* Destacados (fijados) */}
            {pinnedNodes.length > 0 && (
              <div className="rounded-lg border mb-0.5" style={{ borderColor: '#F1D08B', background: '#FFFDF6' }}>
                <div className="flex items-center gap-1.5 px-2.5 pt-2 pb-1">
                  <Pin size={11} style={{ color: '#E0922E' }} fill="#E0922E" />
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#B5872E' }}>Destacados</span>
                </div>
                <div className="px-1 pb-1.5">
                  {pinnedNodes.map(n => {
                    const cfg = NODE_ICON[n.node_type] || NODE_ICON.document;
                    const Icon = cfg.Icon;
                    return (
                      <div key={n.id} className="flex items-center gap-2 py-1.5 px-1.5 rounded-md hover:bg-[#FFF7E8] group/pin">
                        <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: cfg.bg }}><Icon size={13} style={{ color: cfg.color }} /></span>
                        <a href={n.web_url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-[12px] font-semibold no-underline truncate hover:text-blue" style={{ color: '#1A1D26' }} title={n.name}>{n.name}</a>
                        <span className="opacity-0 group-hover/pin:opacity-100"><CopyButton value={n.web_url} title="Copiar enlace" /></span>
                        <button type="button" onClick={() => togglePin(n.id)} title="Quitar de destacados" className="w-7 h-7 rounded inline-flex items-center justify-center shrink-0 bg-transparent border-none cursor-pointer text-[#E0922E] hover:bg-[#FBEAD0]"><Pin size={12} fill="#E0922E" /></button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Árbol desplegable de Drive */}
            {drive.items.length > 0 && (
              <div className="rounded-lg border border-[#E8EBF0] bg-white py-1 px-1">
                {drive.items.map(n => (
                  <DriveTreeRow key={n.id} node={n} childrenByParent={childrenByParent} openSet={treeOpen} onToggle={toggleTree} depth={0} pinnedSet={pinnedSet} onTogglePin={togglePin} />
                ))}
              </div>
            )}

            {!delDocs.length && !pinnedNodes.length && !drive.items.length && (
              <div className="text-[11.5px] italic py-2" style={{ color: '#9CA3AF' }}>
                Cuando la rutina de Drive sincronice la carpeta de esta estrategia, sus carpetas y documentos aparecen acá solos.
              </div>
            )}
          </div>
        )}

        {/* ENLACES */}
        {tab === 'enlaces' && (
          <div className="flex flex-col gap-1.5">
            {links.length === 0 && <div className="text-[11.5px] italic py-2" style={{ color: '#9CA3AF' }}>Links propios de esta estrategia (landing, calendario, dashboard…).</div>}
            {links.map((g, gi) => (
              <div key={gi} className="flex items-stretch gap-1.5 group/lk">
                <a href={g.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] no-underline border border-[#E8EBF0] hover:bg-[#F7F8FA] hover:border-[#DCE3FF]">
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#EEF2FF', color: '#2E69E0' }}><Link2 size={14} /></span>
                  <span className="flex-1 min-w-0"><span className="block text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{g.label || g.url}</span></span>
                </a>
                <CopyButton value={g.url} title="Copiar enlace" />
                <button className="opacity-0 group-hover/lk:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setLinkModal({ initial: g, ref: g })} title="Editar"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/lk:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Quitar enlace?')) removeManual(g); }} title="Quitar"><X size={11} /></button>
              </div>
            ))}
            <button className="inline-flex items-center gap-1.5 mt-2 py-1.5 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-white text-text2 text-[11.5px] font-semibold cursor-pointer hover:text-blue hover:border-blue self-start" onClick={() => setLinkModal({ initial: null, category: 'link' })}><Plus size={12} /> Agregar enlace</button>
          </div>
        )}

        {/* ACCESOS */}
        {tab === 'accesos' && (
          <div className="flex flex-col gap-2">
            {accesos.length === 0 && <div className="text-[11.5px] italic py-2" style={{ color: '#9CA3AF' }}>Sin accesos propios. Los generales del cliente están arriba.</div>}
            {accesos.map((a, ai) => {
              const isExp = !!expanded[ai];
              return (
                <div key={ai} className="rounded-[10px] border border-[#E8EBF0] bg-white overflow-hidden group/ac">
                  <div className="flex items-center gap-2.5 p-2.5">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Key size={15} /></span>
                    <button className="flex-1 min-w-0 text-left bg-transparent border-none cursor-pointer p-0" onClick={() => setExpanded(p => ({ ...p, [ai]: !p[ai] }))}>
                      <span className="block text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{a.label}</span>
                      {(a.email || a.username) && <span className="block text-[11px] truncate" style={{ color: '#6B7280' }}>{a.email || a.username}</span>}
                    </button>
                    <button className="opacity-0 group-hover/ac:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setAccModal({ initial: a, index: ai })} title="Editar"><Pencil size={11} /></button>
                    <button className="opacity-0 group-hover/ac:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Quitar acceso "${a.label}"?`)) onUpdate(s.id, { accesos: accesos.filter((_, i) => i !== ai) }); }} title="Quitar"><X size={11} /></button>
                  </div>
                  {isExp && (
                    <div className="border-t border-[#F0F2F5] p-2 flex flex-col gap-1" style={{ background: '#FAFBFC' }}>
                      <CopyableRow icon={Mail} label="Email" value={a.email || a.username} />
                      <CopyableRow icon={Key} label="Pass" value={a.password} masked />
                      {a.url && <a href={a.url} target="_blank" rel="noreferrer" className="text-[11.5px] inline-flex items-center gap-1 no-underline py-1 px-2 rounded-md self-start" style={{ background: '#F5F7FF', color: '#2E69E0' }}>Abrir login <ExternalLink size={11} /></a>}
                      {a.notes && <div className="text-[11px] py-1 px-2 italic" style={{ color: '#6B7280' }}>{a.notes}</div>}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-white text-text2 text-[11.5px] font-semibold cursor-pointer hover:text-blue hover:border-blue self-start" onClick={() => setAccModal({ initial: null })}><Plus size={12} /> Acceso</button>
          </div>
        )}

        {/* MATERIAL (recursos necesarios) */}
        {tab === 'necesarios' && (
          <MaterialList needs={needs} folders={strategyFolders(myNodes)} onToggle={toggleNeed} onChange={(next) => onUpdate(s.id, { visual_resources: next })} />
        )}
      </div>

      {linkModal && (
        <LinkFormModal open={!!linkModal} onClose={() => setLinkModal(null)} initial={linkModal.initial} defaultCategory={linkModal.category || 'folder'}
          onSave={(data) => upsertManual(data, linkModal.ref)} />
      )}
      {accModal && (
        <AccessFormModal open={!!accModal} onClose={() => setAccModal(null)} initial={accModal.initial}
          onSave={(data) => {
            const next = [...accesos];
            if (accModal.index != null) next[accModal.index] = data; else next.push(data);
            onUpdate(s.id, { accesos: next });
          }} />
      )}
      {delEdit && (
        <LinkFormModal open={!!delEdit} onClose={() => setDelEdit(null)} initial={{ label: delEdit.label, url: delEdit.url, category: 'doc' }} defaultCategory="doc"
          onSave={(data) => saveDelEdit(delEdit.id, data)} />
      )}
    </div>
  );
}

function MaterialList({ needs, folders, onToggle, onChange }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [pickFor, setPickFor] = useState(null);   // índice del item al que se le elige carpeta
  const [pasteUrl, setPasteUrl] = useState('');
  const done = needs.filter(n => n.ok).length;
  const add = () => { const l = newLabel.trim(); if (!l) return; onChange([...needs, { label: l, ok: false }]); setNewLabel(''); setAdding(false); };
  const setFolder = (i, folder) => onChange(needs.map((n, j) => j === i ? { ...n, folder_url: folder?.web_url || folder?.url || null, folder_name: folder?.name || folder?.label || null } : n));
  const clearFolder = (i) => onChange(needs.map((n, j) => j === i ? { ...n, folder_url: null, folder_name: null } : n));
  const openPick = (i) => { setPickFor(p => p === i ? null : i); setPasteUrl(''); };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px]" style={{ color: '#6B7280' }}>Material requerido para producir · con su carpeta de Drive</div>
        {needs.length > 0 && <div className="text-[11px] font-bold" style={{ color: done === needs.length ? '#16A34A' : '#EAB308' }}>{done} / {needs.length} completos</div>}
      </div>
      {needs.length === 0 && <div className="text-[11.5px] italic mb-2" style={{ color: '#9CA3AF' }}>Sin material cargado. Ej: logo, fotos, video VSL.</div>}
      <div className="flex flex-col gap-0.5">
        {needs.map((n, i) => {
          // Carpeta explícita del item; si no hay, se intenta adivinar por el nombre.
          const explicit = n.folder_url ? { url: n.folder_url, name: n.folder_name || 'Carpeta' } : null;
          const auto = !explicit ? matchFolderForLabel(n.label, folders || []) : null;
          const loc = explicit || (auto ? { url: auto.web_url, name: auto.name, isAuto: true } : null);
          return (
            <div key={i} className="border-b border-[#F4F5F8] last:border-b-0">
              <div className="flex items-center gap-2.5 py-2 px-1 group/m">
                <button onClick={() => onToggle(i)} className="inline-flex items-center justify-center w-5 h-5 rounded-md shrink-0 cursor-pointer border-none"
                  style={n.ok ? { background: '#16A34A', color: '#fff' } : { background: '#fff', border: '1.5px dashed #C7CCD6' }} title={n.ok ? 'Marcar faltante' : 'Marcar disponible'}>
                  {n.ok && <Check size={12} strokeWidth={3} />}
                </button>
                <span className="flex-1 min-w-0 text-[12.5px] truncate" style={{ color: n.ok ? '#1A1D26' : '#6B7280' }} title={n.label}>{n.label}</span>
                {loc ? (
                  <a href={loc.url} target="_blank" rel="noreferrer" title={loc.isAuto ? `Carpeta sugerida: ${loc.name}` : `Abrir carpeta: ${loc.name}`}
                    className="inline-flex items-center gap-1 max-w-[150px] py-1 px-2 rounded-md no-underline shrink-0"
                    style={loc.isAuto ? { background: '#FFF7E8', color: '#B5872E', border: '1px dashed #EAC78A' } : { background: '#FDF2DE', color: '#B5701A', border: '1px solid #F1D08B' }}>
                    <Folder size={11} className="shrink-0" />
                    <span className="text-[11px] font-semibold truncate">{loc.name}</span>
                    {loc.isAuto && <span className="text-[8.5px] font-bold uppercase shrink-0">auto</span>}
                  </a>
                ) : (
                  <button onClick={() => openPick(i)} title="Ubicar carpeta en Drive" className="inline-flex items-center gap-1 py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] bg-white text-text3 text-[11px] font-semibold cursor-pointer hover:text-blue hover:border-blue shrink-0">
                    <Folder size={11} /> Ubicar
                  </button>
                )}
                <button onClick={() => openPick(i)} title="Cambiar carpeta" className="opacity-0 group-hover/m:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center shrink-0"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/m:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center shrink-0" onClick={() => onChange(needs.filter((_, j) => j !== i))} title="Quitar"><X size={11} /></button>
              </div>
              {pickFor === i && (
                <div className="ml-7 mb-2 rounded-lg border border-[#E2E5EB] bg-white p-2 flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Elegí la carpeta de Drive</span>
                    {explicit && <button onClick={() => { clearFolder(i); setPickFor(null); }} className="text-[10.5px] font-semibold text-text3 hover:text-red-500 bg-transparent border-none cursor-pointer">Quitar carpeta</button>}
                  </div>
                  <div className="max-h-[180px] overflow-auto flex flex-col gap-0.5">
                    {(folders || []).length === 0 && <div className="text-[11px] italic py-1" style={{ color: '#9CA3AF' }}>Aún no hay carpetas sincronizadas de Drive.</div>}
                    {(folders || []).map(f => (
                      <button key={f.id} onClick={() => { setFolder(i, f); setPickFor(null); }} className="flex items-center gap-2 text-left text-[12px] py-1.5 px-2 rounded-md hover:bg-[#F5F7FF] bg-transparent border-none cursor-pointer">
                        <Folder size={13} style={{ color: '#E0922E' }} className="shrink-0" />
                        <span className="truncate" style={{ color: '#1A1D26' }}>{f.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 border-t border-[#F0F2F5] pt-1.5">
                    <input type="url" value={pasteUrl} onChange={e => setPasteUrl(e.target.value)} placeholder="…o pegá el link de una carpeta" className="flex-1 min-w-0 text-[11.5px] py-1.5 px-2 rounded-md border border-[#E2E5EB] outline-none focus:border-blue" />
                    <button disabled={!pasteUrl.trim()} onClick={() => { setFolder(i, { web_url: pasteUrl.trim(), name: 'Carpeta' }); setPickFor(null); }} className="text-[11px] py-1.5 px-2.5 rounded bg-blue text-white font-medium cursor-pointer border-none disabled:opacity-50">OK</button>
                    <button onClick={() => setPickFor(null)} className="text-[11px] py-1.5 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none">×</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {adding ? (
        <div className="flex gap-1 mt-2">
          <input type="text" value={newLabel} onChange={e => setNewLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add(); if (e.key === 'Escape') setAdding(false); }} placeholder="Ej. Logo, foto producto…" className="flex-1 min-w-0 text-[12px] py-1.5 px-2 rounded-md border border-[#E2E5EB] outline-none focus:border-blue" autoFocus />
          <button className="text-[11px] py-1 px-2 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={add}>OK</button>
          <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
        </div>
      ) : (
        <button className="inline-flex items-center gap-1.5 mt-2.5 py-1.5 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-white text-text2 text-[11.5px] font-semibold cursor-pointer hover:text-blue hover:border-blue" onClick={() => setAdding(true)}><Plus size={12} /> Recurso</button>
      )}
    </div>
  );
}

// ── Tarjeta de estrategia (plegable) ─────────────────────────────────────────────
function StrategyCard({ s, pages, driveNodes }) {
  const { updateStrategy, deleteStrategy, addStrategyPage, updateStrategyPage, deleteStrategyPage } = useApp();
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('strat_collapsed_' + s.id) !== '1'; } catch { return true; } });
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(s.name);
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newPageName, setNewPageName] = useState('');

  const myPages = pages.filter(p => p.strategy_id === s.id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const st = STRAT_STATUS[s.status] || STRAT_STATUS.borrador;
  const drive = strategyDriveItems(driveNodes, s);

  const toggle = () => setOpen(o => { const next = !o; try { localStorage.setItem('strat_collapsed_' + s.id, next ? '0' : '1'); } catch { /* noop */ } return next; });
  const saveName = () => { if (nameValue.trim() && nameValue !== s.name) updateStrategy(s.id, { name: nameValue.trim() }); setEditingName(false); };
  const addPage = () => { if (!newPageName.trim()) return; addStrategyPage({ strategy_id: s.id, name: newPageName.trim(), position: myPages.length }); setNewPageName(''); setAdding(false); };

  return (
    <div className="border border-[#E2E5EB] rounded-xl bg-white overflow-hidden mb-3.5">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3 py-3 px-4" style={{ borderBottom: open ? '1px solid #EEF0F3' : '1px solid transparent' }}>
        <button type="button" onClick={toggle} className="w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:text-blue inline-flex items-center justify-center shrink-0" title={open ? 'Plegar' : 'Desplegar'}>
          <ChevronRight size={16} className={`transition-transform ${open ? 'rotate-90' : ''}`} />
        </button>
        <span className="inline-flex items-center justify-center rounded-md text-white text-[12px] font-bold shrink-0" style={{ width: 30, height: 24, background: '#111418' }}>#{(s.position || 0) + 1}</span>
        {editingName ? (
          <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameValue(s.name); setEditingName(false); } }} autoFocus className="text-[14px] font-bold py-0.5 px-1.5 border border-blue rounded outline-none flex-1 min-w-[150px]" style={{ color: '#1A1D26' }} />
        ) : (
          <span className="text-[14px] font-bold cursor-pointer hover:bg-[#F5F7FF] px-1.5 py-0.5 rounded flex-1 min-w-[150px]" style={{ color: '#1A1D26' }} onClick={() => setEditingName(true)}>{s.name}</span>
        )}
        {editingDate ? (
          <input type="date" autoFocus value={s.start_date || ''} onChange={e => updateStrategy(s.id, { start_date: e.target.value || null })} onBlur={() => setEditingDate(false)} className="text-[11.5px] py-1 px-1.5 rounded-md border border-blue outline-none bg-white" />
        ) : (
          <button className="inline-flex items-center gap-1.5 whitespace-nowrap py-1.5 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-[11.5px] cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#6B7280' }} onClick={() => setEditingDate(true)} title="Fecha de creación">
            <Calendar size={13} /> Creada {s.start_date ? fmtDate(s.start_date) : '—'}
          </button>
        )}
        <div className="relative">
          <button className="inline-flex items-center whitespace-nowrap py-1 px-2.5 rounded-full text-[12px] font-bold cursor-pointer hover:opacity-80 border-none" style={{ background: st.bg, color: st.fg }} onClick={() => setStatusOpen(o => !o)}>{st.label}</button>
          {statusOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
              <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E5EB] rounded-lg shadow-md z-20 min-w-[150px] overflow-hidden">
                {Object.entries(STRAT_STATUS).map(([k, v]) => (
                  <button key={k} className="block w-full text-left text-[11.5px] py-1.5 px-2.5 hover:bg-blue-bg2 bg-transparent border-none cursor-pointer font-medium" style={{ color: v.fg }} onClick={() => { updateStrategy(s.id, { status: k }); setStatusOpen(false); }}>{v.label}</button>
                ))}
              </div>
            </>
          )}
        </div>
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap py-1.5 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-[11.5px]" style={{ color: '#4B5563' }}>{s.version || 'v1'} · actual</span>
        {!open && <span className="inline-flex items-center gap-1 whitespace-nowrap py-1.5 px-2.5 rounded-lg border border-[#E2E5EB] bg-white text-[11.5px]" style={{ color: '#6B7280' }}>{myPages.length} página{myPages.length !== 1 ? 's' : ''}</span>}
        <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center shrink-0" onClick={() => { if (window.confirm(`¿Borrar la estrategia "${s.name}" y todas sus páginas?`)) deleteStrategy(s.id); }} title="Eliminar estrategia"><Trash2 size={13} /></button>
      </div>

      {open && (
        <div className="p-4 grid items-start gap-3.5" style={{ background: '#FAFBFC', gridTemplateColumns: 'minmax(0,1.7fr) minmax(0,1fr)' }}>
          {/* Páginas */}
          <div className="border border-[#E2E5EB] rounded-xl bg-white overflow-hidden self-start">
            <div className="hidden md:grid items-center py-2.5 px-4 border-b border-[#E2E5EB] gap-2" style={{ gridTemplateColumns: PAGE_GRID, background: '#FAFBFC' }}>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Página</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Estado</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Enlaces</div>
              <div className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>Tracking</div>
              <div />
            </div>
            {myPages.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center py-8 px-5 gap-2">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-xl" style={{ background: '#F0F2F5', color: '#A8AFBC' }}><FileText size={18} /></span>
                <div className="text-[13px] font-semibold" style={{ color: '#4B5563' }}>Aún no hay páginas</div>
              </div>
            ) : myPages.map(p => <PageRow key={p.id} p={p} onUpdate={updateStrategyPage} onDelete={deleteStrategyPage} />)}
            {adding ? (
              <div className="flex items-center gap-2 py-2.5 px-4" style={{ background: '#F5F7FF' }}>
                <input type="text" value={newPageName} onChange={e => setNewPageName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPage(); if (e.key === 'Escape') setAdding(false); }} autoFocus placeholder="Nombre de la página (VSL, Landing, Gracias…)" className="flex-1 text-[12.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" />
                <button className="text-[11.5px] py-1.5 px-3 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addPage}>Agregar</button>
                <button className="text-[11.5px] py-1.5 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
              </div>
            ) : (
              <div className="py-2.5 px-4">
                <button className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-white text-[12px] font-semibold cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#5B7CF5' }} onClick={() => setAdding(true)}><Plus size={13} /> Agregar página</button>
              </div>
            )}
          </div>

          {/* Recursos de la estrategia */}
          <StrategyResourcePanel s={s} drive={drive} driveNodes={driveNodes} onUpdate={updateStrategy} />
        </div>
      )}
    </div>
  );
}

// ── Recursos generales del cliente (accesos + enlaces a nivel cliente) ────────────
// Se guardan dentro de clients.links; los accesos llevan category:'acceso'.
function ClientResources({ client, updateClient }) {
  const all = Array.isArray(client.links) ? client.links : [];
  const accesos = all.filter(l => l && l.category === 'acceso');
  const enlaces = all.filter(l => !l || l.category !== 'acceso');
  const [linkModal, setLinkModal] = useState(null);
  const [accModal, setAccModal] = useState(null);
  const saveAll = (next) => updateClient(client.id, { links: next });

  const upsertEnlace = (data, ref) => {
    const idx = ref ? all.indexOf(ref) : -1;
    const item = { label: data.label, url: data.url, category: 'link' };
    const next = idx >= 0 ? all.map((x, i) => i === idx ? item : x) : [...all, item];
    saveAll(next);
  };
  const removeItem = (ref) => saveAll(all.filter(x => x !== ref));
  const upsertAcceso = (data, ref) => {
    const idx = ref ? all.indexOf(ref) : -1;
    const item = { ...data, category: 'acceso' };
    const next = idx >= 0 ? all.map((x, i) => i === idx ? item : x) : [...all, item];
    saveAll(next);
  };

  return (
    <div className="rounded-xl overflow-hidden mb-3.5" style={{ border: '1px solid #DCE3FF', background: '#F8FAFF' }}>
      <div className="flex items-center gap-2.5 py-3 px-4" style={{ borderBottom: '1px solid #E7ECFB' }}>
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-white shrink-0" style={{ background: '#2E69E0' }}><Folder size={16} /></span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-bold truncate" style={{ color: '#1A1D26' }}>Recursos generales {client.name ? `· ${client.name}` : ''}</div>
          <div className="text-[11.5px]" style={{ color: '#6B7280' }}>Accesos y enlaces que aplican a todas las estrategias del cliente</div>
        </div>
        <span className="inline-flex items-center whitespace-nowrap py-1 px-2.5 rounded-full text-[11px] font-bold shrink-0" style={{ background: '#EEF2FF', color: '#2E69E0' }}>Nivel cliente</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Accesos generales */}
        <div className="p-4 border-b md:border-b-0 md:border-r" style={{ borderColor: '#E7ECFB' }}>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#8794AE' }}>Accesos generales</div>
          <div className="flex flex-col gap-1.5">
            {accesos.length === 0 && <div className="text-[11.5px] italic" style={{ color: '#9CA3AF' }}>Sin accesos generales.</div>}
            {accesos.map((a, ai) => (
              <div key={ai} className="flex items-center gap-2.5 border border-[#E2E8FA] rounded-[10px] py-2.5 px-3 bg-white group/ca">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#F4F1FE', color: '#7C3AED' }}><Key size={14} /></span>
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{a.label}</div>
                  {(a.email || a.username) && <div className="text-[11px] truncate" style={{ color: '#6B7280' }}>{a.email || a.username}</div>}
                </div>
                <CopyButton value={a.email || a.username || a.url} title="Copiar" />
                {a.url && <a href={a.url} target="_blank" rel="noreferrer" title="Abrir" className="inline-flex items-center justify-center w-7 h-7 rounded-md no-underline shrink-0" style={{ border: '1px solid #DCE3FF', background: '#F5F7FF', color: '#2E69E0' }}><ExternalLink size={12} /></a>}
                <button className="opacity-0 group-hover/ca:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setAccModal({ initial: a, ref: a })} title="Editar"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/ca:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Quitar "${a.label}"?`)) removeItem(a); }} title="Quitar"><X size={11} /></button>
              </div>
            ))}
          </div>
          <button className="inline-flex items-center gap-1.5 mt-2.5 py-1.5 px-2.5 rounded-lg border border-dashed bg-white text-[11.5px] font-semibold cursor-pointer" style={{ borderColor: '#C2CEF2', color: '#5B7CF5' }} onClick={() => setAccModal({ initial: null })}><Plus size={12} /> Acceso general</button>
        </div>
        {/* Enlaces generales */}
        <div className="p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5" style={{ color: '#8794AE' }}>Enlaces generales</div>
          <div className="flex flex-col gap-1.5">
            {enlaces.length === 0 && <div className="text-[11.5px] italic" style={{ color: '#9CA3AF' }}>Sin enlaces generales.</div>}
            {enlaces.map((g, gi) => (
              <div key={gi} className="flex items-stretch gap-1.5 group/cl">
                <a href={g.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 flex items-center gap-2.5 py-2.5 px-3 rounded-[10px] no-underline border border-[#E2E8FA] bg-white hover:bg-[#F5F7FF]" style={{ borderColor: '#E2E8FA' }}>
                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: '#EEF2FF', color: '#2E69E0' }}><Link2 size={14} /></span>
                  <span className="flex-1 min-w-0 text-[12.5px] font-semibold truncate" style={{ color: '#1A1D26' }}>{g.label || g.url}</span>
                </a>
                <CopyButton value={g.url} title="Copiar enlace" />
                <button className="opacity-0 group-hover/cl:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setLinkModal({ initial: g, ref: g })} title="Editar"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/cl:opacity-100 w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Quitar enlace?')) removeItem(g); }} title="Quitar"><X size={11} /></button>
              </div>
            ))}
          </div>
          <button className="inline-flex items-center gap-1.5 mt-2.5 py-1.5 px-2.5 rounded-lg border border-dashed bg-white text-[11.5px] font-semibold cursor-pointer" style={{ borderColor: '#C2CEF2', color: '#5B7CF5' }} onClick={() => setLinkModal({ initial: null })}><Plus size={12} /> Enlace general</button>
        </div>
      </div>

      {linkModal && (
        <LinkFormModal open={!!linkModal} onClose={() => setLinkModal(null)} initial={linkModal.initial} defaultCategory="link"
          onSave={(data) => upsertEnlace(data, linkModal.ref)} />
      )}
      {accModal && (
        <AccessFormModal open={!!accModal} onClose={() => setAccModal(null)} initial={accModal.initial}
          onSave={(data) => upsertAcceso(data, accModal.ref)} />
      )}
    </div>
  );
}

export default function StrategyMatrix({ clientId }) {
  const { clients, updateClient, strategies, strategyPages, addStrategy } = useApp();
  const client = (clients || []).find(c => c.id === clientId) || { id: clientId, links: [] };
  const myStrategies = (strategies || []).filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0));

  const [driveNodes, setDriveNodes] = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const rows = await sbFetch(`client_drive_nodes?client_id=eq.${encodeURIComponent(clientId)}&select=*`);
        if (alive) setDriveNodes(Array.isArray(rows) ? rows : []);
      } catch { if (alive) setDriveNodes([]); }
    })();
    return () => { alive = false; };
  }, [clientId]);

  const today = new Date().toISOString().slice(0, 10);
  const newStrategy = () => {
    const name = window.prompt('Nombre de la nueva estrategia:');
    if (!name) return;
    addStrategy({ client_id: clientId, name, position: myStrategies.length, status: 'borrador', version: 'v1', start_date: today });
  };

  return (
    <div className="mb-4">
      <ClientResources client={client} updateClient={updateClient} />

      <div className="flex items-center gap-2.5 mt-4 mb-3">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: '#9CA3AF' }}>Estrategias</div>
        <div className="flex-1 h-px" style={{ background: '#E2E5EB' }} />
        <button className="inline-flex items-center gap-1.5 py-1.5 px-2.5 rounded-lg border border-dashed border-[#D0D5DD] bg-white text-[12px] font-semibold cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#5B7CF5' }} onClick={newStrategy}><Plus size={13} /> Nueva estrategia</button>
      </div>

      {myStrategies.length === 0 && (
        <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10">
          <div className="text-[13px] mb-1 font-medium" style={{ color: '#1A1D26' }}>Sin estrategias todavía</div>
          <div className="text-[11.5px] text-text2">Cada estrategia agrupa las páginas de un embudo (VSL, Landing, Gracias…) con sus recursos.</div>
        </div>
      )}
      {myStrategies.map(s => <StrategyCard key={s.id} s={s} pages={strategyPages} driveNodes={driveNodes} />)}
    </div>
  );
}
