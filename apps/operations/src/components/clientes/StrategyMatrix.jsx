import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import Modal from '../Modal';
import { ExternalLink, FileText, Folder, Plus, ChevronDown, Trash2, Pencil, Check, X, Image as ImageIcon, Key, Copy, Eye, EyeOff, Mail, Calendar } from 'lucide-react';
import { fmtDate } from '../../utils/helpers';

const inputClass = 'text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue focus:ring focus:ring-blue-bg bg-white w-full';

function CopyButton({ value, title = 'Copiar' }) {
  const [copied, setCopied] = useState(false);
  const copy = (e) => {
    e?.preventDefault?.();
    e?.stopPropagation?.();
    if (!value) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };
  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue transition-colors shrink-0"
      title={copied ? 'Copiado!' : title}
    >
      {copied ? <Check size={12} className="text-[#16A34A]" strokeWidth={3} /> : <Copy size={12} />}
    </button>
  );
}

function CopyableRow({ icon: Icon, label, value, masked }) {
  const [show, setShow] = useState(false);
  if (!value) return null;
  const display = masked ? (show ? value : '•'.repeat(Math.min(10, value.length))) : value;
  return (
    <div className="flex items-center gap-2 py-1 px-2 rounded-md bg-white border border-[#F0F2F5] group/cp">
      <Icon size={11} className="text-text3 shrink-0" />
      <span className="text-[10px] uppercase font-bold tracking-wider shrink-0" style={{ color: '#9CA3AF' }}>{label}</span>
      <span className="flex-1 text-[12px] font-mono truncate" style={{ color: '#1A1D26' }} title={value}>{display}</span>
      {masked && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShow(s => !s); }}
          className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue transition-colors shrink-0"
          title={show ? 'Ocultar' : 'Mostrar'}
        >
          {show ? <EyeOff size={12} /> : <Eye size={12} />}
        </button>
      )}
      <CopyButton value={value} />
    </div>
  );
}

function AccessFormModal({ open, onClose, initial, onSave }) {
  const isEdit = !!initial;
  const [form, setForm] = useState({ label: '', url: '', email: '', password: '', notes: '' });
  // Reset form when modal opens
  if (open && form._k !== (initial?.label || 'new')) {
    setForm({
      label: initial?.label || '',
      url: initial?.url || '',
      email: initial?.email || initial?.username || '',
      password: initial?.password || '',
      notes: initial?.notes || '',
      _k: initial?.label || 'new',
    });
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.label.trim()) return;
    onSave({
      label: form.label.trim(),
      url: form.url.trim(),
      email: form.email.trim(),
      password: form.password,
      notes: form.notes.trim(),
    });
    onClose();
  };
  return (
    <Modal open={open} onClose={onClose} title={isEdit ? `Editar acceso · ${initial?.label}` : 'Nuevo acceso'} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.label.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar acceso'}</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre del acceso *</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder="Sistema Korex, Panel de comisiones…" autoFocus />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL de login</label>
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputClass} placeholder="https://app.tucliente.com/login" />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Email / Usuario</label>
          <input type="text" value={form.email} onChange={e => set('email', e.target.value)} className={inputClass} placeholder="usuario@dominio.com" />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Contraseña</label>
          <input type="text" value={form.password} onChange={e => set('password', e.target.value)} className={inputClass + ' font-mono'} placeholder="••••••••" />
          <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>La contraseña se almacena tal cual. Visible solo para el equipo.</span>
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Notas (opcional)</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} className={inputClass + ' resize-y min-h-[60px]'} placeholder="2FA por SMS, pin de seguridad, etc." />
        </div>
      </div>
    </Modal>
  );
}

function LinkFormModal({ open, onClose, kind, initial, onSave }) {
  // kind: 'drive' | 'doc'
  const isEdit = !!initial;
  const [form, setForm] = useState({ label: '', url: '' });
  if (open && form._k !== (initial?.url || 'new-' + kind)) {
    setForm({ label: initial?.label || (kind === 'drive' ? 'Drive de la estrategia' : ''), url: initial?.url || '', _k: initial?.url || 'new-' + kind });
  }
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const save = () => {
    if (!form.url.trim()) return;
    onSave({ label: form.label.trim() || (kind === 'drive' ? 'Drive' : 'Documento'), url: form.url.trim() });
    onClose();
  };
  const title = kind === 'drive'
    ? (isEdit ? 'Editar carpeta Drive' : 'Nueva carpeta Drive')
    : (isEdit ? `Editar documento · ${initial?.label}` : 'Nuevo documento');
  return (
    <Modal open={open} onClose={onClose} title={title} maxWidth={500}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark disabled:opacity-50" disabled={!form.url.trim()} onClick={save}>{isEdit ? 'Guardar' : 'Agregar'}</button>
        </div>
      }
    >
      <div className="grid gap-3 p-1">
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>Nombre</label>
          <input type="text" value={form.label} onChange={e => set('label', e.target.value)} className={inputClass} placeholder={kind === 'drive' ? 'Drive de la estrategia' : 'Guion VSL, Copy de anuncios…'} autoFocus />
        </div>
        <div className="grid gap-1">
          <label className="text-[11.5px] font-semibold" style={{ color: '#1A1D26' }}>URL *</label>
          <input type="url" value={form.url} onChange={e => set('url', e.target.value)} className={inputClass} placeholder="https://..." />
        </div>
      </div>
    </Modal>
  );
}

