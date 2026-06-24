import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@korex/db';
import { RefreshCw, X, AlertTriangle, Zap } from 'lucide-react';

// ── Panel "Salud de Automatizaciones" (Administración) ──────────────────────
// Diagrama tipo constelación: Korex en el centro y cada automatización como un
// nodo que late alrededor, agrupado por categoría. El color = estado real (lo
// calcula la función automations_health() en Supabase, cruzando el historial de
// los cron con la frescura de los datos). Se refresca solo cada 5 minutos.

const HEALTH = {
  ok:     { color: '#22C55E', label: 'Funcionando',     soft: 'Al día' },
  warn:   { color: '#F59E0B', label: 'Con alertas',     soft: 'Revisar' },
  error:  { color: '#EF4444', label: 'Con errores',     soft: 'Falla' },
  paused: { color: '#64748B', label: 'Pausada',         soft: 'Apagada' },
  info:   { color: '#38BDF8', label: 'Activa por evento', soft: 'En vivo' },
};

// Orden y acento de color de cada categoría (solo decorativo del rótulo).
const CATEGORY_ORDER = ['Sincronización', 'Recordatorios', 'Informes', 'IA', 'Llamadas', 'Soporte', 'Ventas', 'Contratos', 'Finanzas'];
const CATEGORY_ACCENT = {
  'Sincronización': '#8B5CF6', 'Recordatorios': '#22C55E', 'Informes': '#EC4899',
  'IA': '#38BDF8', 'Llamadas': '#F59E0B', 'Soporte': '#F472B6',
  'Ventas': '#5B7CF5', 'Contratos': '#14B8A6', 'Finanzas': '#0EA5A4',
};
const SOURCE_LABEL = { cron: 'Programada (reloj)', cloud: 'Rutina en la nube (IA)', event: 'Por evento' };

// ── helpers de tiempo ───────────────────────────────────────────────────────
function fmtAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'recién';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'hace instantes';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-AR', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  } catch { return '—'; }
}

// Motivo legible de por qué un nodo no está "ok".
function reasonFor(n) {
  if (n.health === 'paused') return 'Pausada o retirada — no está corriendo.';
  if (n.health === 'error') {
    if (n.source === 'cloud' && n.data_stale) return `Sin datos nuevos desde ${fmtDateTime(n.last_data)} — parece detenida.`;
    if (n.source === 'cron' && Number(n.failed_7d) > 0) return `Falla al ejecutarse (${n.failed_7d} fallos en los últimos 7 días).`;
    return 'Está fallando.';
  }
  if (n.health === 'warn') {
    if (n.data_stale) return 'Corre, pero los datos no se están actualizando.';
    if (Number(n.failed_7d) > 0) return `Tuvo ${n.failed_7d} fallos esta semana.`;
    return 'Necesita una revisión.';
  }
  return null;
}

const polar = (cx, cy, r, deg) => {
  const a = (deg * Math.PI) / 180;
  return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
};

// ── Layout: ubica cada nodo en su sector radial alrededor del centro ─────────
function buildLayout(items) {
  const cx = 550, cy = 372;
  const cats = CATEGORY_ORDER.filter((c) => items.some((i) => i.category === c));
  // categorías que no estén en el orden conocido, al final
  items.forEach((i) => { if (!cats.includes(i.category)) cats.push(i.category); });

  const N = cats.length;
  const nodes = [];
  const labels = [];

  cats.forEach((cat, ci) => {
    const sectorDeg = -90 + ci * (360 / N);            // centro angular del sector
    const members = items.filter((i) => i.category === cat);
    const M = members.length;
    const usable = (360 / N) * 0.74;
    const gap = M > 1 ? Math.min(13, usable / M) : 0;

    let maxR = 0;
    members.forEach((m, j) => {
      const off = (j - (M - 1) / 2) * gap;
      const deg = sectorDeg + off;
      const r = 212 + (j % 2) * 54;                     // escalona el radio
      const [x, y] = polar(cx, cy, r, deg);
      maxR = Math.max(maxR, r);
      const c = Math.cos((deg * Math.PI) / 180);
      const anchor = c > 0.25 ? 'start' : c < -0.25 ? 'end' : 'middle';
      const lx = x + (anchor === 'start' ? 15 : anchor === 'end' ? -15 : 0);
      const ly = y + (Math.sin((deg * Math.PI) / 180) > 0 ? 4 : 0);
      nodes.push({ ...m, x, y, deg, anchor, lx, ly });
    });
    const [labelX, labelY] = polar(cx, cy, maxR + 66, sectorDeg);
    labels.push({ cat, x: labelX, y: labelY, accent: CATEGORY_ACCENT[cat] || '#94A3B8', count: M });
  });

  return { cx, cy, nodes, labels };
}

