import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { ChevronDown, ChevronUp, ChevronRight, FlaskConical, ArrowLeft, ExternalLink } from 'lucide-react';

const GREEN = '#22C55E';
const DARK = '#15803D';

const RANGES = [
  { key: 'all', label: 'Todo' },
  { key: '90d', label: '90 días' },
  { key: '30d', label: '30 días' },
  { key: '7d', label: '7 días' },
  { key: 'today', label: 'Hoy' },
];

const fmtTime = (sec) => {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
};
const fmt = (n) => (n ?? 0).toLocaleString('es-AR');
const cleanName = (n) => (n || '').replace(/\.(mp4|mov|m4v)$/i, '').replace(/_?vsl/i, '').trim() || (n || '');
// Color por % (verde bien / ámbar medio / rojo mal) — para que los fallos salten.
const pctColor = (v) => (v == null ? '#9AA5B1' : v >= 50 ? GREEN : v >= 25 ? '#D97706' : '#DC2626');

// Detecta los N mayores quiebres de retención y los ubica en el punto MÁS EMPINADO
// de cada caída (donde la línea baja), no al inicio. Usa pendiente centrada.
function topDrops(ret, n = 3) {
  const data = ret?.viewers?.length ? ret.viewers : ret?.watchers;
  if (!Array.isArray(data) || data.length < 8) return [];
  const len = data.length, dur = ret.duration || len, base = data[0] || Math.max(...data) || 1;
  const h = Math.max(1, Math.round(len * 0.02)); // medio-ventana ~2% (la caída se mide a ambos lados)
  // Pendiente de bajada centrada en cada punto: cuánto se cae entre i-h e i+h.
  const cand = [];
  for (let i = h; i < len - h; i++) cand.push({ i, drop: data[i - h] - data[i + h] });
  cand.sort((a, b) => b.drop - a.drop);
  const minGap = Math.max(2 * h, Math.round(len * 0.06));
  const picked = [];
  for (const c of cand) {
    if (c.drop <= 0) break;
    if (picked.every((p) => Math.abs(p.i - c.i) >= minGap)) {
      picked.push(c);
      if (picked.length >= n) break;
    }
  }
  return picked
    .map((c) => ({ idx: c.i, sec: Math.round((c.i / (len - 1)) * dur), lost: Math.round(c.drop), pct: Math.round((c.drop / base) * 100) }))
    .sort((a, b) => a.idx - b.idx);
}
// Frase de la transcripción en un segundo dado (cuando exista la transcripción).
function transcriptAt(transcript, sec) {
  if (!Array.isArray(transcript) || !transcript.length) return null;
  const seg = transcript.find((s) => sec >= s.start && sec <= s.end) ||
    transcript.find((s) => Math.abs((s.start ?? 0) - sec) <= 4);
  return seg?.text?.trim() || null;
}

