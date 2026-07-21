// supabase/functions/migrar-videos/index.ts
// Migra un LOTE de VIDEOS del Drive → Bunny Stream. Bunny baja el video directo del Drive
// (fetch server-side). La transcripción está APAGADA a nivel librería (add-on pago que causó
// el cobro de $80.88 el 2026-07-19) → la migración solo GUARDA el archivo = storage (centavos).
// Corre por cron, con pausas (Bunny bloquea en ráfaga). El ORDEN (avatar/funnel/título) lo hace
// después organizar-videos con el DEL. La transcripción real se hará luego por Whisper/Groq.
//
// CANDADO DE GASTO (máxima seguridad, pedido por Matías 2026-07-19): tope diario en USD leído
// de app_settings.bunny_guard { enabled, daily_cap_usd, per_video_usd }. Antes de migrar suma
// el gasto estimado de HOY en api_usage; si llega al tope, se PAUSA (no crea nada en Bunny) y
// deja una alerta en api_usage. El límite NO se sube sin consentimiento de Matías.
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
const BATCH_MAX = 10;

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
    let LIMIT = Math.max(1, Math.min(BATCH_MAX, Number(body.limit) || BATCH_MAX));

    // ── CANDADO DE GASTO (Bunny) ────────────────────────────────────────────────
    // Tope en USD en app_settings.bunny_guard { enabled, daily_cap_usd, per_video_usd, budget_reset_at }.
    // Comportamiento pedido por Matías: va RÁPIDO hasta el tope; si lo toca, se CONGELA
    // (enabled=false), deja una alerta y NO migra más hasta que Matías dé la orden de continuar
    // (eso re-activa enabled=true y corre budget_reset_at → abre otra ventana de gasto).
    // per_video_usd es un estimado conservador de storage (el costo real es aún menor).
    const gRows = await rGet(`app_settings?key=eq.bunny_guard&select=value`);
    // deno-lint-ignore no-explicit-any
    const guard: any = gRows[0]?.value || {};
    const CAP_USD = Number(guard.daily_cap_usd ?? 10);
    const PER_VIDEO = Number(guard.per_video_usd ?? 0.005);
    const dayStart = new Date().toISOString().slice(0, 10) + "T00:00:00Z";
    // ventana de presupuesto: desde el último "continuar" (budget_reset_at) o desde el inicio del día
    const windowStart = (guard.budget_reset_at && String(guard.budget_reset_at) > dayStart) ? String(guard.budget_reset_at) : dayStart;

    if (guard.enabled === false) {
      // congelada, esperando la orden de Matías
      return json({ ok: true, paused: true, reason: "frozen_waiting_order", frozen_since: guard.frozen_at || null });
    }
    const winRows = await rGet(`api_usage?fn=eq.migrar-videos&model=eq.bunny-migracion&status=eq.ok&created_at=gte.${encodeURIComponent(windowStart)}&select=cost_usd`);
    const spent = winRows.reduce((a, r) => a + Number(r.cost_usd || 0), 0);
    const videosLeft = Math.floor((CAP_USD - spent) / PER_VIDEO);
    if (videosLeft < 1) {
      // tope tocado → CONGELAR + alertar (una sola alerta por congelamiento)
      await rPatch(`app_settings?key=eq.bunny_guard`, { value: { ...guard, enabled: false, frozen_at: new Date().toISOString(), frozen_reason: "daily_cap" } });
      await rInsert("api_usage", {
        fn: "migrar-videos", model: "bunny-migracion", status: "cap_reached", cost_usd: 0,
        error: `TOPE de $${CAP_USD} alcanzado (estimado $${spent.toFixed(2)}). Migración CONGELADA — no vuelve a gastar sin tu orden.`,
        meta: { daily_cap_usd: CAP_USD, spent, per_video_usd: PER_VIDEO },
      }).catch(() => {});
      return json({ ok: true, paused: true, reason: "daily_cap", spent: Number(spent.toFixed(2)), cap_usd: CAP_USD });
    }
    LIMIT = Math.min(LIMIT, videosLeft);
    // ─────────────────────────────────────────────────────────────────────────────

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
    // registrar el gasto estimado del lote en api_usage (alimenta el candado diario y el panel "Gasto de API")
    if (ok > 0) {
      await rInsert("api_usage", {
        fn: "migrar-videos", model: "bunny-migracion", status: "ok",
        cost_usd: Number((ok * PER_VIDEO).toFixed(4)), client_id: CID,
        meta: { videos: ok, per_video_usd: PER_VIDEO, nota: "estimado conservador de storage; el costo real es menor" },
      }).catch(() => {});
    }
    const rem = await rGet(`client_drive_nodes?client_id=eq.${CID}&node_type=eq.video&migrated_at=is.null&select=id`);
    return json({ ok: true, client: CID, done: ok, err, remaining: rem.length, errores: errores.slice(0, 5) });
  } catch (e) {
    return json({ ok: false, error: String((e as Error)?.message || e) }, 500);
  }
});
