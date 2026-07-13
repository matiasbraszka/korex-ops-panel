import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { Check, X, Loader2, Search, Layers, Filter, Link2 } from 'lucide-react';

// Panorama "qué tenemos / qué falta" por cliente Y por ESTRATEGIA (sub-pestaña de
// Clientes). Cada cliente se divide en tantas filas como estrategias tenga, para
// segmentar bien sus funnels y el estado del DEL. Lee clients_panorama():
// por estrategia → funnels (+dominio) y DEL vinculado; los recursos (logo/colores/
// imágenes/testimonios) son del CLIENTE (compartidos por todas las estrategias) y van
// una sola vez en la celda del cliente. Foco en lo que FALTA.

// Celda de presencia: verde con ✓ si está, roja con ✗ si falta. Muestra conteo opcional.
function Have({ ok, count }) {
  return (
    <span
      className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-bold"
      style={ok ? { background: '#E6F7EE', color: '#15803D' } : { background: '#FDECEC', color: '#DC2626' }}
    >
      {ok ? <Check size={12} strokeWidth={3} /> : <X size={12} strokeWidth={3} />}
      {ok && count != null ? count : (ok ? '' : 'Falta')}
    </span>
  );
}

// Deja solo el "nombre del dominio": saca protocolo, ruta y ?ref=… (ej.
// "https://viajeros.metodokorex.com?ref=17728" → "viajeros.metodokorex.com").
const cleanDomain = (d) => (d || '').replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];

function TipoBadge({ tipo }) {
  if (!tipo) return null;
  const prod = /producto/i.test(tipo);
  return (
    <span className="inline-flex items-center py-0.5 px-1.5 rounded-full text-[9.5px] font-bold uppercase tracking-[0.03em] mr-1"
      style={prod ? { background: '#E6F7EE', color: '#15803D' } : { background: '#E9F1FF', color: '#2E69E0' }}>
      {prod ? 'Prod' : 'Recl'}
    </span>
  );
}

// Fila compacta de un recurso (etiqueta + ✓/✗) dentro de la celda del cliente.
function ResChip({ label, ok, count }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10.5px]">
      <span className="w-[70px] shrink-0 text-[#9098A4] font-medium">{label}</span>
      <Have ok={ok} count={count} />
    </span>
  );
}

