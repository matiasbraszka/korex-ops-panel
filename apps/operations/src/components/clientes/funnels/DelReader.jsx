import { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink } from 'lucide-react';
import { sbFetch } from '@korex/db';

// El DEL, leible adentro del panel. Sin editor todavia — a proposito.
//
// Es el paso que mas valor tiene por lo que cuesta: prueba si el equipo quiere
// estar aca ANTES de gastar semanas en un editor colaborativo. Si el DEL se lee
// bien en el panel, el editor se justifica. Si no, nos ahorramos el editor.
//
// El texto sale de del_sections (548 secciones importadas de los 36 DEL por el
// marcador "===== Titulo =====" que genera Apps Script). NO se toca el Doc: esto
// es solo lectura. El Doc sigue siendo la verdad hasta el cutover.

// El color de cada seccion es el MISMO que el del paso en el riel: naranja
// avatares · verde VSL · azul anuncios · violeta paginas. Riel, tarjeta de tarea
// y documento hablan igual.
const SEC = {
  estrategia:     { c: '#0891B2', bg: '#ECFEFF', label: 'Estrategia' },
  avatares:       { c: '#F97316', bg: '#FFF7ED', label: 'Avatares' },
  vsl:            { c: '#16A34A', bg: '#ECFDF5', label: 'VSL' },
  anuncios:       { c: '#5B7CF5', bg: '#EEF2FF', label: 'Anuncios' },
  pg_prelanding:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Pre-landing' },
  pg_landing:     { c: '#8B5CF6', bg: '#F5F3FF', label: 'Landing' },
  pg_formulario:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Formulario' },
  pg_thankyou:    { c: '#8B5CF6', bg: '#F5F3FF', label: 'Thank you' },
  pg_testimonios: { c: '#8B5CF6', bg: '#F5F3FF', label: 'Testimonios' },
  mensajes:       { c: '#0D9488', bg: '#F0FDFA', label: 'Mensajes' },
  pipeline_viejo: { c: '#9CA3AF', bg: '#F4F5F7', label: 'Estado (viejo)' },
  otros:          { c: '#9CA3AF', bg: '#F4F5F7', label: 'Otros' },
};
const secOf = (k) => SEC[k] || SEC.otros;

