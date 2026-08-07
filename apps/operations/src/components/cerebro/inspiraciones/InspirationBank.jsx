// BANCO DE INSPIRACIONES — galería de anuncios en imagen.
//
// Es una biblioteca, no un corpus: HOY NO ESTÁ CONECTADA A NINGÚN AGENTE. Vive en la
// configuración de agentes porque a futuro va a alimentar un agente que genere creativos,
// y por eso cada imagen ya guarda nicho, notas ("por qué me gusta"), etiquetas y medidas.
// Nada de esto se inyecta en ningún prompt todavía.
//
// Las imágenes viven en un bucket privado (marketing-inspiraciones): las miniaturas se
// sirven con URL firmada, no con URL pública. Y el borrado es lógico — el archivo nunca
// se borra. Ver migrations/marketing_inspiraciones_v1.sql.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@korex/db';
import { useCan } from '@korex/auth';
import { useApp } from '../../../context/AppContext';
import { Images, Loader2, Search, Star, Trash2, Plus, X, Trophy } from 'lucide-react';
import { BUCKET, TABLA, TABLA_NICHOS, POR_PAGINA } from './inspiraciones';
import { useSignedUrls } from './useSignedUrls';
import NicheChips from './NicheChips';
import InspirationCard from './InspirationCard';
import InspirationUploader from './InspirationUploader';
import WinnerUploader from './WinnerUploader';
import ImageLightbox from './ImageLightbox';

const BLUE = '#5B7CF5';
const SELECT = '*, marketing_niches(slug,label,color)';

