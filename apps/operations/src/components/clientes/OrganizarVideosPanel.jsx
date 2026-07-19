// OrganizarVideosPanel — PREVIEW local del organizador de videos (Recursos).
//
// Muestra, POR FUNNEL (estrategia), qué avatar le corresponde a cada video de Bunny (por
// match de la transcripción contra el ad_script del DEL de ESE funnel) y qué título tendría,
// con flags "para revisar" y "duplicado". Es SOLO LECTURA y se calcula en el navegador: no
// escribe, no publica funciones, no gasta tokens. Cada video se matchea únicamente contra los
// avatares de SU estrategia — los que no tienen funnel asignado van a una sección aparte.
import { useEffect, useMemo, useState } from 'react';
import { sbFetch } from '@korex/db';
import { RefreshCw, Film, Wand2, AlertTriangle, Copy, Filter } from 'lucide-react';

const UMBRAL_AVATAR = 0.70;
const UMBRAL_HOOK = 0.60;

function palabras(txt) {
  return new Set(String(txt || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/).filter(w => w.length >= 5));
}
function containment(a, b) {
  if (!a.size) return 0;
  let hit = 0; for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}
function rango(nums) {
  const s = [...new Set(nums)].sort((x, y) => x - y);
  const out = []; let i = 0;
  while (i < s.length) { let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++; out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`); i = j + 1; }
  return out.join(', ');
}
// "h2-c1-cta2" → Hook 2, ángulo 1 (convención del editor). Señal fuerte, sin IA.
function parseNombre(title) {
  const t = String(title || '').toLowerCase();
  const h = t.match(/\bh(\d{1,2})\b/);
  const c = t.match(/\bc(\d{1,2})\b/);
  return { hook: h ? Number(h[1]) : null, angulo: c ? Number(c[1]) : null };
}

// Calcula la fila de UN video contra los avatares de SU funnel.
function fila(v, avatars, ctx) {
  const tw = v.transcript && v.transcript.length > 120 ? palabras(v.transcript) : new Set();
  let mejor = null, pct = 0;
  if (tw.size) for (const a of avatars) { const c = containment(a.words, tw); if (c > pct) { pct = c; mejor = a; } }
  if (pct < UMBRAL_AVATAR) mejor = null;
  const avActualName = avatars.find(a => a.id === v.avatar_id)?.name || '';
  const avName = mejor?.name || avActualName;
  const cambia = !!(mejor && mejor.id !== v.avatar_id);
  const esEdicion = String(v.bucket_key || '').endsWith('_edit');
  // duplicado (por título, a nivel cliente)
  const kt = (v.title || '').trim().toLowerCase();
  const dup = !!(kt && ctx.cuenta[kt] > 1);
  if (dup) ctx.vistos[kt] = (ctx.vistos[kt] || 0) + 1;
  const dupSobrante = dup && ctx.vistos[kt] > 1;
  // título
  let titulo = null;
  if (esEdicion && avName) { const k = mejor?.id || v.avatar_id || avName; ctx.adCount[k] = (ctx.adCount[k] || 0) + 1; titulo = `${avName} · AD ${ctx.adCount[k]}`; }
  else {
    const pn = parseNombre(v.title);
    const partes = [];
    if (pn.angulo) partes.push(`Ángulo ${pn.angulo}`);
    if (pn.hook) partes.push(`Hook ${pn.hook}`);
    const base = avName || (partes.length ? '' : null);
    if (partes.length) titulo = base ? `${avName} · ${partes.join(' · ')}` : partes.join(' · ');
    else if (tw.size && avName) {
      const av = mejor || avatars.find(a => a.id === v.avatar_id);
      const presentes = (av?.hooks || []).filter(h => containment(h.words, tw) >= UMBRAL_HOOK).map(h => h.n);
      if (presentes.length) titulo = `${avName} · ${presentes.length === 1 ? `Hook ${presentes[0]}` : `Hooks ${rango(presentes)}`}`;
    }
  }
  const revisar = !titulo;
  if (revisar) titulo = '(para revisar)';
  return { id: v.id, tituloActual: v.title || '', avName: avName || '(sin avatar)', cambia, pct: Math.round(pct * 100), carpeta: esEdicion ? 'Edición' : 'Grabación', titulo, revisar, dupSobrante };
}

// Para un video SIN funnel (huérfano): lo matchea contra el DEL de CADA funnel del cliente
// y propone al que más se parece (funnel + avatar). Es la idea de Matías: la estrategia vieja
// mezclaba funnels, así que se resuelve por el guion de cada uno.
function filaOrfano(v, stratMap, ctx) {
  const tw = v.transcript && v.transcript.length > 120 ? palabras(v.transcript) : new Set();
  let best = null; // { sid, name, avatar, pct }
  if (tw.size) {
    for (const [sid, info] of Object.entries(stratMap)) {
      for (const a of (info.avatars || [])) {
        const c = containment(a.words, tw);
        if (!best || c > best.pct) best = { sid, name: info.name, avatar: a, pct: c };
      }
    }
  }
  const ok = !!(best && best.pct >= UMBRAL_AVATAR);
  const esEdicion = String(v.bucket_key || '').endsWith('_edit');
  const kt = (v.title || '').trim().toLowerCase();
  const dup = !!(kt && ctx.cuenta[kt] > 1);
  if (dup) ctx.vistos[kt] = (ctx.vistos[kt] || 0) + 1;
  const dupSobrante = dup && ctx.vistos[kt] > 1;
  let titulo = null;
  const avName = ok ? best.avatar.name : '';
  if (ok) {
    if (esEdicion) { const k = best.avatar.id; ctx.adCount[k] = (ctx.adCount[k] || 0) + 1; titulo = `${avName} · AD ${ctx.adCount[k]}`; }
    else {
      const pn = parseNombre(v.title); const partes = [];
      if (pn.angulo) partes.push(`Ángulo ${pn.angulo}`);
      if (pn.hook) partes.push(`Hook ${pn.hook}`);
      if (partes.length) titulo = `${avName} · ${partes.join(' · ')}`;
      else { const presentes = (best.avatar.hooks || []).filter(h => containment(h.words, tw) >= UMBRAL_HOOK).map(h => h.n); if (presentes.length) titulo = `${avName} · ${presentes.length === 1 ? `Hook ${presentes[0]}` : `Hooks ${rango(presentes)}`}`; }
    }
  }
  const revisar = !titulo;
  if (revisar) titulo = '(para revisar)';
  return {
    id: v.id, tituloActual: v.title || '', carpeta: esEdicion ? 'Edición' : 'Grabación',
    funnelPropuesto: ok ? best.name : null, avName: ok ? avName : '(sin match)',
    pct: best ? Math.round(best.pct * 100) : 0, titulo, revisar, dupSobrante, resuelto: ok,
  };
}

export default function OrganizarVideosPanel() {
  const [clients, setClients] = useState(null);
  const [cid, setCid] = useState('');
  const [data, setData] = useState(null); // { stratMap, videos }
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const rows = await sbFetch('clients?select=id,name&order=name.asc');
      setClients(Array.isArray(rows) ? rows : []);
    })();
  }, []);

  useEffect(() => {
    if (!cid) { setData(null); return; }
    let alive = true;
    setLoading(true); setData(null);
    (async () => {
      const [sps, vids] = await Promise.all([
        sbFetch(`strategy_pages?client_id=eq.${encodeURIComponent(cid)}&select=strategy_id,name,avatars`),
        sbFetch(`funnel_resources?client_id=eq.${encodeURIComponent(cid)}&provider=eq.bunny&kind=eq.video&select=id,strategy_id,avatar_id,bucket_key,transcript,title`),
      ]);
      if (!alive) return;
      const stratMap = {};
      for (const sp of (sps || [])) {
        const avatars = [];
        for (const a of (sp.avatars || [])) {
          const script = String(a?.ad_script || '');
          if (!script || !a?.id) continue;
          const hooks = script.split(/\n+/).map(s => s.trim()).filter(s => s.length > 40)
            .map((texto, i) => ({ n: i + 1, words: palabras(texto) })).filter(h => h.words.size >= 4);
          avatars.push({ id: String(a.id), name: String(a.name || ''), words: palabras(script), hooks });
        }
        stratMap[sp.strategy_id] = { name: sp.name || '(funnel sin nombre)', avatars };
      }
      setData({ stratMap, videos: vids || [] });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [cid]);

  // Agrupa por funnel (estrategia). Cada video se matchea SOLO contra su funnel.
  const grupos = useMemo(() => {
    if (!data) return [];
    const cuenta = {};
    for (const v of data.videos) { const k = (v.title || '').trim().toLowerCase(); if (k) cuenta[k] = (cuenta[k] || 0) + 1; }
    const porSid = {};
    for (const v of data.videos) { const s = v.strategy_id || '__none__'; (porSid[s] ||= []).push(v); }
    const orden = Object.keys(porSid).sort((a, b) => (a === '__none__' ? 1 : b === '__none__' ? -1 : porSid[b].length - porSid[a].length));
    return orden.map(sid => {
      const info = data.stratMap[sid];
      const avatars = info?.avatars || [];
      const ctx = { cuenta, vistos: {}, adCount: {} };
      const sinFunnel = sid === '__none__';
      const filas = sinFunnel
        ? porSid[sid].map(v => filaOrfano(v, data.stratMap, ctx))
        : porSid[sid].map(v => fila(v, avatars, ctx));
      return {
        sid, sinFunnel,
        name: sinFunnel ? 'Sin funnel asignado' : (info?.name || sid),
        filas,
        resumen: {
          total: filas.length,
          cambia: filas.filter(f => f.cambia).length,
          revisar: filas.filter(f => f.revisar).length,
          dup: filas.filter(f => f.dupSobrante).length,
          resueltos: filas.filter(f => f.resuelto).length,
        },
      };
    });
  }, [data]);

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 py-3 px-4">
          <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EEF2FF] text-[#4F46E5] shrink-0"><Wand2 size={15} /></span>
          <div className="min-w-0">
            <div className="text-[13px] font-bold text-[#1A1D26]">Organizar videos — preview</div>
            <div className="text-[11px] text-[#9098A4]">Por funnel: avatar y título de cada video, del guion de esa estrategia. Solo lectura.</div>
          </div>
          <select value={cid} onChange={e => setCid(e.target.value)}
            className="ml-auto shrink-0 text-[12px] font-semibold border border-[#E2E6EE] rounded-lg px-2.5 py-1.5 bg-white text-[#3F4653]">
            <option value="">Elegí un cliente…</option>
            {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      {loading && (
        <div className="rounded-xl border border-[#E7EAF0] bg-white py-8 text-center text-[12px] text-[#9098A4] flex items-center justify-center gap-2">
          <RefreshCw size={14} className="animate-spin" />Calculando…
        </div>
      )}

      {!loading && data && grupos.length === 0 && (
        <div className="rounded-xl border border-[#E7EAF0] bg-white py-10 text-center text-[12px] text-[#9098A4]">Este cliente no tiene videos en Bunny todavía.</div>
      )}

      {!loading && grupos.map(g => (
        <div key={g.sid} className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
          <div className={`flex items-center gap-2 py-2.5 px-4 border-b ${g.sinFunnel ? 'bg-[#FFF7ED] border-[#FCE9D2]' : 'bg-[#F7F8FA] border-[#EDF0F5]'}`}>
            {g.sinFunnel ? <AlertTriangle size={14} className="text-[#B45309]" /> : <Filter size={14} className="text-[#4F46E5]" />}
            <span className={`text-[12.5px] font-bold ${g.sinFunnel ? 'text-[#B45309]' : 'text-[#1A1D26]'}`}>{g.name}</span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              <Chip label="Videos" value={g.resumen.total} />
              {!g.sinFunnel && <Chip label="Corrige" value={g.resumen.cambia} color="#2563EB" />}
              {g.sinFunnel && <Chip label="Resueltos" value={g.resumen.resueltos} color="#15803D" />}
              <Chip label="Revisar" value={g.resumen.revisar} color="#B45309" />
              <Chip label="Dup" value={g.resumen.dup} color="#9333EA" />
            </div>
          </div>
          {g.sinFunnel && (
            <div className="px-4 py-2 text-[11px] text-[#B45309] bg-[#FFFBF5] border-b border-[#FCE9D2]">
              Estos videos no tienen funnel asignado en la migración → no se pueden atribuir a un avatar todavía. Hay que asignarles su estrategia primero.
            </div>
          )}
          <div className="overflow-auto max-h-[46vh]">
            <table className="w-full text-[12px]">
              <thead className="sticky top-0 bg-[#F7F8FA] text-[#6B7280] text-left">
                <tr>
                  <th className="py-2 px-3 font-semibold">Carpeta</th>
                  {g.sinFunnel && <th className="py-2 px-3 font-semibold">Funnel propuesto</th>}
                  <th className="py-2 px-3 font-semibold">Avatar</th>
                  <th className="py-2 px-3 font-semibold">Coinc.</th>
                  <th className="py-2 px-3 font-semibold">Nombre actual</th>
                  <th className="py-2 px-3 font-semibold">Título propuesto</th>
                </tr>
              </thead>
              <tbody>
                {g.filas.map(f => (
                  <tr key={f.id} className="border-t border-[#F0F2F6]">
                    <td className="py-1.5 px-3 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={f.carpeta === 'Edición' ? { color: '#6D28D9' } : { color: '#0369A1' }}>
                        <Film size={11} />{f.carpeta}
                      </span>
                    </td>
                    {g.sinFunnel && (
                      <td className="py-1.5 px-3">
                        {f.funnelPropuesto
                          ? <span className="text-[#4F46E5] font-semibold">{f.funnelPropuesto}</span>
                          : <span className="text-[#B45309]">— sin match —</span>}
                      </td>
                    )}
                    <td className="py-1.5 px-3">
                      <span className="text-[#3F4653] font-medium">{f.avName}</span>
                      {f.cambia && <span className="ml-1.5 text-[10px] font-bold text-[#2563EB]">corrige</span>}
                    </td>
                    <td className="py-1.5 px-3 text-[#6B7280]">{f.pct ? `${f.pct}%` : '—'}</td>
                    <td className="py-1.5 px-3 max-w-[220px]">
                      <span className="text-[#9098A4] truncate inline-block max-w-[160px] align-middle" title={f.tituloActual}>{f.tituloActual || '—'}</span>
                      {f.dupSobrante && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-[#9333EA] align-middle"><Copy size={10} />duplicado</span>}
                    </td>
                    <td className="py-1.5 px-3">
                      {f.revisar
                        ? <span className="inline-flex items-center gap-1 text-[#B45309] font-semibold"><AlertTriangle size={11} />{f.titulo}</span>
                        : <span className="text-[#1A1D26] font-medium">{f.titulo}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {!loading && !data && (
        <div className="rounded-xl border border-[#E7EAF0] bg-white py-10 text-center text-[12px] text-[#9098A4]">Elegí un cliente para ver cómo quedarían organizados sus videos, por funnel.</div>
      )}
    </div>
  );
}

function Chip({ label, value, color = '#6B7280' }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg bg-[#F4F5F7] px-2.5 py-1 text-[11px] font-semibold text-[#3F4653]">
      {label}: <span style={{ color }}>{value}</span>
    </span>
  );
}