const STATUS_STYLES = {
  activa: { bg: '#ECFDF5', fg: '#16A34A', label: 'Activa' },
  borrador: { bg: '#F0F2F5', fg: '#6B7280', label: 'Borrador' },
  pausada: { bg: '#FEFCE8', fg: '#CA8A04', label: 'Pausada' },
};

const PAGE_GRID = '1.3fr 1fr 1fr 1fr 1.3fr 60px';
const PAGE_GRID_COLS = 'gridTemplateColumns: \'1.3fr 1fr 1fr 1fr 1.3fr 60px\'';

const EVENT_PRESETS = ['Visitas', 'Registro lead', 'Thank you page', 'WhatsApp'];

// Acepta legacy (array de strings) o nuevo (array de {label, meta_name})
function normalizeEvents(events) {
  if (!Array.isArray(events)) return [];
  return events.map(e => typeof e === 'string' ? { label: e, meta_name: '' } : { label: e?.label || '', meta_name: e?.meta_name || '' });
}

function TrackingEditor({ page, onPatch, compact = false }) {
  const list = normalizeEvents(page.conversion_events);
  const [openModal, setOpenModal] = useState(false);
  const configured = list.filter(e => e.meta_name).length;
  const hasPixel = !!page.pixel_id;
  const hasClarity = !!page.clarity_id;
  const hasAny = hasPixel || hasClarity || list.length > 0;

  // Vista compacta (en la tabla desktop o card mobile)
  if (compact) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpenModal(true)}
          className="inline-flex flex-wrap items-center gap-1 text-left bg-transparent border-none cursor-pointer p-0 hover:opacity-80"
          title="Configurar tracking"
        >
          {!hasAny ? (
            <span className="inline-flex items-center gap-1 text-[10.5px] py-[2px] px-2 rounded-full border border-dashed border-[#D0D5DD] text-text3">
              <Plus size={10} /> Configurar
            </span>
          ) : (
            <>
              {hasPixel && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium py-[2px] px-2 rounded-full" style={{ background: '#EEF2FF', color: '#5B7CF5' }}>Pixel</span>
              )}
              {hasClarity && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium py-[2px] px-2 rounded-full" style={{ background: '#ECFEFF', color: '#0891B2' }}>Clarity</span>
              )}
              {list.slice(0, 2).map((ev, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] font-medium py-[2px] px-2 rounded-full" style={{ background: ev.meta_name ? '#F5F3FF' : '#FEFCE8', color: ev.meta_name ? '#7C3AED' : '#CA8A04' }}>
                  {ev.label}
                  {ev.meta_name && <span className="font-mono opacity-70">·</span>}
                  {ev.meta_name && <span className="font-mono truncate max-w-[80px]">{ev.meta_name}</span>}
                </span>
              ))}
              {list.length > 2 && (
                <span className="text-[10px] py-[2px] px-1.5 rounded-full" style={{ background: '#F0F2F5', color: '#6B7280' }}>+{list.length - 2}</span>
              )}
            </>
          )}
        </button>
        {openModal && (
          <TrackingModal page={page} onClose={() => setOpenModal(false)} onPatch={onPatch} />
        )}
      </>
    );
  }

  // Vista expandida (form de edicion)
  return (
    <div className="flex flex-col gap-1">
      {!hasAny && (
        <span className="text-[11px] italic" style={{ color: '#9CA3AF' }}>Sin tracking configurado</span>
      )}
      {hasPixel && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-medium shrink-0" style={{ color: '#1A1D26', minWidth: 90 }}>Pixel Meta</span>
          <span style={{ color: '#9CA3AF' }}>→</span>
          <span className="font-mono flex-1 truncate" style={{ color: '#5B7CF5' }}>{page.pixel_id}</span>
        </div>
      )}
      {hasClarity && (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className="font-medium shrink-0" style={{ color: '#1A1D26', minWidth: 90 }}>Clarity</span>
          <span style={{ color: '#9CA3AF' }}>→</span>
          <span className="font-mono flex-1 truncate" style={{ color: '#0891B2' }}>{page.clarity_id}</span>
        </div>
      )}
      {list.map((ev, i) => (
        <div key={i} className="flex items-center gap-1.5 text-[11px]">
          <span className="font-medium shrink-0" style={{ color: '#1A1D26', minWidth: 90 }}>{ev.label}</span>
          <span style={{ color: '#9CA3AF' }}>→</span>
          <span className="font-mono flex-1 truncate" style={{ color: ev.meta_name ? '#7C3AED' : '#9CA3AF' }}>{ev.meta_name || 'sin configurar'}</span>
        </div>
      ))}
      <button type="button" onClick={() => setOpenModal(true)} className="self-start inline-flex items-center gap-1 text-[10.5px] py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] text-text3 hover:text-blue hover:border-blue cursor-pointer bg-transparent mt-1">
        <Pencil size={10} /> Configurar tracking
      </button>
      {openModal && (
        <TrackingModal page={page} onClose={() => setOpenModal(false)} onPatch={onPatch} />
      )}
    </div>
  );
}

