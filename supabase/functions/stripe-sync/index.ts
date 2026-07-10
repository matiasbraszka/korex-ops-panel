// supabase/functions/stripe-sync/index.ts
// Lee Stripe (pagos, SOLO LECTURA): cobros (charges), payouts a Mercury, reembolsos y
// disputas. Arma la trazabilidad "qué pagos componen cada payout" usando balance
// transactions (expand data.source). Avisa a los admins cuando hay un reembolso o
// disputa nueva (panel + Slack opcional). Stripe se consulta por polling (pg_cron).
// verify_jwt: false — auth propia por ?secret=/x-cron-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const STRIPE_API = "https://api.stripe.com/v1";
const ALERT_WINDOW_MS = 7 * 24 * 3600 * 1000; // solo avisar reembolsos/disputas ≤7 días
const TIME_BUDGET_MS = 110000;

interface StripeConfig {
  api_token?: string;
  cron_secret?: string;
  webhook_secret?: string;
  slack_channel?: string;
  slack_bot_token?: string;
}

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const cents = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v) / 100);
const tsOf = (unix: unknown) => (unix ? new Date(Number(unix) * 1000).toISOString() : null);
const rnd = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
const idOf = (v: unknown) => (typeof v === "string" ? str(v) : str((v as any)?.id) || null);
const money2 = (n: unknown) =>
  Math.abs(Number(n) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function stripeGet(token: string, path: string): Promise<any> {
  try {
    const r = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(25000),
    });
    return await r.json().catch(() => ({ error: { message: "parse_error" } }));
  } catch (e) {
    console.error("stripe-sync: fallo GET", path, e);
    return { error: { message: "fetch_error" } };
  }
}

