// Carga de imágenes al banco: arrastrar, pegar (Ctrl+V) o elegir del disco.
//
// El nicho es obligatorio antes de subir. Es la decisión que mantiene el banco ordenado
// desde el día uno (y lo que va a permitir que el agente de imágenes encuentre referencias
// del rubro correcto cuando exista).
import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { UploadCloud, X, Loader2, AlertTriangle, Check, Copy, RotateCcw } from 'lucide-react';
import {
  TABLA, MAX_BYTES, esImagen, pesoLegible, sha256Hex, readDimensions,
  subirInspiracion, sinExtension,
} from './inspiraciones';

const input = 'w-full py-2 px-3 text-[13px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#5B7CF5] bg-white';
const BLUE = '#5B7CF5';
let seq = 0;

export default function InspirationUploader({ niches, nichoSugerido, userId, clients, onSubidas }) {
  const [cola, setCola] = useState([]);           // [{ id, file, preview, estado, motivo, checksum, dims, existente }]
  // El nicho arranca en el que está filtrando la galería. El uploader se monta al abrir el
  // panel, así que alcanza con tomarlo una vez.
  const [comun, setComun] = useState({ niche_slug: nichoSugerido || '', notes: '', tags: '', brand: '', source_url: '', client_id: '' });
  const [subiendo, setSubiendo] = useState(false);
  const [progreso, setProgreso] = useState({ hechas: 0, total: 0 });
  const [resumen, setResumen] = useState(null);   // { ok, fallaron:[{nombre,motivo}] }
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef(null);
  const colaRef = useRef(cola);
  useEffect(() => { colaRef.current = cola; });

  // Las previews son object URLs: hay que soltarlas o se acumulan en memoria.
  useEffect(() => () => { colaRef.current.forEach((c) => c.preview && URL.revokeObjectURL(c.preview)); }, []);

  const set = (k, v) => setComun((c) => ({ ...c, [k]: v }));

  const agregar = useCallback(async (lista) => {
    const files = Array.from(lista || []);
    if (!files.length) return;
    setResumen(null);

    const nuevas = [];
    let ignoradas = 0;
    for (const file of files) {
      if (!esImagen(file)) { ignoradas += 1; continue; }
      if (file.size > MAX_BYTES) {
        nuevas.push({ id: `q${++seq}`, file, preview: null, estado: 'error', motivo: `Pesa ${pesoLegible(file.size)} y el máximo son 15 MB` });
        continue;
      }
      nuevas.push({
        id: `q${++seq}`, file,
        preview: URL.createObjectURL(file),
        estado: 'pendiente',
        // Las pegadas con Ctrl+V llegan sin nombre propio ("image.png"): les damos uno.
        titulo: /^image\.[a-z]+$/i.test(file.name || '')
          ? `Pegada ${new Date().toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}`
          : sinExtension(file.name),
      });
    }
    if (ignoradas) setResumen({ ok: 0, fallaron: [], nota: `Se ignoraron ${ignoradas} archivo(s) que no son imagen.` });
    if (!nuevas.length) return;
    setCola((c) => [...c, ...nuevas]);

    // Checksums de a UNO. Con Promise.all, 20 archivos de 15 MB serían 300 MB de buffers
    // vivos a la vez y la pestaña se cae.
    const hashes = [];
    for (const n of nuevas) {
      if (n.estado === 'error') continue;
      const checksum = await sha256Hex(n.file);
      const dims = await readDimensions(n.file);
      if (checksum) hashes.push(checksum);
      setCola((c) => c.map((x) => (x.id === n.id ? { ...x, checksum, dims } : x)));
    }

    // Una sola consulta de duplicados para todo el lote.
    if (hashes.length) {
      const { data } = await supabase.from(TABLA)
        .select('id,title,checksum').in('checksum', hashes).is('deleted_at', null);
      if (data?.length) {
        const porHash = new Map(data.map((d) => [d.checksum, d]));
        setCola((c) => c.map((x) => (x.checksum && porHash.has(x.checksum) && x.estado === 'pendiente'
          ? { ...x, estado: 'duplicada', existente: porHash.get(x.checksum) }
          : x)));
      }
    }
  }, []);

  const quitar = (id) => setCola((c) => {
    const it = c.find((x) => x.id === id);
    if (it?.preview) URL.revokeObjectURL(it.preview);
    return c.filter((x) => x.id !== id);
  });

  const subirIgual = (id) => setCola((c) => c.map((x) => (x.id === id ? { ...x, estado: 'pendiente' } : x)));

  const limpiar = () => {
    cola.forEach((c) => c.preview && URL.revokeObjectURL(c.preview));
    setCola([]); setProgreso({ hechas: 0, total: 0 });
  };

  const aSubir = cola.filter((c) => c.estado === 'pendiente');

  const subir = async () => {
    if (!comun.niche_slug || !aSubir.length || subiendo) return;
    setSubiendo(true); setResumen(null);
    setProgreso({ hechas: 0, total: aSubir.length });

    const meta = {
      niche_slug: comun.niche_slug,
      notes: comun.notes.trim() || null,
      tags: comun.tags.split(',').map((t) => t.trim()).filter(Boolean),
      brand: comun.brand.trim() || null,
      source_url: comun.source_url.trim() || null,
      client_id: comun.client_id || null,
    };

    const subidas = [];
    const fallaron = [];
    for (let i = 0; i < aSubir.length; i += 1) {
      const it = aSubir[i];
      setCola((c) => c.map((x) => (x.id === it.id ? { ...x, estado: 'subiendo' } : x)));
      try {
        const fila = await subirInspiracion({
          file: it.file, userId, checksum: it.checksum, dims: it.dims,
          comun: { ...meta, title: it.titulo },
        });
        subidas.push(fila);
        setCola((c) => c.map((x) => (x.id === it.id ? { ...x, estado: 'ok' } : x)));
      } catch (err) {
        const motivo = err?.message || 'Error desconocido';
        fallaron.push({ nombre: it.file.name, motivo });
        setCola((c) => c.map((x) => (x.id === it.id ? { ...x, estado: 'error', motivo } : x)));
      }
      setProgreso({ hechas: i + 1, total: aSubir.length });
    }

    setSubiendo(false);
    setResumen({ ok: subidas.length, fallaron });
    if (subidas.length) onSubidas(subidas);
    // Las que salieron bien se van de la cola; las que fallaron quedan para reintentar.
    setCola((c) => c.filter((x) => {
      if (x.estado !== 'ok') return true;
      if (x.preview) URL.revokeObjectURL(x.preview);
      return false;
    }));
  };

  const reintentar = () => setCola((c) => c.map((x) => (x.estado === 'error' && x.file.size <= MAX_BYTES ? { ...x, estado: 'pendiente', motivo: null } : x)));

  const onDrop = (e) => {
    e.preventDefault(); setDragging(false);
    agregar(e.dataTransfer?.files);
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items || [];
    const files = [];
    for (const it of items) {
      if (it.kind === 'file') { const f = it.getAsFile(); if (f) files.push(f); }
    }
    if (files.length) { e.preventDefault(); agregar(files); }
  };

  return (
    <div className="grid gap-3" onPaste={onPaste}>
      {/* Zona de arrastre */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={(e) => { if (e.currentTarget.contains(e.relatedTarget)) return; setDragging(false); }}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className="rounded-2xl border-2 border-dashed py-7 px-5 text-center cursor-pointer transition-colors"
        style={{ borderColor: dragging ? BLUE : '#D8DDE6', background: dragging ? '#EEF2FF' : '#FAFBFC' }}>
        <UploadCloud size={26} className="mx-auto mb-2" style={{ color: dragging ? BLUE : '#C3C9D4' }} />
        <div className="text-[13px] font-semibold text-[#4B5563]">Arrastrá las imágenes acá, pegalas con Ctrl+V o hacé clic para elegirlas</div>
        <div className="text-[11.5px] text-[#9CA3AF] mt-1">PNG, JPG, WEBP o GIF · hasta 15 MB cada una</div>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden
          onChange={(e) => { agregar(e.target.files); e.target.value = ''; }} />
      </div>

      {/* Datos que se aplican a toda la tanda */}
      {cola.length > 0 && (
        <div className="grid gap-2 bg-white border border-[#E2E5EB] rounded-xl p-3.5">
          <div className="text-[12.5px] font-bold text-[#1A1D26]">Datos para las {cola.length} imágenes de esta tanda</div>

          <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
            <label className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">Nicho (obligatorio)</span>
              <select className={input} value={comun.niche_slug} onChange={(e) => set('niche_slug', e.target.value)}>
                <option value="">Elegí un nicho…</option>
                {niches.filter((n) => n.active).map((n) => <option key={n.slug} value={n.slug}>{n.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#9CA3AF]">Cliente (opcional)</span>
              <select className={input} value={comun.client_id} onChange={(e) => set('client_id', e.target.value)}>
                <option value="">Ninguno…</option>
                {(clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                  .map((c) => <option key={c.id} value={c.id}>{c.name || c.id}</option>)}
              </select>
            </label>
          </div>

          <textarea className={`${input} resize-y min-h-[60px] leading-relaxed`} value={comun.notes}
            onChange={(e) => set('notes', e.target.value)}
            placeholder="¿Por qué te gustan? El ángulo, el hook, el recurso visual… (esto es lo que va a leer el agente de imágenes)" />

          <div className="grid grid-cols-3 gap-2 max-md:grid-cols-1">
            <input className={input} value={comun.tags} onChange={(e) => set('tags', e.target.value)}
              placeholder="Etiquetas separadas por coma" />
            <input className={input} value={comun.brand} onChange={(e) => set('brand', e.target.value)}
              placeholder="Marca / anunciante" />
            <input className={input} value={comun.source_url} onChange={(e) => set('source_url', e.target.value)}
              placeholder="Link al original" />
          </div>
        </div>
      )}

      {/* La cola */}
      {cola.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
          {cola.map((c) => (
            <div key={c.id} className="relative rounded-xl overflow-hidden border border-[#E2E5EB] bg-white">
              <div className="bg-[#F4F6F9]" style={{ aspectRatio: '4 / 5' }}>
                {c.preview && <img src={c.preview} alt="" className="w-full h-full object-cover" />}
              </div>
              {c.estado !== 'pendiente' && (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 gap-1"
                  style={{ background: 'rgba(12,16,24,.68)' }}>
                  {c.estado === 'subiendo' && <Loader2 size={18} className="animate-spin text-white" />}
                  {c.estado === 'ok' && <Check size={18} className="text-[#7BE7A8]" />}
                  {c.estado === 'duplicada' && <>
                    <Copy size={16} className="text-[#FBBF24]" />
                    <div className="text-[10px] text-white/90 leading-tight">Ya está en el banco{c.existente?.title ? ` como «${c.existente.title}»` : ''}</div>
                    <button onClick={() => subirIgual(c.id)} className="text-[10px] font-bold text-white bg-white/20 border-none rounded px-1.5 py-0.5 cursor-pointer">Subir igual</button>
                  </>}
                  {c.estado === 'error' && <>
                    <AlertTriangle size={16} className="text-[#FCA5A5]" />
                    <div className="text-[10px] text-white/90 leading-tight">{c.motivo}</div>
                  </>}
                </div>
              )}
              {!subiendo && c.estado !== 'ok' && (
                <button onClick={() => quitar(c.id)} title="Sacar de la tanda"
                  className="absolute top-1 right-1 inline-flex items-center justify-center w-6 h-6 rounded-lg border-none cursor-pointer text-white"
                  style={{ background: 'rgba(12,16,24,.62)' }}><X size={12} /></button>
              )}
              <div className="p-1.5 text-[10.5px] text-[#6B7280] truncate" title={c.titulo}>{c.titulo}</div>
            </div>
          ))}
        </div>
      )}

      {/* Barra de acción */}
      {cola.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={subir} disabled={subiendo || !aSubir.length || !comun.niche_slug}
            className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-white text-[12.5px] font-semibold cursor-pointer border-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: BLUE }}>
            {subiendo
              ? <><Loader2 size={14} className="animate-spin" /> Subiendo {progreso.hechas} de {progreso.total}…</>
              : <><UploadCloud size={14} /> Subir {aSubir.length} {aSubir.length === 1 ? 'imagen' : 'imágenes'}</>}
          </button>
          {cola.some((c) => c.estado === 'error' && c.file.size <= MAX_BYTES) && !subiendo && (
            <button onClick={reintentar}
              className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#4B5563]">
              <RotateCcw size={13} /> Reintentar las que fallaron
            </button>
          )}
          {!subiendo && (
            <button onClick={limpiar}
              className="py-2 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#6B7280]">
              Vaciar la tanda
            </button>
          )}
          {!comun.niche_slug && <span className="text-[12px] text-[#CA8A04] font-semibold">Elegí el nicho para poder subir.</span>}
        </div>
      )}

      {resumen && (
        <div className="rounded-xl border p-3 text-[12.5px]"
          style={resumen.fallaron?.length
            ? { borderColor: '#F3C9C9', background: '#FEF2F2', color: '#B91C1C' }
            : { borderColor: '#C7EBD4', background: '#F0FBF4', color: '#15803D' }}>
          {resumen.ok > 0 && <div className="font-semibold">{resumen.ok} {resumen.ok === 1 ? 'imagen subida' : 'imágenes subidas'}.</div>}
          {resumen.nota && <div>{resumen.nota}</div>}
          {resumen.fallaron?.length > 0 && (
            <div className="mt-1">
              <div className="font-semibold">{resumen.fallaron.length} no se pudieron subir:</div>
              <ul className="list-disc pl-4 mt-0.5">
                {resumen.fallaron.map((f, i) => <li key={i}>{f.nombre} — {f.motivo}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
