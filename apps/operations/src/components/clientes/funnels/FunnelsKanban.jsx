import { useState, useEffect, useMemo } from 'react';
import { Users, Package, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@korex/db';
import { useApp } from '../../../context/AppContext';
import { initials } from '../../../utils/helpers';

// Los 47 funnels de todos los clientes, por estado.
//
// Es la respuesta a "que sea automatico": las COLUMNAS son los 4 estados que el
// equipo marca a mano (si esta pausado o es viejo no hay forma de calcularlo), y
// el CONTENIDO de cada tarjeta es lo que el sistema ya sabe solo — cuanto le
// falta y que lo frena. Ninguno de los dos numeros es nuevo: estaban en la base y
// no habia pantalla que los mostrara juntos.
//
// UNA sola llamada al motor de pasos (sin argumento -> los 47 x 6 pasos). El motor
// no devuelve ni el cliente ni el tipo ni el estado, asi que eso se cruza contra
// strategyPages, que ya esta entero en memoria (AppContext los trae al arrancar).

const COLS = [
  { k: 'activa',   label: 'Activo',   dot: '#22C55E' },
  { k: 'borrador', label: 'Borrador', dot: '#EAB308' },
  { k: 'pausada',  label: 'Pausado',  dot: '#EF4444' },
  { k: 'antiguo',  label: 'Antiguo',  dot: '#9CA3AF' },
];

const TIPO = {
  reclutamiento: { Icon: Users,   color: '#2E69E0', bg: '#E9F1FF', label: 'Reclutamiento' },
  producto:      { Icon: Package, color: '#15803D', bg: '#E6F7EE', label: 'Producto' },
};

// Las 3 fases que importan, con el escalon ESCRITO. Las escaleras no son iguales
// entre si — asi es en la realidad: el VSL no tiene "grabado" (no hay dato que lo
// diga) y la landing salta de nada a diseñada.
const FASES = [
  { stage: 'vsl',      n: 'VSL',      pasos: { nada: 'Sin guión', guion: 'Guionado', editado: 'Editado' } },
  { stage: 'anuncios', n: 'Anuncios', pasos: { nada: 'Sin copy', guion: 'Copy hecho', grabado: 'Grabados', editado: 'Editados' } },
  { stage: 'landing',  n: 'Landing',  pasos: { nada: 'Sin copy', disenado: 'Diseñada' } },
];
// 3 tonos, no uno por escalon: la palabra es la que manda, el color la refuerza de lejos.
const TONO = {
  nada:     { c: '#9CA3AF', bg: '#F4F5F7', b: '#E7E9ED' },
  guion:    { c: '#B45309', bg: '#FFF7ED', b: '#F6E0B8' },
  grabado:  { c: '#B45309', bg: '#FFF7ED', b: '#F6E0B8' },
  editado:  { c: '#15803D', bg: '#ECFDF5', b: '#C7EBD4' },
  disenado: { c: '#15803D', bg: '#ECFDF5', b: '#C7EBD4' },
};

export default function FunnelsKanban({ onOpenClient }) {
  const { strategyPages, clients } = useApp();
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setLoading(true);
      // Sin argumento = todos los clientes. Requiere funnels_v4_pipeline_global_y_gate.
      const { data, error } = await supabase.rpc('cerebro_pipeline_status');
      if (!vivo) return;
      // supabase-js NO lanza excepcion: devuelve el error como valor.
      if (error) setErr(error.message || 'No pude traer el estado de los funnels');
      else { setErr(null); setRows(data || []); }
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, []);

  const tarjetas = useMemo(() => {
    if (!rows) return [];
    const porFunnel = new Map();
    for (const r of rows) {
      if (!porFunnel.has(r.funnel_id)) porFunnel.set(r.funnel_id, []);
      porFunnel.get(r.funnel_id).push(r);
    }
    const cliById = new Map((clients || []).map(c => [c.id, c]));

    return (strategyPages || []).map(p => {
      const pasos = (porFunnel.get(p.id) || []).slice().sort((a, b) => a.ord - b.ord);
      if (!pasos.length) return null;
      const listos = pasos.filter(s => s.status === 'listo').length;
      const prox = pasos.find(s => s.status === 'pendiente') || null;
      const cli = cliById.get(p.client_id);
      return {
        id: p.id,
        name: p.name,
        tipo: p.tipo || null,
        status: p.status || 'activa',
        clientId: p.client_id,
        cliente: cli?.name || '—',
        color: cli?.color || '#94A3B8',
        pct: Math.round((listos / pasos.length) * 100),
        frena: prox ? `${prox.detail}` : null,
        fases: FASES.map(f => {
          const paso = pasos.find(s => s.stage === f.stage);
          const sub = paso?.substate || 'nada';
          return { n: f.n, v: f.pasos[sub] || sub, tono: TONO[sub] || TONO.nada };
        }),
      };
    }).filter(Boolean);
  }, [rows, strategyPages, clients]);

  if (loading) {
    return <div className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-[#9098A4]"><Loader2 size={15} className="animate-spin" />Trayendo el estado de los funnels…</div>;
  }
  if (err) {
    return (
      <div className="rounded-xl border p-4 text-[12.5px]" style={{ background: '#FEF2F2', borderColor: '#F5C2C2', color: '#B91C1C' }}>
        <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertCircle size={14} />No pude traer el estado de los funnels</div>
        <div className="text-[11.5px] opacity-90">{err}</div>
        <div className="text-[11.5px] mt-1.5 opacity-75">Si dice que la función necesita un argumento, falta aplicar <code className="font-mono">funnels_v4_pipeline_global_y_gate.sql</code>.</div>
      </div>
    );
  }

  const conTipo = (k) => tarjetas.filter(t => t.tipo === k).length;
  const sinTipo = tarjetas.filter(t => !t.tipo).length;

  return (
    <div>
      {/* Leyenda: de que estamos hablando, sin abrir nada */}
      <div className="flex items-center gap-3.5 flex-wrap mb-3.5 py-2 px-3.5 rounded-[10px] border border-[#E7EAF0] bg-white">
        <span className="text-[11px] font-bold text-[#6B7280]">{tarjetas.length} funnels</span>
        <span className="w-px h-3.5 bg-[#E7EAF0]" />
        {Object.entries(TIPO).map(([k, t]) => (
          <span key={k} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
            <span className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-[5px]" style={{ background: t.bg, color: t.color }}><t.Icon size={10} /></span>
            {t.label} <b className="text-[#1A1D26]">{conTipo(k)}</b>
          </span>
        ))}
        {sinTipo > 0 && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#9098A4]"><AlertCircle size={11} />Sin tipo <b>{sinTipo}</b></span>}
        <span className="w-px h-3.5 bg-[#E7EAF0]" />
        {[['Sin empezar', TONO.nada], ['A medias', TONO.guion], ['Hecho', TONO.editado]].map(([lbl, t]) => (
          <span key={lbl} className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-[#6B7280]">
            <span className="w-[11px] h-[11px] rounded-[3px] border" style={{ background: t.bg, borderColor: t.b }} />{lbl}
          </span>
        ))}
        <button onClick={() => window.location.reload()} title="Volver a traer" className="ml-auto inline-flex items-center gap-1 text-[10.5px] font-semibold text-[#AEB4BF] hover:text-[#2E69E0] border-none bg-transparent cursor-pointer"><RefreshCw size={11} />Actualizar</button>
      </div>

      <div className="grid gap-3 items-start" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(215px,1fr))' }}>
        {COLS.map(col => {
          // Dentro de cada columna, lo mas cerca de salir va arriba.
          const list = tarjetas.filter(t => t.status === col.k).sort((a, b) => b.pct - a.pct);
          return (
            <div key={col.k} className="rounded-xl overflow-hidden pb-2" style={{ background: '#F4F5F7' }}>
              <div className="flex items-center gap-[7px] py-2.5 px-3 bg-white border-b border-[#EDF0F5]">
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: col.dot }} />
                <span className="text-[11.5px] font-bold text-[#1A1D26] flex-1 truncate">{col.label}</span>
                <span className="text-[10.5px] font-bold text-[#6B7280] rounded-full py-px px-[7px] shrink-0" style={{ background: '#F0F2F5' }}>{list.length}</span>
              </div>
              <div className="p-2 flex flex-col gap-2">
                {!list.length && <div className="text-[11px] text-[#C3C9D4] italic text-center py-2.5">Ninguno</div>}
                {list.map(t => {
                  const tp = t.tipo ? TIPO[t.tipo] : null;
                  const TipoIcon = tp ? tp.Icon : AlertCircle;
                  return (
                    <div key={t.id} onClick={() => onOpenClient?.(t.clientId)} title={`Abrir ${t.cliente}`}
                      className="bg-white border border-[#E7EAF0] rounded-[9px] py-2.5 px-[11px] cursor-pointer hover:border-[#2E69E0] hover:shadow-md hover:-translate-y-px transition-all">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-[#6B7280] mb-1.5 truncate">
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[7.5px] font-extrabold text-white shrink-0" style={{ background: t.color }}>{initials(t.cliente)}</span>
                        <span className="truncate">{t.cliente}</span>
                      </div>
                      <div className="text-[12.5px] font-bold text-[#1A1D26] leading-[1.35] mb-2">
                        <span title={tp ? `Tipo: ${tp.label}` : 'Sin tipo definido'} className="inline-flex items-center justify-center w-[17px] h-[17px] rounded-[5px] mr-1.5 align-[-3px]" style={tp ? { background: tp.bg, color: tp.color } : { background: '#F0F2F5', color: '#AEB4BF' }}>
                          <TipoIcon size={10} />
                        </span>
                        {t.name}
                      </div>
                      <div className="flex items-center gap-[7px] mb-[7px]">
                        <span className="text-[11px] font-extrabold text-[#1A1D26] min-w-[30px] tabular-nums">{t.pct}%</span>
                        <span className="flex-1 h-[5px] rounded-full overflow-hidden" style={{ background: '#E8EBF0' }}>
                          <span className="block h-full rounded-full" style={{ width: `${t.pct}%`, background: t.pct === 100 ? '#22C55E' : t.color }} />
                        </span>
                      </div>
                      <div className="flex gap-1 mb-[7px]">
                        {t.fases.map(f => (
                          <span key={f.n} title={`${f.n}: ${f.v}`} className="flex-1 min-w-0 flex flex-col items-center gap-px py-1 px-0.5 rounded-md border overflow-hidden" style={{ background: f.tono.bg, borderColor: f.tono.b, color: f.tono.c }}>
                            <span className="text-[8px] font-extrabold uppercase tracking-[0.05em] opacity-70 leading-none">{f.n}</span>
                            <span className="text-[9.5px] font-extrabold leading-tight truncate max-w-full">{f.v}</span>
                          </span>
                        ))}
                      </div>
                      <div className="text-[10.5px] leading-[1.4]" style={{ color: t.frena ? '#6B7280' : '#15803D' }}>
                        {t.frena || 'Todo listo para lanzar'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
