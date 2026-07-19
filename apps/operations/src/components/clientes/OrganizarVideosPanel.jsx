// OrganizarVideosPanel — PREVIEW local del organizador de videos (Recursos).
//
// Muestra, por cada video ya subido a Bunny de un cliente, qué avatar le corresponde
// (por match de la transcripción contra el ad_script del DEL) y qué título tendría, con
// el flag "para revisar" cuando no matchea con confianza. Es SOLO LECTURA y se calcula
// en el navegador: no escribe nada, no publica funciones, no gasta tokens. Sirve para
// ver cómo queda antes de conectar el organizador real (que además detecta subtítulos y
// numera las ediciones con IA del lado del servidor).
import { useEffect, useMemo, useState } from 'react';
import { sbFetch } from '@korex/db';
import { RefreshCw, Film, Wand2, AlertTriangle, Copy } from 'lucide-react';

const UMBRAL_AVATAR = 0.70; // coincidencia mínima para confiar el avatar
const UMBRAL_HOOK = 0.60;   // un hook está "presente" si el video lo dice en ≥60%

// texto → set de palabras normalizadas (minúsculas, sin acentos, ≥5 letras)
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
// Del nombre del archivo (convención del editor: "h2-c1-cta2" = Hook 2, ángulo 1) saca
// hook y ángulo si están. Señal fuerte, sin IA — se usa cuando el nombre lo dice claro.
function parseNombre(title) {
  const t = String(title || '').toLowerCase();
  const h = t.match(/\bh(\d{1,2})\b/);
  const c = t.match(/\bc(\d{1,2})\b/);
  return { hook: h ? Number(h[1]) : null, angulo: c ? Number(c[1]) : null };
}

