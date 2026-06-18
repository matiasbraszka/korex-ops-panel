import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { ChevronDown, ExternalLink, ArrowDown, AlertTriangle, CheckCircle2, TrendingDown, MessageCircle, Play, ListChecks } from 'lucide-react';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const pct = (n) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toLocaleString('es-AR')}%`);

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const stepInfo = (u) => {
  let p = ''; try { p = new URL(u).pathname.toLowerCase(); } catch { p = ''; }
  if (p === '/' || p === '') return { type: 'prelanding', label: 'Prelanding' };
  if (/(thanku|thank-?you|gracias|thanks)/.test(p)) return { type: 'gracias', label: 'Página de gracias' };
  if (/(vsl|landing|focus|register|registro|pre-?land|oferta|checkout)/.test(p)) return { type: 'vsl', label: 'Landing / VSL' };
  return { type: 'other', label: p.replace(/\/index\.html$/, '').replace(/^\//, '') || p };
};
const RANK = { prelanding: 0, vsl: 1, other: 2, gracias: 3 };

// Arma el embudo a partir de las páginas (top_paths) del dominio principal.
function buildFunnel(topPaths) {
  const tp = (topPaths || []).map((x) => ({ url: x.url, count: Number(x.count) || 0, host: hostOf(x.url), ...stepInfo(x.url) }))
    .filter((x) => x.host);
  if (!tp.length) return null;
  const primary = tp[0].host; // el de la página más visitada
  const steps = tp.filter((s) => s.host === primary).sort((a, b) => (RANK[a.type] - RANK[b.type]) || (b.count - a.count));
  const otherHosts = [...new Set(tp.filter((s) => s.host !== primary).map((s) => s.host))];
  const secondary = otherHosts.map((h) => tp.filter((s) => s.host === h).sort((a, b) => (RANK[a.type] - RANK[b.type]) || (b.count - a.count)));
  return { primary, steps, secondary };
}

// ¿el texto es un selector CSS (sin texto legible) o una etiqueta humana?
const isSelector = (l) => !l || l.length < 3 || l.includes('>') || /^[A-Z][A-Z0-9]*(\.|#|\[)/.test(l) || /^[A-Z]+(\[\d+\])?$/.test(l) || /^▫+/.test(l);
const clicksPages = (clicks) => clicks?.pages || [];
const findPage = (clicks, re) => clicksPages(clicks).find((p) => re.test(p.step || '')) || null;
// opciones legibles del quiz / CTAs de la página intermedia, dedup por texto (máximo click)
function readableClicks(page) {
  const map = new Map();
  for (const e of (page?.top || [])) {
    if (isSelector(e.element)) continue;
    const k = e.element.trim();
    if (!map.has(k) || map.get(k).clicks < e.clicks) map.set(k, { label: k, clicks: e.clicks });
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}
// clicks al botón de WhatsApp en la página de gracias (botón CTA, suma de instancias)
function whatsappClicks(page) {
  let total = 0;
  for (const e of (page?.top || [])) {
    if (/whatsapp/i.test(e.element) || (isSelector(e.element) && /(bg-black|transition-all)/.test(e.element))) total += e.clicks || 0;
  }
  return total;
}

function Kpi({ label, value, sub, color }) {
  return (
    <div className="bg-white border border-border rounded-xl py-4 px-5">
      <div className="text-[11px] text-text3 font-medium">{label}</div>
      <div className="text-[30px] font-extrabold my-0.5 tracking-tight" style={{ color: color || '#1A1A2E' }}>{value}</div>
      {sub && <div className="text-[11px] text-text3">{sub}</div>}
    </div>
  );
}

function FunnelBars({ steps, tagId }) {
  if (!steps?.length) return <div className="text-text3 text-[12px] py-6 text-center">Sin páginas con datos en este funnel.</div>;
  const entrada = steps[0].count || 1;
  const colors = ['#4F46E5', '#0EA5A5', '#0891B2', '#7C3AED', '#9333EA'];
  return (
    <div>
      {steps.map((s, i) => {
        const w = Math.max(14, Math.round((s.count / entrada) * 100));
        const prev = i > 0 ? steps[i - 1] : null;
        const conv = prev && prev.count ? (s.count / prev.count) * 100 : null;
        const drop = conv != null ? 100 - conv : null;
        const hmUrl = `https://clarity.microsoft.com/projects/view/${tagId}/heatmaps`;
        return (
          <div key={s.url}>
            {prev && (
              <div className="flex items-center gap-2 my-2 text-[12px]">
                <ArrowDown size={14} className="text-text3" />
                <span className="font-semibold text-[#16A34A] bg-[#E9F8EF] px-2 py-0.5 rounded-full">{pct(conv)} pasa</span>
                {drop != null && drop >= 1 && (
                  <span className="font-semibold text-[#DC2626] bg-[#FDECEC] px-2 py-0.5 rounded-full">
                    −{pct(drop)} se cae{drop >= 70 ? ' · cuello' : ''}
                  </span>
                )}
              </div>
            )}
            <div className="bg-[#F1F3F9] rounded-xl">
              <div className="h-16 rounded-xl flex items-center px-4 text-white" style={{ width: `${w}%`, background: `linear-gradient(90deg, ${colors[i % colors.length]}, ${colors[i % colors.length]}cc)` }}>
                <span className="text-[13px] font-bold opacity-95 whitespace-nowrap">{i + 1} · {s.label}</span>
                <span className="ml-auto text-[22px] font-extrabold tracking-tight">{fmt(s.count)}</span>
              </div>
            </div>
            <div className="flex justify-between items-center mt-1 mb-0.5">
              <span className="text-[11px] text-text3 truncate max-w-[70%]" title={s.url}>{s.url}</span>
              <a href={hmUrl} target="_blank" rel="noreferrer" className="text-[11px] font-semibold text-[#4F46E5] inline-flex items-center gap-1 shrink-0">
                Ver mapa de calor <ExternalLink size={11} />
              </a>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function EmbudoPage() {
  const [funnels, setFunnels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [sel, setSel] = useState('');

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from('clarity_funnels')
        .select('id, label, tag_id, client_id, range_30d, clicks_30d, vsl_cross, last_synced_at, client:clients(name)')
        .eq('active', true);
      if (!active) return;
      if (error) { setErr(error.message); setLoading(false); return; }
      const rows = (data || []).filter((r) => r.range_30d);
      rows.sort((a, b) => (b.range_30d?.sessions || 0) - (a.range_30d?.sessions || 0));
      setFunnels(rows);
      setSel(rows[0]?.id || '');
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const cur = useMemo(() => funnels.find((f) => f.id === sel) || null, [funnels, sel]);
  const r = cur?.range_30d || null;
  const funnel = useMemo(() => (r ? buildFunnel(r.top_paths) : null), [r]);

  // KPIs y cuellos
  const entrada = funnel?.steps?.[0]?.count || 0;
  const vslStep = funnel?.steps?.find((s) => s.type === 'vsl');
  const graciasStep = funnel?.steps?.find((s) => s.type === 'gracias');
  const toVsl = entrada && vslStep ? (vslStep.count / entrada) * 100 : null;
  const toGracias = entrada && graciasStep ? (graciasStep.count / entrada) * 100 : null;
  const humans = r ? (r.sessions || 0) - (r.bot_sessions || 0) : 0;
  const botPct = r && r.sessions ? Math.round(((r.bot_sessions || 0) / r.sessions) * 100) : 0;

  // mayor caída entre pasos (para el insight de cuello)
  const cuello = useMemo(() => {
    if (!funnel?.steps?.length) return null;
    let worst = null;
    for (let i = 1; i < funnel.steps.length; i++) {
      const prev = funnel.steps[i - 1], s = funnel.steps[i];
      if (!prev.count) continue;
      const drop = 100 - (s.count / prev.count) * 100;
      if (!worst || drop > worst.drop) worst = { from: prev, to: s, drop };
    }
    return worst;
  }, [funnel]);

  // Comportamiento: quiz, WhatsApp, compromiso con el VSL
  const clicks = cur?.clicks_30d || null;
  const vsl = cur?.vsl_cross || null;
  const midPage = useMemo(() => findPage(clicks, /vsl|landing|register|focus/), [clicks]);
  const graciasPage = useMemo(() => findPage(clicks, /gracias|thank|thanks/), [clicks]);
  const prelandingPage = useMemo(() => findPage(clicks, /prelanding/), [clicks]);
  const quiz = useMemo(() => readableClicks(midPage).slice(0, 9), [midPage]);
  const waClicks = useMemo(() => whatsappClicks(graciasPage), [graciasPage]);
  const preTop = useMemo(() => readableClicks(prelandingPage).slice(0, 5), [prelandingPage]);

  return (
    <div className="p-6 max-w-[1180px] mx-auto">
      <div className="text-[12.5px] text-text3">Marketing › Embudo de ventas</div>
      <div className="flex items-end justify-between gap-4 mt-1 mb-5">
        <h1 className="text-[23px] font-bold tracking-tight flex items-center gap-2"><TrendingDown size={22} className="text-[#4F46E5]" /> Embudo &amp; Mapas de calor</h1>
        <div className="flex items-center gap-2">
          {funnels.length > 0 && (
            <div className="relative">
              <select value={sel} onChange={(e) => setSel(e.target.value)} className="appearance-none bg-white border border-border rounded-xl pl-3 pr-8 py-2 text-[13.5px] font-semibold cursor-pointer">
                {funnels.map((f) => <option key={f.id} value={f.id}>{f.client?.name || 'Cliente'} — {f.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" />
            </div>
          )}
          <span className="bg-white border border-border rounded-xl px-3 py-2 text-[13px] font-semibold text-text3">Últimos 30 días</span>
        </div>
      </div>

      {loading && <div className="text-text3 text-[13px] py-10 text-center">Cargando métricas…</div>}
      {err && <div className="text-[#DC2626] text-[13px] bg-[#FDECEC] border border-[#F5C2C2] rounded-xl p-3">Error: {err}</div>}
      {!loading && !err && !funnels.length && <div className="text-text3 text-[13px] py-10 text-center">Todavía no hay datos de Clarity cargados.</div>}

      {cur && r && (
        <>
          <div className="grid grid-cols-4 gap-3.5 mb-5">
            <Kpi label="Visitas (30 días)" value={fmt(r.sessions)} sub={`${botPct}% bots · ${fmt(humans)} personas reales`} color="#4F46E5" />
            <Kpi label="Registros (al VSL)" value={pct(toVsl)} sub={vslStep ? `${fmt(vslStep.count)} leads · de ${fmt(entrada)} visitas` : 'sin paso de VSL'} color="#0EA5A5" />
            <Kpi label="Registro final" value={pct(toGracias)} sub={graciasStep ? `${fmt(graciasStep.count)} llegan a "gracias"` : 'sin página de gracias'} color="#16A34A" />
            <Kpi label="Scroll promedio" value={r.avg_scroll_depth != null ? pct(r.avg_scroll_depth) : '—'} sub="cuánto baja la página" color="#D97706" />
          </div>

          <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-start">
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="flex justify-between items-center">
                <div className="text-[13px] font-bold">Embudo paso a paso</div>
                <span className="text-[11px] font-bold text-[#4F46E5] bg-[#EEF0FF] px-2 py-0.5 rounded-full">30 días</span>
              </div>
              <div className="text-[12px] text-text3 mt-0.5 mb-3">El ancho de cada barra es proporcional a las visitas reales: se ve dónde se cae la gente.</div>
              <FunnelBars steps={funnel?.steps} tagId={cur.tag_id} />
              {funnel?.secondary?.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  {funnel.secondary.map((sec, idx) => (
                    <div key={idx} className="flex items-center gap-2 flex-wrap text-[12px] mb-1">
                      <span className="text-text3 font-semibold">Otro dominio ({sec[0]?.host}):</span>
                      {sec.map((s, i) => (
                        <span key={s.url} className="flex items-center gap-2">
                          {i > 0 && <span className="text-text3">→</span>}
                          <span className="bg-[#F4F6FB] border border-border rounded-lg px-2 py-1 font-semibold">{s.label} {fmt(s.count)}</span>
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="text-[13px] font-bold">Qué retiene y dónde mejorar</div>
              <div className="text-[12px] text-text3 mt-0.5 mb-3">Lectura en simple del embudo.</div>
              <div className="flex flex-col">
                {cuello && (
                  <div className="flex gap-2.5 items-start py-2.5">
                    <div className="w-6 h-6 rounded-lg bg-[#FDECEC] text-[#DC2626] flex items-center justify-center shrink-0"><TrendingDown size={14} /></div>
                    <div className="text-[13px] leading-snug"><b>Cuello principal:</b> {Math.round(cuello.drop)}% se cae entre <b>{cuello.from.label}</b> y <b>{cuello.to.label}</b>. Es donde más se pierde gente.</div>
                  </div>
                )}
                {toVsl != null && vslStep && graciasStep && (vslStep.count ? (graciasStep.count / vslStep.count) : 0) >= 0.4 && (
                  <div className="flex gap-2.5 items-start py-2.5 border-t border-border">
                    <div className="w-6 h-6 rounded-lg bg-[#E9F8EF] text-[#16A34A] flex items-center justify-center shrink-0"><CheckCircle2 size={14} /></div>
                    <div className="text-[13px] leading-snug"><b>Lo que sí funciona:</b> de los que llegan al VSL, {pct((graciasStep.count / vslStep.count) * 100)} avanza a "gracias". El cierre va bien; el problema es traer gente al VSL.</div>
                  </div>
                )}
                <div className="flex gap-2.5 items-start py-2.5 border-t border-border">
                  <div className="w-6 h-6 rounded-lg bg-[#FEF3E2] text-[#D97706] flex items-center justify-center shrink-0"><AlertTriangle size={14} /></div>
                  <div className="text-[13px] leading-snug"><b>Scroll {pct(r.avg_scroll_depth)}:</b> {r.avg_scroll_depth >= 50 ? 'la gente baja bien la página.' : 'la gente baja poco la página — revisar lo de arriba (above the fold).'}</div>
                </div>
              </div>
              <a href={`https://clarity.microsoft.com/projects/view/${cur.tag_id}/heatmaps`} target="_blank" rel="noreferrer"
                 className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#4F46E5] rounded-lg px-3 py-2">
                Abrir mapas de calor en Clarity <ExternalLink size={13} />
              </a>
            </div>
          </div>

          {/* COMPORTAMIENTO */}
          <div className="mt-4 grid grid-cols-3 gap-4 items-start">
            {/* Compromiso con el VSL (Voomly) */}
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="text-[13px] font-bold flex items-center gap-1.5"><Play size={14} className="text-[#0EA5A5]" /> Compromiso con el VSL</div>
              <div className="text-[12px] text-text3 mt-0.5 mb-3">De los que llegan a la landing del VSL.</div>
              {vsl ? (
                <div className="space-y-3">
                  {[{ l: 'Le dan play al video', v: Number(vsl.play_rate), c: '#0EA5A5' }, { l: 'Miran el video completo', v: Number(vsl.completion), c: '#16A34A' }].map((b, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[12px] mb-0.5"><span>{b.l}</span><b>{Number.isFinite(b.v) ? `${b.v}%` : '—'}</b></div>
                      <div className="h-2.5 bg-[#F1F3F9] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, b.v || 0))}%`, background: b.c }} /></div>
                    </div>
                  ))}
                  <div className="text-[11px] text-text3">Fuente: Voomly · video "{vsl.name}".</div>
                </div>
              ) : <div className="text-text3 text-[12px] py-4">Sin datos del VSL.</div>}
            </div>

            {/* Quiz */}
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="text-[13px] font-bold flex items-center gap-1.5"><ListChecks size={14} className="text-[#4F46E5]" /> Quiz · qué responden y dónde se quedan</div>
              <div className="text-[12px] text-text3 mt-0.5 mb-3">Clicks por opción / CTA del paso (más clicks = más arriba en el quiz).</div>
              {quiz.length ? (
                <div className="space-y-2">
                  {quiz.map((q, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-[12px] mb-0.5"><span className="truncate max-w-[80%]" title={q.label}>{q.label}</span><b>{fmt(q.clicks)}</b></div>
                      <div className="h-2 bg-[#F1F3F9] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (q.clicks / (quiz[0].clicks || 1)) * 100)}%`, background: '#6366F1' }} /></div>
                    </div>
                  ))}
                </div>
              ) : <div className="text-text3 text-[12px] py-4">Poco tráfico / sin clicks legibles en este paso.</div>}
            </div>

            {/* WhatsApp en gracias + prelanding */}
            <div className="bg-white border border-border rounded-2xl p-5">
              <div className="text-[13px] font-bold flex items-center gap-1.5"><MessageCircle size={14} className="text-[#16A34A]" /> WhatsApp en la página de gracias</div>
              <div className="text-[12px] text-text3 mt-0.5 mb-2">Clicks al botón para escribir por WhatsApp.</div>
              <div className="text-[34px] font-extrabold tracking-tight" style={{ color: '#16A34A' }}>{fmt(waClicks)}</div>
              <div className="text-[12px] text-text3">{graciasStep ? `sobre ${fmt(graciasStep.count)} visitas a "gracias"` : 'clicks al CTA final'}</div>
              {preTop.length > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="text-[12px] font-semibold mb-1.5">Dónde clickean en la prelanding</div>
                  {preTop.map((p, i) => (
                    <div key={i} className="flex justify-between text-[12px] py-0.5"><span className="truncate max-w-[80%]" title={p.label}>{p.label}</span><b>{fmt(p.clicks)}</b></div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="text-[11px] text-text3 mt-4 flex gap-4 flex-wrap">
            <span>● Embudo, visitas y scroll: <b>Clarity · 30 días</b></span>
            <span>● Mapas de calor: <b>Clarity</b></span>
            <span>● Se complementa con <b>retención del VSL (Voomly)</b> y <b>tope de embudo (Meta Ads)</b></span>
            {cur.last_synced_at && <span>● Última actualización: {new Date(cur.last_synced_at).toLocaleString('es-AR')}</span>}
          </div>
        </>
      )}
    </div>
  );
}
