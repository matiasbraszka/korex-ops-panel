// supabase/functions/kraken-sync/index.ts
// Lee Kraken (cripto, SOLO LECTURA): saldos + libro mayor + depósitos/retiros con
// detalle (txid, red). Avisa a los admins cuando entra un PAGO en USDT (depósito).
// Kraken no tiene webhooks → pg_cron. Auth Kraken: API-Key + API-Sign (HMAC-SHA512).
// verify_jwt: false — auth propia por ?secret=/x-cron-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const KRAKEN_API = "https://api.kraken.com";
const LEDGER_MAX_PAGES = 30;
const LEDGER_PAGE_DELAY = 1500;

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
const rnd = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}
function b64encode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

let nonceCounter = Date.now() * 1000;
const nextNonce = () => String(++nonceCounter);

async function krakenSign(path: string, postdata: string, nonce: string, privateKey: string): Promise<string> {
  const sha256 = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce + postdata)));
  const pathBytes = new TextEncoder().encode(path);
  const message = new Uint8Array(pathBytes.length + sha256.length);
  message.set(pathBytes, 0);
  message.set(sha256, pathBytes.length);
  const key = await crypto.subtle.importKey("raw", b64decode(privateKey), { name: "HMAC", hash: "SHA-512" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, message));
  return b64encode(sig);
}

async function krakenPrivate(method: string, params: Record<string, string>, apiKey: string, privateKey: string): Promise<any> {
  const path = `/0/private/${method}`;
  const nonce = nextNonce();
  const body = new URLSearchParams({ nonce, ...params }).toString();
  const apiSign = await krakenSign(path, body, nonce, privateKey);
  const r = await fetch(`${KRAKEN_API}${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": apiSign,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "KorexPanel/1.0",
    },
    body,
    signal: AbortSignal.timeout(25000),
  });
  return await r.json().catch(() => ({ error: ["parse_error"] }));
}

function transferRow(e: any, direction: string) {
  return {
    refid: str(e.refid) || str(e.txid) || `${direction}_${str(e.time)}_${rnd()}`,
    direction,
    asset: str(e.asset) || null,
    amount: num(e.amount),
    fee: num(e.fee),
    method: str(e.method) || null,
    txid: str(e.txid) || null,
    address: str(e.info) || null,
    alias: str(e.key) || null,   // alias de la wallet (libreta de Kraken) → a quién le pagamos
    time: e.time ? new Date(Number(e.time) * 1000).toISOString() : null,
    status: str(e.status) || null,
    raw: e,
  };
}

async function notifyDeposit(t: any) {
  const { data: locked } = await admin
    .from("kraken_transfers").update({ alerted_at: new Date().toISOString() })
    .eq("refid", t.refid).is("alerted_at", null).select("refid");
  if (!locked || locked.length === 0) return;
  const { data: ids } = await admin.rpc("korex_admin_member_ids");
  const recipients: string[] = Array.isArray(ids) ? ids : [];
  if (!recipients.length) return;
  const monto = `${Math.abs(Number(t.amount) || 0).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${t.asset}`;
  const rows = recipients.map((rid) => ({
    id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
    recipient_id: rid,
    type: "kraken_deposit",
    title: "Pago recibido en Kraken",
    body: `Entró un pago de ${monto}${t.method ? ` (${t.method})` : ""} en Kraken.${t.txid ? ` Tx: ${t.txid}` : ""}`,
  }));
  await admin.from("notifications").insert(rows);
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "kraken_config").maybeSingle();
  const cfg = (s?.value as Record<string, string>) ?? {};

  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!cfg.cron_secret || got !== cfg.cron_secret) return jsonResp(401, { error: "unauthorized" });
  if (!cfg.api_key || !cfg.private_key) return jsonResp(200, { ok: false, error: "no_credentials" });
  const KEY = cfg.api_key, PRIV = cfg.private_key;
  const nowIso = new Date().toISOString();

  // 1) Saldos
  const bal = await krakenPrivate("Balance", {}, KEY, PRIV);
  if (bal?.error?.length) return jsonResp(200, { ok: false, step: "Balance", error: bal.error });
  let balUpserts = 0;
  for (const [asset, amount] of Object.entries(bal.result ?? {})) {
    const { error } = await admin.from("kraken_balances").upsert({ asset, amount: num(amount), updated_at: nowIso }, { onConflict: "asset" });
    if (!error) balUpserts++;
  }
  const assets = Object.keys(bal.result ?? {});
  if (assets.length) await admin.from("kraken_balances").delete().not("asset", "in", `(${assets.map((a) => `"${a}"`).join(",")})`);

  // 2) Libro mayor (paginado)
  let ledgerUpserts = 0; let total = 0; let rateLimited = false;
  for (let page = 0; page < LEDGER_MAX_PAGES; page++) {
    const led = await krakenPrivate("Ledgers", { ofs: String(page * 50) }, KEY, PRIV);
    if (led?.error?.length) { if (String(led.error).includes("Rate limit")) { rateLimited = true; break; } if (page === 0) return jsonResp(200, { ok: false, step: "Ledgers", error: led.error }); break; }
    total = Number(led.result?.count ?? 0);
    const entries = Object.entries(led.result?.ledger ?? {}) as [string, any][];
    if (entries.length === 0) break;
    for (const [id, e] of entries) {
      const { error } = await admin.from("kraken_ledger").upsert({
        id, refid: str(e.refid) || null,
        time: e.time ? new Date(Number(e.time) * 1000).toISOString() : null,
        type: str(e.type) || null, subtype: str(e.subtype) || null, asset: str(e.asset) || null,
        amount: num(e.amount), fee: num(e.fee), balance: num(e.balance), raw: e,
      }, { onConflict: "id" });
      if (!error) ledgerUpserts++;
    }
    if ((page + 1) * 50 >= total) break;
    await sleep(LEDGER_PAGE_DELAY);
  }

  // 3) Depósitos y retiros con detalle (txid, red)
  let transferUpserts = 0; let alerted = 0;
  const dep = await krakenPrivate("DepositStatus", {}, KEY, PRIV);
  const wd = await krakenPrivate("WithdrawStatus", {}, KEY, PRIV);
  const depArr: any[] = Array.isArray(dep?.result) ? dep.result : [];
  const wdArr: any[] = Array.isArray(wd?.result) ? wd.result : [];
  for (const e of depArr) {
    const row = transferRow(e, "in");
    const { error } = await admin.from("kraken_transfers").upsert(row, { onConflict: "refid" });
    if (!error) transferUpserts++;
    // Avisar SOLO ingresos en USDT recientes (≤48h) y no avisados.
    const recent = row.time ? (Date.now() - new Date(row.time).getTime()) <= 48 * 3600000 : false;
    if (/usdt/i.test(row.asset || "") && recent) { await notifyDeposit(row); alerted++; }
  }
  for (const e of wdArr) {
    const row = transferRow(e, "out");
    const { error } = await admin.from("kraken_transfers").upsert(row, { onConflict: "refid" });
    if (!error) transferUpserts++;
  }
  // Depósitos viejos (>48h) no avisados: marcarlos vistos para no spamear después.
  await admin.from("kraken_transfers").update({ alerted_at: nowIso })
    .is("alerted_at", null).eq("direction", "in").lt("time", new Date(Date.now() - 48 * 3600000).toISOString());

  return jsonResp(200, { ok: true, balances: balUpserts, ledger: ledgerUpserts, ledger_total: total, transfers: transferUpserts, deposits: depArr.length, withdrawals: wdArr.length, alerted, rate_limited: rateLimited, dep_err: dep?.error ?? null, wd_err: wd?.error ?? null });
});