export default function AutomatizacionesPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [fetchedAt, setFetchedAt] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: e } = await supabase.rpc('automations_health');
    if (e) { setError(e.message); setItems([]); }
    else { setItems(Array.isArray(data) ? data : []); setError(null); }
    setFetchedAt(new Date());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5 * 60 * 1000);          // auto-refresco cada 5 min
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const layout = useMemo(() => (items?.length ? buildLayout(items) : null), [items]);
  const selected = useMemo(() => items?.find((i) => i.id === selectedId) || null, [items, selectedId]);

  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, error: 0, paused: 0, info: 0 };
    (items || []).forEach((i) => { c[i.health] = (c[i.health] || 0) + 1; });
    return c;
  }, [items]);

  const attention = useMemo(
    () => (items || []).filter((i) => ['error', 'warn', 'paused'].includes(i.health)),
    [items],
  );

  if (loading && !items) {
    return <div className="text-gray-400 text-center py-24 text-sm">Cargando automatizaciones…</div>;
  }

  return (
    <div className="space-y-4">
      {/* encabezado */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
            <Zap size={20} className="text-violet-500" /> Automatizaciones
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Todo lo que el sistema hace solo — y si viene corriendo bien. Se actualiza solo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">
            Actualizado {fmtAgo(fetchedAt?.toISOString())}
          </span>
          <button
            onClick={load}
            className="flex items-center gap-1.5 text-[13px] font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* semáforo resumen */}
      <div className="flex flex-wrap gap-2">
        {[
          ['ok', counts.ok], ['error', counts.error], ['warn', counts.warn],
          ['info', counts.info], ['paused', counts.paused],
        ].map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: HEALTH[k].color }} />
            <span className="text-[13px] font-semibold text-gray-700">{v}</span>
            <span className="text-[12px] text-gray-400">{HEALTH[k].label}</span>
          </div>
        ))}
      </div>

      {/* banner de atención */}
      {attention.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
          <div className="flex items-center gap-2 text-amber-800 text-[13px] font-semibold mb-1.5">
            <AlertTriangle size={15} /> {attention.length} necesita{attention.length === 1 ? '' : 'n'} atención
          </div>
          <div className="flex flex-wrap gap-1.5">
            {attention.map((n) => (
              <button
                key={n.id}
                onClick={() => setSelectedId(n.id)}
                className="text-[12px] px-2.5 py-1 rounded-lg bg-white border cursor-pointer hover:shadow-sm transition-shadow"
                style={{ borderColor: HEALTH[n.health].color, color: '#475569' }}
              >
                <span className="w-2 h-2 rounded-full inline-block mr-1.5 align-middle" style={{ background: HEALTH[n.health].color }} />
                {n.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* diagrama constelación */}
      <div className="relative rounded-2xl overflow-hidden border border-violet-900/40"
        style={{ background: 'radial-gradient(ellipse at center, #1E1B3A 0%, #0F0E1F 70%, #0A0913 100%)' }}>
        {error && (
          <div className="absolute top-3 left-3 z-10 text-[12px] text-red-300 bg-red-950/60 px-3 py-1.5 rounded-lg">
            No se pudo leer el estado: {error}
          </div>
        )}

        {layout && (
          <svg viewBox="0 0 1100 760" className="w-full h-auto block select-none" style={{ maxHeight: '74vh' }}>
            <defs>
              <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
                <feGaussianBlur stdDeviation="4" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
              <radialGradient id="core" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#C4B5FD" />
                <stop offset="55%" stopColor="#8B5CF6" />
                <stop offset="100%" stopColor="#5B21B6" />
              </radialGradient>
            </defs>

            {/* órbitas de fondo */}
            {[150, 235, 320].map((r) => (
              <circle key={r} cx={layout.cx} cy={layout.cy} r={r} fill="none" stroke="#ffffff" strokeOpacity="0.05" />
            ))}

            {/* líneas centro → nodo (energía que fluye) */}
            {layout.nodes.map((n) => (
              <line
                key={`l-${n.id}`}
                x1={layout.cx} y1={layout.cy} x2={n.x} y2={n.y}
                stroke={HEALTH[n.health].color}
                strokeOpacity={selectedId && selectedId !== n.id ? 0.08 : 0.5}
                strokeWidth={selectedId === n.id ? 2.4 : 1.3}
                strokeDasharray="3 7"
                className={n.health === 'paused' ? '' : 'auto-flow'}
              />
            ))}

            {/* rótulos de categoría */}
            {layout.labels.map((l) => (
              <text key={l.cat} x={l.x} y={l.y} textAnchor="middle"
                fontSize="12" fontWeight="700" fill={l.accent} fillOpacity="0.9"
                style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                {l.cat}
              </text>
            ))}

            {/* nodos */}
            {layout.nodes.map((n) => {
              const h = HEALTH[n.health];
              const isSel = selectedId === n.id;
              const dim = selectedId && !isSel;
              return (
                <g key={n.id} onClick={() => setSelectedId(isSel ? null : n.id)}
                   style={{ cursor: 'pointer', opacity: dim ? 0.4 : 1, transition: 'opacity .2s' }}>
                  {/* anillo que late */}
                  {n.health !== 'paused' && (
                    <circle cx={n.x} cy={n.y} r={isSel ? 15 : 11} fill={h.color}
                      className="auto-pulse" style={{ transformOrigin: `${n.x}px ${n.y}px` }} />
                  )}
                  {/* halo */}
                  <circle cx={n.x} cy={n.y} r={isSel ? 16 : 12} fill={h.color} fillOpacity="0.18" filter="url(#glow)" />
                  {/* punto */}
                  <circle cx={n.x} cy={n.y} r={isSel ? 9 : 6.5} fill={h.color}
                    stroke="#0F0E1F" strokeWidth="1.5" filter="url(#glow)" />
                  {/* nombre */}
                  <text x={n.lx} y={n.ly} textAnchor={n.anchor} dominantBaseline="middle"
                    fontSize="11" fontWeight={isSel ? 700 : 500}
                    fill="#E2E8F0" fillOpacity={dim ? 0.5 : 0.92}>
                    {n.name}
                  </text>
                </g>
              );
            })}

            {/* núcleo Korex */}
            <circle cx={layout.cx} cy={layout.cy} r="46" fill="url(#core)" filter="url(#glow)"
              className="auto-core" style={{ transformOrigin: `${layout.cx}px ${layout.cy}px` }} />
            <circle cx={layout.cx} cy={layout.cy} r="46" fill="none" stroke="#C4B5FD" strokeOpacity="0.5" strokeWidth="1.5" />
            <text x={layout.cx} y={layout.cy - 3} textAnchor="middle" fontSize="17" fontWeight="800" fill="#fff" style={{ letterSpacing: '0.04em' }}>KOREX</text>
            <text x={layout.cx} y={layout.cy + 13} textAnchor="middle" fontSize="9" fill="#DDD6FE" fillOpacity="0.85" style={{ letterSpacing: '0.12em' }}>OPERACIONES</text>
          </svg>
        )}

        {/* panel de detalle */}
        {selected && (
          <div className="auto-fadein lg:absolute lg:top-4 lg:right-4 lg:w-[300px] m-3 lg:m-0 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 flex items-start justify-between gap-2"
              style={{ background: HEALTH[selected.health].color + '14' }}>
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wide" style={{ color: CATEGORY_ACCENT[selected.category] || '#64748B' }}>
                  {selected.category}
                </div>
                <div className="text-[15px] font-bold text-gray-800 leading-tight">{selected.name}</div>
              </div>
              <button onClick={() => setSelectedId(null)} className="text-gray-400 hover:text-gray-700 cursor-pointer shrink-0">
                <X size={16} />
              </button>
            </div>
            <div className="p-4 space-y-2.5 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                style={{ background: HEALTH[selected.health].color + '1A', color: HEALTH[selected.health].color }}>
                <span className="w-2 h-2 rounded-full" style={{ background: HEALTH[selected.health].color }} />
                {HEALTH[selected.health].label}
              </span>

              <p className="text-gray-600 leading-snug">{selected.description}</p>

              {reasonFor(selected) && (
                <div className="text-[12px] rounded-lg px-2.5 py-2 leading-snug"
                  style={{ background: HEALTH[selected.health].color + '12', color: '#7c2d12' }}>
                  {reasonFor(selected)}
                </div>
              )}

              <dl className="space-y-1.5 pt-1">
                <Row label="Cuándo corre" value={selected.schedule_human} />
                <Row label="Tipo" value={SOURCE_LABEL[selected.source] || selected.source} />
                {selected.source === 'cron' && (
                  <>
                    <Row label="Última corrida" value={fmtAgo(selected.last_run)} />
                    <Row label="Corridas (7 días)" value={`${selected.ok_7d ?? 0} ok · ${selected.failed_7d ?? 0} fallos`} />
                  </>
                )}
                {selected.data_key && (
                  <Row label="Últimos datos" value={`${fmtAgo(selected.last_data)} ${selected.data_stale ? '⚠️' : '✓'}`} />
                )}
              </dl>
            </div>
          </div>
        )}

        {/* leyenda */}
        <div className="absolute bottom-2.5 left-3 flex flex-wrap gap-x-3 gap-y-1">
          {Object.entries(HEALTH).map(([k, v]) => (
            <span key={k} className="flex items-center gap-1.5 text-[10.5px] text-gray-300">
              <span className="w-2 h-2 rounded-full" style={{ background: v.color }} /> {v.label}
            </span>
          ))}
        </div>
      </div>

      {/* lista de detalle (completa y escaneable, también para móvil) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {CATEGORY_ORDER.filter((c) => (items || []).some((i) => i.category === c)).map((cat) => (
          <div key={cat} className="bg-white border border-gray-200 rounded-xl p-3">
            <div className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: CATEGORY_ACCENT[cat] || '#64748B' }}>
              {cat}
            </div>
            <div className="space-y-1">
              {(items || []).filter((i) => i.category === cat).map((n) => (
                <button key={n.id} onClick={() => setSelectedId(n.id)}
                  className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: HEALTH[n.health].color }} />
                  <span className="text-[13px] text-gray-700 truncate flex-1">{n.name}</span>
                  <span className="text-[11px] text-gray-400 shrink-0">{n.schedule_human}</span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-400">{label}</dt>
      <dd className="text-gray-700 font-medium text-right">{value}</dd>
    </div>
  );
}
