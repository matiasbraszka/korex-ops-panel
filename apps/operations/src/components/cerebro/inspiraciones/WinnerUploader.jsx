// Carga de un ANUNCIO GANADOR: un solo creativo (imagen o video) con su ficha completa —
// copy, por qué ganó, métricas y el período en que corrió con esas métricas.
//
// Va de a uno a propósito: las métricas son de ESE anuncio, no de una tanda. El copy (o la
// transcripción del video) es lo que después lee el agente de Anuncios como referencia de oro.
import { useState, useRef, useCallback, useEffect } from 'react';
import { Trophy, UploadCloud, X, Loader2, Film } from 'lucide-react';
import {
  esCreativo, esVideo, maxDe, pesoLegible, sha256Hex, readDimensions,
  subirInspiracion, sinExtension,
} from './inspiraciones';

const input = 'w-full py-2 px-3 text-[13px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#5B7CF5] bg-white';
const label = 'text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]';
const GOLD = '#C79A2E';

// Las métricas que Matías carga para decir "este funcionó". Cada una con su unidad y ayuda.
const METRICAS = [
  { k: 'cpl', label: 'CPL', suf: 'US$', ph: '3.20', hint: 'Costo por lead / registro' },
  { k: 'hook_rate', label: 'Hook rate', suf: '%', ph: '32', hint: 'Vieron los primeros 3s' },
  { k: 'retencion_seg', label: 'Retención prom.', suf: 'seg', ph: '18', hint: 'Tiempo promedio visto' },
  { k: 'ctr', label: 'CTR', suf: '%', ph: '1.8', hint: 'Clics sobre impresiones' },
  { k: 'frecuencia', label: 'Frecuencia', suf: '', ph: '1.4', hint: 'Veces que lo vio cada persona' },
  { k: 'cpm', label: 'CPM', suf: 'US$', ph: '9.50', hint: 'Costo por mil impresiones' },
];