export default function DelReader({ strategyId, docUrl }) {
  const [secs, setSecs] = useState(null);
  const [err, setErr] = useState(null);
  const [activa, setActiva] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // El DEL cuelga de la CARPETA del Drive (strategy_id), no del funnel: por eso
        // dos funnels de la misma carpeta ven el mismo DEL. Es asi hoy y esta bien —
        // el DEL es el maestro de la campaña. Se resuelve (o no) en el cutover.
        const rows = await sbFetch(
          `del_sections?select=id,ord,title,kind,text,char_count&strategy_id=eq.${strategyId}&order=ord.asc`,
          { headers: { Prefer: 'return=representation' } },
        );
        if (!vivo) return;
        setSecs(Array.isArray(rows) ? rows : []);
        if (rows?.length) setActiva(rows[0].id);
      } catch (e) {
        if (vivo) setErr(String(e?.message || e));
      }
    })();
    return () => { vivo = false; };
  }, [strategyId]);

  // Indice: agrupa el conteo por tipo para la barra de resumen de arriba.
  const resumen = useMemo(() => {
    if (!secs) return [];
    const m = new Map();
    secs.forEach(s => m.set(s.kind, (m.get(s.kind) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [secs]);

  const irA = (id) => {
    setActiva(id);
    const el = document.getElementById('sec-' + id);
    if (el && scrollRef.current) {
      scrollRef.current.scrollTo({ top: el.offsetTop - 16, behavior: 'smooth' });
    }
  };

  if (err) {
    return (
      <div className="p-6">
        <div className="rounded-xl border p-4 text-[13px]" style={{ background: '#FEF2F2', borderColor: '#F5C2C2', color: '#B91C1C' }}>
          <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertCircle size={14} />No pude traer el DEL</div>
          <div className="text-[12px] opacity-90">{err}</div>
        </div>
      </div>
    );
  }
  if (!secs) {
    return <div className="flex items-center justify-center gap-2 h-full text-[13px] text-[#9098A4]"><Loader2 size={15} className="animate-spin" />Abriendo el DEL…</div>;
  }
  if (!secs.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 h-full text-center px-6">
        <FileText size={22} className="text-[#C3C9D4]" />
        <div className="text-[13px] font-semibold text-[#4B5563]">Este funnel todavía no tiene DEL importado</div>
        <div className="text-[11.5px] text-[#9098A4] max-w-[420px]">Puede que la carpeta no tenga un DEL, o que el documento exista con un nombre que el sistema no reconoce. Sincronizá la pestaña Carpetas y volvé a probar.</div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: '#FBFCFD' }}>
      <div className="grid gap-5 items-start mx-auto max-w-[1180px] py-5 px-6" style={{ gridTemplateColumns: 'minmax(0,215px) minmax(0,1fr)' }}>

        {/* El indice, FIJO al scrollear — como el de Google Docs. Anda gracias a que
            index.css usa overflow-x: clip y no hidden (hidden crea contenedor de
            scroll y rompe position:sticky en los descendientes). */}
        <nav className="sticky top-0 flex flex-col gap-0.5 p-2 rounded-xl border border-[#E7EAF0] bg-white max-h-[calc(100vh-140px)] overflow-y-auto" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>
          <div className="text-[9.5px] font-extrabold tracking-[0.1em] uppercase text-[#AEB4BF] px-3 pt-1.5 pb-2">
            {secs.length} secciones
          </div>
          {secs.map(s => {
            const sc = secOf(s.kind);
            const on = activa === s.id;
            return (
              <button key={s.id} onClick={() => irA(s.id)}
                className="flex items-center gap-2.5 py-2 px-3 rounded-[9px] text-left border-none cursor-pointer text-[12px] font-semibold transition-colors"
                style={{ background: on ? sc.bg : 'transparent', color: on ? sc.c : '#6B7280' }}>
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: sc.c, opacity: on ? 1 : .45 }} />
                <span className="truncate flex-1 min-w-0">{s.title}</span>
              </button>
            );
          })}
        </nav>

        <div className="min-w-0 flex flex-col gap-3">
          {/* De donde salio esto: sin esta linea el equipo no sabe si lee el Doc o una copia. */}
          <div className="flex items-center gap-2.5 flex-wrap py-2.5 px-3.5 rounded-[10px] border border-[#E7EAF0] bg-white">
            <span className="text-[11px] text-[#9098A4]">Copia de lectura · el documento sigue viviendo en Drive</span>
            {docUrl && (
              <a href={docUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2E69E0] hover:underline">
                <ExternalLink size={11} />Abrir el Doc original
              </a>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            {resumen.map(([k, n]) => {
              const sc = secOf(k);
              return (
                <span key={k} className="inline-flex items-center gap-1.5 py-[3px] px-2 rounded-md text-[10.5px] font-bold" style={{ background: sc.bg, color: sc.c }}>
                  {sc.label}<span className="opacity-60">{n}</span>
                </span>
              );
            })}
          </div>

          {secs.map(s => {
            const sc = secOf(s.kind);
            return (
              <section key={s.id} id={'sec-' + s.id} className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden" style={{ scrollMarginTop: 16 }}>
                <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]" style={{ borderLeft: `4px solid ${sc.c}` }}>
                  <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase shrink-0" style={{ color: sc.c }}>{sc.label}</span>
                  <span className="text-[15px] font-bold text-[#1A1D26] tracking-[-.01em] flex-1 min-w-0 truncate">{s.title}</span>
                  <span className="text-[10.5px] text-[#C3C9D4] tabular-nums shrink-0">{s.char_count.toLocaleString('es-AR')}</span>
                </div>
                {/* pre-wrap: el texto viene plano del Doc, con sus saltos de linea.
                    max-w en ch para que la lectura no se haga una linea larguisima. */}
                <div className="py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] whitespace-pre-wrap break-words" style={{ maxWidth: '78ch' }}>
                  {s.text.trim() || <span className="italic text-[#C3C9D4]">Vacía</span>}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