// Gráfico grande interactivo: eje de tiempo (mm:ss) + personas reales + hover + puntos rojos de caída.
function RetentionChart({ ret, drops = [] }) {
  const [hover, setHover] = useState(null);
  const data = ret?.viewers?.length ? ret.viewers : ret?.watchers;
  if (!Array.isArray(data) || data.length < 2) return <div className="text-text3 text-[12px] py-6 text-center">Sin reproducciones en este rango → no hay curva de retención.</div>;
  const dur = ret.duration || data.length;
  const n = data.length, maxV = Math.max(...data, 1), base = data[0] || maxV;
  const W = 900, H = 220, padL = 36, padR = 8, padT = 12, padB = 24;
  const x = (i) => padL + (i / (n - 1)) * (W - padL - padR);
  const y = (v) => padT + (1 - v / maxV) * (H - padT - padB);
  const line = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(n - 1).toFixed(1)},${H - padB} L${x(0).toFixed(1)},${H - padB} Z`;
  const onMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (W / rect.width);
    setHover(Math.max(0, Math.min(n - 1, Math.round(((px - padL) / (W - padL - padR)) * (n - 1)))));
  };
  return (
    <div className="relative w-full">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ cursor: 'crosshair' }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        {[0, 0.5, 1].map((f) => { const v = Math.round(maxV * f), yy = y(v); return <g key={f}><line x1={padL} y1={yy} x2={W - padR} y2={yy} stroke="#F0F2F5" /><text x={2} y={yy + 3} fontSize="10" fill="#9AA5B1">{v}</text></g>; })}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => { const i = Math.round(f * (n - 1)); return <g key={f}><line x1={x(i)} y1={padT} x2={x(i)} y2={H - padB} stroke="#F7F8FA" /><text x={x(i)} y={H - 7} fontSize="10" fill="#9AA5B1" textAnchor="middle">{fmtTime((i / (n - 1)) * dur)}</text></g>; })}
        <path d={area} fill={GREEN} opacity={0.1} />
        <path d={line} fill="none" stroke={GREEN} strokeWidth={2} />
        {drops.map((d, k) => (
          <g key={k}>
            <circle cx={x(d.idx)} cy={y(data[d.idx])} r={5.5} fill="#DC2626" stroke="#fff" strokeWidth={2} />
            <text x={x(d.idx)} y={y(data[d.idx]) - 9} fontSize="10" fontWeight="700" fill="#DC2626" textAnchor="middle">{fmtTime(d.sec)}</text>
          </g>
        ))}
        {hover != null && (<g><line x1={x(hover)} y1={padT} x2={x(hover)} y2={H - padB} stroke={DARK} strokeWidth={1} strokeDasharray="3 3" /><circle cx={x(hover)} cy={y(data[hover])} r={4} fill={DARK} /></g>)}
      </svg>
      {hover != null && (
        <div className="absolute -top-1 bg-[#15803D] text-white text-[12px] font-semibold rounded px-2 py-1 pointer-events-none whitespace-nowrap" style={{ left: `${(x(hover) / W) * 100}%`, transform: 'translateX(-50%)' }}>
          {fmtTime((hover / (n - 1)) * dur)} · {data[hover]} personas · {Math.round((data[hover] / base) * 100)}%
        </div>
      )}
      <div className="text-[11px] text-text3 mt-1.5">Horizontal = minuto:segundo del video · vertical = personas mirando. Pasá el mouse para ver el segundo exacto donde se caen.</div>
    </div>
  );
}

function MetricCard({ label, value, sub, color, hint }) {
  return (
    <div className="bg-white border border-border rounded-xl py-4 px-5">
      <div className="text-[11px] text-text3 font-medium flex items-center gap-1" title={hint}>{label}{hint && <span className="text-text3/60 cursor-help">ⓘ</span>}</div>
      <div className="text-[30px] font-extrabold my-0.5 tracking-tight" style={{ color: color || '#1A1A2E' }}>{value}</div>
      {sub && <div className="text-[11px] text-text3">{sub}</div>}
    </div>
  );
}

export default function VslPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [range, setRange] = useState('all');
  const [selected, setSelected] = useState('all'); // 'all' = tabla comparativa | voomly_id = detalle
  const [sort, setSort] = useState({ key: 'engagement', dir: 'desc' });

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from('vsl_voomly').select('*').eq('kind', 'VSL').order('total_plays', { ascending: false });
      if (!active) return;
      if (error) setErr(error.message); else setRows(data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const lastSync = useMemo(() => {
    const ts = rows.map((r) => r.synced_at).filter(Boolean).sort().pop();
    return ts ? new Date(ts) : null;
  }, [rows]);

  // Métricas del rango seleccionado (fallback all-time si el VSL no tiene rangos).
  const metricsFor = (r) => {
    const fr = r.ranges && r.ranges[range];
    const base = fr || {
      total_plays: r.total_plays, uniq_plays: r.uniq_plays, total_views: r.total_views, uniq_views: r.uniq_views,
      play_rate: r.play_rate, engagement: r.engagement, completion: r.retention?.points?.p100 ?? null, retention: r.retention || null,
    };
    return { ...base, _row: r };
  };

  const all = useMemo(() => rows.map(metricsFor), [rows, range]);
  const sorted = useMemo(() => {
    const arr = [...all];
    arr.sort((a, b) => {
      const av = a.key === 'name' ? 0 : (a[sort.key] ?? -1), bv = b[sort.key] ?? -1;
      if (sort.key === 'name') return (sort.dir === 'asc' ? 1 : -1) * cleanName(a._row.name).localeCompare(cleanName(b._row.name));
      return (sort.dir === 'asc' ? 1 : -1) * (av - bv);
    });
    return arr;
  }, [all, sort]);

  const rangeLabel = RANGES.find((r) => r.key === range)?.label || 'Todo';
  const current = selected !== 'all' ? all.find((m) => m._row.voomly_id === selected) : null;

  const setSortKey = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-[22px] font-extrabold text-text flex items-center gap-2">
            VSL · Métricas de Voomly
            <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full" style={{ background: '#FEF3C7', color: '#B45309' }}><FlaskConical size={11} /> Experimental</span>
          </h1>
          <p className="text-[13px] text-text3 mt-0.5">
            Elegí un VSL para verlo en detalle, o "Comparar todos" para encontrar puntos de fallo.
            {lastSync && <> · Actualizado {lastSync.toLocaleDateString('es-AR')} {lastSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        <div className="flex gap-1 bg-[#F3F4F6] p-1 rounded-xl">
          {RANGES.map((r) => (
            <button key={r.key} onClick={() => setRange(r.key)} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
              style={range === r.key ? { background: GREEN, color: '#fff', boxShadow: '0 1px 3px rgba(34,197,94,0.45)' } : { color: '#6B7280' }}>{r.label}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-text3 text-center py-20">Cargando…</div>
        : err ? <div className="text-red-500 text-center py-20">Error: {err}</div>
        : rows.length === 0 ? <div className="text-text3 text-center py-20">Todavía no hay datos. Corré el exportador (<code>npm run pull</code>).</div>
        : (
          <>
            {/* Selector de VSL */}
            <div className="flex items-center gap-2 my-5 flex-wrap">
              {current && <button onClick={() => setSelected('all')} className="flex items-center gap-1 text-[13px] font-semibold text-text3 hover:text-text"><ArrowLeft size={15} /> Comparar todos</button>}
              <div className="relative">
                <select value={selected} onChange={(e) => setSelected(e.target.value)}
                  className="appearance-none bg-white border border-border rounded-xl pl-4 pr-9 py-2.5 text-[14px] font-semibold text-text outline-none focus:border-blue cursor-pointer min-w-[280px]">
                  <option value="all">📊 Comparar todos los VSL ({rows.length})</option>
                  {sorted.map((m) => <option key={m._row.voomly_id} value={m._row.voomly_id}>{cleanName(m._row.name)}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" />
              </div>
              <span className="text-[12px] text-text3">Rango: <b className="text-text">{rangeLabel}</b></span>
            </div>

            {current ? <VslDetail m={current} rangeLabel={rangeLabel} />
              : <CompareTable sorted={sorted} sort={sort} onSort={setSortKey} onPick={setSelected} rangeLabel={rangeLabel} />}
          </>
        )}
    </div>
  );
}

// ── Detalle de UN VSL (ocupa todo el panel) ──────────────────────────────────
function VslDetail({ m, rangeLabel }) {
  const r = m._row, ret = m.retention, pts = ret?.points;
  const drops = topDrops(ret);
  const [showTr, setShowTr] = useState(false);
  const transcript = Array.isArray(r.transcript) ? r.transcript : null;
  return (
    <div>
      <div className="flex items-baseline gap-3 mb-1 flex-wrap">
        <h2 className="text-[20px] font-extrabold text-text">{cleanName(r.name)}</h2>
        {ret?.duration && <span className="text-[13px] text-text3">Duración {fmtTime(ret.duration)}</span>}
        {r.embed_id && (
          <a href={`https://embed.voomly.com/b/${r.embed_id}`} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-lg border border-border hover:bg-[#FAFBFC] transition-colors" style={{ color: '#EC4899' }}>
            <ExternalLink size={13} /> Ver en Voomly
          </a>
        )}
      </div>
      <div className="grid grid-cols-5 gap-3 my-4 max-md:grid-cols-2">
        <MetricCard label="Visitas" value={fmt(m.uniq_views)} sub="personas que cargaron" />
        <MetricCard label="Reproducciones" value={fmt(m.total_plays)} sub={`${fmt(m.uniq_plays)} únicas`} color={GREEN} />
        <MetricCard label="Tasa de reproducción" value={(m.play_rate ?? 0) + '%'} sub="dieron play / visitas" color={pctColor(m.play_rate)} hint="De los que cargaron la página, cuántos le dieron play." />
        <MetricCard label="Retención" value={(m.engagement ?? 0) + '%'} sub="% del video visto, en prom." color={pctColor(m.engagement)} hint="En promedio, qué parte del video completo mira cada reproducción." />
        <MetricCard label="Vieron completo" value={(m.completion ?? 0) + '%'} sub="llegaron al final" color={pctColor(m.completion)} hint="De los que arrancaron, cuántos seguían mirando en el último segundo." />
      </div>
      <div className="bg-white border border-border rounded-xl p-4">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-[14px] font-bold text-text">Retención — dónde se cae la gente</h3>
          {pts && <div className="text-[12px] text-text3">Quedan: 25%→<b className="text-text">{pts.p25}%</b> · 50%→<b className="text-text">{pts.p50}%</b> · 75%→<b className="text-text">{pts.p75}%</b> · fin→<b className="text-text">{pts.p100}%</b></div>}
        </div>
        <RetentionChart ret={ret} drops={drops} />
        {drops.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border">
            <h4 className="text-[13px] font-bold text-text mb-0.5 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#DC2626' }} /> Mayores caídas — dónde se va más gente
            </h4>
            <p className="text-[11px] text-text3 mb-2">El % es sobre el total de personas que arrancaron el video.</p>
            <div className="space-y-2">
              {drops.map((d, k) => {
                const phrase = transcriptAt(r.transcript, d.sec);
                return (
                  <div key={k} className="text-[13px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <b className="text-text tabular-nums">{fmtTime(d.sec)}</b>
                      <span className="text-text3">se van ~{fmt(d.lost)} personas ({d.pct}% del total)</span>
                    </div>
                    {phrase
                      ? <div className="text-[13px] text-text2 italic mt-0.5 pl-2 border-l-2 border-[#FBCFE8]">“{phrase}”</div>
                      : <div className="text-[11px] text-text3 mt-0.5 pl-2">— transcripción pendiente (se completa con Whisper) —</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Transcripción completa — desplegable, colapsado (minimalista). */}
      {transcript && transcript.length > 0 && (
        <div className="bg-white border border-border rounded-xl p-4 mt-4">
          <button onClick={() => setShowTr((v) => !v)} className="flex items-center gap-1.5 text-[14px] font-bold text-text hover:text-text2">
            {showTr ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            Transcripción completa
            <span className="text-[12px] font-normal text-text3">({transcript.length} frases)</span>
          </button>
          {showTr && (
            <div className="mt-3 max-h-[320px] overflow-y-auto pr-2 space-y-1.5">
              {transcript.map((s, i) => {
                const inDrop = drops.some((d) => Math.abs(d.sec - (s.start ?? 0)) <= 4);
                return (
                  <div key={i} className="flex gap-2.5 text-[13px] leading-snug">
                    <span className="text-text3 tabular-nums shrink-0 w-10 text-right">{fmtTime(s.start)}</span>
                    <span className={inDrop ? 'text-text font-semibold' : 'text-text2'}>{s.text}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Tabla comparativa de todos los VSL ───────────────────────────────────────
function CompareTable({ sorted, sort, onSort, onPick, rangeLabel }) {
  // Títulos claros (2 líneas) para que se entienda sin saber del tema.
  const cols = [
    { k: 'name',        label: 'Video',          sub: 'nombre del VSL' },
    { k: 'uniq_views',  label: 'Visitas',        sub: 'personas que vieron la página' },
    { k: 'total_plays', label: 'Reproducciones', sub: 'le dieron play' },
    { k: 'play_rate',   label: 'Tasa de play',   sub: '% que reprodujo', pct: true },
    { k: 'engagement',  label: 'Retención',      sub: '% del video que ven', pct: true },
    { k: 'completion',  label: 'Completo',       sub: '% que llega al final', pct: true },
  ];
  const GRID = 'grid grid-cols-[2fr_1fr_1.2fr_1fr_1.1fr_1fr]';
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="text-[12px] text-text3 px-4 pt-3 pb-1">Mostrando rango: <b className="text-text">{rangeLabel}</b></div>
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          {/* Encabezado — clic para ordenar */}
          <div className={`${GRID} bg-[#FAFBFC] border-y border-border`}>
            {cols.map((c, i) => {
              const active = sort.key === c.k;
              return (
                <button key={c.k} onClick={() => onSort(c.k)}
                  className={`text-left px-3 py-2.5 hover:bg-[#F1F3F5] transition-colors ${i ? 'border-l border-border' : ''}`}>
                  <div className="flex items-center gap-1 text-[12.5px] font-bold text-text leading-tight">
                    {c.label}
                    {active && (sort.dir === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />)}
                  </div>
                  <div className="text-[10px] text-text3 font-normal leading-tight mt-0.5">{c.sub}</div>
                </button>
              );
            })}
          </div>
          {/* Filas — todo a la izquierda, columnas separadas */}
          {sorted.map((m) => (
            <div key={m._row.voomly_id} onClick={() => onPick(m._row.voomly_id)}
              className={`${GRID} border-b border-border last:border-0 hover:bg-[#FAFBFC] cursor-pointer`}>
              {cols.map((c, i) => (
                <div key={c.k} className={`px-3 py-3 text-[13px] flex flex-col justify-center ${i ? 'border-l border-border' : ''}`}>
                  {c.k === 'name' ? (
                    <>
                      <span className="font-semibold text-text truncate">{cleanName(m._row.name)}</span>
                      {m.retention?.duration && <span className="text-[10px] text-text3 mt-0.5">{fmtTime(m.retention.duration)} de duración</span>}
                    </>
                  ) : c.pct ? (
                    <span className="font-bold" style={{ color: pctColor(m[c.k]) }}>{m[c.k] ?? 0}%</span>
                  ) : (
                    <span className="font-semibold text-text">{fmt(m[c.k])}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 py-2.5 text-[11px] text-text3 bg-[#FAFBFC] border-t border-border flex items-center gap-3 flex-wrap">
        <span>Clic en un título para ordenar · clic en un VSL para abrir su detalle.</span>
        <span className="flex items-center gap-1"><span style={{ color: GREEN }}>●</span> bien <span style={{ color: '#D97706' }}>●</span> medio <span style={{ color: '#DC2626' }}>●</span> flojo</span>
      </div>
    </div>
  );
}
