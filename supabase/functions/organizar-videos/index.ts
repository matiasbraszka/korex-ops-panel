// supabase/functions/organizar-videos/index.ts
// El "cerebro" que organiza y TITULA los videos ya subidos a Bunny. Por cada video:
//
//   1) AVATAR por texto (GRATIS): compara la transcripción contra el ad_script de cada
//      avatar del DEL. Coincidencia ≥70% → ese avatar, sin gastar tokens. La IA
//      (detectar-avatar) queda de respaldo para el video que no sigue ningún guion.
//
//   2) TÍTULO descriptivo estándar: usando la estructura del guion (parsear-guion, 1 vez
//      por avatar) detecta QUÉ hooks/textos base dice el video y arma el título:
//        · grabación  → "Financiero · Ángulo 1 · Hook 3"  (o "Hooks 1-4 + Texto base 1")
//        · edición    → "Financiero · AD 1"  (numerado secuencial por avatar)
//      Si nada matchea con confianza → título "(para revisar)" y flag: NO inventa.
//
//   3) GRABACIÓN vs EDICIÓN: detectar-subtitulos (visión). Con subtítulos → …_edit; sin → …_rec.
//
// Modos (POST JSON):
//   { client_id, dry_run:true }            → PREVIEW: avatar + título (usa el bucket actual para
//                                            rec/edit). Lee los guiones (unas pocas llamadas, centavos,
//                                            una vez). No escribe, no corre subtítulos.
//   { client_id, dry_run:false, limit:10 } → APLICA: setea avatar, corre subtítulos (con pausas),
//                                            refina bucket_key, escribe título y guarda.
//
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const TOKEN = DETECT_TOKEN || SERVICE_ROLE; // para llamar a las funciones hermanas

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UMBRAL_AVATAR = 0.70;   // coincidencia mínima para confiar el avatar
const UMBRAL_SEG = 0.60;      // un segmento está "presente" si el video lo dice en ≥60%

// Texto → set de palabras normalizadas (minúsculas, sin acentos, ≥5 letras).
function palabras(txt: string): Set<string> {
  return new Set((txt || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 5));
}
// Qué fracción de las palabras de A aparecen en B.
function containment(a: Set<string>, b: Set<string>): number {
  if (!a.size) return 0;
  let hit = 0; for (const w of a) if (b.has(w)) hit++;
  return hit / a.size;
}
// [1,2,3,5] → "1-3, 5"
function rango(nums: number[]): string {
  const s = [...new Set(nums)].sort((x, y) => x - y);
  const out: string[] = []; let i = 0;
  while (i < s.length) {
    let j = i; while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? `${s[i]}` : `${s[i]}-${s[j]}`);
    i = j + 1;
  }
  return out.join(", ");
}

type Seg = { angulo: string; tipo: string; numero: number; texto: string; words: Set<string> };

// Arma el título descriptivo de una grabación a partir de los segmentos presentes.
function tituloGrabacion(avatarName: string, presentes: Seg[]): string | null {
  if (!presentes.length) return null;
  const porAngulo = new Map<string, { hooks: number[]; textos: number[] }>();
  for (const s of presentes) {
    if (!porAngulo.has(s.angulo)) porAngulo.set(s.angulo, { hooks: [], textos: [] });
    const g = porAngulo.get(s.angulo)!;
    (s.tipo === "hook" ? g.hooks : g.textos).push(s.numero);
  }
  const partes: string[] = [];
  for (const [ang, g] of porAngulo) {
    const seg: string[] = [];
    if (g.hooks.length) seg.push(g.hooks.length === 1 ? `Hook ${g.hooks[0]}` : `Hooks ${rango(g.hooks)}`);
    if (g.textos.length) seg.push(g.textos.length === 1 ? `Texto base ${g.textos[0]}` : `Textos base ${rango(g.textos)}`);
    const label = seg.join(" + ");
    partes.push(ang && ang.toLowerCase() !== "general" ? `${ang} · ${label}` : label);
  }
  return `${avatarName} · ${partes.join(" | ")}`;
}