// Celda del cliente: ocupa (rowSpan) todas las filas de sus estrategias e incluye los
// RECURSOS del cliente (branding/colores/imágenes/testimonios), que son compartidos por
// todas las estrategias — por eso van una sola vez acá, no por estrategia.
function ClienteCell({ r, rowSpan }) {
  return (
    <td rowSpan={rowSpan} className="py-2.5 px-3 align-top border-r border-[#EEF1F6] bg-[#FCFDFE]"
      style={{ borderTop: '2px solid #E7EAF0', minWidth: 190 }}>
      <div className="text-[13px] font-semibold text-[#1A1D26] leading-tight">{r.client_name}</div>
      {r.company && <div className="text-[11px] text-[#9098A4] leading-tight">{r.company}</div>}
      {r.n_estrategias > 1 && (
        <div className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-[#8A93A3]">
          <Layers size={10} />{r.n_estrategias} estrategias
        </div>
      )}
      <div className="mt-2.5 pt-2 border-t border-[#EEF1F6] flex flex-col gap-1">
        <div className="text-[9px] font-bold uppercase tracking-[0.06em] text-[#B4BAC6] mb-0.5">Recursos</div>
        <ResChip label="Logo" ok={r.tiene_logo} />
        <ResChip label="Colores" ok={r.tiene_colores} />
        <ResChip label="Imágenes" ok={r.imagenes_files > 0} count={r.imagenes_files} />
        <ResChip label="Testimonios" ok={r.testimonios_files > 0} count={r.testimonios_files} />
      </div>
    </td>
  );
}

export default function PanoramaRecursos() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [soloFaltantes, setSoloFaltantes] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('clients_panorama');
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, []);

  // Falta a nivel ESTRATEGIA: DEL sin vincular o algún funnel sin dominio.
  const estrFalta = (e) => !e.del_ok || e.n_sin_dominio > 0;
  // Falta a nivel CLIENTE: recursos compartidos incompletos (logo/imágenes/testimonios),
  // sin estrategias, o alguna estrategia con faltantes.
  const clientFalta = (r) => !r.tiene_logo || r.imagenes_files === 0 || r.testimonios_files === 0
    || (r.estrategias || []).length === 0 || (r.estrategias || []).some(estrFalta);

  const filtered = useMemo(() => {
    let list = rows || [];
    const term = q.trim().toLowerCase();
    if (term) list = list.filter(r => (r.client_name || '').toLowerCase().includes(term) || (r.company || '').toLowerCase().includes(term));
    if (soloFaltantes) list = list.filter(clientFalta);
    return list;
  }, [rows, q, soloFaltantes]);

  const totalEstr = useMemo(() => (filtered || []).reduce((a, r) => a + Math.max(1, (r.estrategias || []).length), 0), [filtered]);

  if (rows === null) {
    return <div className="flex items-center gap-2 text-[13px] text-gray-500 py-10 justify-center"><Loader2 size={16} className="animate-spin" />Cargando panorama…</div>;
  }

  const th = 'text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#9098A4] py-2 px-3 whitespace-nowrap';
  // Borde superior según sea la 1ª fila del cliente (fuerte) o una continuación (tenue).
  const cellStyle = (first) => ({ borderTop: first ? '2px solid #E7EAF0' : '1px solid #F4F6F9' });
  const tdBase = 'py-2.5 px-3 align-top';

  return (
    <div>
      {/* Controles */}
      <div className="flex items-center gap-2 flex-wrap mb-3">
        <div className="relative flex-1 min-w-[200px] max-w-[320px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#AEB4BF]" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar cliente…"
            className="w-full text-[13px] py-2 pl-8 pr-3 rounded-lg border border-[#E2E5EB] outline-none focus:border-blue-400 bg-white" />
        </div>
        <button onClick={() => setSoloFaltantes(s => !s)}
          className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg text-[12px] font-semibold border cursor-pointer"
          style={soloFaltantes ? { background: '#FDECEC', color: '#DC2626', borderColor: '#F7C6C6' } : { background: '#fff', color: '#4B5563', borderColor: '#E2E5EB' }}>
          <Filter size={13} />Solo con faltantes
        </button>
        <span className="text-[12px] text-[#9098A4] ml-auto">{filtered.length} clientes · {totalEstr} estrategias</span>
      </div>

      {/* Tabla */}
      <div className="border border-[#E7EAF0] rounded-xl overflow-x-auto bg-white">
        <table className="w-full border-collapse min-w-[820px]">
          <thead>
            <tr className="bg-[#F8FAFD]">
              <th className={th}>Cliente · Recursos</th>
              <th className={th}>Estrategia</th>
              <th className={th}>DEL</th>
              <th className={th}>Funnels</th>
              <th className={th}>Dominio</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const estr = r.estrategias || [];
              // Cliente sin estrategias → una sola fila con placeholder.
              if (estr.length === 0) {
                return (
                  <tr key={r.client_id} className="hover:bg-[#FBFCFE]">
                    <ClienteCell r={r} rowSpan={1} />
                    <td className={tdBase} style={cellStyle(true)} colSpan={4}>
                      <span className="text-[11.5px] text-[#C2C7D0]">— sin estrategia creada —</span>
                    </td>
                  </tr>
                );
              }
              return estr.map((e, i) => {
                const st = cellStyle(i === 0);
                return (
                  <tr key={r.client_id + ':' + (e.id || i)} className="hover:bg-[#FBFCFE]">
                    {i === 0 && <ClienteCell r={r} rowSpan={estr.length} />}
                    {/* Estrategia */}
                    <td className={tdBase} style={st}>
                      <span className="inline-flex items-center text-[11.5px] text-[#3F4653] leading-tight">
                        <TipoBadge tipo={e.tipo} />{e.name}
                      </span>
                    </td>
                    {/* DEL vinculado */}
                    <td className={tdBase} style={st}>
                      {e.del_ok
                        ? <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-bold" style={{ background: '#E6F7EE', color: '#15803D' }}><Link2 size={11} strokeWidth={3} />Vinculado</span>
                        : <span className="inline-flex items-center gap-1 py-0.5 px-2 rounded-full text-[11px] font-bold" style={{ background: '#FDECEC', color: '#DC2626' }}><X size={11} strokeWidth={3} />Falta</span>}
                    </td>
                    {/* Funnels */}
                    <td className={tdBase} style={st}>
                      {e.n_funnels === 0
                        ? <span className="text-[11px] text-[#C2C7D0]">—</span>
                        : <div className="flex flex-col gap-1">
                            {(e.funnels || []).map((f, j) => (
                              <span key={j} className="text-[11.5px] text-[#3F4653] leading-[18px] h-[18px] truncate max-w-[220px]" title={f.name}>{f.name}</span>
                            ))}
                          </div>}
                    </td>
                    {/* Dominio (alineado con cada funnel) */}
                    <td className={tdBase} style={st}>
                      {e.n_funnels === 0
                        ? <span className="text-[11px] text-[#C2C7D0]">—</span>
                        : <div className="flex flex-col gap-1">
                            {(e.funnels || []).map((f, j) => (
                              f.dominio
                                ? <a key={j} href={/^https?:\/\//i.test(f.dominio) ? f.dominio : `https://${f.dominio}`} target="_blank" rel="noopener" className="text-[11.5px] text-[#15803D] font-medium leading-[18px] h-[18px] truncate max-w-[240px] hover:underline" title={f.dominio}>{cleanDomain(f.dominio)}</a>
                                : <span key={j} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#DC2626] leading-[18px] h-[18px]"><X size={11} strokeWidth={3} />Falta</span>
                            ))}
                          </div>}
                    </td>
                  </tr>
                );
              });
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="text-center text-[12.5px] text-[#9098A4] py-8">Sin clientes que mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[11px] text-[#9098A4] flex-wrap">
        <span className="inline-flex items-center gap-1"><Check size={12} className="text-[#15803D]" strokeWidth={3} />Está</span>
        <span className="inline-flex items-center gap-1"><X size={12} className="text-[#DC2626]" strokeWidth={3} />Falta</span>
        <span className="inline-flex items-center gap-1"><Link2 size={12} className="text-[#15803D]" />DEL vinculado = el documento está detectado y leído por el cerebro para esa estrategia.</span>
        <span className="inline-flex items-center gap-1"><Layers size={12} />Los recursos (logo/colores/imágenes/testimonios) son del cliente y se comparten entre sus estrategias; cada estrategia tiene su propio DEL y funnels.</span>
      </div>
    </div>
  );
}
