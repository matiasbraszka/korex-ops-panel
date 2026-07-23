// supabase/functions/migrar-fotos/index.ts
// Migra un LOTE de fotos del Drive → Supabase Storage, ordenadas en categorías. Corre en el
// servidor (lo llama un cron cada minuto) para terminar la migración SIN depender de la PC.
// Marca cada nodo con client_drive_nodes.migrated_at para no repetir. Video NO (eso va a Bunny).
//
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.
// Secret usado: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (inyectados). Drive token vía Apps Script.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const BUCKET = "funnel-recursos";
const BATCH = 35;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const safe = (s: string) => String(s || "archivo").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

function segCat(p: string): string | null {
  if (/testimoni/.test(p)) return "testimonios";
  if (/(vsl|angulo|tarima|guion)/.test(p)) return /(terminad|editad|\bfinal|listo)/.test(p) ? "vsl_edit" : "vsl_rec";
  if (/(anuncio|publi|\bcta\b|cuerpo|marketing|creativ|\bads?\b|reel)/.test(p)) return /(terminad|editad|\bfinal|listo|ganador)/.test(p) ? "ad_edit" : "ad_rec";
  if (/(estilo de vida|lifestyle|viaje|escenario|evento|convenci|photoshoot|sesion|isla|mediterran|bali|italia|suiza|espana|lisboa|reino unido|albania|crucero|cruise|vacacion|playa|hotel|griega|paris|dubai|mundo)/.test(p)) return "estilo_vida";
  if (/producto/.test(p)) return "productos";
  if (/(branding|logo|color|mural|portada|instagram|facebook|\bmarca\b)/.test(p)) return "branding";
  if (/(autoridad|profesional)/.test(p)) return "autoridad";
  if (/(empresa|company|fabrica|stock|oficina)/.test(p)) return "empresa";
  if (/(grabacion|grabados|repetid|tomas|b ?roll|apoyo|editad|terminad)/.test(p)) return "ad_rec";
  return null;
}
// deno-lint-ignore no-explicit-any
function classify(node: any, fById: Record<string, any>, avByStrat: Record<string, any[]>) {
  const segs: string[] = []; let n = fById[node.parent_id], h = 0;
  while (n && h < 14) { segs.unshift(n.name); n = fById[n.parent_id]; h++; }
  let bucket = "sin_clasif";
  for (let i = segs.length - 1; i >= 0; i--) { const k = segCat(norm(segs[i])); if (k) { bucket = k; break; } }
  if (bucket === "testimonios" && node.strategy_id) return { bucket, strategy_id: node.strategy_id, avatar_id: null };
  return { bucket, strategy_id: null, avatar_id: null };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE))) return json({ ok: false, error: "no autorizado" }, 401);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    // 1) próximo cliente con fotos pendientes
    const { data: pend } = await sb.from("client_drive_nodes").select("client_id").eq("node_type", "image").is("migrated_at", null).limit(1);
    if (!pend?.length) { await sb.rpc("migrar_fotos_finalizar").catch(() => {}); return json({ ok: true, done: 0, remaining: 0, msg: "terminado — cron apagado" }); }
    const CID = pend[0].client_id;

    // 2) árbol de carpetas + avatares de ese cliente
    const { data: folders } = await sb.from("client_drive_nodes").select("id,name,parent_id").eq("client_id", CID).eq("node_type", "folder");
    const fById: Record<string, unknown> = {}; for (const f of (folders || [])) fById[(f as { id: string }).id] = f;
    const { data: sps } = await sb.from("strategy_pages").select("strategy_id,avatars").eq("client_id", CID);
    const avByStrat: Record<string, unknown[]> = {}; for (const s of (sps || [])) if ((s as { strategy_id: string }).strategy_id) avByStrat[(s as { strategy_id: string }).strategy_id] = (s as { avatars: unknown[] }).avatars || [];

    // 3) token de Drive (Apps Script)
    const { data: cfg } = await sb.from("app_settings").select("value").eq("key", "venta_form_config").single();
    // deno-lint-ignore no-explicit-any
    const v: any = cfg?.value || {};
    const tok = await fetch(v.appscript_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: v.appscript_secret, action: "get_drive_token" }) }).then((r) => r.json());
    const TOKEN = tok.token;
    if (!TOKEN) return json({ ok: false, error: "sin token de Drive" }, 500);

    // 4) RESERVAR el lote antes de procesar (marca migrated_at ya, para que otra corrida del
    //    cron no agarre las mismas). Si una falla, se le vuelve a poner null para reintentar.
    const { data: ids0 } = await sb.from("client_drive_nodes").select("id").eq("client_id", CID).eq("node_type", "image").is("migrated_at", null).limit(BATCH);
    const ids = (ids0 || []).map((x) => (x as { id: string }).id);
    if (!ids.length) return json({ ok: true, done: 0, remaining: null, msg: "sin lote" });
    await sb.from("client_drive_nodes").update({ migrated_at: new Date().toISOString() }).in("id", ids);
    const { data: batch } = await sb.from("client_drive_nodes").select("id,name,parent_id,mime_type,size_bytes,strategy_id").in("id", ids);
    let ok = 0, err = 0;
    for (const node of (batch || [])) {
      try {
        // deno-lint-ignore no-explicit-any
        const dest = classify(node as any, fById as any, avByStrat as any);
        const res = await fetch(`https://www.googleapis.com/drive/v3/files/${(node as { id: string }).id}?alt=media&supportsAllDrives=true`, { headers: { Authorization: "Bearer " + TOKEN } });
        if (!res.ok) throw new Error("drive " + res.status);
        const buf = new Uint8Array(await res.arrayBuffer());
        const nm = (node as { name: string }).name;
        const path = `cliente/${CID}/${dest.bucket}/${Date.now()}_${safe(nm)}`;
        const mime = (node as { mime_type?: string }).mime_type || "image/jpeg";
        const up = await sb.storage.from(BUCKET).upload(path, buf, { contentType: mime, upsert: false });
        if (up.error) throw new Error("storage " + up.error.message);
        const pub = sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
        await sb.from("funnel_resources").insert({ strategy_id: dest.strategy_id, client_id: CID, avatar_id: dest.avatar_id, bucket_key: dest.bucket, title: nm.replace(/\.[^.]+$/, ""), provider: "supabase", storage_path: path, public_url: pub, mime_type: mime, kind: "image", size_bytes: (node as { size_bytes?: number }).size_bytes || null });
        ok++;
      } catch (_e) { err++; await sb.from("client_drive_nodes").update({ migrated_at: null }).eq("id", (node as { id: string }).id); }
    }
    const { count } = await sb.from("client_drive_nodes").select("*", { count: "exact", head: true }).eq("node_type", "image").is("migrated_at", null);
    return json({ ok: true, client: CID, done: ok, err, remaining: count ?? null });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
