// Helpers compartidos por FunnelsView y CarpetasView (rediseño Recursos).
import { useState } from 'react';
import {
  Copy, Check, Folder, FileText, FileSpreadsheet, Presentation,
  ExternalLink, Eye, EyeOff, Mail, Key, Film, Image as ImageIcon, File as FileIcon, Music,
} from 'lucide-react';
import Modal from '../Modal';

const inputClass = 'text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg bg-white w-full';

export function copyText(v) { try { if (v && navigator.clipboard) navigator.clipboard.writeText(v); } catch { /* noop */ } }
export function openUrl(url) { if (url) window.open(url, '_blank', 'noopener'); }

// ── Botón copiar ───────────────────────────────────────────────────────────────
export function CopyButton({ value, title = 'Copiar' }) {
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

// ── Drive: iconos / tipos / normalización / DEL ──────────────────────────────────
export const NODE_ICON = {
  folder:   { Icon: Folder,          color: '#C79A3E', bg: '#FCEFD0' }, // ámbar = carpeta
  document: { Icon: FileText,        color: '#2E69E0', bg: '#E9F1FF' }, // azul  = documento
  sheet:    { Icon: FileSpreadsheet, color: '#16A34A', bg: '#E6F7EE' },
  slides:   { Icon: Presentation,    color: '#A855F7', bg: '#F4ECFE' },
  video:    { Icon: Film,            color: '#DC2626', bg: '#FDECEC' }, // rojo  = video (grabaciones/anuncios)
  image:    { Icon: ImageIcon,       color: '#0EA5E9', bg: '#E6F6FE' },
  pdf:      { Icon: FileIcon,        color: '#B91C1C', bg: '#FBE9E9' },
  audio:    { Icon: Music,           color: '#7C3AED', bg: '#F4ECFE' },
  other:    { Icon: FileIcon,        color: '#6B7280', bg: '#F1F3F6' },
};
// Mostramos TODOS los tipos de nodo (docs + videos/imágenes/pdf/etc.). Antes solo docs/sheets/
// slides, y una carpeta con SOLO videos (ej. "Terminados" con los anuncios/grabaciones) salía
// falsamente VACÍA (roja) y no se podía expandir. Los archivos SON contenido.
export const isDisplayableNode = (n) => !!n && n.node_type !== undefined && n.node_type !== null;

export function normLabel(v) {
  return (v || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

// El documento clave: "DEL" (acrónimo mayúsculas) o "Documento en limpio…".
// OJO: "DEL" en mayúsculas también es la preposición "del" en títulos todo-mayúsculas
// (ej. "…LINK DEL VIDEO") → falso positivo. Para evitarlo, "DEL" tiene que ser la ETIQUETA:
// al inicio (o tras "Copia de"), o entre separadores (| DEL |). Nunca en medio de una frase.
export function isDelDoc(n) {
  if (!n || n.node_type === 'folder') return false;
  const name = (n.name || '').trim();
  if (/documento\s+en\s+limpio/i.test(name)) return true;
  if (/^(?:[Cc]opia\s+de\s+)?DEL\b/.test(name)) return true;      // empieza con DEL (o "Copia de DEL")
  if (/[|\-–—]\s*DEL\s*[|\-–—]/.test(name)) return true;          // "… | DEL | …" como etiqueta entre separadores
  return false;
}

// El doc de onboarding del cliente (lo crea el Apps Script: "Onboarding Korex y …").
export function isOnboardingDoc(n) {
  if (!n || n.node_type === 'folder') return false;
  return /\bonboarding\b/i.test(n.name || '');
}

// El doc de investigación del cliente/empresa (avatar, mercado, ángulos).
export function isInvestigacionDoc(n) {
  if (!n || n.node_type === 'folder') return false;
  return /investigaci[oó]n|research|search|serch/i.test(n.name || '');
}

// ¿Se fija solo? (DEL u onboarding). No se puede des-fijar a mano.
export function isAutoPinned(n) { return isDelDoc(n) || isOnboardingDoc(n); }
export function pinBadge(n) { return isDelDoc(n) ? 'DEL' : isOnboardingDoc(n) ? 'Onboarding' : 'Fijado'; }

// Mapa parent_id -> hijos (carpetas primero, alfabético).
export function buildChildrenMap(nodes) {
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

// ── Modal: acceso (credenciales) ─────────────────────────────────────────────────
export function AccessFormModal({ open, onClose, initial, onSave, onDelete }) {
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
        <div className="flex items-center justify-between gap-2 w-full">
          {isEdit && onDelete
            ? <button className="text-[12.5px] py-2 px-3 rounded-lg border border-[#F3C9C9] bg-white text-[#DC2626] font-semibold cursor-pointer hover:bg-[#FEF2F2]" onClick={() => { onDelete(); onClose(); }}>Borrar</button>
            : <span />}
          <div className="flex gap-2">
            <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
            <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.label.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar acceso'}</button>
          </div>
        </div>
      }>
      <div className="grid gap-3 p-1">
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre del acceso *</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder="Meta Business, CRM…" autoFocus /></div>
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

// ── Modal: enlace simple (general del cliente) ───────────────────────────────────
export function LinkFormModal({ open, onClose, initial, onSave, onDelete }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({ label: '', url: '' });
  const k = initial?.url || 'new';
  if (open && form._k !== k) setForm({ label: initial?.label || '', url: initial?.url || '', _k: k });
  const set = (key, v) => setForm(f => ({ ...f, [key]: v }));
  const save = () => {
    if (!form.url.trim()) return;
    onSave({ label: form.label.trim() || form.url.trim(), url: form.url.trim() });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar · ${initial?.label}` : 'Nuevo enlace'} maxWidth={500}
      footer={
        <div className="flex items-center justify-between gap-2 w-full">
          {isEdit && onDelete
            ? <button className="text-[12.5px] py-2 px-3 rounded-lg border border-[#F3C9C9] bg-white text-[#DC2626] font-semibold cursor-pointer hover:bg-[#FEF2F2]" onClick={() => { onDelete(); onClose(); }}>Borrar</button>
            : <span />}
          <div className="flex gap-2">
            <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
            <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.url.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar'}</button>
          </div>
        </div>
      }>
      <div className="grid gap-3 p-1">
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder="Web, Drive raíz, Brandbook…" autoFocus /></div>
        <div className="grid gap-1"><label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL *</label>
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputClass} placeholder="https://..." /></div>
      </div>
    </Modal>
  );
}

// Credenciales (fila copiable) usada en el modal de acceso del diseño.
export function CredRow({ label, value, mono, masked }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  const display = masked ? (show ? value : '•'.repeat(Math.min(10, value.length))) : value;
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-white border border-[#F0F2F5]">
      <span className="text-[10px] uppercase font-bold tracking-wider shrink-0" style={{ color: '#9CA3AF' }}>{label}</span>
      <span className={'flex-1 text-[12px] truncate ' + (mono ? 'font-mono' : '')} style={{ color: '#1A1D26' }} title={value}>{display}</span>
      {masked && (
        <button type="button" onClick={(e) => { e.stopPropagation(); setShow(s => !s); }} className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue shrink-0" title={show ? 'Ocultar' : 'Mostrar'}>
          {show ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      <CopyButton value={value} />
    </div>
  );
}

export { Mail, Key, ExternalLink };