export default function InspirationBank() {
  const canWrite = useCan('marketing', 'write');
  const { currentUser, clients } = useApp();

  const [niches, setNiches] = useState([]);
  const [counts, setCounts] = useState({});
  const [totalGlobal, setTotalGlobal] = useState(0);

  const [nicho, setNicho] = useState(null);
  const [q, setQ] = useState('');
  const [soloDestacadas, setSoloDestacadas] = useState(false);
  const [soloGanadores, setSoloGanadores] = useState(false);
  const [verBorradas, setVerBorradas] = useState(false);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const pagina = useRef(0);
  const [cargando, setCargando] = useState(true);
  const [subiendoAbierto, setSubiendoAbierto] = useState(false);
  const [ganadorAbierto, setGanadorAbierto] = useState(false);
  const [lightbox, setLightbox] = useState(null);   // índice dentro de rows

  // ── Catálogo de nichos + conteos ───────────────────────────────────────────
  const cargarNichos = useCallback(async () => {
    const { data } = await supabase.from(TABLA_NICHOS).select('*').order('sort').order('label');
    setNiches(data || []);
  }, []);

  // Traemos solo la columna del nicho de todas las vivas y contamos acá: es un payload
  // mínimo y evita una consulta por chip.
  const cargarConteos = useCallback(async () => {
    const { data } = await supabase.from(TABLA).select('niche_slug').is('deleted_at', null).limit(20000);
    const acc = {};
    (data || []).forEach((r) => { if (r.niche_slug) acc[r.niche_slug] = (acc[r.niche_slug] || 0) + 1; });
    setCounts(acc);
    setTotalGlobal((data || []).length);
  }, []);

  useEffect(() => { (async () => { await cargarNichos(); await cargarConteos(); })(); }, [cargarNichos, cargarConteos]);

  // ── Galería ────────────────────────────────────────────────────────────────
  const cargarPagina = useCallback(async (pag, acumular) => {
    setCargando(true);
    let query = supabase.from(TABLA).select(SELECT, { count: 'exact' });
    query = verBorradas ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null);
    if (nicho) query = query.eq('niche_slug', nicho);
    if (soloDestacadas) query = query.eq('starred', true);
    if (soloGanadores) query = query.eq('es_ganador', true);
    if (q.trim()) query = query.or(`title.ilike.%${q.trim()}%,notes.ilike.%${q.trim()}%,brand.ilike.%${q.trim()}%,ad_copy.ilike.%${q.trim()}%`);

    const { data, count } = await query
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(pag * POR_PAGINA, pag * POR_PAGINA + POR_PAGINA - 1);

    setRows((prev) => (acumular ? [...prev, ...(data || [])] : (data || [])));
    setTotal(count || 0);
    setCargando(false);
  }, [nicho, q, soloDestacadas, soloGanadores, verBorradas]);

  // Al cambiar cualquier filtro se vuelve a la primera página. La página va en un ref
  // porque no se dibuja en ningún lado: solo la necesita "Ver más".
  useEffect(() => {
    pagina.current = 0;
    const t = setTimeout(() => cargarPagina(0, false), q ? 280 : 0);
    return () => clearTimeout(t);
  }, [cargarPagina, q]);

  const cargarMas = () => {
    pagina.current += 1;
    cargarPagina(pagina.current, true);
  };

  const paths = useMemo(() => rows.map((r) => r.storage_path), [rows]);
  const urls = useSignedUrls(BUCKET, paths);

  // ── Acciones sobre una imagen ──────────────────────────────────────────────
  const parchear = (id, patch) => setRows((c) => c.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const destacar = async (item) => {
    parchear(item.id, { starred: !item.starred });
    const { error } = await supabase.from(TABLA).update({ starred: !item.starred }).eq('id', item.id);
    if (error) { parchear(item.id, { starred: item.starred }); window.alert('No se pudo guardar: ' + error.message); }
  };

  // Baja LÓGICA. El archivo se conserva: el DELETE está revocado en la base a propósito.
  const borrar = async (item) => {
    if (!window.confirm(`¿Sacar «${item.title}» de la galería?\n\nSe deja de ver acá, pero el archivo se conserva en el servidor y se puede restaurar.`)) return;
    const { error } = await supabase.from(TABLA)
      .update({ deleted_at: new Date().toISOString(), deleted_by: currentUser?.id || null })
      .eq('id', item.id);
    if (error) { window.alert('No se pudo borrar: ' + error.message); return; }
    setRows((c) => c.filter((r) => r.id !== item.id));
    setTotal((t) => Math.max(0, t - 1));
    cargarConteos();
  };

  const restaurar = async (item) => {
    const { error } = await supabase.from(TABLA).update({ deleted_at: null, deleted_by: null }).eq('id', item.id);
    if (error) { window.alert('No se pudo restaurar: ' + error.message); return; }
    setRows((c) => c.filter((r) => r.id !== item.id));
    cargarConteos();
  };

  const onSubidas = (nuevas) => {
    setSubiendoAbierto(false);
    cargarConteos();
    // Si el filtro activo no es el nicho de la tanda, saltamos a ese nicho para que Matías
    // vea lo que acaba de subir en vez de una galería aparentemente sin cambios.
    const destino = nuevas[0]?.niche_slug;
    if (!verBorradas && destino && nicho && nicho !== destino) { setNicho(destino); return; }
    pagina.current = 0;
    cargarPagina(0, false);
  };

  const hayFiltro = !!nicho || !!q.trim() || soloDestacadas || soloGanadores;
  const nichoDeFiltro = niches.find((n) => n.slug === nicho);

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[#1A1D26] flex items-center gap-2">
            <Images size={17} style={{ color: BLUE }} /> Banco de inspiraciones
          </div>
          <p className="text-[12.5px] text-[#6B7280] mt-1 max-w-[660px]">
            Anuncios de referencia, ordenados por nicho. Los que marcás como <b>Ganador</b> (con su copy y
            sus métricas) los <b>lee el agente de Anuncios</b> como referencia de oro de ese nicho. Las
            inspiraciones sueltas quedan de biblioteca para el futuro agente de creativos. Todo se ve en
            grande, se descarga y queda guardado (borrar acá no borra el archivo).
          </p>
        </div>
        {canWrite && (
          <div className="flex items-center gap-2">
            <button onClick={() => { setGanadorAbierto((s) => !s); setSubiendoAbierto(false); }}
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
              style={ganadorAbierto
                ? { background: '#fff', borderColor: '#EAD9A8', color: '#8A6D2A' }
                : { background: '#C79A2E', borderColor: '#C79A2E', color: '#fff' }}>
              {ganadorAbierto ? <><X size={14} /> Cerrar</> : <><Trophy size={14} /> Cargar ganador</>}
            </button>
            <button onClick={() => { setSubiendoAbierto((s) => !s); setGanadorAbierto(false); }}
              className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
              style={subiendoAbierto
                ? { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }
                : { background: '#fff', borderColor: '#E2E5EB', color: '#4B5563' }}>
              {subiendoAbierto ? <><X size={14} /> Cerrar</> : <><Plus size={14} /> Cargar inspiraciones</>}
            </button>
          </div>
        )}
      </div>

      {ganadorAbierto && canWrite && (
        <WinnerUploader
          niches={niches}
          nichoSugerido={nicho}
          userId={currentUser?.id}
          clients={clients}
          onSubida={(fila) => { setGanadorAbierto(false); onSubidas([fila]); }}
          onCancelar={() => setGanadorAbierto(false)}
        />
      )}

      {subiendoAbierto && canWrite && (
        <InspirationUploader
          niches={niches}
          nichoSugerido={nicho}
          userId={currentUser?.id}
          clients={clients}
          onSubidas={onSubidas}
        />
      )}

      <NicheChips
        niches={niches} value={nicho} counts={counts} total={totalGlobal}
        canWrite={canWrite} onChange={setNicho} onCreated={(n) => setNiches((c) => [...c, n])}
      />

      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por título, nota o marca…"
            className="py-1.5 pl-8 pr-3 text-[12.5px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#5B7CF5] bg-white w-[260px] max-md:w-full" />
        </div>
        <button onClick={() => setSoloGanadores((s) => !s)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
          style={soloGanadores
            ? { background: '#FCFAF3', borderColor: '#C79A2E', color: '#7A5B12' }
            : { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }}>
          <Trophy size={13} fill={soloGanadores ? '#C79A2E' : 'none'} /> Ganadores
        </button>
        <button onClick={() => setSoloDestacadas((s) => !s)}
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
          style={soloDestacadas
            ? { background: '#FEF9E7', borderColor: '#F5B301', color: '#946200' }
            : { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }}>
          <Star size={13} fill={soloDestacadas ? '#F5B301' : 'none'} /> Destacadas
        </button>
        {canWrite && (
          <button onClick={() => setVerBorradas((s) => !s)}
            className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12.5px] font-semibold cursor-pointer border"
            style={verBorradas
              ? { background: '#FEF2F2', borderColor: '#F3C9C9', color: '#B91C1C' }
              : { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }}>
            <Trash2 size={13} /> Borradas
          </button>
        )}
        <span className="text-[12px] text-[#9CA3AF]">
          {cargando && rows.length === 0 ? '' : `${total} ${total === 1 ? 'imagen' : 'imágenes'}${nichoDeFiltro ? ` en ${nichoDeFiltro.label}` : ''}`}
        </span>
      </div>

      {cargando && rows.length === 0 ? (
        <div className="text-[#9CA3AF] text-center py-14 text-[13px]">
          <Loader2 size={16} className="animate-spin inline mr-2" />Cargando…
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 px-5 border border-dashed border-[#D8DDE6] rounded-2xl">
          <Images size={26} className="text-[#C3C9D4] mx-auto mb-2" />
          <div className="text-[13px] font-semibold text-[#4B5563]">
            {verBorradas ? 'No hay imágenes borradas' : hayFiltro ? 'No hay imágenes con estos filtros' : 'El banco todavía está vacío'}
          </div>
          <div className="text-[12px] text-[#9CA3AF] mt-1">
            {verBorradas ? 'Todo lo que cargaste sigue en la galería.'
              : hayFiltro ? 'Probá sacando algún filtro.'
              : canWrite ? 'Cargá los primeros anuncios con “Cargar imágenes”.' : 'Todavía no cargó nadie.'}
          </div>
        </div>
      ) : (
        <>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))' }}>
            {rows.map((r, i) => (
              <InspirationCard key={r.id} item={r} url={urls[r.storage_path]} canWrite={canWrite}
                onOpen={() => setLightbox(i)} onStar={destacar} onDelete={borrar} onRestore={restaurar} />
            ))}
          </div>
          {rows.length < total && (
            <div className="text-center">
              <button onClick={cargarMas} disabled={cargando}
                className="inline-flex items-center gap-1.5 py-2 px-4 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#4B5563] disabled:opacity-50">
                {cargando ? <><Loader2 size={13} className="animate-spin" /> Cargando…</> : `Ver más (${total - rows.length} restantes)`}
              </button>
            </div>
          )}
        </>
      )}

      {lightbox !== null && rows[lightbox] && (
        <ImageLightbox items={rows} index={lightbox} urls={urls}
          onIndex={setLightbox} onClose={() => setLightbox(null)} />
      )}
    </div>
  );
}
