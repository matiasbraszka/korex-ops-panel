// supabase/functions/migrar-videos/index.ts
// Migra un LOTE de VIDEOS del Drive → Bunny Stream, SIN que el archivo pase por acá: le
// pedimos a Bunny que baje el video directo del Drive (fetch server-side de Bunny). Bunny
// lo procesa y lo TRANSCRIBE solo. Corre por cron, con pausas (Bunny bloquea si le pegás
// en ráfaga). El ORDEN (avatar/funnel/título/edición) NO se hace acá — eso lo hace después
// organizar-videos con el DEL. Acá solo movemos + registramos.
//
// Marca client_drive_nodes.migrated_at para no repetir. Registra cada video en
// funnel_resources (provider='bunny', bunny_id=guid). El bucket_key sale de la carpeta
// (igual que migrar-fotos); organizar-videos lo refina luego.
//
// Body (POST JSON): { client_id?, limit? }  ·  sin client_id, toma el próximo cliente con videos pendientes.
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.
// Secrets: SUPABASE_URL/SERVICE_ROLE_KEY, BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_HOSTNAME.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const BUNNY_KEY = Deno.env.get("BUNNY_API_KEY") ?? "";
const BUNNY_LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const V = "https://video.bunnycdn.com/library";
const BATCH_MAX = 5; // pocos por corrida: Bunny bloquea en ráfaga

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// Clasificación por carpeta (misma idea que migrar-fotos). organizar-videos la refina después.
function segCat(p: string): string | null {
  if (/testimoni/.test(p)) return "testimonios";
  if (/(vsl|angulo|tarima|guion)/.test(p)) return /(terminad|editad|\bfinal|listo)/.test(p) ? "vsl_edit" : "vsl_rec";
  if (/(anuncio|publi|\bcta\b|cuerpo|marketing|creativ|\bads?\b|reel)/.test(p)) return /(terminad|editad|\bfinal|listo|ganador)/.test(p) ? "ad_edit" : "ad_rec";
  if (/producto/.test(p)) return "productos";
  if (/(branding|logo|color|portada|\bmarca\b)/.test(p)) return "branding";
  if (/(grabacion|grabados|repetid|tomas|b ?roll|apoyo|editad|terminad)/.test(p)) return "ad_rec";
  return null;
}
// deno-lint-ignore no-explicit-any
function bucketDe(node: any, fById: Record<string, any>): string {
  const segs: string[] = []; let n = fById[node.parent_id], h = 0;
  while (n && h < 14) { segs.unshift(n.name); n = fById[n.parent_id]; h++; }
  for (let i = segs.length - 1; i >= 0; i--) { const k = segCat(norm(segs[i])); if (k) return k; }
  return "sin_clasif";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const auth = (req.headers.get("authorization") || "").replace("Bearer ", "").trim();
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE))) return json({ ok: false, error: "no autorizado" }, 401);
    if (!BUNNY_KEY || !BUNNY_LIB) return json({ ok: false, error: "bunny_not_configured" }, 500);
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE);

    const body = await req.json().catch(() => ({}));
    let CID = String(body.client_id || "");
    const LIMIT = Math.max(1, Math.min(BATCH_MAX, Number(body.limit) || BATCH_MAX));

    // 1) cliente objetivo (el pedido, o el próximo con videos pendientes)
    if (!CID) {
      const { data } = await sb.from("client_drive_nodes").select("client_id").eq("node_type", "video").is("migrated_at", null).limit(1);
      if (!data?.length) return json({ ok: true, done: 0, remaining: 0, msg: "no quedan videos pendientes" });
      CID = data[0].client_id;
    }

    // 2) token de Drive (Apps Script) — Bunny lo usa para bajar el archivo
    const { data: cfg } = await sb.from("app_settings").select("value").eq("key", "venta_form_config").single();
    // deno-lint-ignore no-explicit-any
    const v: any = cfg?.value || {};
    const tok = await fetch(v.appscript_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: v.appscript_secret, action: "get_drive_token" }) }).then((r) => r.json());
    const TOKEN = tok?.token;
    if (!TOKEN) return json({ ok: false, error: "sin token de Drive" }, 500);

    // 3) árbol de carpetas del cliente (para el bucket_key)
    const { data: folders } = await sb.from("client_drive_nodes").select("id,name,parent_id").eq("client_id", CID).eq("node_type", "folder");
    const fById: Record<string, unknown> = {}; for (const f of (folders || [])) fById[(f as { id: string }).id] = f;

    // 4) reservar el lote (marca migrated_at ya, para que otra corrida no lo agarre)
    const { data: ids0 } = await sb.from("client_drive_nodes").select("id").eq("client_id", CID).eq("node_type", "video").is("migrated_at", null).limit(LIMIT);
    const ids = (ids0 || []).map((x) => (x as { id: string }).id);
    if (!ids.length) return json({ ok: true, client: CID, done: 0, remaining: 0, msg: "cliente sin videos pendientes" });
    await sb.from("client_drive_nodes").update({ migrated_at: new Date().toISOString() }).in("id", ids);
    const { data: batch } = await sb.from("client_drive_nodes").select("id,name,parent_id,mime_type,size_bytes,strategy_id").in("id", ids);

    const H = { AccessKey: BUNNY_KEY, "Content-Type": "application/json", accept: "application/json" };
    let ok = 0, err = 0; const errores: string[] = [];
    for (const node of (batch || [])) {
      const nd = node as { id: string; name: string; parent_id: string; mime_type?: string; size_bytes?: number; strategy_id?: string };
      try {
        // 4a) crear el video vacío en Bunny
        const cr = await fetch(`${V}/${BUNNY_LIB}/videos`, { method: "POST", headers: H, body: JSON.stringify({ title: nd.name || "video" }) });
        if (!cr.ok) throw new Error("create " + cr.status);
        const guid = String((await cr.json())?.guid || "");
        if (!guid) throw new Error("sin guid");

        // 4b) que Bunny baje el archivo del Drive (fetch server-side, con el token en el header)
        const driveUrl = `https://www.googleapis.com/drive/v3/files/${nd.id}?alt=media&supportsAllDrives=true`;
        const fe = await fetch(`${V}/${BUNNY_LIB}/videos/${guid}/fetch`, { method: "POST", headers: H, body: JSON.stringify({ url: driveUrl, headers: { Authorization: "Bearer " + TOKEN } }) });
        const feBody = await fe.json().catch(() => ({}));
        if (!feBody?.success && !fe.ok) throw new Error("fetch " + fe.status);

        // 4c) registrar en funnel_resources (organizar-videos lo ordena después)
        const bucket = bucketDe(nd, fById as Record<string, unknown>);
        await sb.from("funnel_resources").insert({
          strategy_id: nd.strategy_id || null, client_id: CID, bucket_key: bucket,
          title: (nd.name || "video").replace(/\.[^.]+$/, ""), provider: "bunny", kind: "video",
          bunny_id: guid, public_url: `https://iframe.mediadelivery.net/embed/${BUNNY_LIB}/${guid}`,
          storage_path: BUNNY_HOST ? `https://${BUNNY_HOST}/${guid}/thumbnail.jpg` : null,
          mime_type: nd.mime_type || "video/mp4", size_bytes: nd.size_bytes || null,
        });
        ok++;
        await sleep(1200); // pausa: goteo suave hacia Bunny
      } catch (e) {
        err++; errores.push(`${nd.name}: ${String((e as Error)?.message || e)}`);
        await sb.from("client_drive_nodes").update({ migrated_at: null }).eq("id", nd.id); // liberar para reintentar
      }
    }
    const { count } = await sb.from("client_drive_nodes").select("*", { count: "exact", head: true }).eq("client_id", CID).eq("node_type", "video").is("migrated_at", null);
    return json({ ok: true, client: CID, done: ok, err, remaining: count ?? null, errores: errores.slice(0, 5) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
