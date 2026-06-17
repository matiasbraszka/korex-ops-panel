// Supabase Edge Function: archivar-factura
// Guarda el PDF de una factura del panel en Google Drive (carpeta del mes), llamando al
// Apps Script de Drive (acción 'guardar_factura'). El HTML lo manda el frontend (mismo
// template que el PDF descargable). Admin de finanzas únicamente.
//
// Config (app_settings key='venta_form_config'): appscript_url, appscript_secret.
// Secrets usados: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

async function verifyFinanceUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { ok: false, status: 401, error: "missing_token" };
  const jwt = authHeader.slice("Bearer ".length);
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY } });
  if (!u.ok) return { ok: false, status: 401, error: "invalid_token" };
  const user = await u.json();
  if (!user?.id) return { ok: false, status: 401, error: "invalid_token" };
  const tm = await fetch(
    `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${user.id}&select=can_access_finance`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  const rows = await tm.json().catch(() => []);
  if (rows?.[0]?.can_access_finance !== true) return { ok: false, status: 403, error: "forbidden" };
  return { ok: true };
}

async function getDriveCfg() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.venta_form_config&select=value`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await r.json().catch(() => []);
  const v = rows?.[0]?.value || {};
  return {
    url: String(v.appscript_url || ""),
    secret: String(v.appscript_secret || ""),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const auth = await verifyFinanceUser(req.headers.get("Authorization"));
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const html = String(body.html || "");
  const numero = String(body.numero || "").trim();
  const nombreFactura = String(body.nombreFactura || "").trim();
  const fecha = String(body.fecha || "").trim();
  if (!html) return json(400, { ok: false, error: "missing_html" });

  const cfg = await getDriveCfg();
  if (!cfg.url) return json(500, { ok: false, error: "appscript_url no configurada en venta_form_config" });

  // El Apps Script puede tardar unos segundos (genera el PDF + lo sube a Drive).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 40000);
  try {
    const r = await fetch(cfg.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.secret, action: "guardar_factura", html, numero, nombreFactura, fecha }),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (data && data.ok && typeof data.url === "string") {
      return json(200, { ok: true, url: data.url, carpeta: data.carpeta || null });
    }
    return json(502, { ok: false, error: (data && data.error) || `apps_script_${r.status}` });
  } catch (e) {
    return json(502, { ok: false, error: String(e) });
  } finally {
    clearTimeout(timer);
  }
});
