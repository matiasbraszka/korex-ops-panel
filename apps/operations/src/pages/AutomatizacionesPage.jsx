import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@korex/db';
import { RefreshCw, Check, X, AlertTriangle, Zap } from 'lucide-react';

// ── Panel "Automatizaciones" (Administración) ───────────────────────────────
// Tablero estilo Miro: cada automatización es una tarjeta que dice para qué es,
// qué hace, a qué hora, DÓNDE se ejecuta (tu PC / Claude / Supabase / externo),
// cuándo corrió por última vez y cuándo corrió bien por última vez. El estado lo
// calcula automations_health() en Supabase (historial de cron + frescura de datos).

const HEALTH = {
  ok:     { color: '#16A34A', label: 'Funcionando' },
  warn:   { color: '#F59E0B', label: 'Con alertas' },
  error:  { color: '#EF4444', label: 'Con errores' },
  paused: { color: '#64748B', label: 'Pausada' },
  info:   { color: '#38BDF8', label: 'Activa' },
};

// Dónde corre cada una — lo más importante a entender de un vistazo.
const RUNTIME = {
  local:    { label: 'Tu computadora', sub: 'tiene que estar prendida', color: '#F97316', icon: '💻' },
  claude:   { label: 'Claude (nube)',  sub: 'rutina de IA, siempre activa', color: '#8B5CF6', icon: '✨' },
  supabase: { label: 'Supabase',       sub: 'servidor en la nube, siempre activo', color: '#10B981', icon: '⚙️' },
  external: { label: 'Servicio externo', sub: 'se dispara cuando el servicio avisa', color: '#0EA5A4', icon: '🔌' },
};

const CATEGORY_ORDER = ['Sincronización', 'Recordatorios', 'Informes', 'IA', 'Llamadas', 'Soporte', 'Ventas', 'Contratos', 'Finanzas'];
const CATEGORY_ICON = {
  'Sincronización': '🔄', 'Recordatorios': '⏰', 'Informes': '📊', 'IA': '✨', 'Llamadas': '📞',
  'Soporte': '💬', 'Ventas': '💰', 'Contratos': '📝', 'Finanzas': '🏦', 'Otros': '📦',
};
const HEALTH_RANK = { error: 0, paused: 1, warn: 2, info: 3, ok: 4 };

