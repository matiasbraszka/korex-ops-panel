// supabase/functions/migrar-videos/index.ts
// Migra un LOTE de VIDEOS del Drive → Bunny Stream. Bunny baja el video directo del Drive
// (fetch server-side) y lo TRANSCRIBE solo. Corre por cron, con pausas (Bunny bloquea en
// ráfaga). El ORDEN (avatar/funnel/título) lo hace después organizar-videos con el DEL.
//
// Autocontenida (sin imports): habla con la base por su API REST (PostgREST) con la
// service_role. Marca client_drive_nodes.migrated_at para no repetir y registra cada video
// en funnel_resources (provider='bunny', bunny_id=guid).
//
// Body (POST JSON): { client_id?, limit? }  ·  sin client_id, toma el próximo cliente pendiente.
// Auth: Authorization: Bearer <DETECT_TOKEN | service_role>.
// Secrets: SUPABASE_URL/SERVICE_ROLE_KEY, BUNNY_API_KEY, BUNNY_LIBRARY_ID, BUNNY_HOSTNAME.

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const DETECT_TOKEN = Deno.env.get("DETECT_TOKEN") ?? "";
const MIGRAR_TOKEN = Deno.env.get("MIGRAR_TOKEN") ?? ""; // token propio para disparar la migración
const BUNNY_KEY = Deno.env.get("BUNNY_API_KEY") ?? "";
const BUNNY_LIB = Deno.env.get("BUNNY_LIBRARY_ID") ?? "";
const BUNNY_HOST = Deno.env.get("BUNNY_HOSTNAME") ?? "";
const V = "https://video.bunnycdn.com/library";
const BATCH_MAX = 5;

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const norm = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

// PostgREST helper con service_role.
const REST = `${SUPABASE_URL}/rest/v1/`;
const hdr = (extra: Record<string, string> = {}) => ({ apikey: SERVICE_ROLE, Authorization: `Bearer ${SERVICE_ROLE}`, "Content-Type": "application/json", ...extra });
async function rGet(path: string): Promise<Record<string, unknown>[]> {
  const r = await fetch(REST + path, { headers: hdr() });
  if (!r.ok) throw new Error(`REST GET ${r.status}: ${(await r.text()).slice(0, 120)}`);
  return r.json();
}
async function rPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(REST + path, { method: "PATCH", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`REST PATCH ${r.status}: ${(await r.text()).slice(0, 120)}`);
}
async function rInsert(table: string, row: unknown): Promise<void> {
  const r = await fetch(REST + table, { method: "POST", headers: hdr({ Prefer: "return=minimal" }), body: JSON.stringify(row) });
  if (!r.ok) throw new Error(`REST INSERT ${r.status}: ${(await r.text()).slice(0, 160)}`);
}
const inList = (ids: string[]) => `in.(${ids.map((x) => `"${x}"`).join(",")})`;

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
    if (!((DETECT_TOKEN && auth === DETECT_TOKEN) || (SERVICE_ROLE && auth === SERVICE_ROLE) || (MIGRAR_TOKEN && auth === MIGRAR_TOKEN))) return json({ ok: false, error: "no autorizado" }, 401);
    if (!BUNNY_KEY || !BUNNY_LIB) return json({ ok: false, error: "bunny_not_configured" }, 500);

    const body = await req.json().catch(() => ({}));
    let CID = String(body.client_id || "");
    const LIMIT = Math.max(1, Math.min(BATCH_MAX, Number(body.limit) || BATCH_MAX));

    // 1) cliente objetivo
    if (!CID) {
      const pend = await rGet(`client_drive_nodes?node_type=eq.video&migrated_at=is.null&select=client_id&limit=1`);
      if (!pend.length) return json({ ok: true, done: 0, remaining: 0, msg: "no quedan videos pendientes" });
      CID = String(pend[0].client_id);
    }

    // 2) token de Drive (Apps Script)
    const cfgRows = await rGet(`app_settings?key=eq.venta_form_config&select=value`);
    // deno-lint-ignore no-explicit-any
    const v: any = cfgRows[0]?.value || {};
    const tok = await fetch(v.appscript_url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ secret: v.appscript_secret, action: "get_drive_token" }) }).then((r) => r.json());
    const TOKEN = tok?.token;
    if (!TOKEN) return json({ ok: false, error: "sin token de Drive" }, 500);

    // 3) árbol de carpetas (para el bucket_key)
    const folders = await rGet(`client_drive_nodes?client_id=eq.${CID}&node_type=eq.folder&select=id,name,parent_id`);
    const fById: Record<string, unknown> = {}; for (const f of folders) fById[String(f.id)] = f;

    // 4) reservar el lote
    const ids0 = await rGet(`client_drive_nodes?client_id=eq.${CID}&node_type=eq.video&migrated_at=is.null&select=id&limit=${LIMIT}`);
    const ids = ids0.map((x) => String(x.id));
    if (!ids.length) return json({ ok: true, client: CID, done: 0, remaining: 0, msg: "cliente sin videos pendientes" });
    await rPatch(`client_drive_nodes?id=${inList(ids)}`, { migrated_at: new Date().toISOString() });
    const batch = await rGet(`client_drive_nodes?id=${inList(ids)}&select=id,name,parent_id,mime_type,size_bytes,strategy_id`);

    const H = { AccessKey: BUNNY_KEY, "Content-Type": "application/json", accept: "application/json" };
    let ok = 0, err = 0; const errores: string[] = [];
    for (const node of batch) {
      const nd = node as { id: string; name: string; parent_id: string; mime_type?: string; size_bytes?: number; strategy_id?: string };
      try {
        const cr = await fetch(`${V}/${BUNNY_LIB}/videos`, { method: "POST", headers: H, body: JSON.stringify({ title: nd.name || "video" }) });
        if (!cr.ok) throw new Error("create " + cr.status);
        const guid = String((await cr.json())?.guid || "");
        if (!guid) throw new Error("sin guid");

        const driveUrl = `https://www.googleapis.com/drive/v3/files/${nd.id}?alt=media&supportsAllDrives=true`;
        const fe = await fetch(`${V}/${BUNNY_LIB}/videos/${guid}/fetch`, { method: "POST", headers: H, body: JSON.stringify({ url: driveUrl, headers: { Authorization: "Bearer " + TOKEN } }) });
        const feBody = await fe.json().catch(() => ({}));
        if (!feBody?.success && !fe.ok) throw new Error("fetch " + fe.status);

        const bucket = bucketDe(nd, fById as Record<string, unknown>);
        await rInsert("funnel_resources", {
          strategy_id: nd.strategy_id || null, client_id: CID, bucket_key: bucket,
          title: (nd.name || "video").replace(/\.[^.]+$/, ""), provider: "bunny", kind: "video",
          bunny_id: guid, public_url: `https://iframe.mediadelivery.net/embed/${BUNNY_LIB}/${guid}`,
          storage_path: BUNNY_HOST ? `https://${BUNNY_HOST}/${guid}/thumbnail.jpg` : null,
          mime_type: nd.mime_type || "video/mp4", size_bytes: nd.size_bytes || null,
        });
        ok++;
        await sleep(1200);
      } catch (e) {
        err++; errores.push(`${nd.name}: ${String((e as Error)?.message || e)}`);
        await rPatch(`client_drive_nodes?id=eq.${nd.id}`, { migrated_at: null });
      }
    }
    const rem = await rGet(`client_drive_nodes?client_id=eq.${CID}&node_type=eq.video&migrated_at=is.null&select=id`);
    return json({ ok: true, client: CID, done: ok, err, remaining: rem.length, errores: errores.slice(0, 5) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
