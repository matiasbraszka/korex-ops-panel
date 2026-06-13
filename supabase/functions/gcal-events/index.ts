// supabase/functions/gcal-events/index.ts — v1
// Devuelve los eventos reales del Google Calendar de admin@ en un rango, para
// que la pestaña Agenda del panel los muestre "tal cual" (resaltando aparte los
// agendamientos del sistema). Proxy autenticado al Apps Script (action
// list_events) con el secreto guardado en soporte_config.
//
//   POST { from, to }  (ISO) → { ok, events: [{id,title,start,end,allDay,calendar}] }
//
// verify_jwt: true — solo usuarios logueados del panel. Si el Apps Script aún
// no soporta list_events (no se actualizó), devuelve events:[] sin romper.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

interface Cfg {
  calendar_script_url?: string;
  calendar_script_secret?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }

  const from = new Date(String(body.from || ""));
  const to = new Date(String(body.to || ""));
  if (isNaN(from.getTime()) || isNaN(to.getTime())) return jsonResp(400, { error: "bad_range" });
  // Tope defensivo: máximo ~45 días por pedido.
  if (to.getTime() - from.getTime() > 45 * 86400_000) return jsonResp(400, { error: "range_too_wide" });

  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (data?.value as Cfg) ?? {};
  if (!cfg.calendar_script_url || !cfg.calendar_script_secret) {
    return jsonResp(200, { ok: true, events: [] });
  }

  try {
    const r = await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: cfg.calendar_script_secret,
        action: "list_events",
        timeMin: from.toISOString(),
        timeMax: to.toISOString(),
      }),
      signal: AbortSignal.timeout(30000),
    });
    const res = await r.json().catch(() => null);
    // Script viejo (sin list_events) o error → degradar a vacío, no romper.
    if (!res?.ok || !Array.isArray(res.events)) return jsonResp(200, { ok: true, events: [] });
    return jsonResp(200, { ok: true, events: res.events });
  } catch (e) {
    console.error("gcal-events: fallo el Apps Script", e);
    return jsonResp(200, { ok: true, events: [] });
  }
});