export default function WinnerUploader({ niches, nichoSugerido, userId, clients, onSubida, onCancelar }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  const [f, setF] = useState({
    niche_slug: nichoSugerido || '', client_id: '', title: '',
    ad_copy: '', notes: '', activo_desde: '', activo_hasta: '',
  });
  const [met, setMet] = useState({});
  const set = (k, v) => setF((c) => ({ ...c, [k]: v }));
  const setMetric = (k, v) => setMet((c) => ({ ...c, [k]: v }));

  useEffect(() => () => { preview && URL.revokeObjectURL(preview); }, [preview]);

  const tomar = useCallback((lista) => {
    const arch = Array.from(lista || [])[0];
    if (!arch) return;
    setError(null);
    if (!esCreativo(arch)) { setError('Tiene que ser una imagen o un video (mp4, mov, webm).'); return; }
    if (arch.size > maxDe(arch)) {
      setError(`Pesa ${pesoLegible(arch.size)} y el máximo es ${esVideo(arch) ? '200 MB para video' : '15 MB para imagen'}.`);
      return;
    }
    if (preview) URL.revokeObjectURL(preview);
    setFile(arch);
    setPreview(URL.createObjectURL(arch));
    if (!f.title) set('title', sinExtension(arch.name));
  }, [preview, f.title]);

  const onDrop = (e) => { e.preventDefault(); setDragging(false); tomar(e.dataTransfer?.files); };
  const onPaste = (e) => {
    const arch = Array.from(e.clipboardData?.items || []).find((it) => it.kind === 'file')?.getAsFile();
    if (arch) { e.preventDefault(); tomar([arch]); }
  };

  const limpiarMetricas = () => {
    // Solo las métricas cargadas, como números. Vacías fuera.
    const out = {};
    for (const { k } of METRICAS) {
      const v = String(met[k] ?? '').trim().replace(',', '.');
      if (v !== '' && Number.isFinite(Number(v))) out[k] = Number(v);
    }
    return out;
  };

  const guardar = async () => {
    if (!file || !f.niche_slug || subiendo) return;
    if (f.activo_desde && f.activo_hasta && f.activo_hasta < f.activo_desde) {
      setError('La fecha de fin es anterior a la de inicio.'); return;
    }
    setSubiendo(true); setError(null);
    try {
      const checksum = await sha256Hex(file);
      const dims = await readDimensions(file); // devuelve nulls en video, no rompe
      const fila = await subirInspiracion({
        file, userId, checksum, dims,
        comun: {
          niche_slug: f.niche_slug,
          client_id: f.client_id || null,
          title: f.title || sinExtension(file.name),
          ad_copy: f.ad_copy.trim() || null,
          notes: f.notes.trim() || null,
          activo_desde: f.activo_desde || null,
          activo_hasta: f.activo_hasta || null,
          es_ganador: true,
          metrics: limpiarMetricas(),
          tags: [],
        },
      });
      onSubida(fila);
    } catch (err) {
      setError(err?.message || 'No se pudo guardar el ganador.');
      setSubiendo(false);
    }
  };

  const video = file && esVideo(file);

  return (
    <div className="grid gap-3 bg-white border rounded-2xl p-4" style={{ borderColor: '#EAD9A8' }} onPaste={onPaste}>
      <div className="flex items-center gap-2">
        <Trophy size={16} style={{ color: GOLD }} />
        <div className="text-[13.5px] font-bold text-[#1A1D26]">Cargar un anuncio ganador</div>
        <button onClick={onCancelar} className="ml-auto text-[#9CA3AF] hover:text-[#4B5563] bg-transparent border-none cursor-pointer p-1"><X size={16} /></button>
      </div>

      <div className="grid grid-cols-[200px_1fr] gap-4 max-md:grid-cols-1">
        {/* Creativo */}
        <div>
          {!file ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragging(false); }}
              onDrop={onDrop}
              onClick={() => fileRef.current?.click()}
              className="rounded-xl border-2 border-dashed py-8 px-3 text-center cursor-pointer transition-colors h-full flex flex-col items-center justify-center"
              style={{ borderColor: dragging ? GOLD : '#D8DDE6', background: dragging ? '#FBF6E8' : '#FAFBFC', minHeight: 220 }}>
              <UploadCloud size={24} className="mx-auto mb-2" style={{ color: dragging ? GOLD : '#C3C9D4' }} />
              <div className="text-[12px] font-semibold text-[#4B5563]">Arrastrá, pegá o hacé clic</div>
              <div className="text-[11px] text-[#9CA3AF] mt-1">Imagen (15 MB) o video (200 MB)</div>
              <input ref={fileRef} type="file" hidden
                accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
                onChange={(e) => { tomar(e.target.files); e.target.value = ''; }} />
            </div>
          ) : (
            <div className="relative rounded-xl overflow-hidden border border-[#E2E5EB] bg-[#F4F6F9]">
              {video
                ? <video src={preview} controls className="w-full block" style={{ maxHeight: 260 }} />
                : <img src={preview} alt="" className="w-full block object-contain" style={{ maxHeight: 260 }} />}
              <button onClick={() => { URL.revokeObjectURL(preview); setFile(null); setPreview(null); }}
                className="absolute top-1.5 right-1.5 inline-flex items-center justify-center w-7 h-7 rounded-lg border-none cursor-pointer text-white"
                style={{ background: 'rgba(12,16,24,.62)' }}><X size={13} /></button>
              <div className="px-2 py-1 text-[10.5px] text-[#6B7280] flex items-center gap-1 truncate">
                {video && <Film size={11} />}{file.name} · {pesoLegible(file.size)}
              </div>
            </div>
          )}
        </div>

        {/* Ficha */}
        <div className="grid gap-2.5">
          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <label className="grid gap-1">
              <span className={label}>Nicho (obligatorio)</span>
              <select className={input} value={f.niche_slug} onChange={(e) => set('niche_slug', e.target.value)}>
                <option value="">Elegí un nicho…</option>
                {niches.filter((n) => n.active).map((n) => <option key={n.slug} value={n.slug}>{n.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className={label}>Cliente (opcional)</span>
              <select className={input} value={f.client_id} onChange={(e) => set('client_id', e.target.value)}>
                <option value="">Ninguno…</option>
                {(clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
            </label>
          </div>

          <label className="grid gap-1">
            <span className={label}>Título</span>
            <input className={input} value={f.title} onChange={(e) => set('title', e.target.value)}
              placeholder="Cómo lo reconocés (ej: «Mamá networker · ángulo hijos primero»)" />
          </label>

          <label className="grid gap-1">
            <span className={label}>El copy del anuncio {video && <span className="text-[#C79A2E] normal-case">· en video lo transcribimos después</span>}</span>
            <textarea className={`${input} resize-y min-h-[80px] leading-relaxed`} value={f.ad_copy}
              onChange={(e) => set('ad_copy', e.target.value)}
              placeholder="El texto del anuncio, tal cual. Es lo que el agente de Anuncios lee y clona (nunca copia literal)." />
          </label>

          <label className="grid gap-1">
            <span className={label}>Por qué ganó</span>
            <textarea className={`${input} resize-y min-h-[52px] leading-relaxed`} value={f.notes}
              onChange={(e) => set('notes', e.target.value)}
              placeholder="El ángulo, el hook, el recurso… qué lo hizo funcionar." />
          </label>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid gap-2 bg-[#FCFAF3] border border-[#EAD9A8] rounded-xl p-3">
        <div className="text-[12px] font-bold text-[#7A5B12]">Métricas (cargá las que tengas)</div>
        <div className="grid grid-cols-3 gap-2 max-md:grid-cols-2">
          {METRICAS.map((m) => (
            <label key={m.k} className="grid gap-1" title={m.hint}>
              <span className="text-[10.5px] font-bold text-[#8A6D2A]">{m.label}{m.suf ? ` (${m.suf})` : ''}</span>
              <input className={`${input} py-1.5`} inputMode="decimal" value={met[m.k] ?? ''}
                onChange={(e) => setMetric(m.k, e.target.value)} placeholder={m.ph} />
            </label>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1 mt-1">
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-[#8A6D2A]">Activo desde</span>
            <input type="date" className={`${input} py-1.5`} value={f.activo_desde} onChange={(e) => set('activo_desde', e.target.value)} />
          </label>
          <label className="grid gap-1">
            <span className="text-[10.5px] font-bold text-[#8A6D2A]">Activo hasta</span>
            <input type="date" className={`${input} py-1.5`} value={f.activo_hasta} onChange={(e) => set('activo_hasta', e.target.value)} />
          </label>
        </div>
      </div>

      {error && <div className="text-[12.5px] text-[#B91C1C] bg-[#FEF2F2] border border-[#F3C9C9] rounded-lg px-3 py-2">{error}</div>}

      <div className="flex items-center gap-2">
        <button onClick={guardar} disabled={subiendo || !file || !f.niche_slug}
          className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-white text-[12.5px] font-semibold cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: GOLD }}>
          {subiendo ? <><Loader2 size={14} className="animate-spin" /> Guardando…</> : <><Trophy size={14} /> Guardar ganador</>}
        </button>
        {!f.niche_slug && file && <span className="text-[12px] text-[#CA8A04] font-semibold">Elegí el nicho para guardar.</span>}
      </div>
    </div>
  );
}
