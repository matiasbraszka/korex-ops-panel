import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import { ChevronDown, ChevronUp, ArrowLeft, ExternalLink, ArrowDown, AlertTriangle, CheckCircle2, TrendingDown, MessageCircle, Play, ListChecks } from 'lucide-react';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('es-AR'));
const pct = (n) => (n == null ? '—' : `${(Math.round(n * 10) / 10).toLocaleString('es-AR')}%`);
// Color por scroll (verde bien / ámbar medio / rojo flojo).
const scrollColor = (v) => (v == null ? '#9AA5B1' : v >= 50 ? '#16A34A' : v >= 25 ? '#D97706' : '#DC2626');
const isoDaysAgo = (d) => new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);

// Ventanas de tiempo. 'Máximo' = todos los días que tenga cada funnel.
const WINDOWS = [
  { key: 'all', label: 'Máximo', days: null },
  { key: 'd30', label: '30 días', days: 30 },
  { key: 'd14', label: '14 días', days: 14 },
  { key: 'd7', label: '7 días', days: 7 },
];

const hostOf = (u) => { try { return new URL(u).hostname; } catch { return ''; } };
const stepInfo = (u) => {
  let p = ''; try { p = new URL(u).pathname.toLowerCase(); } catch { p = ''; }
  if (p === '/' || p === '') return { type: 'prelanding', label: 'Prelanding' };
  if (/(thanku|thank-?you|gracias|thanks)/.test(p)) return { type: 'gracias', label: 'Página de gracias' };
  if (/(vsl|landing|focus|register|registro|pre-?land|oferta|checkout)/.test(p)) return { type: 'vsl', label: 'Landing / VSL' };
  return { type: 'other', label: p.replace(/\/index\.html$/, '').replace(/^\//, '') || p };
};
const RANK = { prelanding: 0, vsl: 1, other: 2, gracias: 3 };

// Agrega N días de clarity_daily de UN funnel en un único resumen (embudo por URL + KPIs).
function aggregate(rows, days) {
  const cutoff = days ? isoDaysAgo(days) : null;
  const win = (rows || []).filter((r) => !cutoff || r.date >= cutoff);
  if (!win.length) return null;
  let sessions = 0, bots = 0, scrollNum = 0, scrollDen = 0;
  const paths = new Map();
  const dates = new Set(), datesTraffic = new Set();
  let minD = null, maxD = null;
  for (const r of win) {
    sessions += r.sessions || 0;
    bots += r.bot_sessions || 0;
    if (r.avg_scroll_depth != null) { scrollNum += r.avg_scroll_depth * (r.sessions || 0); scrollDen += (r.sessions || 0); }
    for (const pp of (r.popular_pages || [])) {
      const url = pp.url; const c = Number(pp.visitsCount ?? pp.count ?? 0) || 0;
      if (url) paths.set(url, (paths.get(url) || 0) + c);
    }
    dates.add(r.date);
    if ((r.sessions || 0) > 0) datesTraffic.add(r.date);
    if (!minD || r.date < minD) minD = r.date;
    if (!maxD || r.date > maxD) maxD = r.date;
  }
  const top_paths = [...paths.entries()].map(([url, count]) => ({ url, count })).sort((a, b) => b.count - a.count);
  return {
    sessions, bot_sessions: bots,
    avg_scroll_depth: scrollDen ? Math.round((scrollNum / scrollDen) * 100) / 100 : null,
    top_paths, days: dates.size, days_traffic: datesTraffic.size, range_min: minD, range_max: maxD,
  };
}

// Arma el embudo de un dominio puntual a partir de las páginas (top_paths).
function buildFunnel(topPaths, domain) {
  const tp = (topPaths || []).map((x) => ({ url: x.url, count: Number(x.count) || 0, host: hostOf(x.url), ...stepInfo(x.url) }))
    .filter((x) => x.host);
  if (!tp.length) return null;
  const target = domain || tp.slice().sort((a, b) => b.count - a.count)[0].host;
  const steps = tp.filter((s) => s.host === target).sort((a, b) => (RANK[a.type] - RANK[b.type]) || (b.count - a.count));
  return { primary: target, steps };
}

// Dominios que son un funnel propio (tienen su prelanding con tráfico). Marta → beyond + madres.
function domainsOf(topPaths) {
  const tp = (topPaths || []).map((x) => ({ count: Number(x.count) || 0, host: hostOf(x.url), ...stepInfo(x.url) })).filter((x) => x.host);
  const roots = {};
  for (const s of tp) if (s.type === 'prelanding') roots[s.host] = Math.max(roots[s.host] || 0, s.count);
  let doms = Object.entries(roots).filter(([, c]) => c >= 10).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  if (!doms.length) { const p = tp.slice().sort((a, b) => b.count - a.count)[0]?.host; if (p) doms = [p]; }
  return doms;
}
const shortDom = (h) => (h || '').replace(/^www\./, '').replace(/\.metodokorex\.com$/, '').replace(/\.com$/, '');

// ¿el texto es un selector CSS (sin texto legible) o una etiqueta humana?
const isSelector = (l) => !l || l.length < 3 || l.includes('>') || /^[A-Z][A-Z0-9]*(\.|#|\[)/.test(l) || /^[A-Z]+(\[\d+\])?$/.test(l) || /^▫+/.test(l);
const clicksPages = (clicks) => clicks?.pages || [];
const findPage = (clicks, re) => clicksPages(clicks).find((p) => re.test(p.step || '')) || null;
const clicksForDomain = (clicks, domain) => ({ pages: clicksPages(clicks).filter((p) => !domain || hostOf(p.url) === domain) });
function readableClicks(page) {
  const map = new Map();
  for (const e of (page?.top || [])) {
    if (isSelector(e.element)) continue;
    const k = e.element.trim();
    if (!map.has(k) || map.get(k).clicks < e.clicks) map.set(k, { label: k, clicks: e.clicks });
  }
  return [...map.values()].sort((a, b) => b.clicks - a.clicks);
}
function whatsappClicks(page) {
  let total = 0;
  for (const e of (page?.top || [])) {
    if (/whatsapp/i.test(e.element) || (isSelector(e.element) && /(bg-black|transition-all)/.test(e.element))) total += e.clicks || 0;
  }
  return total;
}
const isCTA = (l) => /^[¡]?\s*(QUIERO|EMPEZAR|EMPIEZA|COMENZAR|COMIENZA|VER\b|COMUNICAR|VAMOS|CONTINUAR|SIGUIENTE|UNIRME|ÚNETE|UNETE|DESCUBRIR|GENERAR|AGENDAR|RESERVAR)/i.test(l) || (l === l.toUpperCase() && /[A-ZÁÉÍÓÚÑ]{3}/.test(l) && l.length <= 42);

// Métricas clave de una vista (funnel × dominio). r = resumen agregado del rango elegido.
function metricsOf(view) {
  const r = view.funnel?.range || null;
  const funnel = r ? buildFunnel(r.top_paths, view.domain) : null;
  const entrada = funnel?.steps?.[0]?.count || 0;
  const vslStep = funnel?.steps?.find((s) => s.type === 'vsl');
  const graciasStep = funnel?.steps?.find((s) => s.type === 'gracias');
  const toVsl = entrada && vslStep ? (vslStep.count / entrada) * 100 : null;
  const toGracias = entrada && graciasStep ? (graciasStep.count / entrada) * 100 : null;          // s/ visitas
  const toGraciasLeads = vslStep?.count && graciasStep ? (graciasStep.count / vslStep.count) * 100 : null; // s/ leads
  const sessions = r?.sessions || 0;
  const bots = r?.bot_sessions || 0;
  const botPct = sessions ? (bots / sessions) * 100 : 0;
  const scroll = r?.avg_scroll_depth ?? null;
  // WhatsApp en la página de gracias (viene del scrape de clicks)
  const clicks = clicksForDomain(view.funnel?.clicks_30d, view.domain);
  const graciasPage = findPage(clicks, /gracias|thank|thanks/);
  const waClicks = whatsappClicks(graciasPage);
  const waPct = graciasStep?.count ? (waClicks / graciasStep.count) * 100 : null;
  // mayor caída entre pasos (cuello)
  let cuello = null;
  if (funnel?.steps?.length) {
    for (let i = 1; i < funnel.steps.length; i++) {
      const prev = funnel.steps[i - 1], s = funnel.steps[i];
      if (!prev.count) continue;
      const drop = 100 - (s.count / prev.count) * 100;
      if (!cuello || drop > cuello.drop) cuello = { from: prev, to: s, drop };
    }
  }
  return {
    view, r, funnel, entrada, vslStep, graciasStep, toVsl, toGracias, toGraciasLeads,
    sessions, bots, botPct, scroll, waClicks, waPct, cuello,
    days: r?.days ?? 0, daysTraffic: r?.days_traffic ?? 0,
  };
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

// ── Tabla comparativa de todos los funnels ───────────────────────────────────
function CompareTable({ list, sort, onSort, onPick }) {
  const cols = [
    { k: 'name',           label: 'Funnel',     sub: 'cliente · días de datos' },
    { k: 'entrada',        label: 'Visitas',    sub: 'a la prelanding' },
    { k: 'toVsl',          label: 'Registros',  sub: '% s/ visitas', pctv: true },
    { k: 'toGracias',      label: 'Reg. final', sub: '% s/ visitas', pctv: true },
    { k: 'toGraciasLeads', label: 'Reg. final', sub: '% s/ leads', pctv: true },
    { k: 'waPct',          label: 'WhatsApp',   sub: '% s/ leads', pctv: true, muted: true },
    { k: 'scroll',         label: 'Scroll',     sub: 'proyecto', pctv: true, color: true },
  ];
  const GRID = 'grid grid-cols-[1.8fr_0.9fr_1fr_1fr_1fr_1fr_0.9fr]';
  const maxEntrada = Math.max(1, ...list.map((m) => m.entrada || 0));
  return (
    <div className="bg-white border border-border rounded-xl overflow-hidden">
      <div className="text-[12px] text-text3 px-4 pt-3 pb-1">Comparando <b className="text-text">{list.length}</b> funnels</div>
      <div className="overflow-x-auto">
        <div className="min-w-[860px]">
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
          {list.map((m) => (
            <div key={m.view.key} onClick={() => onPick(m.view.key)}
              className={`${GRID} border-b border-border last:border-0 hover:bg-[#FAFBFC] cursor-pointer`}>
              {cols.map((c, i) => (
                <div key={c.k} className={`px-3 py-3 text-[13px] flex flex-col justify-center ${i ? 'border-l border-border' : ''}`}>
                  {c.k === 'name' ? (
                    <>
                      <span className="font-semibold text-text truncate">{m.view.label}</span>
                      <span className="text-[10px] text-text3 mt-0.5">{m.days} {m.days === 1 ? 'día' : 'días'}{m.daysTraffic < m.days ? ` · ${m.daysTraffic} c/ tráfico` : ''}</span>
                    </>
                  ) : c.k === 'entrada' ? (
                    <>
                      <span className="font-semibold text-text">{fmt(m.entrada)}</span>
                      <div className="h-1.5 bg-[#F1F3F9] rounded-full overflow-hidden mt-1"><div className="h-full rounded-full" style={{ width: `${Math.max(4, (m.entrada / maxEntrada) * 100)}%`, background: '#4F46E5' }} /></div>
                    </>
                  ) : c.color ? (
                    <span className="font-bold" style={{ color: scrollColor(m[c.k]) }}>{pct(m[c.k])}</span>
                  ) : c.muted ? (
                    <span className="text-text3">{pct(m[c.k])}</span>
                  ) : (
                    <span className="font-bold text-text">{pct(m[c.k])}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="px-4 py-2.5 text-[11px] text-text3 bg-[#FAFBFC] border-t border-border flex items-center gap-3 flex-wrap">
        <span>Clic en un título para ordenar · clic en un funnel para abrir su detalle.</span>
        <span>Reg. final <b>s/ visitas</b> = sobre las visitas totales · <b>s/ leads</b> = sobre los que se registraron.</span>
        <span className="flex items-center gap-1">Scroll: <span style={{ color: '#16A34A' }}>●</span> bien <span style={{ color: '#D97706' }}>●</span> medio <span style={{ color: '#DC2626' }}>●</span> flojo</span>
      </div>
    </div>
  );
}

// ── Detalle de UN funnel (ocupa todo el panel) ───────────────────────────────
function FunnelDetail({ view }) {
  const cur = view.funnel;
  const dom = view.domain;
  const m = useMemo(() => metricsOf(view), [view]);
  const { r, funnel, entrada, vslStep, graciasStep, toVsl, toGracias, toGraciasLeads, cuello, botPct, waClicks, waPct } = m;
  const humans = r ? (r.sessions || 0) - (r.bot_sessions || 0) : 0;

  const clicks = useMemo(() => clicksForDomain(cur?.clicks_30d, dom), [cur, dom]);
  const vsl = (view.primary && cur?.vsl_cross) ? cur.vsl_cross : null;
  const midPage = useMemo(() => findPage(clicks, /vsl|landing|register|focus/), [clicks]);
  const prelandingPage = useMemo(() => findPage(clicks, /prelanding/), [clicks]);
  const preTop = useMemo(() => readableClicks(prelandingPage).slice(0, 5), [prelandingPage]);
  const ctas = useMemo(() => {
    const pre = readableClicks(prelandingPage).filter((q) => isCTA(q.label)).map((q) => ({ ...q, src: 'Prelanding' }));
    const mid = readableClicks(midPage).filter((q) => isCTA(q.label)).map((q) => ({ ...q, src: 'VSL' }));
    return [...pre, ...mid].sort((a, b) => b.clicks - a.clicks).slice(0, 8);
  }, [prelandingPage, midPage]);
  const quizOpts = useMemo(() => readableClicks(midPage).filter((q) => !isCTA(q.label) && q.label.includes(' ') && !/^[+▫]/.test(q.label)).slice(0, 9), [midPage]);

  if (!r) return <div className="text-text3 text-[13px] py-10 text-center">Este funnel todavía no tiene datos de Clarity.</div>;

  return (
    <>
      <div className="grid grid-cols-5 gap-3.5 mb-5 max-md:grid-cols-2">
        <Kpi label="Visitas a la prelanding" value={fmt(entrada)} sub={view.multi ? `dominio ${shortDom(dom)} · ${fmt(r.sessions)} ses. proyecto` : `${Math.round(botPct)}% bots · ${fmt(humans)} reales (proyecto)`} color="#4F46E5" />
        <Kpi label="Registros (al VSL)" value={pct(toVsl)} sub={vslStep ? `${fmt(vslStep.count)} leads · de ${fmt(entrada)} visitas` : 'sin paso de VSL'} color="#0EA5A5" />
        <Kpi label="Registro final · s/ visitas" value={pct(toGracias)} sub={graciasStep ? `${fmt(graciasStep.count)} llegan a "gracias"` : 'sin página de gracias'} color="#16A34A" />
        <Kpi label="Registro final · s/ leads" value={pct(toGraciasLeads)} sub={vslStep?.count ? `de ${fmt(vslStep.count)} registrados` : 'sin leads'} color="#0891B2" />
        <Kpi label="Scroll promedio" value={r.avg_scroll_depth != null ? pct(r.avg_scroll_depth) : '—'} sub="del proyecto (no por página)" color="#D97706" />
      </div>

      <div className="grid grid-cols-[1.5fr_1fr] gap-4 items-start max-md:grid-cols-1">
        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="flex justify-between items-center">
            <div className="text-[13px] font-bold">Embudo paso a paso</div>
            <span className="text-[11px] font-bold text-[#4F46E5] bg-[#EEF0FF] px-2 py-0.5 rounded-full">{r.days} {r.days === 1 ? 'día' : 'días'}</span>
          </div>
          <div className="text-[12px] text-text3 mt-0.5 mb-3">El ancho de cada barra es proporcional a las visitas reales: se ve dónde se cae la gente.</div>
          <FunnelBars steps={funnel?.steps} tagId={cur.tag_id} />
          {view.multi && <div className="mt-3 text-[11px] text-text3">Mostrando el dominio <b>{shortDom(dom)}</b>. Cambiá de funnel arriba para ver el otro dominio.</div>}
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
            {toGraciasLeads != null && toGraciasLeads >= 40 && (
              <div className="flex gap-2.5 items-start py-2.5 border-t border-border">
                <div className="w-6 h-6 rounded-lg bg-[#E9F8EF] text-[#16A34A] flex items-center justify-center shrink-0"><CheckCircle2 size={14} /></div>
                <div className="text-[13px] leading-snug"><b>Lo que sí funciona:</b> de los que llegan al VSL, {pct(toGraciasLeads)} avanza a "gracias". El cierre va bien; el problema es traer gente al VSL.</div>
              </div>
            )}
            <div className="flex gap-2.5 items-start py-2.5 border-t border-border">
              <div className="w-6 h-6 rounded-lg bg-[#FEF3E2] text-[#D97706] flex items-center justify-center shrink-0"><AlertTriangle size={14} /></div>
              <div className="text-[13px] leading-snug"><b>Scroll {pct(r.avg_scroll_depth)}:</b> {r.avg_scroll_depth >= 50 ? 'la gente baja bien la página.' : 'la gente baja poco la página — revisar lo de arriba (above the fold).'} <span className="text-text3">Es del proyecto entero (Clarity no separa scroll por página vía API).</span></div>
            </div>
          </div>
          <a href={`https://clarity.microsoft.com/projects/view/${cur.tag_id}/heatmaps`} target="_blank" rel="noreferrer"
             className="mt-4 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-white bg-[#4F46E5] rounded-lg px-3 py-2">
            Abrir mapas de calor en Clarity <ExternalLink size={13} />
          </a>
        </div>
      </div>

      {/* COMPORTAMIENTO */}
      <div className="mt-4 grid grid-cols-2 gap-4 items-start max-md:grid-cols-1">
        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="text-[13px] font-bold flex items-center gap-1.5"><TrendingDown size={14} className="text-[#7C3AED]" /> CTAs más clickeados</div>
          <div className="text-[12px] text-text3 mt-0.5 mb-3">Botones de acción en prelanding y VSL.</div>
          {ctas.length ? (
            <div className="space-y-2">
              {ctas.map((q, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[12px] mb-0.5">
                    <span className="truncate max-w-[78%]" title={q.label}><span className="text-[10px] font-bold uppercase text-text3 mr-1">{q.src}</span>{q.label}</span>
                    <b>{fmt(q.clicks)}</b>
                  </div>
                  <div className="h-2 bg-[#F1F3F9] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (q.clicks / (ctas[0].clicks || 1)) * 100)}%`, background: '#7C3AED' }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="text-text3 text-[12px] py-4">Sin CTAs detectados.</div>}
        </div>

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
          ) : <div className="text-text3 text-[12px] py-4">{view.multi ? 'El cruce automático del VSL es del dominio principal; para este dominio mirá Voomly.' : 'Sin datos del VSL.'}</div>}
        </div>

        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="text-[13px] font-bold flex items-center gap-1.5"><ListChecks size={14} className="text-[#4F46E5]" /> Quiz · qué responden y dónde se quedan</div>
          <div className="text-[12px] text-text3 mt-0.5 mb-3">Respuestas más elegidas en el quiz (clicks por opción).</div>
          {quizOpts.length ? (
            <div className="space-y-2">
              {quizOpts.map((q, i) => (
                <div key={i}>
                  <div className="flex justify-between text-[12px] mb-0.5"><span className="truncate max-w-[80%]" title={q.label}>{q.label}</span><b>{fmt(q.clicks)}</b></div>
                  <div className="h-2 bg-[#F1F3F9] rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${Math.max(6, (q.clicks / (quizOpts[0].clicks || 1)) * 100)}%`, background: '#6366F1' }} /></div>
                </div>
              ))}
            </div>
          ) : <div className="text-text3 text-[12px] py-4">Poco tráfico / sin clicks legibles en este paso.</div>}
        </div>

        <div className="bg-white border border-border rounded-2xl p-5">
          <div className="text-[13px] font-bold flex items-center gap-1.5"><MessageCircle size={14} className="text-[#16A34A]" /> WhatsApp en la página de gracias</div>
          <div className="text-[12px] text-text3 mt-0.5 mb-2">Clicks al botón para escribir por WhatsApp.</div>
          <div className="flex items-baseline gap-2">
            <div className="text-[34px] font-extrabold tracking-tight" style={{ color: '#16A34A' }}>{fmt(waClicks)}</div>
            {waPct != null && <div className="text-[16px] font-bold text-[#16A34A]">· {pct(waPct)}</div>}
          </div>
          <div className="text-[12px] text-text3">{graciasStep ? `${pct(waPct)} de los ${fmt(graciasStep.count)} que llegaron a "gracias"` : 'clicks al CTA final'}</div>
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
        <span>● Embudo, visitas y scroll: <b>Clarity · {r.days} días</b> (se actualiza a diario)</span>
        <span>● CTAs, quiz y WhatsApp: <b>último scrape de Clarity/Voomly</b></span>
        {cur.last_synced_at && <span>● Última actualización: {new Date(cur.last_synced_at).toLocaleString('es-AR')}</span>}
      </div>
    </>
  );
}

export default function EmbudoPage() {
  const [meta, setMeta] = useState([]);
  const [daily, setDaily] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [selected, setSelected] = useState('all'); // 'all' = tabla comparativa | view.key = detalle
  const [sort, setSort] = useState({ key: 'entrada', dir: 'desc' });
  const [win, setWin] = useState('all'); // ventana de tiempo

  useEffect(() => {
    let active = true;
    (async () => {
      const [mRes, dRes] = await Promise.all([
        supabase.from('clarity_funnels').select('id, label, tag_id, client_id, clicks_30d, vsl_cross, last_synced_at, client:clients(name)').eq('active', true),
        supabase.from('clarity_daily').select('funnel_id, date, sessions, bot_sessions, avg_scroll_depth, popular_pages').gte('date', isoDaysAgo(180)).order('date'),
      ]);
      if (!active) return;
      if (mRes.error || dRes.error) { setErr((mRes.error || dRes.error).message); setLoading(false); return; }
      setMeta(mRes.data || []);
      setDaily(dRes.data || []);
      setLoading(false);
    })();
    return () => { active = false; };
  }, []);

  const dailyByFunnel = useMemo(() => {
    const map = {};
    for (const r of daily) (map[r.funnel_id] ||= []).push(r);
    return map;
  }, [daily]);

  const winDays = WINDOWS.find((w) => w.key === win)?.days ?? null;

  // funnels con su resumen agregado del rango elegido
  const funnels = useMemo(() => meta
    .map((f) => ({ ...f, range: aggregate(dailyByFunnel[f.id], winDays) }))
    .filter((f) => f.range && f.range.top_paths.length)
    .sort((a, b) => (b.range.sessions || 0) - (a.range.sessions || 0)),
  [meta, dailyByFunnel, winDays]);

  // vistas = funnel × dominio
  const views = useMemo(() => {
    const out = [];
    for (const f of funnels) {
      const doms = domainsOf(f.range?.top_paths);
      doms.forEach((d, i) => out.push({ key: `${f.id}|${d}`, funnel: f, domain: d, primary: i === 0, multi: doms.length > 1, label: doms.length > 1 ? `${f.client?.name || 'Cliente'} · ${shortDom(d)}` : (f.client?.name || f.label) }));
    }
    return out;
  }, [funnels]);

  const metrics = useMemo(() => views.map(metricsOf), [views]);
  const sorted = useMemo(() => {
    const arr = [...metrics];
    arr.sort((a, b) => {
      if (sort.key === 'name') return (sort.dir === 'asc' ? 1 : -1) * (a.view.label || '').localeCompare(b.view.label || '');
      const av = a[sort.key] ?? -1, bv = b[sort.key] ?? -1;
      return (sort.dir === 'asc' ? 1 : -1) * (av - bv);
    });
    return arr;
  }, [metrics, sort]);

  const setSortKey = (key) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'desc' ? 'asc' : 'desc' }));
  const current = selected !== 'all' ? views.find((v) => v.key === selected) : null;
  const lastSync = useMemo(() => {
    const ts = meta.map((f) => f.last_synced_at).filter(Boolean).sort().pop();
    return ts ? new Date(ts) : null;
  }, [meta]);

  return (
    <div className="p-6 max-w-[1180px] mx-auto">
      <div className="text-[12.5px] text-text3">Marketing › Embudo de ventas</div>
      <div className="flex items-end justify-between gap-4 mt-1 mb-5 flex-wrap">
        <div>
          <h1 className="text-[23px] font-bold tracking-tight flex items-center gap-2"><TrendingDown size={22} className="text-[#4F46E5]" /> Embudo &amp; Mapas de calor</h1>
          <p className="text-[12.5px] text-text3 mt-0.5">
            Compará todos los funnels o entrá al detalle de cada cliente.
            {lastSync && <> · Actualizado {lastSync.toLocaleDateString('es-AR')} {lastSync.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}</>}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {current && <button onClick={() => setSelected('all')} className="flex items-center gap-1 text-[13px] font-semibold text-text3 hover:text-text"><ArrowLeft size={15} /> Comparar todos</button>}
          {views.length > 0 && (
            <div className="relative">
              <select value={selected} onChange={(e) => setSelected(e.target.value)} className="appearance-none bg-white border border-border rounded-xl pl-3 pr-8 py-2 text-[13.5px] font-semibold cursor-pointer min-w-[240px]">
                <option value="all">📊 Comparar todos los funnels ({views.length})</option>
                {sorted.map((m) => <option key={m.view.key} value={m.view.key}>{m.view.label}</option>)}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text3 pointer-events-none" />
            </div>
          )}
          <div className="flex gap-1 bg-[#F3F4F6] p-1 rounded-xl">
            {WINDOWS.map((w) => (
              <button key={w.key} onClick={() => setWin(w.key)} className="text-[12px] font-semibold px-2.5 py-1.5 rounded-lg transition-colors"
                style={win === w.key ? { background: '#4F46E5', color: '#fff', boxShadow: '0 1px 3px rgba(79,70,229,0.4)' } : { color: '#6B7280' }}>{w.label}</button>
            ))}
          </div>
        </div>
      </div>

      {loading && <div className="text-text3 text-[13px] py-10 text-center">Cargando métricas…</div>}
      {err && <div className="text-[#DC2626] text-[13px] bg-[#FDECEC] border border-[#F5C2C2] rounded-xl p-3">Error: {err}</div>}
      {!loading && !err && !views.length && <div className="text-text3 text-[13px] py-10 text-center">Sin datos de Clarity en este rango.</div>}

      {!loading && !err && views.length > 0 && (
        current ? <FunnelDetail view={current} /> : <CompareTable list={sorted} sort={sort} onSort={setSortKey} onPick={setSelected} />
      )}
    </div>
  );
}
