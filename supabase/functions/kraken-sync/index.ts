// supabase/functions/kraken-sync/index.ts
// Lee Kraken (cripto, SOLO LECTURA) y guarda saldos + libro mayor (ingresos/egresos).
// Kraken no tiene webhooks → se consulta periódicamente (pg_cron).
// Auth de Kraken: API-Key + API-Sign (HMAC-SHA512 sobre path + SHA256(nonce+body)).
// verify_jwt: false — auth propia por ?secret=/x-cron-secret.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const KRAKEN_API = "https://api.kraken.com";
const LEDGER_MAX_PAGES = 30;       // hasta 1500 entradas
const LEDGER_PAGE_DELAY = 1500;    // ms entre páginas (rate limit de Kraken)

const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));
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

// nonce estrictamente creciente dentro de la corrida.
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

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "kraken_config").maybeSingle();
  const cfg = (s?.value as Record<string, string>) ?? {};

  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!cfg.cron_secret || got !== cfg.cron_secret) return jsonResp(401, { error: "unauthorized" });
  if (!cfg.api_key || !cfg.private_key) return jsonResp(200, { ok: false, error: "no_credentials" });

  const nowIso = new Date().toISOString();

  // 1) Saldos
  const bal = await krakenPrivate("Balance", {}, cfg.api_key, cfg.private_key);
  if (bal?.error?.length) return jsonResp(200, { ok: false, step: "Balance", error: bal.error });
  let balUpserts = 0;
  for (const [asset, amount] of Object.entries(bal.result ?? {})) {
    const { error } = await admin.from("kraken_balances").upsert({
      asset, amount: num(amount), updated_at: nowIso,
    }, { onConflict: "asset" });
    if (!error) balUpserts++;
  }
  const assets = Object.keys(bal.result ?? {});
  if (assets.length) await admin.from("kraken_balances").delete().not("asset", "in", `(${assets.map((a) => `"${a}"`).join(",")})`);

  // 2) Libro mayor (ingresos/egresos) — paginado
  let ledgerUpserts = 0; let total = 0; let rateLimited = false;
  for (let page = 0; page < LEDGER_MAX_PAGES; page++) {
    const led = await krakenPrivate("Ledgers", { ofs: String(page * 50) }, cfg.api_key, cfg.private_key);
    if (led?.error?.length) {
      if (String(led.error).includes("Rate limit")) { rateLimited = true; break; }
      if (page === 0) return jsonResp(200, { ok: false, step: "Ledgers", error: led.error });
      break;
    }
    total = Number(led.result?.count ?? 0);
    const entries = Object.entries(led.result?.ledger ?? {}) as [string, any][];
    if (entries.length === 0) break;
    for (const [id, e] of entries) {
      const { error } = await admin.from("kraken_ledger").upsert({
        id,
        refid: str(e.refid) || null,
        time: e.time ? new Date(Number(e.time) * 1000).toISOString() : null,
        type: str(e.type) || null,
        subtype: str(e.subtype) || null,
        asset: str(e.asset) || null,
        amount: num(e.amount),
        fee: num(e.fee),
        balance: num(e.balance),
        raw: e,
      }, { onConflict: "id" });
      if (!error) ledgerUpserts++;
    }
    if ((page + 1) * 50 >= total) break;
    await sleep(LEDGER_PAGE_DELAY);
  }

  return jsonResp(200, { ok: true, balances: balUpserts, ledger: ledgerUpserts, ledger_total: total, rate_limited: rateLimited });
});
