// supabase/functions/mercury-webhook/index.ts
// Recibe los webhooks de Mercury (banco propio de Korex) y, cuando una
// transacción queda FALLIDA, avisa a todos los administradores: en el panel
// (buzón, type 'mercury_failed_transaction') y en Slack (#alertas-mercury, vía el
// mismo bot que usa onboarding-clientes).
//
// Mercury manda transaction.created / transaction.updated con un payload
// JSON-Merge-Patch (solo los campos que cambiaron), así que NO trae la
// transacción completa. Tomamos el resourceId y pedimos la transacción entera a
// la API (GET /transaction/{id}) para tener fondo, tarjeta, monto y motivo.
//
// Auth (verify_jwt: false): se acepta el secreto simple en la URL (?secret=,
// guardado en webhook_secret) O la firma 'Mercury-Signature' (HMAC-SHA256 con
// webhook_signing_secret, probando la clave en texto y en base64).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MERCURY_API = "https://api.mercury.com/api/v1";

interface MercuryConfig {
  api_token?: string;
  webhook_secret?: string;
  webhook_signing_secret?: string;
  cron_secret?: string;
  slack_channel?: string;
  slack_bot_token?: string;
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const rnd = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// ── Auth ─────────────────────────────────────────────────────────────────────
function b64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u;
  } catch { return null; }
}

