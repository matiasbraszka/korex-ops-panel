// supabase/functions/contract-reminders/index.ts
// Recordatorios de contratos pendientes de firma. La llama pg_cron 1 vez al día.
//
// Recorre los contratos que están "enviados a firmar" (status sent/delivered) hace
// más de N días y todavía no se firmaron, y:
//   - postea un recordatorio en el canal de Slack del cliente,
//   - notifica al equipo legal (campana del panel),
//   - marca last_reminder_at para no repetir antes de M días.
//
// NUNCA molesta a contratos en borrador, ya firmados, rechazados o anulados:
// el estado real lo manda DocuSign, así que solo recuerda lo que de verdad espera firma.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEGAL_RECIPIENTS = ["matias", "sioux-carrera"];

function rnd(n = 6) { return Math.random().toString(36).slice(2, 2 + n); }
function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
function daysAgoIso(days: number) { return new Date(Date.now() - days * 86400000).toISOString(); }

async function postSlack(token: string, channelId: string, text: string) {
  if (!token || !channelId) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
    });
  } catch (e) { console.error("contract-reminders: slack error", e); }
}

Deno.serve(async () => {
  // Config: bot token + umbrales (editables desde el panel, con defaults).
  let cfg: Record<string, unknown> = {};
  let onb: Record<string, unknown> = {};
  try {
    const { data: s } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    cfg = (s?.value as Record<string, unknown>) ?? {};
    const { data: g } = await supabase.from("app_settings").select("value").eq("key", "global").maybeSingle();
    onb = (((g?.value as Record<string, unknown>)?.onboarding_config) ?? {}) as Record<string, unknown>;
  } catch (_e) { /* ignore */ }

  const botToken = str(cfg.slack_bot_token);
  const afterDays = Number(onb.contract_reminder_days) || 3;     // recordar tras N días sin firmar
  const repeatDays = Number(onb.contract_reminder_repeat_days) || 2; // no repetir antes de M días

  // Contratos esperando firma hace rato y sin recordatorio reciente.
  const { data: pend, error } = await supabase
    .from("contracts")
    .select("id, client_id, subject, sent_at, last_reminder_at, status")
    .in("status", ["sent", "delivered"])
    .not("client_id", "is", null)
    .lt("sent_at", daysAgoIso(afterDays));
  if (error) { console.error("contract-reminders: query error", error); return new Response("err", { status: 500 }); }

  const repeatCutoff = daysAgoIso(repeatDays);
  const due = (pend ?? []).filter((c) => !c.last_reminder_at || c.last_reminder_at < repeatCutoff);

  let sent = 0;
  for (const c of due) {
    const { data: cli } = await supabase
      .from("clients").select("name, slack_channel_id").eq("id", c.client_id).maybeSingle();
    const name = str(cli?.name);
    const channelId = str(cli?.slack_channel_id);

    await postSlack(botToken, channelId,
      `:hourglass_flowing_sand: *Recordatorio:* el contrato sigue *pendiente de firma*. Si ya lo firmaron, avisennos; si no, ¿coordinamos para cerrarlo?`);

    await supabase.from("notifications").insert(
      LEGAL_RECIPIENTS.map((rid) => ({
        id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
        recipient_id: rid,
        type: "contract_unlinked",
        title: "Contrato pendiente de firma",
        body: `${name || "Un cliente"} todavía no firmó el contrato (enviado hace +${afterDays} días).`,
      })),
    );

    await supabase.from("contracts").update({ last_reminder_at: new Date().toISOString() }).eq("id", c.id);
    sent++;
  }

  return new Response(JSON.stringify({ ok: true, checked: pend?.length ?? 0, reminded: sent }), {
    headers: { "Content-Type": "application/json" },
  });
});
