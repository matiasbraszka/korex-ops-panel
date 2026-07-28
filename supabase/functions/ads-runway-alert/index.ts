// supabase/functions/ads-runway-alert/index.ts
// Capa PROACTIVA de runway de publicidad. Corre 1x/dia por cron.
// Lee el DME diario por cliente (saldo_final / gasto promedio) via RPC ads_runway_scan,
// y avisa ANTES de que la cuenta de ads se quede sin fondo: panel + Slack (#alertas-mercury).
// El RPC ya aplica dedup (no repite el mismo nivel dentro del cooldown) para no molestar
// cuando la cuenta ya esta seca.
//
// Auth (verify_jwt:false): x-cron-secret == ads_runway_config.cron_secret.
// Query params: ?dry=true  => calcula y devuelve, NO avisa ni toca estado.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const rnd = (n = 6) => Math.random().toString(36).slice(2, 2 + n);
function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function fmtUsd(n: number): string {
  return `USD ${Number(n).toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function diasTxt(runway: number): string {
  if (runway < 1) return "menos de 1 dia";
  const d = Math.floor(runway);
  return `~${d} dia${d === 1 ? "" : "s"}`;
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
    if (!j?.ok) console.error("ads-runway-alert: slack chat.postMessage", JSON.stringify(j));
  } catch (e) {
    console.error("ads-runway-alert: fallo post a slack", e);
  }
}

interface Row {
  client_id: string; cliente: string; saldo: number;
  gasto_prom: number; runway: number; tier: string; dias: number;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "true";

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "ads_runway_config").maybeSingle();
  const cfg = (s?.value as Record<string, any>) ?? {};

  // Auth por cron secret (salvo dry desde consola con service role, que igual pasa el header)
  const got = req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (!dry && str(cfg.cron_secret) && got !== str(cfg.cron_secret)) {
    return jsonResp(401, { error: "unauthorized" });
  }

  if (cfg.enabled === false) {
    return jsonResp(200, { ok: true, disabled: true });
  }

  const { data: rows, error } = await admin.rpc("ads_runway_scan", { p_dry: dry });
  if (error) {
    console.error("ads-runway-alert: error rpc", error);
    return jsonResp(200, { ok: false, error: error.message });
  }
  const list = (rows ?? []) as Row[];

  if (dry) return jsonResp(200, { ok: true, dry: true, count: list.length, rows: list });
  if (list.length === 0) return jsonResp(200, { ok: true, count: 0 });

  // --- Slack bot token (reusa el de onboarding, igual que mercury-webhook) ---
  const { data: vf } = await admin
    .from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const slackBot = str((vf?.value as any)?.slack_bot_token);
  const channel = str(cfg.slack_channel) || "#alertas-mercury";

  const linea = (r: Row) => {
    const flag = r.tier === "crit" ? ":red_circle:" : ":large_yellow_circle:";
    return `${flag} *${r.cliente}* — aguanta ${diasTxt(r.runway)} (saldo ${fmtUsd(r.saldo)}, gasta ${fmtUsd(r.gasto_prom)}/dia)`;
  };
  const slackText =
    `:fuelpump: *Publicidad por agotarse* — recargar antes de que Meta rechace el cobro\n` +
    list.map(linea).join("\n") +
    `\n_Umbral: menos de ${str(cfg.warn_days) || 7} dias de runway. Fuente: DME diario._`;
  await postSlackBot(slackBot, channel, slackText);

  // --- Notificaciones al panel (admins) ---
  const { data: ids } = await admin.rpc("korex_admin_member_ids");
  const recipients: string[] = Array.isArray(ids) ? ids : [];
  if (recipients.length) {
    const resumen = list
      .map((r) => `${r.cliente} (${diasTxt(r.runway)}, saldo ${fmtUsd(r.saldo)})`)
      .join("; ");
    const body =
      list.length === 1
        ? `A ${list[0].cliente} le queda saldo de publicidad para ${diasTxt(list[0].runway)} ` +
          `(${fmtUsd(list[0].saldo)}, gasta ${fmtUsd(list[0].gasto_prom)}/dia). Recargar antes de que Meta rechace el cobro.`
        : `${list.length} clientes con publicidad por agotarse: ${resumen}. Recargar antes de que Meta rechace el cobro.`;
    const nowSec = Math.floor(Date.now() / 1000);
    const notifRows = recipients.map((rid) => ({
      id: `ntf_${nowSec}_${rnd(6)}`,
      recipient_id: rid,
      type: "ads_runway_low",
      title: list.some((r) => r.tier === "crit") ? "Publicidad por agotarse (critico)" : "Publicidad por agotarse",
      body,
    }));
    const { error: nErr } = await admin.from("notifications").insert(notifRows);
    if (nErr) console.error("ads-runway-alert: error insert notifications", nErr);
  }

  return jsonResp(200, { ok: true, count: list.length, clientes: list.map((r) => r.cliente) });
});