async function hmacHexBytes(keyBytes: Uint8Array, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function authOk(req: Request, rawBody: string, urlSecret: string, signingSecret: string): Promise<boolean> {
  // 1) Secreto simple en la URL (?secret=) — el que registramos en la URL del webhook.
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-mercury-secret") || "";
  if (urlSecret && got && timingSafeEqual(got, urlSecret)) return true;
  // 2) Firma de Mercury: HMAC-SHA256(secret, `${t}.${rawBody}`). Probamos la clave
  //    como texto y como bytes base64 (Mercury la entrega en base64).
  const sigHeader = req.headers.get("Mercury-Signature") || req.headers.get("mercury-signature") || "";
  if (sigHeader && signingSecret) {
    const parts = Object.fromEntries(sigHeader.split(",").map((kv) => kv.split("=").map((s) => s.trim())));
    const t = parts["t"]; const v1 = parts["v1"];
    if (t && v1) {
      const msg = `${t}.${rawBody}`;
      const variants: Uint8Array[] = [new TextEncoder().encode(signingSecret)];
      const decoded = b64ToBytes(signingSecret);
      if (decoded) variants.push(decoded);
      for (const kb of variants) {
        if (timingSafeEqual(await hmacHexBytes(kb, msg), v1)) return true;
      }
    }
  }
  return false;
}

// ── Mercury API ──────────────────────────────────────────────────────────────
function authHeader(token: string): string {
  const t = token.startsWith("secret-token:") ? token : `secret-token:${token}`;
  return `Bearer ${t}`;
}

async function getTransaction(token: string, txId: string): Promise<Record<string, any> | null> {
  try {
    const r = await fetch(`${MERCURY_API}/transaction/${encodeURIComponent(txId)}`, {
      headers: { Authorization: authHeader(token), Accept: "application/json" },
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) { console.error("mercury-webhook: API tx", r.status, await r.text()); return null; }
    return await r.json();
  } catch (e) {
    console.error("mercury-webhook: fallo getTransaction", e);
    return null;
  }
}

function cardRefOf(tx: Record<string, any>): string | null {
  const d = tx?.details ?? {};
  return str(d?.debitCardInfo?.id) || str(d?.creditCardInfo?.id) || null;
}

function txRow(tx: Record<string, any>) {
  return {
    id: str(tx.id),
    account_id: str(tx.accountId) || null,
    card_id: cardRefOf(tx),
    status: str(tx.status) || null,
    kind: str(tx.kind) || null,
    amount: typeof tx.amount === "number" ? tx.amount : (tx.amount != null ? Number(tx.amount) : null),
    currency: str(tx.currency) || "USD",
    counterparty_name: str(tx.counterpartyName) || null,
    note: str(tx.note) || null,
    merchant: tx.merchant ?? null,
    reason_for_failure: str(tx.reasonForFailure) || null,
    failed_at: tx.failedAt ?? null,
    posted_at: tx.postedAt ?? null,
    tx_created_at: tx.createdAt ?? null,
    raw: tx,
  };
}

// ── Alerta ───────────────────────────────────────────────────────────────────
function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  return `${currency || "USD"} ${Math.abs(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// Postea en Slack con el bot (mismo token que onboarding-clientes).
async function postSlackBot(botToken: string, channel: string, text: string): Promise<void> {
  if (!botToken || !channel) return;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) console.error("mercury-webhook: slack chat.postMessage", JSON.stringify(j));
  } catch (e) {
    console.error("mercury-webhook: fallo post a slack", e);
  }
}

async function alertFailed(
  cfg: MercuryConfig,
  tx: { id: string; account_id: string | null; card_id: string | null; amount: number | null; currency: string; counterparty_name: string | null; reason_for_failure: string | null; merchant: any },
): Promise<boolean> {
  // Candado: solo avisar una vez por transacción (alerted_at NULL).
  const { data: locked } = await admin
    .from("mercury_transactions")
    .update({ alerted_at: new Date().toISOString() })
    .eq("id", tx.id).is("alerted_at", null).select("id");
  if (!locked || locked.length === 0) return false;

  let fundName = "—"; let fundBalance = "";
  if (tx.account_id) {
    const { data: acc } = await admin
      .from("mercury_accounts").select("name, current_balance, currency").eq("id", tx.account_id).maybeSingle();
    if (acc) {
      fundName = str(acc.name) || tx.account_id;
      fundBalance = acc.current_balance != null ? fmtMoney(Number(acc.current_balance), str(acc.currency) || tx.currency) : "";
    }
  }

  let cardLabel = "";
  if (tx.card_id) {
    const { data: card } = await admin
      .from("mercury_cards").select("name_on_card, last_four").eq("card_id", tx.card_id).maybeSingle();
    if (card) {
      cardLabel = [str(card.name_on_card), str(card.last_four) ? `•• ${str(card.last_four)}` : ""].filter(Boolean).join(" ");
    }
  }

  const concepto = tx.counterparty_name || str(tx.merchant?.name) || "un pago";
  const monto = fmtMoney(tx.amount, tx.currency);
  const motivo = tx.reason_for_failure || "sin detalle";

  // Notificación en el panel para todos los admins.
  const { data: ids } = await admin.rpc("korex_admin_member_ids");
  const recipients: string[] = Array.isArray(ids) ? ids : [];
  if (recipients.length) {
    const bodyTxt =
      `Se rechazó ${monto} a «${concepto}». ` +
      `Fondo: ${fundName}${fundBalance ? ` (saldo ${fundBalance})` : ""}.` +
      (cardLabel ? ` Tarjeta: ${cardLabel}.` : "") +
      ` Motivo: ${motivo}.`;
    const rows = recipients.map((rid) => ({
      id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
      recipient_id: rid,
      type: "mercury_failed_transaction",
      title: "Transacción fallida en Mercury",
      body: bodyTxt,
    }));
    const { error } = await admin.from("notifications").insert(rows);
    if (error) console.error("mercury-webhook: error insert notifications", error);
  }

  // Slack (#alertas-mercury) vía bot.
  await postSlackBot(str(cfg.slack_bot_token), str(cfg.slack_channel) || "#alertas-mercury",
    `:rotating_light: *Transacción fallida en Mercury*\n` +
    `• *Pago:* ${concepto} — ${monto}\n` +
    `• *Fondo:* ${fundName}${fundBalance ? ` — saldo actual ${fundBalance}` : ""}\n` +
    (cardLabel ? `• *Tarjeta:* ${cardLabel}\n` : "") +
    `• *Motivo:* ${motivo}\n` +
    `Revisar cuanto antes en el panel → Administración › Mercury.`);
  return true;
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "mercury_config").maybeSingle();
  const mcfg = (s?.value as MercuryConfig) ?? {};
  // El bot token de Slack vive en venta_form_config (mismo bot que onboarding).
  const { data: vf } = await admin
    .from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const cfg: MercuryConfig = { ...mcfg, slack_bot_token: str((vf?.value as any)?.slack_bot_token) };

  const rawBody = await req.text(); // crudo: la firma se calcula sobre el body exacto

  if (!(await authOk(req, rawBody, str(cfg.webhook_secret), str(cfg.webhook_signing_secret)))) {
    return jsonResp(401, { error: "unauthorized" });
  }

  let body: Record<string, any>;
  try { body = JSON.parse(rawBody); }
  catch { return jsonResp(200, { ok: false, error: "not_json" }); }

  if (str(body.resourceType) !== "transaction") {
    return jsonResp(200, { ok: true, ignored: str(body.resourceType) || "unknown" });
  }
  const txId = str(body.resourceId);
  if (!txId) return jsonResp(200, { ok: false, error: "no_resource_id" });

  if (!str(cfg.api_token)) {
    console.error("mercury-webhook: falta api_token en mercury_config");
    return jsonResp(200, { ok: false, error: "no_api_token" });
  }

  const tx = await getTransaction(str(cfg.api_token), txId);
  if (!tx?.id) return jsonResp(200, { ok: false, error: "tx_not_found", tx: txId });

  const row = txRow(tx);
  const { error: upErr } = await admin.from("mercury_transactions").upsert(row, { onConflict: "id" });
  if (upErr) console.error("mercury-webhook: error upsert tx", upErr);

  let alerted = false;
  if (row.status === "failed") alerted = await alertFailed(cfg, row);

  return jsonResp(200, { ok: true, tx: txId, status: row.status, alerted });
});