export default function OrganizarVideosPanel() {
  const [clients, setClients] = useState(null);
  const [cid, setCid] = useState('');
  const [data, setData] = useState(null); // { avatars, videos }
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
        sbFetch(`strategy_pages?client_id=eq.${encodeURIComponent(cid)}&select=strategy_id,avatars`),
        sbFetch(`funnel_resources?client_id=eq.${encodeURIComponent(cid)}&provider=eq.bunny&kind=eq.video&select=id,strategy_id,avatar_id,bucket_key,transcript,title`),
      ]);
      if (!alive) return;
      // avatares con: palabras del guion (para avatar) + hooks (párrafos, para título)
      const avatars = [];
      for (const sp of (sps || [])) {
        for (const a of (sp.avatars || [])) {
          const script = String(a?.ad_script || '');
          if (!script || !a?.id) continue;
          const hooks = script.split(/\n+/).map(s => s.trim()).filter(s => s.length > 40)
            .map((texto, i) => ({ n: i + 1, words: palabras(texto) }))
            .filter(h => h.words.size >= 4);
          avatars.push({ id: String(a.id), name: String(a.name || ''), words: palabras(script), hooks });
        }
      }
      setData({ avatars, videos: vids || [] });
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [cid]);

  const filas = useMemo(() => {
    if (!data) return [];
    // conteo por título → marcar duplicados (2do+ con el mismo nombre)
    const cuenta = {};
    for (const v of data.videos) { const k = (v.title || '').trim().toLowerCase(); if (k) cuenta[k] = (cuenta[k] || 0) + 1; }
    const vistos = {}, adCount = {};
    return data.videos.map(v => {
      const tw = v.transcript && v.transcript.length > 120 ? palabras(v.transcript) : new Set();
      // avatar por texto
      let mejor = null, pct = 0;
      if (tw.size) for (const a of data.avatars) { const c = containment(a.words, tw); if (c > pct) { pct = c; mejor = a; } }
      if (pct < UMBRAL_AVATAR) mejor = null;
      const avActualName = data.avatars.find(a => a.id === v.avatar_id)?.name || '';
      const avName = mejor?.name || avActualName;
      const cambia = !!(mejor && mejor.id !== v.avatar_id);
      const esEdicion = String(v.bucket_key || '').endsWith('_edit');
      // duplicado: la 2da+ copia con el mismo título es la sobrante
      const kt = (v.title || '').trim().toLowerCase();
      const dup = !!(kt && cuenta[kt] > 1);
      if (dup) vistos[kt] = (vistos[kt] || 0) + 1;
      const dupSobrante = dup && vistos[kt] > 1;
      // título
      let titulo = null;
      if (esEdicion && avName) { const k = mejor?.id || v.avatar_id || avName; adCount[k] = (adCount[k] || 0) + 1; titulo = `${avName} · AD ${adCount[k]}`; }
      else {
        const pn = parseNombre(v.title); // 1) señal fuerte del nombre (h#/c#)
        const partes = [];
        if (pn.angulo) partes.push(`Ángulo ${pn.angulo}`);
        if (pn.hook) partes.push(`Hook ${pn.hook}`);
        if (partes.length && avName) titulo = `${avName} · ${partes.join(' · ')}`;
        else if (tw.size && (mejor || avActualName)) { // 2) match de la transcripción
          const av = mejor || data.avatars.find(a => a.id === v.avatar_id);
          const presentes = (av?.hooks || []).filter(h => containment(h.words, tw) >= UMBRAL_HOOK).map(h => h.n);
          if (presentes.length) titulo = `${avName} · ${presentes.length === 1 ? `Hook ${presentes[0]}` : `Hooks ${rango(presentes)}`}`;
        }
      }
      const revisar = !titulo;
      if (revisar) titulo = '(para revisar)';
      return { id: v.id, tituloActual: v.title || '', avName: avName || '(sin avatar)', cambia, pct: Math.round(pct * 100), carpeta: esEdicion ? 'Edición' : 'Grabación', titulo, revisar, dupSobrante };
    });
  }, [data]);

  const resumen = useMemo(() => ({
    total: filas.length,
    cambia: filas.filter(f => f.cambia).length,
    revisar: filas.filter(f => f.revisar).length,
    dup: filas.filter(f => f.dupSobrante).length,
  }), [filas]);

  return (
    <div className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 py-3 px-4 border-b border-[#EDF0F5]">
        <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-[#EEF2FF] text-[#4F46E5] shrink-0"><Wand2 size={15} /></span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#1A1D26]">Organizar videos — preview</div>
          <div className="text-[11px] text-[#9098A4]">Avatar y título de cada video, calculado del guion. Solo lectura: no cambia nada todavía.</div>
        </div>
        <select value={cid} onChange={e => setCid(e.target.value)}
          className="ml-auto shrink-0 text-[12px] font-semibold border border-[#E2E6EE] rounded-lg px-2.5 py-1.5 bg-white text-[#3F4653]">
          <option value="">Elegí un cliente…</option>
          {(clients || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {loading && (
        <div className="py-8 text-center text-[12px] text-[#9098A4] flex items-center justify-center gap-2">
          <RefreshCw size={14} className="animate-spin" />Calculando…
        </div>
      )}

      {!loading && data && (
        <>
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-[#EDF0F5]">
            <Chip label="Videos" value={resumen.total} />
            <Chip label="Corrige avatar" value={resumen.cambia} color="#2563EB" />
            <Chip label="Para revisar" value={resumen.revisar} color="#B45309" />
            <Chip label="Duplicados" value={resumen.dup} color="#9333EA" />
          </div>
          {filas.length === 0 ? (
            <div className="py-10 text-center text-[12px] text-[#9098A4]">Este cliente no tiene videos en Bunny todavía.</div>
          ) : (
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-[12px]">
                <thead className="sticky top-0 bg-[#F7F8FA] text-[#6B7280] text-left">
                  <tr>
                    <th className="py-2 px-3 font-semibold">Carpeta</th>
                    <th className="py-2 px-3 font-semibold">Avatar</th>
                    <th className="py-2 px-3 font-semibold">Coinc.</th>
                    <th className="py-2 px-3 font-semibold">Nombre actual</th>
                    <th className="py-2 px-3 font-semibold">Título propuesto</th>
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => (
                    <tr key={f.id} className="border-t border-[#F0F2F6]">
                      <td className="py-1.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold" style={f.carpeta === 'Edición' ? { color: '#6D28D9' } : { color: '#0369A1' }}>
                          <Film size={11} />{f.carpeta}
                        </span>
                      </td>
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
          )}
        </>
      )}

      {!loading && !data && (
        <div className="py-10 text-center text-[12px] text-[#9098A4]">Elegí un cliente para ver cómo quedarían organizados sus videos.</div>
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
