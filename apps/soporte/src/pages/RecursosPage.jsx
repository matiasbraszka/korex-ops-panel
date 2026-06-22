import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Gauge, Zap, FolderOpen, FileText, Folder, Link2, ExternalLink,
  Plus, Trash2, AlertTriangle, RefreshCw, MessageCircle, Copy, Check,
} from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';
import { fetchBriefings } from '../lib/api.js';
import PlantillasPage from './PlantillasPage.jsx';

const TABS = [
  { id: 'resumen', label: 'Resumen de grupos', Icon: Gauge },
  { id: 'plantillas', label: 'Plantillas', Icon: Zap },
  { id: 'enlaces', label: 'Enlaces y carpetas', Icon: FolderOpen },
  { id: 'walink', label: 'Link de WhatsApp', Icon: MessageCircle },
];

// ── Chip de score 0-100 con color ────────────────────────────────────────────
function Chip({ v }) {
  if (v === null || v === undefined) return <span className="text-text3 text-[12px]">—</span>;
  const c = v >= 75 ? { b: '#DCFCE7', t: '#15803D' } : v >= 50 ? { b: '#FEF0D7', t: '#B45309' } : { b: '#FEE2E2', t: '#DC2626' };
  return <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: c.b, color: c.t }}>{v}</span>;
}
const dot = (v) => (v === null || v === undefined ? '⚪' : v >= 75 ? '🟢' : v >= 50 ? '🟡' : '🔴');