function fmtAgo(iso) {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 0) return 'recién';
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} día${d === 1 ? '' : 's'}`;
}

export default function AutomatizacionesPage() {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchedAt, setFetchedAt] = useState(null);
  const [groupBy, setGroupBy] = useState('category');   // 'category' | 'runtime'
  const [onlyProblems, setOnlyProblems] = useState(false);

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
    const t = setInterval(load, 5 * 60 * 1000);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  const counts = useMemo(() => {
    const c = { ok: 0, warn: 0, error: 0, paused: 0, info: 0 };
    (items || []).forEach((i) => { c[i.health] = (c[i.health] || 0) + 1; });
    return c;
  }, [items]);

  const attention = useMemo(
    () => (items || []).filter((i) => ['error', 'warn', 'paused'].includes(i.health)),
    [items],
  );

  // Agrupa en columnas (tablero) según el modo elegido.
  const columns = useMemo(() => {
    if (!items) return [];
    let list = items;
    if (onlyProblems) list = list.filter((i) => ['error', 'warn', 'paused'].includes(i.health));

    const byKey = {};
    list.forEach((i) => {
      const key = groupBy === 'runtime' ? i.runtime : i.category;
      (byKey[key] = byKey[key] || []).push(i);
    });
    const order = groupBy === 'runtime' ? ['local', 'claude', 'supabase', 'external'] : CATEGORY_ORDER;
    const keys = [...order.filter((k) => byKey[k]), ...Object.keys(byKey).filter((k) => !order.includes(k))];
    return keys.map((key) => ({
      key,
      title: groupBy === 'runtime' ? (RUNTIME[key]?.label || key) : key,
      icon: groupBy === 'runtime' ? (RUNTIME[key]?.icon || '📦') : (CATEGORY_ICON[key] || '📦'),
      accent: groupBy === 'runtime' ? (RUNTIME[key]?.color || '#64748B') : '#8B5CF6',
      items: byKey[key].slice().sort((a, b) => (HEALTH_RANK[a.health] - HEALTH_RANK[b.health]) || a.name.localeCompare(b.name)),
    }));
  }, [items, groupBy, onlyProblems]);

  if (loading && !items) {
    return <div className="text-gray-400 text-center py-24 text-sm">Cargando automatizaciones…</div>;
  }

  return (
    <div className="space-y-4">
      {/* encabezado */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[20px] font-bold text-gray-800 flex items-center gap-2">
            <Zap size={19} className="text-violet-500" /> Automatizaciones
          </h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Todo lo que el sistema hace solo: qué hace, cuándo, dónde corre y si viene bien. Se actualiza solo.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-gray-400">Actualizado {fmtAgo(fetchedAt?.toISOString())}</span>
          <button onClick={load}
            className="flex items-center gap-1.5 text-[13px] font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Actualizar
          </button>
        </div>
      </div>

      {/* semáforo */}
      <div className="flex flex-wrap items-center gap-2">
        {[['ok', counts.ok], ['error', counts.error], ['warn', counts.warn], ['info', counts.info], ['paused', counts.paused]].map(([k, v]) => (
          <div key={k} className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-2.5 py-1">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: HEALTH[k].color }} />
            <span className="text-[13px] font-semibold text-gray-700">{v}</span>
            <span className="text-[12px] text-gray-400">{HEALTH[k].label}</span>
          </div>
        ))}
        {attention.length > 0 && (
          <span className="flex items-center gap-1.5 text-[12px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1">
            <AlertTriangle size={13} /> {attention.length} necesita{attention.length === 1 ? '' : 'n'} atención
          </span>
        )}
      </div>

      {/* controles */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
          {[['category', 'Por categoría'], ['runtime', 'Por dónde corre']].map(([k, label]) => (
            <button key={k} onClick={() => setGroupBy(k)}
              className={`text-[12.5px] font-medium px-3 py-1 rounded-md transition-colors cursor-pointer ${groupBy === k ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
              {label}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-[12.5px] text-gray-600 cursor-pointer select-none">
          <input type="checkbox" checked={onlyProblems} onChange={(e) => setOnlyProblems(e.target.checked)} className="accent-violet-600" />
          Solo los que necesitan atención
        </label>
        {/* leyenda de dónde corre */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 ml-auto">
          {Object.entries(RUNTIME).map(([k, r]) => (
            <span key={k} className="flex items-center gap-1 text-[11px] text-gray-500">
              <span>{r.icon}</span> {r.label}
            </span>
          ))}
        </div>
      </div>

      {error && (
        <div className="text-[12px] text-red-600 bg-red-50 border border-red-200 px-3 py-2 rounded-lg">
          No se pudo leer el estado: {error}
        </div>
      )}

      {/* tablero */}
      <div className="rounded-2xl border border-gray-200 p-3 sm:p-4"
        style={{ background: '#F8FAFC', backgroundImage: 'radial-gradient(#CBD5E1 1px, transparent 1px)', backgroundSize: '22px 22px' }}>
        <div className="flex gap-3 overflow-x-auto pb-1 items-start">
          {columns.map((col) => (
            <div key={col.key} className="shrink-0 w-[300px]">
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className="text-[15px]">{col.icon}</span>
                <span className="text-[13px] font-bold text-gray-700">{col.title}</span>
                <span className="text-[11px] text-gray-400 bg-white border border-gray-200 rounded-full px-1.5">{col.items.length}</span>
                {groupBy === 'runtime' && RUNTIME[col.key]?.sub && (
                  <span className="text-[10.5px] text-gray-400 italic truncate">· {RUNTIME[col.key].sub}</span>
                )}
              </div>
              <div className="space-y-2.5">
                {col.items.map((n) => <Card key={n.id} n={n} />)}
              </div>
            </div>
          ))}
          {columns.length === 0 && (
            <div className="text-[13px] text-gray-400 py-10 px-2">Nada que mostrar con este filtro. 🎉</div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Tarjeta (sticky tipo Miro) ──────────────────────────────────────────────
function Card({ n }) {
  const h = HEALTH[n.health];
  const r = RUNTIME[n.runtime] || RUNTIME.supabase;

  return (
    <div className="bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow border border-gray-100 overflow-hidden"
      style={{ borderLeft: `4px solid ${h.color}` }}>
      <div className="p-3 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="text-[13.5px] font-bold text-gray-800 leading-tight">{n.name}</div>
          <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10.5px] font-semibold"
            style={{ background: h.color + '1A', color: h.color }}>
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: h.color }} /> {h.label}
          </span>
        </div>

        <p className="text-[12px] text-gray-500 leading-snug">{n.description}</p>

        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 text-[11px] text-gray-600 bg-gray-100 rounded-md px-1.5 py-0.5">
            ⏰ {n.schedule_human}
          </span>
          <span className="inline-flex items-center gap-1 text-[11px] font-medium rounded-md px-1.5 py-0.5"
            style={{ background: r.color + '15', color: r.color }}>
            {r.icon} {r.label}
          </span>
        </div>

        <div className="pt-2 border-t border-gray-100 space-y-1">
          <Footer n={n} />
        </div>
      </div>
    </div>
  );
}

function Footer({ n }) {
  if (n.source === 'cron') {
    const failed = n.last_status === 'failed';
    return (
      <>
        <FRow label="Última corrida" value={fmtAgo(n.last_run)} ok={!failed} show />
        <FRow label="Última vez OK" value={fmtAgo(n.last_ok)} ok={!!n.last_ok} show={!!n.last_ok || failed} muted />
        {Number(n.failed_7d) > 0 && (
          <div className="text-[11px] text-red-500">{n.failed_7d} fallos en los últimos 7 días</div>
        )}
      </>
    );
  }
  if (n.data_key) {
    return <FRow label="Última vez que trajo datos" value={fmtAgo(n.last_data)} ok={!n.data_stale} show />;
  }
  return (
    <div className="text-[11px] text-gray-400 italic">
      {n.runtime === 'external' ? 'Corre cuando llega el evento (no se registra acá).' : 'Rutina en la nube (no medible desde el panel).'}
    </div>
  );
}

function FRow({ label, value, ok, show, muted }) {
  if (!show) return null;
  return (
    <div className="flex items-center justify-between gap-2 text-[11.5px]">
      <span className={muted ? 'text-gray-400' : 'text-gray-500'}>{label}</span>
      <span className="flex items-center gap-1 font-medium" style={{ color: ok ? '#16A34A' : '#EF4444' }}>
        {ok ? <Check size={12} /> : <X size={12} />} <span className="text-gray-700">{value}</span>
      </span>
    </div>
  );
}
