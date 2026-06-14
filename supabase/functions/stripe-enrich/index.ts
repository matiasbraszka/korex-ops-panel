// supabase/functions/stripe-enrich/index.ts
// Enriquece los cobros de Stripe con la info del Checkout Session: producto, respuestas
// que cargó el cliente (custom_fields), teléfono, razón social, y deduce la categoría
// (CRM / Publicidad) del nombre del producto. SOLO LECTURA. Eficiente: pagina las
// sesiones (no 1 llamada por pago) y matchea por payment_intent.
// verify_jwt: false — auth propia por ?secret=/x-cron-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const STRIPE_API = "https://api.stripe.com/v1";
const TIME_BUDGET_MS = 110000;

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const idOf = (v: unknown) => (typeof v === "string" ? str(v) : str((v as any)?.id) || null);

async function stripeGet(token: string, path: string): Promise<any> {
  try {
    const r = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(25000),
    });
    return await r.json().catch(() => ({ error: { message: "parse_error" } }));
  } catch (e) {
    console.error("stripe-enrich: GET", path, e);
    return { error: { message: "fetch_error" } };
  }
}

// Arma el objeto de respuestas del checkout (lo que completó la persona).
function buildAnswers(session: any): Record<string, string> {
  const out: Record<string, string> = {};
  const cd = session.customer_details ?? {};
  const ci = session.collected_information ?? {};
  const biz = str(cd.business_name) || str(ci.business_name);
  const ind = str(cd.individual_name) || str(ci.individual_name);
  if (biz) out["Empresa / Razón social"] = biz;
  if (ind) out["Nombre"] = ind;
  for (const f of session.custom_fields ?? []) {
    const label = str(f.label?.custom) || str(f.key);
    let val: string | null = null;
    if (f.type === "dropdown") {
      const v = f.dropdown?.value;
      const opt = (f.dropdown?.options ?? []).find((o: any) => o.value === v);
      val = str(opt?.label) || str(v);
    } else if (f.type === "text") val = str(f.text?.value);
    else if (f.type === "numeric") val = str(f.numeric?.value);
    if (label && val) out[label] = val;
  }
  if (Array.isArray(cd.tax_ids) && cd.tax_ids.length) {
    const ids = cd.tax_ids.map((t: any) => str(t.value)).filter(Boolean).join(", ");
    if (ids) out["Tax ID"] = ids;
  }
  if (cd.address) {
    const a = cd.address;
    const addr = [a.line1, a.line2, a.postal_code, a.city, a.state, a.country].map(str).filter(Boolean).join(", ");
    if (addr) out["Dirección"] = addr;
  }
  return out;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });
  const startedAt = Date.now();

  const { data: s } = await admin.from("app_settings").select("value").eq("key", "stripe_config").maybeSingle();
  const cfg = (s?.value as Record<string, string>) ?? {};
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!cfg.cron_secret || got !== cfg.cron_secret) return jsonResp(401, { error: "unauthorized" });
  const token = str(cfg.api_token);
  if (!token) return jsonResp(200, { ok: false, error: "no_api_token" });

  const full = url.searchParams.get("full") === "1";
  const SESSION_PAGES = full ? 40 : 8;

  // 1) Mapa de productos del catálogo (id -> nombre limpio "Cliente | Servicio | Monto").
  const productName: Record<string, string> = {};
  let pAfter = "";
  for (let p = 0; p < 10; p++) {
    const qs = new URLSearchParams({ limit: "100" });
    if (pAfter) qs.set("starting_after", pAfter);
    const j = await stripeGet(token, `/products?${qs.toString()}`);
    if (j?.error) break;
    const data: any[] = Array.isArray(j.data) ? j.data : [];
    for (const pr of data) productName[str(pr.id)] = str(pr.name);
    if (!j.has_more || !data.length) break;
    pAfter = data[data.length - 1].id;
  }

  // 2) Qué cobros necesitan enriquecerse (sin producto todavía). En modo full, todos.
  let needPI: Set<string> | null = null;
  if (!full) {
    const { data: pending } = await admin.from("stripe_charges")
      .select("payment_intent").is("product_name", null).not("payment_intent", "is", null).limit(5000);
    needPI = new Set((pending ?? []).map((r: any) => str(r.payment_intent)).filter(Boolean));
    if (needPI.size === 0) return jsonResp(200, { ok: true, enriched: 0, note: "nada_pendiente", products: Object.keys(productName).length });
  }

  // 3) Paginar Checkout Sessions (con line_items) y enriquecer el cobro por payment_intent.
  let enriched = 0, scanned = 0, sAfter = "";
  for (let p = 0; p < SESSION_PAGES; p++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    const qs = new URLSearchParams({ limit: "100", "expand[]": "data.line_items" });
    if (sAfter) qs.set("starting_after", sAfter);
    const j = await stripeGet(token, `/checkout/sessions?${qs.toString()}`);
    if (j?.error) { console.error("stripe-enrich: sessions", JSON.stringify(j.error)); break; }
    const sessions: any[] = Array.isArray(j.data) ? j.data : [];
    if (!sessions.length) break;
    for (const session of sessions) {
      scanned++;
      const pi = idOf(session.payment_intent);
      if (!pi) continue;
      if (needPI && !needPI.has(pi)) continue;
      const li = session.line_items?.data?.[0];
      const pid = li ? idOf(li.price?.product) : null;
      const lineDesc = str(li?.description) || null;
      const catalog = pid && productName[pid] ? productName[pid] : null;
      const prodName = catalog || lineDesc;
      const cd = session.customer_details ?? {};
      const { error, count } = await admin.from("stripe_charges").update({
        product_id: pid,
        product_name: prodName,
        customer_phone: str(cd.phone) || null,
        checkout_answers: buildAnswers(session),
      }, { count: "exact" }).eq("payment_intent", pi);
      if (!error && (count ?? 0) > 0) enriched++;
    }
    if (!j.has_more) break;
    sAfter = sessions[sessions.length - 1].id;
  }

  // Deducir categoría (CRM/Publicidad) y cliente desde el producto (respeta overrides).
  if (enriched > 0 || full) await admin.rpc("korex_stripe_derive");

  return jsonResp(200, {
    ok: true, enriched, sessions_scanned: scanned, products: Object.keys(productName).length,
    elapsed_ms: Date.now() - startedAt, full,
  });
});