// ── Resumen de grupos: una tarjeta por cliente con su situación ───────────────
function ResumenGrupos() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setError(false);
    try { setRows(await fetchBriefings()); } catch { setError(true); setRows([]); }
  };
  useEffect(() => { load(); }, []);

  if (rows === null) {
    return <div className="text-center py-20 text-text3 text-[13px]">Cargando…</div>;
  }
  if (error) {
    return <div className="text-center py-20 text-text3 text-[13px]">No se pudo cargar el resumen.</div>;
  }
  if (!rows.length) {
    return (
      <div className="text-center py-20 px-6">
        <Gauge size={26} className="mx-auto text-text3 mb-2" />
        <div className="text-[13.5px] font-semibold text-text2">Todavía no hay análisis</div>
        <div className="text-[12px] text-text3 mt-1">El informe automático corre los domingos y completa esta vista.</div>
      </div>
    );
  }

  return (
    <div className="p-4 max-md:p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-text3">{rows.length} cliente(s) · ordenados de menor a mayor satisfacción</div>
        <button onClick={load} className="flex items-center gap-1 text-[12px] text-text2 hover:text-[#F59E0B] cursor-pointer">
          <RefreshCw size={13} /> Actualizar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {rows.map((b) => {
          const name = b.client?.name || b.client_id;
          return (
            <div key={b.client_id} className="rounded-[14px] border border-border bg-white p-4 shadow-[0_1px_2px_rgba(10,22,40,.04)]">
              <div className="flex items-center justify-between gap-2">
                <div className="text-[14px] font-bold truncate">{dot(b.sat_overall)} {name}</div>
                <Chip v={b.sat_overall} />
              </div>
              <div className="flex items-center gap-3 mt-2 text-[12px] text-text2 flex-wrap">
                <span className="flex items-center gap-1">👥 Usuarios <Chip v={b.sat_usuarios} /></span>
                <span className="flex items-center gap-1">💬 Cliente <Chip v={b.sat_cliente_grupo} /></span>
                <span className="flex items-center gap-1">📩 1-a-1 <Chip v={b.sat_privado} /></span>
              </div>
              {b.estado && <div className="text-[12.5px] text-text2 mt-2.5 leading-snug line-clamp-4">{b.estado}</div>}
              {b.riesgos && (
                <div className="flex items-start gap-1.5 mt-2 text-[12px] text-[#DC2626] leading-snug">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span className="line-clamp-3">{b.riesgos}</span>
                </div>
              )}
              {b.updated_at && (
                <div className="text-[10.5px] text-text3 mt-2.5">Actualizado: {String(b.updated_at).slice(0, 10)}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Enlaces y carpetas: links configurables (Docs, carpetas, etc.) ────────────
const ICON_BY_TYPE = { doc: FileText, folder: Folder, link: Link2 };
const TYPE_LABEL = { doc: 'Documento', folder: 'Carpeta', link: 'Enlace' };

function EnlacesCarpetas() {
  const { recursos, saveRecursos } = useSoporte();
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ label: '', url: '', type: 'doc' });
  const [saving, setSaving] = useState(false);

  const persist = async (next) => { setSaving(true); try { await saveRecursos(next); } finally { setSaving(false); } };
  const add = async () => {
    const label = draft.label.trim(); let url = draft.url.trim();
    if (!label || !url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    await persist([...(recursos || []), { label, url, type: draft.type }]);
    setDraft({ label: '', url: '', type: 'doc' });
    setAdding(false);
  };
  const remove = async (i) => persist((recursos || []).filter((_, idx) => idx !== i));

  return (
    <div className="p-4 max-md:p-3 max-w-[760px]">
      <div className="flex items-center justify-between mb-3">
        <div className="text-[12px] text-text3">Accesos rápidos a documentos y carpetas del equipo.</div>
        <button onClick={() => setAdding((v) => !v)}
                className="py-2 px-3 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1 shadow-[0_2px_6px_rgba(245,158,11,.35)]">
          <Plus size={13} /> Agregar
        </button>
      </div>

      {adding && (
        <div className="rounded-[12px] border border-border bg-surface p-3 mb-3 flex flex-col gap-2">
          <div className="grid grid-cols-[1fr_140px] gap-2 max-md:grid-cols-1">
            <input autoFocus value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))}
                   placeholder="Nombre (ej. Guía de soporte)"
                   className="h-9 px-3 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B]" />
            <select value={draft.type} onChange={(e) => setDraft((d) => ({ ...d, type: e.target.value }))}
                    className="h-9 px-2 text-[12.5px] rounded-[10px] border border-border outline-none bg-white cursor-pointer">
              <option value="doc">Documento</option>
              <option value="folder">Carpeta</option>
              <option value="link">Enlace</option>
            </select>
          </div>
          <input value={draft.url} onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                 placeholder="https://…"
                 className="h-9 px-3 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B]" />
          <div className="flex items-center gap-2">
            <button onClick={add} disabled={saving || !draft.label.trim() || !draft.url.trim()}
                    className={`py-2 px-3.5 rounded-[10px] border-0 text-[12.5px] font-bold ${draft.label.trim() && draft.url.trim() ? 'bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B]' : 'bg-surface2 text-text3 cursor-default'}`}>
              {saving ? 'Guardando…' : 'Agregar'}
            </button>
            <button onClick={() => { setAdding(false); setDraft({ label: '', url: '', type: 'doc' }); }}
                    className="py-2 px-3 rounded-[10px] border border-border bg-white text-[12.5px] text-text2 cursor-pointer hover:bg-surface2">Cancelar</button>
          </div>
        </div>
      )}

      {(!recursos || recursos.length === 0) ? (
        <div className="text-center py-14 px-6">
          <FolderOpen size={24} className="mx-auto text-text3 mb-2" />
          <div className="text-[12.5px] font-semibold text-text2">Sin enlaces todavía</div>
          <div className="text-[11px] text-text3 mt-1">Agregá los documentos o carpetas que use el equipo.</div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {recursos.map((r, i) => {
            const Icon = ICON_BY_TYPE[r.type] || Link2;
            return (
              <div key={i} className="group flex items-center gap-3 rounded-[12px] border border-border bg-white p-3 hover:border-[#F59E0B]/45 hover:shadow-[0_2px_8px_rgba(10,22,40,0.06)] transition-all duration-150">
                <span className="w-9 h-9 rounded-[10px] bg-[#FEF0D7] flex items-center justify-center shrink-0">
                  <Icon size={16} className="text-[#B45309]" />
                </span>
                <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold truncate flex items-center gap-1.5">{r.label} <ExternalLink size={12} className="text-text3" /></div>
                  <div className="text-[11px] text-text3 truncate">{TYPE_LABEL[r.type] || 'Enlace'} · {r.url}</div>
                </a>
                <button onClick={() => remove(i)} title="Quitar"
                        className="opacity-0 group-hover:opacity-100 transition-opacity border border-border bg-white rounded-[9px] text-text3 hover:text-[#DC2626] hover:border-[#DC2626]/40 cursor-pointer p-2">
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Generador de links de WhatsApp (wa.me) con el número de soporte ───────────
// Arma un link tipo https://wa.me/<numero>?text=<mensaje> para que, al abrirlo,
// se inicie un chat con el WhatsApp de soporte y el mensaje ya escrito. El
// número se guarda en la config para no tener que reescribirlo cada vez.
function GeneradorWaLink() {
  const { supportNumber, saveSupportNumber } = useSoporte();
  const [number, setNumber] = useState(supportNumber || '');
  const [message, setMessage] = useState('');
  const [copied, setCopied] = useState(false);
  const [savedHint, setSavedHint] = useState(false);

  // Si la config carga/llega después de montar, reflejar el número guardado
  // (sin pisar lo que el usuario esté tipeando: solo cuando aún está vacío).
  useEffect(() => { setNumber((n) => (n ? n : supportNumber || '')); }, [supportNumber]);

  const digits = number.replace(/\D/g, '');
  const link = digits
    ? `https://wa.me/${digits}${message.trim() ? `?text=${encodeURIComponent(message)}` : ''}`
    : '';

  // Persistir el número (solo dígitos) cuando cambió respecto del guardado.
  const persistNumber = async () => {
    if (digits === (supportNumber || '')) return;
    await saveSupportNumber(digits);
    setSavedHint(true);
    setTimeout(() => setSavedHint(false), 1600);
  };

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard no disponible */ }
  };

  return (
    <div className="p-4 max-md:p-3 max-w-[760px]">
      <div className="text-[12px] text-text3 mb-3">
        Generá un link de WhatsApp con el número de soporte y el mensaje que quieras. Quien lo abra inicia el chat con el texto ya escrito.
      </div>

      {/* Número de soporte (se recuerda) */}
      <div className="rounded-[12px] border border-border bg-surface p-3 mb-3 flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-text2">Número de soporte</label>
        <div className="flex items-center gap-2 max-md:flex-col max-md:items-stretch">
          <input
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onBlur={persistNumber}
            inputMode="tel"
            placeholder="Ej. 5492915056739 (código de país, sin + ni espacios)"
            className="flex-1 h-9 px-3 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B]"
          />
          {savedHint && (
            <span className="text-[11.5px] text-[#15803D] font-semibold flex items-center gap-1 shrink-0">
              <Check size={13} /> Guardado
            </span>
          )}
        </div>
        <div className="text-[11px] text-text3">Se guarda para la próxima vez. Incluí el código de país (ej. 54 para Argentina).</div>
      </div>

      {/* Mensaje */}
      <div className="rounded-[12px] border border-border bg-surface p-3 mb-3 flex flex-col gap-1.5">
        <label className="text-[12px] font-semibold text-text2">Mensaje (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={4}
          placeholder="Hola! Quería consultar por…"
          className="px-3 py-2 text-[13px] rounded-[10px] border border-border outline-none focus:border-[#F59E0B] resize-y leading-snug"
        />
      </div>

      {/* Link generado + acciones */}
      <div className="rounded-[12px] border border-border bg-white p-3 flex flex-col gap-2.5">
        <label className="text-[12px] font-semibold text-text2">Link generado</label>
        {link ? (
          <div className="text-[12.5px] text-[#1D4ED8] bg-surface2 rounded-[10px] px-3 py-2 break-all font-mono leading-snug">
            {link}
          </div>
        ) : (
          <div className="text-[12.5px] text-text3 bg-surface2 rounded-[10px] px-3 py-2">
            Cargá el número de soporte para generar el link.
          </div>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={copy}
            disabled={!link}
            className={`py-2 px-3.5 rounded-[10px] border-0 text-[12.5px] font-bold flex items-center gap-1.5 ${link ? 'bg-[#F59E0B] text-white cursor-pointer hover:bg-[#E08C0B] shadow-[0_2px_6px_rgba(245,158,11,.35)]' : 'bg-surface2 text-text3 cursor-default'}`}
          >
            {copied ? <><Check size={14} /> Copiado</> : <><Copy size={14} /> Copiar link</>}
          </button>
          <a
            href={link || undefined}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => { if (!link) e.preventDefault(); }}
            className={`py-2 px-3 rounded-[10px] border text-[12.5px] font-semibold flex items-center gap-1.5 ${link ? 'border-border bg-white text-text2 cursor-pointer hover:bg-surface2' : 'border-border bg-white text-text3 cursor-default pointer-events-none opacity-60'}`}
          >
            <ExternalLink size={13} /> Probar
          </a>
        </div>
      </div>
    </div>
  );
}

// ── Página Recursos ───────────────────────────────────────────────────────────
export default function RecursosPage() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get('tab');
  const [tab, setTab] = useState(TABS.some((t) => t.id === fromUrl) ? fromUrl : 'resumen');
  const selectTab = (id) => { setTab(id); setParams(id === 'resumen' ? {} : { tab: id }, { replace: true }); };

  return (
    <div className="h-full min-h-0 flex flex-col rounded-[14px] border border-border overflow-hidden bg-white shadow-[0_1px_2px_rgba(10,22,40,.04),0_1px_3px_rgba(10,22,40,.06)]">
      {/* Cabecera con sub-pestañas */}
      <div className="px-4 pt-3.5 pb-3 border-b border-surface2 shrink-0">
        <div className="flex items-center gap-2 mb-3">
          <span className="w-8 h-8 rounded-[10px] bg-[#FEF0D7] flex items-center justify-center">
            <FolderOpen size={15} className="text-[#B45309]" />
          </span>
          <div>
            <div className="text-[15px] font-bold leading-tight">Recursos</div>
            <div className="text-[11px] text-text3">Situación de los grupos, plantillas y enlaces del equipo</div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {TABS.map((t) => {
            const on = tab === t.id;
            return (
              <button key={t.id} onClick={() => selectTab(t.id)}
                      className={`flex items-center gap-1.5 py-1.5 px-3 rounded-[10px] text-[12.5px] font-semibold cursor-pointer transition-colors duration-150 ${on ? 'bg-[#FEF0D7] text-[#B45309]' : 'text-text2 hover:bg-surface2'}`}>
                <t.Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Contenido */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {tab === 'resumen' && <ResumenGrupos />}
        {tab === 'enlaces' && <EnlacesCarpetas />}
        {tab === 'walink' && <GeneradorWaLink />}
        {tab === 'plantillas' && (
          <div className="h-full min-h-0 p-3 max-md:p-0">
            <div className="h-full min-h-0"><PlantillasPage /></div>
          </div>
        )}
      </div>
    </div>
  );
}
