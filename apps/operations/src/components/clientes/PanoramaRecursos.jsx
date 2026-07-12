import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { Check, X, Loader2, Search, Layers, Filter } from 'lucide-react';

// Panorama "qué tenemos / qué falta" por cliente (sub-pestaña de Clientes).
// Lee el RPC clients_resumen(): estrategias, funnels (+dominio) y recursos
// (branding/logo, colores, imágenes, testimonios). Foco en lo que FALTA.

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

export default function PanoramaRecursos() {
  const [rows, setRows] = useState(null);
  const [q, setQ] = useState('');
  const [soloFaltantes, setSoloFaltantes] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.rpc('clients_resumen');
        if (alive) setRows(Array.isArray(data) ? data : []);
      } catch { if (alive) setRows([]); }
    })();
    return () => { alive = false; };
  }, []);

  const falta = (r) => !r.tiene_logo || r.imagenes_files === 0 || r.testimonios_files === 0 || r.n_sin_dominio > 0;

  const filtered = useMemo(() => {
    let list = rows || [];
    const term = q.trim().toLowerCase();
    if (term) list = list.filter(r => (r.client_name || '').toLowerCase().includes(term) || (r.company || '').toLowerCase().includes(term));
    if (soloFaltantes) list = list.filter(falta);
    return list;
  }, [rows, q, soloFaltantes]);

  if (rows === null) {
    return <div className="flex items-center gap-2 text-[13px] text-gray-500 py-10 justify-center"><Loader2 size={16} className="animate-spin" />Cargando panorama…</div>;
  }

  const th = 'text-left text-[10.5px] font-bold uppercase tracking-[0.05em] text-[#9098A4] py-2 px-3 whitespace-nowrap';
  const td = 'py-2.5 px-3 align-middle border-t border-[#F1F3F7]';

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
        <span className="text-[12px] text-[#9098A4] ml-auto">{filtered.length} clientes</span>
      </div>

      {/* Tabla */}
      <div className="border border-[#E7EAF0] rounded-xl overflow-x-auto bg-white">
        <table className="w-full border-collapse min-w-[960px]">
          <thead>
            <tr className="bg-[#F8FAFD]">
              <th className={th}>Cliente</th>
              <th className={th}>Estrategias</th>
              <th className={th}>Funnels</th>
              <th className={th}>Dominio</th>
              <th className={th}>Logo</th>
              <th className={th}>Colores</th>
              <th className={th}>Imágenes</th>
              <th className={th}>Testimonios</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.client_id} className="hover:bg-[#FBFCFE]">
                <td className={td}>
                  <div className="text-[13px] font-semibold text-[#1A1D26] leading-tight">{r.client_name}</div>
                  {r.company && <div className="text-[11px] text-[#9098A4] leading-tight">{r.company}</div>}
                </td>
                <td className={td}>
                  {r.n_estrategias === 0
                    ? <span className="text-[11px] text-[#C2C7D0]">—</span>
                    : <div className="flex flex-wrap items-center gap-y-1">
                        {(r.estrategias || []).map((s, i) => (
                          <span key={i} className="inline-flex items-center text-[11.5px] text-[#3F4653] mr-2">
                            <TipoBadge tipo={s.tipo} />{s.name}
                          </span>
                        ))}
                      </div>}
                </td>
                <td className={td}>
                  {r.n_funnels === 0
                    ? <span className="text-[11px] text-[#C2C7D0]">—</span>
                    : <div className="flex flex-col gap-1">
                        {(r.funnels || []).map((f, i) => (
                          <span key={i} className="text-[11.5px] text-[#3F4653] leading-[18px] h-[18px] truncate max-w-[220px]" title={f.name}>{f.name}</span>
                        ))}
                      </div>}
                </td>
                <td className={td}>
                  {r.n_funnels === 0
                    ? <span className="text-[11px] text-[#C2C7D0]">—</span>
                    : <div className="flex flex-col gap-1">
                        {(r.funnels || []).map((f, i) => (
                          f.dominio
                            ? <a key={i} href={/^https?:\/\//i.test(f.dominio) ? f.dominio : `https://${f.dominio}`} target="_blank" rel="noopener" className="text-[11.5px] text-[#15803D] font-medium leading-[18px] h-[18px] truncate max-w-[240px] hover:underline" title={f.dominio}>{cleanDomain(f.dominio)}</a>
                            : <span key={i} className="inline-flex items-center gap-1 text-[10.5px] font-bold text-[#DC2626] leading-[18px] h-[18px]"><X size={11} strokeWidth={3} />Falta</span>
                        ))}
                      </div>}
                </td>
                <td className={td}><Have ok={r.tiene_logo} /></td>
                <td className={td}><Have ok={r.tiene_colores} /></td>
                <td className={td}><Have ok={r.imagenes_files > 0} count={r.imagenes_files} /></td>
                <td className={td}><Have ok={r.testimonios_files > 0} count={r.testimonios_files} /></td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="text-center text-[12.5px] text-[#9098A4] py-8">Sin clientes que mostrar.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3 mt-3 text-[11px] text-[#9098A4] flex-wrap">
        <span className="inline-flex items-center gap-1"><Check size={12} className="text-[#15803D]" strokeWidth={3} />Está</span>
        <span className="inline-flex items-center gap-1"><X size={12} className="text-[#DC2626]" strokeWidth={3} />Falta</span>
        <span className="inline-flex items-center gap-1"><Layers size={12} />Cada funnel está alineado con su dominio; el foco es ver qué falta de cada cliente.</span>
      </div>
    </div>
  );
}
