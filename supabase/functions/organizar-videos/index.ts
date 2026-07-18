// supabase/functions/organizar-videos/index.ts
// El "cerebro" que organiza los videos ya subidos a Bunny en la carpeta correcta.
// Para cada video de un cliente hace dos cosas:
//
//   1) AVATAR por texto (GRATIS, sin IA): compara la transcripción (que Bunny generó)
//      contra el guion de anuncio (ad_script) de cada avatar del DEL. Si coincide ≥70%,
//      ese es el avatar — con certeza y sin gastar tokens. La IA (detectar-avatar) queda
//      solo para el video raro que no sigue ningún guion.
//
//   2) GRABACIÓN vs EDICIÓN: llama a detectar-subtitulos (Claude visión sobre la grilla
//      de Bunny). Si tiene subtítulos quemados → es una edición (…_edit); si no → grabación
//      (…_rec). Con eso refina el bucket_key SIN cambiar la familia (ad/vsl) ni tocar
//      testimonios ni lo que no se puede clasificar.
//
// Modos (POST JSON):
//   { client_id, dry_run:true }                → PREVIEW gratis: solo el match de avatar por
//                                                texto; devuelve qué cambiaría, no escribe, no
//                                                llama a Bunny ni a la IA.
//   { client_id, dry_run:false, limit:10 }     → APLICA: setea avatar, corre el subtítulo
//                                                (con pausas), refina bucket_key y guarda.
//
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const UMBRAL = 0.70; // coincidencia mínima para confiar en el match de texto

// Normaliza un texto a un set de palabras (minúsculas, sin acentos, ≥5 letras) — igual que
// la demo en SQL. Palabras cortas (el, de, que…) se descartan para no meter ruido.
function palabras(txt: string): Set<string> {
  const norm = (txt || "").toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/).filter((w) => w.length >= 5);
  return new Set(norm);
}
// Containment: qué fracción de las palabras de la transcripción aparecen en el guion.
function coincidencia(trans: Set<string>, guion: Set<string>): number {
  if (!trans.size) return 0;
  let hit = 0;
  for (const w of trans) if (guion.has(w)) hit++;
  return hit / trans.size;
}

// De ad_rec/ad_edit/vsl_rec/vsl_edit saca la familia (ad|vsl). Otras carpetas → null
// (no se les toca el rec/edit: testimonios no aplica, sin_clasif no sabemos ad vs vsl).
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
    const dry = body.dry_run !== false; // por defecto, preview
    const LIMIT = Math.max(1, Math.min(50, Number(body.limit) || 10));
    if (!CID) return json({ ok: false, error: "falta client_id" }, 400);

    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Avatares del cliente (con su guion en palabras), agrupados por estrategia + una bolsa global.
    const { data: sps } = await sb.from("strategy_pages").select("strategy_id,avatars").eq("client_id", CID);
    type Av = { avatar_id: string; name: string; words: Set<string> };
    const porStrat: Record<string, Av[]> = {};
    const todos: Av[] = [];
    for (const sp of (sps || [])) {
      const list: Av[] = [];
      for (const a of (((sp as { avatars?: unknown[] }).avatars) || []) as Record<string, unknown>[]) {
        const script = String(a?.ad_script || "");
        if (!script) continue;
        const av: Av = { avatar_id: String(a?.id || ""), name: String(a?.name || ""), words: palabras(script) };
        if (av.avatar_id && av.words.size) { list.push(av); todos.push(av); }
      }
      if (list.length) porStrat[(sp as { strategy_id: string }).strategy_id] = list;
    }

    // Videos del cliente en Bunny. En preview miramos todos; al aplicar, un lote.
    let q = sb.from("funnel_resources")
      .select("id,bunny_id,strategy_id,avatar_id,bucket_key,transcript")
      .eq("client_id", CID).eq("provider", "bunny").eq("kind", "video");
    if (!dry) q = q.limit(LIMIT);
    const { data: vids } = await q;

    const plan: Record<string, unknown>[] = [];
    let avatarCambia = 0, subtituloCorridos = 0, bucketCambia = 0;

    for (const v of (vids || [])) {
      const row = v as { id: string; bunny_id: string; strategy_id: string | null; avatar_id: string | null; bucket_key: string | null; transcript: string | null };
      const cands = (row.strategy_id && porStrat[row.strategy_id]) ? porStrat[row.strategy_id] : todos;

      // ── 1) Avatar por texto (gratis) ──
      let nuevoAvatar: string | null = null, pct = 0, avatarName = "";
      if (row.transcript && row.transcript.length > 120 && cands.length) {
        const tw = palabras(row.transcript);
        for (const a of cands) {
          const c = coincidencia(tw, a.words);
          if (c > pct) { pct = c; nuevoAvatar = a.avatar_id; avatarName = a.name; }
        }
        if (pct < UMBRAL) nuevoAvatar = null; // no confiable → queda para la IA
      }
      const avatarChange = nuevoAvatar && nuevoAvatar !== row.avatar_id;
      if (avatarChange) avatarCambia++;

      // ── 2) Grabación vs edición (subtítulos) — solo al aplicar y solo familias ad/vsl ──
      const fam = familia(row.bucket_key || "");
      let subtitulado: boolean | null = null, nuevoBucket: string | null = null;
      if (!dry && fam && row.bunny_id) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/detectar-subtitulos`, {
            method: "POST",
            headers: { authorization: `Bearer ${DETECT_TOKEN || SERVICE_ROLE}`, "content-type": "application/json" },
            body: JSON.stringify({ bunny_id: row.bunny_id }),
          }).then((x) => x.json());
          if (r?.ok) {
            subtitulado = !!r.subtitulado;
            subtituloCorridos++;
            const suf = subtitulado ? "edit" : "rec";
            nuevoBucket = `${fam}_${suf}`;
          }
        } catch { /* sin subtítulo → no tocamos el bucket */ }
        await sleep(400); // pausa: goteo suave hacia Bunny/Anthropic
      }
      const bucketChange = nuevoBucket && nuevoBucket !== row.bucket_key;
      if (bucketChange) bucketCambia++;

      // ── Escribir (solo al aplicar) ──
      if (!dry && (avatarChange || bucketChange)) {
        const upd: Record<string, unknown> = {};
        if (avatarChange) { upd.avatar_id = nuevoAvatar; upd.avatar_auto = true; }
        if (bucketChange) upd.bucket_key = nuevoBucket;
        await sb.from("funnel_resources").update(upd).eq("id", row.id);
      }

      plan.push({
        video: row.id,
        avatar_actual: row.avatar_id, avatar_nuevo: nuevoAvatar, avatar_name: avatarName,
        coincidencia_pct: Math.round(pct * 100),
        bucket_actual: row.bucket_key, subtitulado, bucket_nuevo: nuevoBucket,
      });
    }

    return json({
      ok: true, dry_run: dry, cliente: CID, videos: plan.length,
      resumen: { avatar_cambia: avatarCambia, bucket_cambia: bucketCambia, subtitulos_corridos: subtituloCorridos },
      plan: dry ? plan : plan.filter((p) => p.avatar_nuevo || p.bucket_nuevo),
    });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