function familia(bucket: string): "ad" | "vsl" | null {
  if (bucket === "ad_rec" || bucket === "ad_edit") return "ad";
  if (bucket === "vsl_rec" || bucket === "vsl_edit") return "vsl";
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE))) return json({ ok: false, error: "no autorizado" }, 401);

    const body = await req.json().catch(() => ({}));
    const CID = String(body.client_id || "");
    const dry = body.dry_run !== false;
    const LIMIT = Math.max(1, Math.min(50, Number(body.limit) || 10));
    if (!CID) return json({ ok: false, error: "falta client_id" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Avatares del cliente: palabras del guion (para el avatar) + segmentos (para el título).
    const { data: sps } = await sb.from("strategy_pages").select("strategy_id,avatars").eq("client_id", CID);
    type Av = { avatar_id: string; name: string; words: Set<string>; segs: Seg[] };
    const porStrat: Record<string, Av[]> = {};
    const todos: Av[] = [];
    for (const sp of (sps || [])) {
      const list: Av[] = [];
      for (const a of (((sp as { avatars?: unknown[] }).avatars) || []) as Record<string, unknown>[]) {
        const script = String(a?.ad_script || "");
        const avatar_id = String(a?.id || "");
        if (!script || !avatar_id) continue;
        // parsear-guion (1 vez por avatar) → segmentos
        let segs: Seg[] = [];
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/parsear-guion`, {
            method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ ad_script: script }),
          }).then((x) => x.json());
          if (r?.ok && Array.isArray(r.segmentos)) {
            segs = r.segmentos.map((s: Record<string, unknown>) => ({
              angulo: String(s.angulo || "General"), tipo: String(s.tipo || "hook"),
              numero: Number(s.numero || 0), texto: String(s.texto || ""), words: palabras(String(s.texto || "")),
            })).filter((s: Seg) => s.words.size >= 4);
          }
        } catch { /* sin parseo → título por avatar sin detalle */ }
        const av: Av = { avatar_id, name: String(a?.name || ""), words: palabras(script), segs };
        if (av.words.size) { list.push(av); todos.push(av); }
      }
      if (list.length) porStrat[(sp as { strategy_id: string }).strategy_id] = list;
    }

    // Videos del cliente en Bunny.
    let q = sb.from("funnel_resources")
      .select("id,bunny_id,strategy_id,avatar_id,bucket_key,transcript,title")
      .eq("client_id", CID).eq("provider", "bunny").eq("kind", "video");
    if (!dry) q = q.limit(LIMIT);
    const { data: vids } = await q;

    const adCounter: Record<string, number> = {}; // AD n por avatar (ediciones)
    const plan: Record<string, unknown>[] = [];
    let avatarCambia = 0, bucketCambia = 0, subtituloCorridos = 0, paraRevisar = 0;

    for (const v of (vids || [])) {
      const row = v as { id: string; bunny_id: string; strategy_id: string | null; avatar_id: string | null; bucket_key: string | null; transcript: string | null; title: string | null };
      const cands = (row.strategy_id && porStrat[row.strategy_id]) ? porStrat[row.strategy_id] : todos;
      const tw = row.transcript && row.transcript.length > 120 ? palabras(row.transcript) : new Set<string>();

      // ── 1) Avatar por texto ──
      let elegido: Av | null = null, pct = 0;
      if (tw.size && cands.length) {
        for (const a of cands) { const c = containment(a.words, tw); if (c > pct) { pct = c; elegido = a; } }
        if (pct < UMBRAL_AVATAR) elegido = null;
      }
      const avatarUsado = elegido?.avatar_id || row.avatar_id;
      const avatarName = elegido?.name || cands.find((a) => a.avatar_id === row.avatar_id)?.name || "";
      const avatarChange = !!(elegido && elegido.avatar_id !== row.avatar_id);
      if (avatarChange) avatarCambia++;

      // ── 3) Grabación vs edición (subtítulos, solo al aplicar y solo familias ad/vsl) ──
      const fam = familia(row.bucket_key || "");
      let subtitulado: boolean | null = null, nuevoBucket: string | null = null;
      if (!dry && fam && row.bunny_id) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/detectar-subtitulos`, {
            method: "POST", headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify({ bunny_id: row.bunny_id }),
          }).then((x) => x.json());
          if (r?.ok) { subtitulado = !!r.subtitulado; subtituloCorridos++; nuevoBucket = `${fam}_${subtitulado ? "edit" : "rec"}`; }
        } catch { /* sin subtítulo → no tocamos el bucket */ }
        await sleep(400);
      }
      const bucketChange = !!(nuevoBucket && nuevoBucket !== row.bucket_key);
      if (bucketChange) bucketCambia++;

      // ¿es edición? en apply lo dice el subtítulo; en preview, el bucket actual.
      const esEdicion = subtitulado !== null ? subtitulado : (row.bucket_key || "").endsWith("_edit");

      // ── 2) Título ──
      let titulo: string | null = null;
      const segAv = elegido?.segs || cands.find((a) => a.avatar_id === avatarUsado)?.segs || [];
      const presentes = tw.size ? segAv.filter((s) => containment(s.words, tw) >= UMBRAL_SEG) : [];
      if (esEdicion && avatarName) {
        adCounter[avatarUsado || avatarName] = (adCounter[avatarUsado || avatarName] || 0) + 1;
        titulo = `${avatarName} · AD ${adCounter[avatarUsado || avatarName]}`;
      } else if (presentes.length && avatarName) {
        titulo = tituloGrabacion(avatarName, presentes);
      }
      if (!titulo) { titulo = "(para revisar)"; paraRevisar++; }

      // ── Escribir (solo al aplicar) ──
      if (!dry) {
        const upd: Record<string, unknown> = { title: titulo };
        if (avatarChange) { upd.avatar_id = elegido!.avatar_id; upd.avatar_auto = true; }
        if (bucketChange) upd.bucket_key = nuevoBucket;
        await sb.from("funnel_resources").update(upd).eq("id", row.id);
      }

      plan.push({
        video: row.id, avatar: avatarName || "(sin avatar)", coincidencia_pct: Math.round(pct * 100),
        avatar_cambia: avatarChange, bucket_actual: row.bucket_key, subtitulado, bucket_nuevo: nuevoBucket,
        titulo, para_revisar: titulo === "(para revisar)",
      });
    }

    return json({
      ok: true, dry_run: dry, cliente: CID, videos: plan.length,
      resumen: { avatar_cambia: avatarCambia, bucket_cambia: bucketCambia, subtitulos_corridos: subtituloCorridos, para_revisar: paraRevisar },
      plan,
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
