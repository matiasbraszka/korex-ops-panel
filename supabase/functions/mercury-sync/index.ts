// supabase/functions/mercury-sync/index.ts
// Sincroniza Mercury contra el panel y sirve de RED DE SEGURIDAD del webhook.
// Lo llama pg_cron cada ~15 min (net.http_post con x-cron-secret). En cada corrida:
//   1. GET /accounts            → upsert mercury_accounts (con saldo actual).
//   2. GET /account/{id}/cards  → upsert mercury_cards (últimos 4 dígitos).
//   3. GET /account/{id}/transactions (recientes) → upsert mercury_transactions;
//      si alguna está 'failed' y todavía no se avisó, dispara la misma alerta que
//      el webhook (panel a todos los admins + Slack #alertas-mercury). Así no se
//      pierde ninguna fallida aunque se caiga un webhook.
//
// verify_jwt: false — auth por secreto compartido (?secret= o x-cron-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const MERCURY_API = "https://api.mercury.com/api/v1";
const TX_PER_ACCOUNT = 50; // cuántas transacciones recientes revisar por cuenta

interface MercuryConfig {
  api_token?: string;
  webhook_secret?: string;
  webhook_signing_secret?: string;
  cron_secret?: string;
  slack_channel?: string;
  slack_bot_token?: string;
}

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const rnd = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

function authHeader(token: string): string {
  const t = token.startsWith("secret-token:") ? token : `secret-token:${token}`;
  return `Bearer ${t}`;
}

async function mercuryGet(token: string, path: string): Promise<Record<string, any> | null> {
  try {
    const r = await fetch(`${MERCURY_API}${path}`, {
      headers: { Authorization: authHeader(token), Accept: "application/json" },
      signal: AbortSignal.timeout(25000),
    });
    if (!r.ok) { console.error("mercury-sync: API", path, r.status, await r.text()); return null; }
    return await r.json();
  } catch (e) {
    console.error("mercury-sync: fallo GET", path, e);
    return null;
  }
}

const num = (v: unknown) => (typeof v === "number" ? v : v != null && v !== "" ? Number(v) : null);

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
    amount: num(tx.amount),
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

function fmtMoney(amount: number | null, currency: string): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  return `${currency || "USD"} ${Math.abs(amount).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

async function postSlackBot(botToken: string, channel: string, text: string): Promise<void> {
  if (!botToken || !channel) return;
  try {
    const r = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${botToken}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
    });
    const j = await r.json().catch(() => null);
    if (!j?.ok) console.error("mercury-sync: slack chat.postMessage", JSON.stringify(j));
  } catch (e) { console.error("mercury-sync: fallo post a slack", e); }
}

// Misma alerta que el webhook: avisa una sola vez por transacción (candado
// alerted_at). Devuelve true si avisó.
async function alertFailed(
  cfg: MercuryConfig,
  tx: { id: string; account_id: string | null; card_id: string | null; amount: number | null; currency: string; counterparty_name: string | null; reason_for_failure: string | null; merchant: any },
): Promise<boolean> {
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
    if (error) console.error("mercury-sync: error insert notifications", error);
  }

  await postSlackBot(str(cfg.slack_bot_token), str(cfg.slack_channel) || "#alertas-mercury",
    `:rotating_light: *Transacción fallida en Mercury*\n` +
    `• *Pago:* ${concepto} — ${monto}\n` +
    `• *Fondo:* ${fundName}${fundBalance ? ` — saldo actual ${fundBalance}` : ""}\n` +
    (cardLabel ? `• *Tarjeta:* ${cardLabel}\n` : "") +
    `• *Motivo:* ${motivo}\n` +
    `Revisar cuanto antes en el panel → Administración › Mercury.`);
  return true;
}

const arr = (resp: Record<string, any> | null, key: string): Record<string, any>[] => {
  if (!resp) return [];
  if (Array.isArray(resp)) return resp;
  if (Array.isArray(resp[key])) return resp[key];
  return [];
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "mercury_config").maybeSingle();
  const mcfg = (s?.value as MercuryConfig) ?? {};
  // Bot token de Slack: vive en venta_form_config (mismo bot que onboarding).
  const { data: vf } = await admin
    .from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const cfg: MercuryConfig = { ...mcfg, slack_bot_token: str((vf?.value as any)?.slack_bot_token) };

  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!cfg.cron_secret || got !== cfg.cron_secret) return jsonResp(401, { error: "unauthorized" });
  if (!str(cfg.api_token)) return jsonResp(200, { ok: false, error: "no_api_token" });

  const token = str(cfg.api_token);
  const nowIso = new Date().toISOString();

  // 1) Cuentas (fondos) + saldos.
  const accountsResp = await mercuryGet(token, "/accounts");
  const accounts = arr(accountsResp, "accounts");
  let accUpserts = 0;
  for (const a of accounts) {
    const id = str(a.id);
    if (!id) continue;
    const { error } = await admin.from("mercury_accounts").upsert({
      id,
      name: str(a.name) || null,
      kind: str(a.kind) || str(a.type) || null,
      status: str(a.status) || null,
      current_balance: num(a.currentBalance),
      available_balance: num(a.availableBalance),
      currency: str(a.currency) || "USD",
      raw: a,
      synced_at: nowIso,
      updated_at: nowIso,
    }, { onConflict: "id" });
    if (!error) accUpserts++;
  }

  // 2) Tarjetas + 3) transacciones recientes, por cada cuenta.
  let cardUpserts = 0, txUpserts = 0, alerted = 0;
  for (const a of accounts) {
    const accId = str(a.id);
    if (!accId) continue;

    const cardsResp = await mercuryGet(token, `/account/${encodeURIComponent(accId)}/cards`);
    for (const c of arr(cardsResp, "cards")) {
      const cardId = str(c.cardId) || str(c.id);
      if (!cardId) continue;
      const { error } = await admin.from("mercury_cards").upsert({
        card_id: cardId,
        account_id: accId,
        name_on_card: str(c.nameOnCard) || null,
        last_four: str(c.lastFourDigits) || null,
        network: str(c.network) || null,
        type: str(c.type) || null,
        status: str(c.status) || null,
        raw: c,
        updated_at: nowIso,
      }, { onConflict: "card_id" });
      if (!error) cardUpserts++;
    }

    const txResp = await mercuryGet(token, `/account/${encodeURIComponent(accId)}/transactions?limit=${TX_PER_ACCOUNT}&order=desc`);
    for (const t of arr(txResp, "transactions")) {
      const row = txRow(t);
      if (!row.id) continue;
      const { error } = await admin.from("mercury_transactions").upsert(row, { onConflict: "id" });
      if (!error) txUpserts++;
      // Solo alertar fallidas RECIENTES (≤48h). Evita que el primer barrido (o un
      // backfill) avise por fallas viejas. Las nuevas igual llegan en tiempo real
      // por el webhook; esto es solo la red de seguridad.
      if (row.status === "failed") {
        const ref = row.failed_at || row.tx_created_at;
        const recent = ref ? (Date.now() - new Date(ref).getTime()) <= 48 * 3600_000 : false;
        if (recent) {
          const did = await alertFailed(cfg, row);
          if (did) alerted++;
        }
      }
    }
  }

  return jsonResp(200, {
    ok: true,
    accounts: accUpserts,
    cards: cardUpserts,
    transactions: txUpserts,
    alerted,
  });
});