function TrackingModal({ page, onClose, onPatch }) {
  const initialEvents = (() => {
    const events = normalizeEvents(page.conversion_events);
    const byLabel = new Map(events.map(e => [e.label, e.meta_name]));
    const rows = EVENT_PRESETS.map(label => ({ label, meta_name: byLabel.get(label) || '', preset: true }));
    events.forEach(e => {
      if (!EVENT_PRESETS.includes(e.label) && e.label) {
        rows.push({ label: e.label, meta_name: e.meta_name || '', preset: false });
      }
    });
    return rows;
  })();
  const [pixelId, setPixelId] = useState(page.pixel_id || '');
  const [clarityId, setClarityId] = useState(page.clarity_id || '');
  const [rows, setRows] = useState(initialEvents);

  const setRow = (i, patch) => setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));
  const addCustom = () => setRows(rs => [...rs, { label: '', meta_name: '', preset: false }]);
  const removeRow = (i) => setRows(rs => rs.filter((_, j) => j !== i));

  const save = () => {
    const cleaned = rows
      .filter(r => r.label.trim() && (r.meta_name.trim() || !r.preset))
      .map(r => ({ label: r.label.trim(), meta_name: r.meta_name.trim() }));
    onPatch({
      pixel_id: pixelId.trim() || null,
      clarity_id: clarityId.trim() || null,
      conversion_events: cleaned,
    });
    onClose();
  };

  return (
    <Modal open={true} onClose={onClose} title="Configuración de tracking" maxWidth={580}
      footer={
        <div className="flex justify-end gap-2 w-full">
          <button className="text-[12.5px] py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-text2 font-medium cursor-pointer hover:bg-surface2" onClick={onClose}>Cancelar</button>
          <button className="text-[12.5px] py-2 px-4 rounded-lg border-none bg-blue text-white font-semibold cursor-pointer hover:bg-blue-dark" onClick={save}>Guardar</button>
        </div>
      }
    >
      <div className="p-1 flex flex-col gap-5">
        {/* Pixels */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Píxeles instalados</div>
          <div className="grid gap-3" style={{ gridTemplateColumns: '1fr 1fr' }}>
            <div className="grid gap-1">
              <label className="text-[11.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#1A1D26' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#5B7CF5' }} /> Pixel de Meta
              </label>
              <input type="text" value={pixelId} onChange={e => setPixelId(e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="123456789012345" />
              <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Pixel ID del Business Manager</span>
            </div>
            <div className="grid gap-1">
              <label className="text-[11.5px] font-semibold inline-flex items-center gap-1.5" style={{ color: '#1A1D26' }}>
                <span className="w-2 h-2 rounded-full" style={{ background: '#0891B2' }} /> Microsoft Clarity
              </label>
              <input type="text" value={clarityId} onChange={e => setClarityId(e.target.value)} className="text-[13px] py-2 px-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono" placeholder="abc12defgh" />
              <span className="text-[10.5px]" style={{ color: '#9CA3AF' }}>Project ID de Clarity</span>
            </div>
          </div>
        </div>

        {/* Eventos */}
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>Eventos de conversión</div>
          <div className="text-[11.5px] mb-3 py-2 px-3 rounded-lg" style={{ background: '#FEFCE8', color: '#92400E' }}>
            Pegá el <b>nombre exacto</b> con el que está configurado cada evento en Meta. Ej.: si "Visitas" aparece como <span className="font-mono bg-white px-1 rounded">eventos_pre-landing</span>, pegá eso.
          </div>
          <div className="hidden md:grid text-[10px] font-bold uppercase tracking-wider mb-1.5 px-2" style={{ gridTemplateColumns: '1fr 1.4fr 32px', color: '#9CA3AF', gap: 8 }}>
            <div>Qué trackeamos</div>
            <div>Nombre en Meta</div>
            <div />
          </div>
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="grid items-center gap-2 p-1.5 rounded-lg" style={{ gridTemplateColumns: '1fr 1.4fr 32px', background: r.preset ? '#F7F9FC' : 'transparent', border: r.preset ? '1px solid #F0F2F5' : '1px dashed #E2E5EB' }}>
                <input
                  type="text"
                  value={r.label}
                  onChange={e => setRow(i, { label: e.target.value })}
                  disabled={r.preset}
                  className={`text-[12.5px] py-1.5 px-2 rounded-md border outline-none ${r.preset ? 'bg-transparent border-transparent font-semibold' : 'bg-white border-[#E2E5EB] focus:border-blue'}`}
                  placeholder="Nombre interno"
                  style={{ color: '#1A1D26' }}
                />
                <input
                  type="text"
                  value={r.meta_name}
                  onChange={e => setRow(i, { meta_name: e.target.value })}
                  className="text-[12.5px] py-1.5 px-2 rounded-md border border-[#E2E5EB] outline-none focus:border-blue bg-white font-mono"
                  placeholder="ej. eventos_pre-landing"
                  style={{ color: '#7C3AED' }}
                />
                {r.preset ? (
                  <span />
                ) : (
                  <button type="button" onClick={() => removeRow(i)} className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" title="Quitar"><Trash2 size={12} /></button>
                )}
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

function UrlPill({ url, isLive, label, color = 'blue' }) {
  if (!url) return <span className="text-[12px]" style={{ color: '#9CA3AF' }}>—</span>;
  const bg = color === 'purple' ? '#F5F3FF' : '#EEF2FF';
  const fg = color === 'purple' ? '#7C3AED' : '#5B7CF5';
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] no-underline py-1 px-2 rounded-md" style={{ background: bg, color: fg }}>
      {label || 'Abrir'} <ExternalLink size={11} />
      {isLive && <span className="ml-1 inline-flex items-center py-[1px] px-1.5 rounded-full text-[9px] font-bold bg-green-bg text-[#16A34A]">live</span>}
    </a>
  );
}

function PageRow({ p, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    name: p.name,
    testing_url: p.testing_url || '',
    prod_url: p.prod_url || '',
    is_live: p.is_live,
    ads_url: p.ads_url || '',
  });

  const save = () => {
    onUpdate(p.id, form);
    setEditing(false);
  };

  const patchTracking = (patch) => onUpdate(p.id, patch);

  if (editing) {
    return (
      <>
        {/* Desktop: edicion inline en fila */}
        <div className="hidden md:grid items-center py-2 px-3 bg-blue-bg2 gap-2" style={{ gridTemplateColumns: PAGE_GRID }}>
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="text-[12px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="Nombre página" />
          <input type="text" value={form.testing_url} onChange={e => setForm({ ...form, testing_url: e.target.value })} className="text-[11px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL testing" />
          <div className="flex items-center gap-1.5">
            <input type="text" value={form.prod_url} onChange={e => setForm({ ...form, prod_url: e.target.value })} className="text-[11px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue flex-1 min-w-0" placeholder="URL producción" />
            <label className="inline-flex items-center gap-1 text-[10px] cursor-pointer shrink-0" title="Marcar como live"><input type="checkbox" checked={form.is_live} onChange={e => setForm({ ...form, is_live: e.target.checked })} /> live</label>
          </div>
          <input type="text" value={form.ads_url} onChange={e => setForm({ ...form, ads_url: e.target.value })} className="text-[11px] py-1 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL campaña Meta" />
          <TrackingEditor page={p} onPatch={patchTracking} compact />
          <div className="flex gap-1 justify-end">
            <button className="text-[11px] py-1 px-2 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={save}>OK</button>
            <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setEditing(false)}>×</button>
          </div>
        </div>
        {/* Mobile: form apilado */}
        <div className="md:hidden flex flex-col gap-2 py-3 px-3 bg-blue-bg2 border-b border-[#F0F2F5]">
          <input type="text" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} className="text-[12px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="Nombre página" />
          <input type="text" value={form.testing_url} onChange={e => setForm({ ...form, testing_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL testing" />
          <input type="text" value={form.prod_url} onChange={e => setForm({ ...form, prod_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL producción" />
          <label className="inline-flex items-center gap-1.5 text-[11px] cursor-pointer self-start"><input type="checkbox" checked={form.is_live} onChange={e => setForm({ ...form, is_live: e.target.checked })} /> Marcar como live</label>
          <input type="text" value={form.ads_url} onChange={e => setForm({ ...form, ads_url: e.target.value })} className="text-[11.5px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" placeholder="URL campaña Meta" />
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: '#9CA3AF' }}>Tracking</div>
            <TrackingEditor page={p} onPatch={patchTracking} />
          </div>
          <div className="flex gap-1 pt-1">
            <button className="text-[12px] py-1.5 px-3 rounded bg-blue text-white font-medium cursor-pointer border-none flex-1" onClick={save}>Guardar</button>
            <button className="text-[12px] py-1.5 px-3 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setEditing(false)}>Cancelar</button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {/* Desktop: tabla */}
      <div className="hidden md:grid items-center py-2 px-3 border-b border-[#F0F2F5] last:border-b-0 hover:bg-[#F7F9FC] group gap-2" style={{ gridTemplateColumns: PAGE_GRID }}>
        <div className="flex items-center gap-1.5 text-[12.5px] font-medium min-w-0" style={{ color: '#1A1D26' }}>
          <FileText size={13} className="text-[#9CA3AF] shrink-0" /><span className="truncate">{p.name}</span>
        </div>
        <div><UrlPill url={p.testing_url} /></div>
        <div><UrlPill url={p.prod_url} isLive={p.is_live} /></div>
        <div><UrlPill url={p.ads_url} label="Meta" color="purple" /></div>
        <div className="min-w-0"><TrackingEditor page={p} onPatch={patchTracking} compact /></div>
        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
          <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setEditing(true)} title="Editar"><Pencil size={11} /></button>
          <button className="w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar esta página?')) onDelete(p.id); }} title="Eliminar"><Trash2 size={11} /></button>
        </div>
      </div>
      {/* Mobile: card apilado */}
      <div className="md:hidden py-3 px-3 border-b border-[#F0F2F5] last:border-b-0 flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-[#9CA3AF] shrink-0" />
          <span className="flex-1 truncate text-[13px] font-semibold" style={{ color: '#1A1D26' }}>{p.name}</span>
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setEditing(true)} title="Editar"><Pencil size={12} /></button>
          <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Borrar esta página?')) onDelete(p.id); }} title="Eliminar"><Trash2 size={12} /></button>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[11px]">
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#9CA3AF' }}>Testing</div>
            <UrlPill url={p.testing_url} />
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#9CA3AF' }}>Producción</div>
            <UrlPill url={p.prod_url} isLive={p.is_live} />
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#9CA3AF' }}>Publicidad</div>
            <UrlPill url={p.ads_url} label="Meta" color="purple" />
          </div>
          <div>
            <div className="text-[9.5px] font-bold uppercase tracking-wider mb-0.5" style={{ color: '#9CA3AF' }}>Tracking</div>
            <TrackingEditor page={p} onPatch={patchTracking} compact />
          </div>
        </div>
      </div>
    </>
  );
}

function VisualChecklist({ strategy, onUpdate }) {
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const items = Array.isArray(strategy.visual_resources) ? strategy.visual_resources : [];
  const done = items.filter(i => i.ok).length;

  const toggle = (idx) => {
    const next = items.map((it, i) => i === idx ? { ...it, ok: !it.ok } : it);
    onUpdate(strategy.id, { visual_resources: next });
  };
  const removeItem = (idx) => {
    onUpdate(strategy.id, { visual_resources: items.filter((_, i) => i !== idx) });
  };
  const addItem = () => {
    const label = newLabel.trim();
    if (!label) return;
    onUpdate(strategy.id, { visual_resources: [...items, { label, ok: false }] });
    setNewLabel('');
    setAdding(false);
  };

  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: '#9CA3AF' }}>
          <ImageIcon size={11} /> Recursos necesarios
        </div>
        {items.length > 0 && (
          <span className="text-[10.5px] font-semibold py-[2px] px-1.5 rounded-full" style={{ background: '#F0F2F5', color: '#6B7280' }}>{done} / {items.length}</span>
        )}
      </div>
      {items.length === 0 ? (
        <div className="text-[11.5px] mb-2 italic" style={{ color: '#9CA3AF' }}>
          Sin recursos cargados. Ejemplos: logo, fotos, vídeo VSL.
        </div>
      ) : (
        <ul className="list-none p-0 m-0 flex flex-col gap-0.5 mb-2">
          {items.map((it, i) => (
            <li key={i} className="flex items-center gap-2 py-1 px-1.5 rounded-md hover:bg-white group">
              <button
                className={`w-[18px] h-[18px] rounded inline-flex items-center justify-center shrink-0 cursor-pointer border-2`}
                style={it.ok ? { background: '#ECFDF5', borderColor: '#16A34A' } : { background: '#FFFFFF', borderColor: '#D0D5DD' }}
                onClick={() => toggle(i)}
                title={it.ok ? 'Marcar como faltante' : 'Marcar como disponible'}
              >
                {it.ok && <Check size={11} strokeWidth={3} className="text-[#16A34A]" />}
              </button>
              <span className={`flex-1 text-[12px] truncate ${it.ok ? 'font-semibold' : 'font-medium'}`} style={{ color: it.ok ? '#1A1D26' : '#6B7280' }}>{it.label}</span>
              <button className="w-5 h-5 rounded bg-transparent border-none cursor-pointer text-text3 opacity-0 group-hover:opacity-100 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center transition-opacity shrink-0" onClick={() => removeItem(i)} title="Quitar"><X size={10} /></button>
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <div className="flex gap-1">
          <input
            type="text"
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') addItem(); if (e.key === 'Escape') setAdding(false); }}
            placeholder="Ej. Logo, foto producto…"
            className="flex-1 min-w-0 text-[12px] py-1.5 px-2 rounded-md border border-[#E2E5EB] outline-none focus:border-blue"
            autoFocus
          />
          <button className="text-[11px] py-1 px-2 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addItem}>OK</button>
          <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
        </div>
      ) : (
        <button className="inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] text-text3 hover:text-blue hover:border-blue cursor-pointer bg-transparent self-start" onClick={() => setAdding(true)}>
          <Plus size={11} /> Recurso
        </button>
      )}
    </div>
  );
}

function StrategyCard({ s, pages }) {
  const { updateStrategy, deleteStrategy, addStrategyPage, updateStrategyPage, deleteStrategyPage } = useApp();
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState(s.name);
  const [adding, setAdding] = useState(false);
  const [newPageName, setNewPageName] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [editingDate, setEditingDate] = useState(false);
  // Modales para archivos/accesos
  const [linkModal, setLinkModal] = useState(null); // { kind: 'drive' | 'doc', initial, index }
  const [accessModal, setAccessModal] = useState(null); // { initial, index } or { initial: null } para nuevo
  // Expand/collapse de accesos individuales
  const [expandedAccess, setExpandedAccess] = useState({});
  const myPages = pages.filter(p => p.strategy_id === s.id).sort((a, b) => (a.position || 0) - (b.position || 0));
  const st = STATUS_STYLES[s.status] || STATUS_STYLES.borrador;

  const saveName = () => {
    if (nameValue.trim() && nameValue !== s.name) updateStrategy(s.id, { name: nameValue.trim() });
    setEditingName(false);
  };

  const addPage = () => {
    if (!newPageName.trim()) return;
    addStrategyPage({ strategy_id: s.id, name: newPageName.trim(), position: myPages.length });
    setNewPageName('');
    setAdding(false);
  };

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl shadow-sm overflow-hidden mb-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 md:gap-3 py-3 px-3 md:px-4 border-b border-[#F0F2F5]" style={{ background: '#F5F7FF' }}>
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] font-bold text-white" style={{ background: '#1A1D26' }}>#{s.position + 1}</span>
        {editingName ? (
          <input type="text" value={nameValue} onChange={e => setNameValue(e.target.value)} onBlur={saveName} onKeyDown={e => { if (e.key === 'Enter') saveName(); if (e.key === 'Escape') { setNameValue(s.name); setEditingName(false); } }} autoFocus className="text-[14px] font-bold py-0.5 px-1.5 border border-blue rounded outline-none flex-1" style={{ color: '#1A1D26' }} />
        ) : (
          <span className="text-[14px] font-bold cursor-pointer hover:bg-white px-1.5 py-0.5 rounded flex-1" style={{ color: '#1A1D26' }} onClick={() => setEditingName(true)}>{s.name}</span>
        )}
        <div className="relative">
          <button className="inline-flex items-center py-[3px] px-[9px] rounded-full text-[10px] font-bold cursor-pointer hover:opacity-80 border-none" style={{ background: st.bg, color: st.fg }} onClick={() => setStatusOpen(o => !o)}>{st.label}</button>
          {statusOpen && (
            <div className="absolute right-0 top-full mt-1 bg-white border border-[#E2E5EB] rounded-lg shadow-md z-10 min-w-[120px]">
              {Object.entries(STATUS_STYLES).map(([k, v]) => (
                <button key={k} className="block w-full text-left text-[11px] py-1.5 px-2.5 hover:bg-blue-bg2 bg-transparent border-none cursor-pointer font-medium" style={{ color: v.fg }} onClick={() => { updateStrategy(s.id, { status: k }); setStatusOpen(false); }}>{v.label}</button>
              ))}
            </div>
          )}
        </div>
        <span className="inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded-md bg-white border border-[#E2E5EB]" style={{ color: '#6B7280' }}>
          {s.version} · actual <ChevronDown size={11} />
        </span>
        {editingDate ? (
          <input type="date" autoFocus value={s.start_date || ''}
            onChange={e => updateStrategy(s.id, { start_date: e.target.value || null })}
            onBlur={() => setEditingDate(false)}
            className="text-[11px] py-1 px-1.5 rounded-md border border-blue outline-none bg-white"
          />
        ) : (
          <button
            className="inline-flex items-center gap-1 text-[11px] py-1 px-2 rounded-md bg-white border border-[#E2E5EB] cursor-pointer hover:border-blue hover:text-blue"
            style={{ color: '#6B7280' }}
            onClick={() => setEditingDate(true)}
            title="Fecha de inicio de la estrategia"
          >
            <Calendar size={11} /> {s.start_date ? fmtDate(s.start_date) : 'Fecha inicio'}
          </button>
        )}
        <button className="w-7 h-7 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Borrar la estrategia "${s.name}" y todas sus páginas?`)) deleteStrategy(s.id); }} title="Eliminar estrategia"><Trash2 size={13} /></button>
      </div>

      {/* Matriz */}
      <div>
        <div className="hidden md:grid items-center py-2 px-3 text-[10px] font-bold uppercase tracking-wider border-b border-[#F0F2F5] gap-2" style={{ gridTemplateColumns: PAGE_GRID, color: '#9CA3AF' }}>
          <div>Página</div>
          <div>Testing</div>
          <div>Producción</div>
          <div>Publicidad</div>
          <div>Tracking</div>
          <div />
        </div>
        {myPages.length === 0 ? (
          <div className="text-center text-text3 text-[12px] py-4">Sin páginas. Agregá la primera abajo.</div>
        ) : (
          myPages.map(p => (
            <PageRow key={p.id} p={p} onUpdate={updateStrategyPage} onDelete={deleteStrategyPage} />
          ))
        )}
        {adding ? (
          <div className="grid items-center py-2 px-3 gap-2 bg-blue-bg2" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <input type="text" value={newPageName} onChange={e => setNewPageName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addPage(); if (e.key === 'Escape') setAdding(false); }} autoFocus placeholder="Nombre de la página (ej. VSL, Landing, Página de gracias)" className="text-[12px] py-1.5 px-2 rounded border border-[#E2E5EB] outline-none focus:border-blue" />
            <button className="text-[11px] py-1 px-2.5 rounded bg-blue text-white font-medium cursor-pointer border-none" onClick={addPage}>Agregar</button>
            <button className="text-[11px] py-1 px-2 rounded bg-surface2 text-text2 cursor-pointer border-none" onClick={() => setAdding(false)}>×</button>
          </div>
        ) : (
          <button className="w-full text-left text-[11.5px] py-2 px-3 bg-transparent border-none cursor-pointer text-blue font-medium hover:bg-blue-bg2 inline-flex items-center gap-1" onClick={() => setAdding(true)}><Plus size={12} /> Agregar página</button>
        )}
      </div>

      {/* Footer: 3 columnas en desktop, apiladas en mobile */}
      <div className="grid border-t border-[#F0F2F5] grid-cols-1 md:grid-cols-3" style={{ background: '#FAFBFC' }}>
        {/* Archivos: Drive + docs */}
        <div className="p-3 border-b md:border-b-0 md:border-r border-[#F0F2F5]">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>
            <Folder size={11} /> Archivos
          </div>
          <div className="flex flex-col gap-1.5">
            {s.drive_url && (
              <div className="flex items-center gap-2 text-[12px] py-1.5 px-2 rounded-md bg-white border border-[#E2E5EB] group/lk" style={{ color: '#1A1D26' }}>
                <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#EEF2FF' }}><Folder size={12} className="text-blue" /></span>
                <a href={s.drive_url} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium no-underline hover:text-blue" style={{ color: 'inherit' }}>Drive de la estrategia</a>
                <CopyButton value={s.drive_url} title="Copiar URL" />
                <button className="opacity-0 group-hover/lk:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setLinkModal({ kind: 'drive', initial: { label: 'Drive', url: s.drive_url } })} title="Editar"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/lk:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm('¿Quitar el Drive?')) updateStrategy(s.id, { drive_url: null }); }} title="Quitar"><X size={11} /></button>
              </div>
            )}
            {(s.docs || []).map((d, di) => (
              <div key={di} className="flex items-center gap-2 text-[12px] py-1.5 px-2 rounded-md bg-white border border-[#E2E5EB] group/lk" style={{ color: '#1A1D26' }}>
                <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#F5F3FF' }}><FileText size={12} className="text-purple" /></span>
                <a href={d.url} target="_blank" rel="noreferrer" className="flex-1 truncate font-medium no-underline hover:text-blue" style={{ color: 'inherit' }}>{d.label}</a>
                <CopyButton value={d.url} title="Copiar URL" />
                <button className="opacity-0 group-hover/lk:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setLinkModal({ kind: 'doc', initial: d, index: di })} title="Editar"><Pencil size={11} /></button>
                <button className="opacity-0 group-hover/lk:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Quitar "${d.label}"?`)) updateStrategy(s.id, { docs: (s.docs || []).filter((_, i) => i !== di) }); }} title="Quitar"><X size={11} /></button>
              </div>
            ))}
            <div className="flex gap-1 flex-wrap">
              {!s.drive_url && (
                <button className="inline-flex items-center gap-1 text-[11px] bg-transparent py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] cursor-pointer text-text3 hover:text-blue hover:border-blue" onClick={() => setLinkModal({ kind: 'drive', initial: null })}><Plus size={11} /> Drive</button>
              )}
              <button className="inline-flex items-center gap-1 text-[11px] bg-transparent py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] cursor-pointer text-text3 hover:text-blue hover:border-blue" onClick={() => setLinkModal({ kind: 'doc', initial: null })}><Plus size={11} /> Documento</button>
            </div>
          </div>
        </div>

        {/* Accesos */}
        <div className="p-3 border-b md:border-b-0 md:border-r border-[#F0F2F5]">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: '#9CA3AF' }}>
            <Key size={11} /> Accesos
          </div>
          <div className="flex flex-col gap-1.5">
            {(s.accesos || []).length === 0 && (
              <span className="text-[11.5px] italic" style={{ color: '#9CA3AF' }}>Sin accesos cargados</span>
            )}
            {(s.accesos || []).map((a, ai) => {
              const isExp = !!expandedAccess[ai];
              return (
                <div key={ai} className="rounded-md bg-white border border-[#E2E5EB] overflow-hidden group/ac">
                  <div className="flex items-center gap-2 text-[12px] py-1.5 px-2" style={{ color: '#1A1D26' }}>
                    <span className="w-6 h-6 rounded-md inline-flex items-center justify-center shrink-0" style={{ background: '#EEF2FF' }}><Key size={12} className="text-blue" /></span>
                    <button
                      className="flex-1 min-w-0 text-left bg-transparent border-none cursor-pointer p-0"
                      onClick={() => setExpandedAccess(prev => ({ ...prev, [ai]: !prev[ai] }))}
                      title={isExp ? 'Ocultar detalles' : 'Mostrar detalles'}
                    >
                      <span className="block truncate font-medium" style={{ color: '#1A1D26' }}>{a.label}</span>
                      {a.email && !isExp && <span className="block text-[10px] truncate" style={{ color: '#9CA3AF' }}>{a.email}</span>}
                    </button>
                    {a.url && (
                      <a href={a.url} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center w-6 h-6 rounded-md bg-transparent text-text3 hover:bg-blue-bg hover:text-blue shrink-0 no-underline" title="Abrir login"><ExternalLink size={12} /></a>
                    )}
                    <button className="opacity-0 group-hover/ac:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-blue-bg hover:text-blue inline-flex items-center justify-center" onClick={() => setAccessModal({ initial: a, index: ai })} title="Editar"><Pencil size={11} /></button>
                    <button className="opacity-0 group-hover/ac:opacity-100 w-6 h-6 rounded bg-transparent border-none cursor-pointer text-text3 hover:bg-red-bg hover:text-red-500 inline-flex items-center justify-center" onClick={() => { if (window.confirm(`¿Quitar acceso "${a.label}"?`)) updateStrategy(s.id, { accesos: (s.accesos || []).filter((_, i) => i !== ai) }); }} title="Quitar"><X size={11} /></button>
                  </div>
                  {isExp && (
                    <div className="border-t border-[#F0F2F5] p-1.5 flex flex-col gap-1" style={{ background: '#FAFBFC' }}>
                      <CopyableRow icon={Mail} label="Email" value={a.email || a.username} />
                      <CopyableRow icon={Key} label="Pass" value={a.password} masked />
                      {a.notes && (
                        <div className="text-[11px] py-1 px-2 rounded-md italic" style={{ color: '#6B7280' }}>{a.notes}</div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            <button className="inline-flex items-center gap-1 text-[11px] bg-transparent py-1 px-2 rounded-md border border-dashed border-[#D0D5DD] cursor-pointer text-text3 hover:text-blue hover:border-blue self-start" onClick={() => setAccessModal({ initial: null })}>
              <Plus size={11} /> Acceso
            </button>
          </div>
        </div>

        {/* Recursos necesarios (checklist) */}
        <VisualChecklist strategy={s} onUpdate={updateStrategy} />
      </div>

      {/* Modales */}
      {linkModal && (
        <LinkFormModal
          open={!!linkModal}
          onClose={() => setLinkModal(null)}
          kind={linkModal.kind}
          initial={linkModal.initial}
          onSave={(data) => {
            if (linkModal.kind === 'drive') {
              updateStrategy(s.id, { drive_url: data.url });
            } else {
              const docs = [...(s.docs || [])];
              if (linkModal.index != null) docs[linkModal.index] = data;
              else docs.push(data);
              updateStrategy(s.id, { docs });
            }
          }}
        />
      )}
      {accessModal && (
        <AccessFormModal
          open={!!accessModal}
          onClose={() => setAccessModal(null)}
          initial={accessModal.initial}
          onSave={(data) => {
            const accesos = [...(s.accesos || [])];
            if (accessModal.index != null) accesos[accessModal.index] = data;
            else accesos.push(data);
            updateStrategy(s.id, { accesos });
          }}
        />
      )}
    </div>
  );
}

export default function StrategyMatrix({ clientId }) {
  const { strategies, strategyPages, addStrategy } = useApp();
  const myStrategies = strategies.filter(s => s.client_id === clientId).sort((a, b) => (a.position || 0) - (b.position || 0));

  const today = new Date().toISOString().slice(0, 10);
  const newStrategy = () => {
    const name = window.prompt('Nombre de la nueva estrategia:');
    if (!name) return;
    addStrategy({ client_id: clientId, name, position: myStrategies.length, status: 'borrador', version: 'v1', start_date: today });
  };

  return (
    <div className="mb-4">
      {myStrategies.length === 0 && (
        <div className="bg-white border border-dashed border-[#D0D5DD] rounded-xl text-center py-10 mb-3">
          <div className="text-[13px] mb-1 font-medium" style={{ color: '#1A1D26' }}>Sin estrategias todavía</div>
          <div className="text-[11.5px] text-text2 mb-3">Cada estrategia agrupa las páginas de un embudo (VSL, Landing, Página de gracias…) con sus URLs de testing y producción.</div>
        </div>
      )}
      {myStrategies.map(s => <StrategyCard key={s.id} s={s} pages={strategyPages} />)}
      <button className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg border border-[#E2E5EB] bg-white text-[12.5px] font-medium cursor-pointer hover:border-blue hover:text-blue" style={{ color: '#1A1D26' }} onClick={newStrategy}><Plus size={14} /> Nueva estrategia</button>
    </div>
  );
}