// Lista paginada (cursor starting_after).
async function stripeList(token: string, resource: string, extra: Record<string, string>, maxPages: number): Promise<any[]> {
  const out: any[] = [];
  let after = "";
  for (let p = 0; p < maxPages; p++) {
    const qs = new URLSearchParams({ limit: "100", ...extra });
    if (after) qs.set("starting_after", after);
    const j = await stripeGet(token, `/${resource}?${qs.toString()}`);
    if (j?.error) { console.error("stripe-sync: list", resource, JSON.stringify(j.error)); break; }
    const data: any[] = Array.isArray(j.data) ? j.data : [];
    out.push(...data);
    if (!j.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return out;
}

// Balance transactions de un payout (con la fuente expandida → charge/refund/dispute).
async function stripeBalanceTx(token: string, payoutId: string): Promise<any[]> {
  const out: any[] = [];
  let after = "";
  for (let p = 0; p < 10; p++) {
    const qs = new URLSearchParams({ limit: "100", payout: payoutId, "expand[]": "data.source" });
    if (after) qs.set("starting_after", after);
    const j = await stripeGet(token, `/balance_transactions?${qs.toString()}`);
    if (j?.error) { console.error("stripe-sync: bt", payoutId, JSON.stringify(j.error)); break; }
    const data: any[] = Array.isArray(j.data) ? j.data : [];
    out.push(...data);
    if (!j.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return out;
}

function chargeRow(ch: any) {
  const bd = ch.billing_details ?? {};
  return {
    id: str(ch.id),
    amount: cents(ch.amount),
    currency: str(ch.currency) || null,
    amount_refunded: cents(ch.amount_refunded),
    status: str(ch.status) || null,
    paid: !!ch.paid,
    refunded: !!ch.refunded,
    disputed: !!ch.disputed,
    captured: !!ch.captured,
    description: str(ch.description) || null,
    customer_name: str(bd.name) || null,
    customer_email: str(bd.email) || str(ch.receipt_email) || null,
    payment_intent: idOf(ch.payment_intent),
    receipt_url: str(ch.receipt_url) || null,
    failure_code: str(ch.failure_code) || null,
    failure_message: str(ch.failure_message) || null,
    risk_level: str(ch.outcome?.risk_level) || null,
    balance_transaction: idOf(ch.balance_transaction),
    created_at: tsOf(ch.created),
    raw: ch,
  };
}

function payoutRow(po: any) {
  return {
    id: str(po.id),
    amount: cents(po.amount),
    currency: str(po.currency) || null,
    status: str(po.status) || null,
    arrival_date: tsOf(po.arrival_date),
    method: str(po.method) || null,
    automatic: !!po.automatic,
    destination: idOf(po.destination),
    description: str(po.description) || null,
    statement_descriptor: str(po.statement_descriptor) || null,
    failure_code: str(po.failure_code) || null,
    failure_message: str(po.failure_message) || null,
    reconciliation_status: str(po.reconciliation_status) || null,
    balance_transaction: idOf(po.balance_transaction),
    created_at: tsOf(po.created),
    raw: po,
  };
}

function btRow(bt: any, payoutId: string) {
  return {
    id: str(bt.id),
    type: str(bt.type) || null,
    reporting_category: str(bt.reporting_category) || null,
    amount_usd: cents(bt.amount),
    fee_usd: cents(bt.fee),
    net_usd: cents(bt.net),
    currency: str(bt.currency) || null,
    source: idOf(bt.source),
    payout_id: payoutId || null,
    exchange_rate: num(bt.exchange_rate),
    available_on: tsOf(bt.available_on),
    created_at: tsOf(bt.created),
    raw: bt,
  };
}

function refundRow(re: any) {
  return {
    id: str(re.id),
    amount: cents(re.amount),
    currency: str(re.currency) || null,
    charge_id: idOf(re.charge),
    payment_intent: idOf(re.payment_intent),
    status: str(re.status) || null,
    reason: str(re.reason) || null,
    balance_transaction: idOf(re.balance_transaction),
    created_at: tsOf(re.created),
    raw: re,
  };
}

function disputeRow(du: any) {
  return {
    id: str(du.id),
    amount: cents(du.amount),
    currency: str(du.currency) || null,
    charge_id: idOf(du.charge),
    payment_intent: idOf(du.payment_intent),
    status: str(du.status) || null,
    reason: str(du.reason) || null,
    evidence_due_by: tsOf(du.evidence_details?.due_by),
    is_charge_refundable: !!du.is_charge_refundable,
    balance_transaction: idOf(du.balance_transaction),
    created_at: tsOf(du.created),
    raw: du,
  };
}

async function adminIds(): Promise<string[]> {
  const { data } = await admin.rpc("korex_admin_member_ids");
  return Array.isArray(data) ? data : [];
}

async function insertNotifs(recipients: string[], type: string, title: string, body: string) {
  if (!recipients.length) return;
  const rows = recipients.map((rid) => ({
    id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
    recipient_id: rid, type, title, body,
  }));
  const { error } = await admin.from("notifications").insert(rows);
  if (error) console.error("stripe-sync: error insert notifications", error);
}

async function postSlackBot(botToken: string, channel: string, text: string) {
  if (!botToken || !channel) return;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) console.error("stripe-sync: slack chat.postMessage", JSON.stringify(j));
  } catch (e) { console.error("stripe-sync: fallo post a slack", e); }
}

// ¿Está prendida esta alerta en Administración? (interruptor maestro)
async function notifEnabled(type: string): Promise<boolean> {
  const { data } = await admin.rpc("korex_notif_enabled", { p_type: type });
  return data !== false;
}

// Avisa una sola vez por reembolso (candado alerted_at), solo si es reciente.
async function tryAlertRefund(cfg: StripeConfig, row: ReturnType<typeof refundRow>): Promise<boolean> {
  const recent = row.created_at ? Date.now() - new Date(row.created_at).getTime() <= ALERT_WINDOW_MS : false;
  if (!recent) return false;
  if (!(await notifEnabled("stripe_refund"))) return false;
  const { data: locked } = await admin.from("stripe_refunds")
    .update({ alerted_at: new Date().toISOString() })
    .eq("id", row.id).is("alerted_at", null).select("id");
  if (!locked || locked.length === 0) return false;
  const monto = `${(row.currency || "").toUpperCase()} ${money2(row.amount)}`;
  await insertNotifs(await adminIds(), "stripe_refund", "Reembolso en Stripe",
    `Se procesó un reembolso de ${monto}${row.reason ? ` (motivo: ${row.reason})` : ""}.`);
  if (cfg.slack_channel) await postSlackBot(str(cfg.slack_bot_token), str(cfg.slack_channel),
    `:arrows_counterclockwise: *Reembolso en Stripe*\n• *Monto:* ${monto}\n${row.reason ? `• *Motivo:* ${row.reason}\n` : ""}Revisar en el panel → Soporte › Cuentas › Stripe.`);
  return true;
}

// Avisa una sola vez por disputa (más urgente: tiene fecha límite para responder).
async function tryAlertDispute(cfg: StripeConfig, row: ReturnType<typeof disputeRow>): Promise<boolean> {
  const recent = row.created_at ? Date.now() - new Date(row.created_at).getTime() <= ALERT_WINDOW_MS : false;
  if (!recent) return false;
  if (!(await notifEnabled("stripe_dispute"))) return false;
  const { data: locked } = await admin.from("stripe_disputes")
    .update({ alerted_at: new Date().toISOString() })
    .eq("id", row.id).is("alerted_at", null).select("id");
  if (!locked || locked.length === 0) return false;
  const monto = `${(row.currency || "").toUpperCase()} ${money2(row.amount)}`;
  const vence = row.evidence_due_by
    ? ` Hay que responder antes del ${new Date(row.evidence_due_by).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}.`
    : "";
  await insertNotifs(await adminIds(), "stripe_dispute", "Disputa (contracargo) en Stripe",
    `Se abrió una disputa de ${monto}${row.reason ? ` (${row.reason})` : ""}.${vence}`);
  if (cfg.slack_channel) await postSlackBot(str(cfg.slack_bot_token), str(cfg.slack_channel),
    `:rotating_light: *Disputa (contracargo) en Stripe*\n• *Monto:* ${monto}\n${row.reason ? `• *Motivo:* ${row.reason}\n` : ""}${vence ? `• *Responder antes:* ${new Date(row.evidence_due_by!).toLocaleDateString("es-AR")}\n` : ""}Revisar cuanto antes → Soporte › Cuentas › Stripe.`);
  return true;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });
  const startedAt = Date.now();

  const { data: s } = await admin.from("app_settings").select("value").eq("key", "stripe_config").maybeSingle();
  const scfg = (s?.value as StripeConfig) ?? {};
  // Bot de Slack: vive en venta_form_config (mismo bot que onboarding/Mercury).
  const { data: vf } = await admin.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const cfg: StripeConfig = { ...scfg, slack_bot_token: str((vf?.value as any)?.slack_bot_token), slack_channel: str(scfg.slack_channel) };

  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!scfg.cron_secret || got !== scfg.cron_secret) return jsonResp(401, { error: "unauthorized" });
  const token = str(scfg.api_token);
  if (!token) return jsonResp(200, { ok: false, error: "no_api_token" });

  const full = url.searchParams.get("full") === "1";
  const noalert = url.searchParams.get("noalert") === "1";
  const PAGES = full ? 50 : 6;
  const ITEMIZE_CAP = full ? 150 : 60;

  // 1) Cobros (charges) recientes / históricos
  const charges = await stripeList(token, "charges", {}, PAGES);
  let chUp = 0;
  for (const ch of charges) {
    const { error } = await admin.from("stripe_charges").upsert(chargeRow(ch), { onConflict: "id" });
    if (!error) chUp++;
  }

  // 2) Payouts a Mercury
  const payouts = await stripeList(token, "payouts", {}, PAGES);
  let poUp = 0;
  for (const po of payouts) {
    const { error } = await admin.from("stripe_payouts").upsert(payoutRow(po), { onConflict: "id" });
    if (!error) poUp++;
  }

  // 3) Trazabilidad: items de cada payout. Siempre refresca los 20 más recientes;
  //    el resto se completa de a poco (payouts aún sin items) en sucesivas corridas.
  const { data: existing } = await admin.from("stripe_balance_transactions").select("payout_id").not("payout_id", "is", null);
  const done = new Set((existing || []).map((r: any) => r.payout_id));
  let btUp = 0, itemized = 0;
  for (let i = 0; i < payouts.length; i++) {
    const po = payouts[i];
    const needs = i < 20 || !done.has(str(po.id));
    if (!needs) continue;
    if (itemized >= ITEMIZE_CAP || Date.now() - startedAt > TIME_BUDGET_MS) break;
    const items = await stripeBalanceTx(token, str(po.id));
    for (const bt of items) {
      const { error } = await admin.from("stripe_balance_transactions").upsert(btRow(bt, str(po.id)), { onConflict: "id" });
      if (!error) btUp++;
      // Enriquecer el cobro con su neto/comisión en USD (capa de liquidación).
      if (bt.type === "charge" && bt.source && typeof bt.source === "object") {
        await admin.from("stripe_charges").upsert(
          { ...chargeRow(bt.source), net_usd: cents(bt.net), fee_usd: cents(bt.fee) }, { onConflict: "id" });
      }
    }
    itemized++;
  }

  // 4) Reembolsos
  const refunds = await stripeList(token, "refunds", {}, PAGES);
  let reUp = 0, reAlert = 0;
  for (const re of refunds) {
    const row = refundRow(re);
    const { error } = await admin.from("stripe_refunds").upsert(row, { onConflict: "id" });
    if (!error) reUp++;
    if (!noalert && (await tryAlertRefund(cfg, row))) reAlert++;
  }

  // 5) Disputas
  const disputes = await stripeList(token, "disputes", {}, PAGES);
  let duUp = 0, duAlert = 0;
  for (const du of disputes) {
    const row = disputeRow(du);
    const { error } = await admin.from("stripe_disputes").upsert(row, { onConflict: "id" });
    if (!error) duUp++;
    if (!noalert && (await tryAlertDispute(cfg, row))) duAlert++;
  }

  return jsonResp(200, {
    ok: true, charges: chUp, payouts: poUp, balance_tx: btUp, payouts_itemized: itemized,
    refunds: reUp, refunds_alerted: reAlert, disputes: duUp, disputes_alerted: duAlert,
    elapsed_ms: Date.now() - startedAt, full, noalert,
  });
});
