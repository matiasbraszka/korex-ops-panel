// Supabase Edge Function: finance-data
// Lee la planilla de finanzas (Google Sheets) via un Google Apps Script Web App
// y devuelve los rangos crudos para que el frontend (apps/finance) los procese.
//
// Flow:
//   1. Frontend → Edge Function (con JWT del usuario en Authorization)
//   2. Edge Function valida JWT + can_access_finance en team_members
//   3. Edge Function → Apps Script Web App (con token compartido)
//   4. Apps Script lee la planilla y devuelve los rangos en JSON
//   5. Edge Function cachea 10min y devuelve al frontend
//
// Secrets requeridos:
//   FINANCE_SCRIPT_URL    URL del Apps Script Web App (acaba en /exec)
//   FINANCE_SCRIPT_TOKEN  string aleatorio compartido entre Apps Script y esta function

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SCRIPT_URL = Deno.env.get("FINANCE_SCRIPT_URL")!;
const SCRIPT_TOKEN = Deno.env.get("FINANCE_SCRIPT_TOKEN")!;

type ViewKey = "dashboard" | "commissions" | "expenses";
const VALID_VIEWS: ViewKey[] = ["dashboard", "commissions", "expenses"];

type CacheEntry = { data: any; expiresAt: number };
const dataCache = new Map<string, CacheEntry>();
const TEN_MIN_MS = 10 * 60 * 1000;

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function fetchFromAppsScript(view: ViewKey): Promise<Record<string, any[][]>> {
  const url = `${SCRIPT_URL}?view=${encodeURIComponent(view)}&token=${encodeURIComponent(SCRIPT_TOKEN)}`;
  const res = await fetch(url, { method: "GET", redirect: "follow" });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`apps_script_${res.status}: ${txt.slice(0, 200)}`);
  }
  const body = await res.json();
  if (!body.ok) {
    throw new Error(body.error || "apps_script_error");
  }
  return body.ranges || {};
}

async function verifyUser(authHeader: string | null): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "missing_token" };
  }
  const userJwt = authHeader.substring("Bearer ".length);

  const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { Authorization: `Bearer ${userJwt}`, apikey: SERVICE_KEY },
  });
  if (!userRes.ok) return { ok: false, status: 401, error: "invalid_token" };
  const user = await userRes.json();
  if (!user?.id) return { ok: false, status: 401, error: "invalid_token" };

  const tmRes = await fetch(
    `${SUPABASE_URL}/rest/v1/team_members?user_id=eq.${user.id}&select=can_access_finance`,
    { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } },
  );
  if (!tmRes.ok) return { ok: false, status: 500, error: "team_members_lookup_failed" };
  const rows = await tmRes.json();
  const allowed = rows?.[0]?.can_access_finance === true;
  if (!allowed) return { ok: false, status: 403, error: "forbidden" };

  return { ok: true };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const view = (url.searchParams.get("view") || "dashboard") as ViewKey;
    const noCache = url.searchParams.get("nocache") === "true";

    if (!VALID_VIEWS.includes(view)) {
      return jsonResponse({ ok: false, error: "invalid_view" }, 400);
    }

    const auth = await verifyUser(req.headers.get("Authorization"));
    if (!auth.ok) return jsonResponse({ ok: false, error: auth.error }, auth.status);

    const cacheKey = `view:${view}`;
    const now = Date.now();
    if (!noCache) {
      const cached = dataCache.get(cacheKey);
      if (cached && cached.expiresAt > now) {
        return jsonResponse({
          ok: true,
          cached: true,
          fetchedAt: cached.expiresAt - TEN_MIN_MS,
          ranges: cached.data,
        });
      }
    }

    const ranges = await fetchFromAppsScript(view);
    dataCache.set(cacheKey, { data: ranges, expiresAt: now + TEN_MIN_MS });

    return jsonResponse({ ok: true, cached: false, fetchedAt: now, ranges });
  } catch (e: any) {
    console.error("finance-data error", e);
    return jsonResponse({ ok: false, error: String(e?.message || e) }, 500);
  }
});
