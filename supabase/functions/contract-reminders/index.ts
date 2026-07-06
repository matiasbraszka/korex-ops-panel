// supabase/functions/contract-reminders/index.ts
// Recordatorios de contratos pendientes de firma. La llama pg_cron 1 vez al día.
//
// Recorre los contratos que están "enviados a firmar" (status sent/delivered) hace
// más de N días (por defecto 3) y todavía no se firmaron, y:
//   - avisa en #contratos-legalidad (con el documento identificado),
//   - notifica al equipo legal (campana del panel),
//   - marca last_reminder_at para no repetir antes de M días.
//
// NOTA (2026-07-05, pedido de Matías): al canal PRIVADO del cliente ya NO se le
// postea el recordatorio de "firma pendiente" (era intrusivo). El pendiente de
// firma queda solo como aviso INTERNO en #contratos-legalidad + campana del panel.
// El "contrato firmado" (docusign-webhook) al cliente se mantiene.
//
// Un cliente puede tener varios contratos: cada fila (envelope) se chequea por
// separado, así que los avisos siempre dicen de qué documento se trata.
//
// NUNCA molesta a contratos en borrador, ya firmados, rechazados o anulados:
// el estado real lo manda DocuSign, así que solo recuerda lo que de verdad espera firma.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const LEGAL_RECIPIENTS = ["matias", "sioux-carrera"];
const LEGAL_CHANNEL_FALLBACK = "C0AD74MT33P"; // #contratos-legalidad

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
  const legalChannel = str(cfg.contratos_legalidad_channel) || LEGAL_CHANNEL_FALLBACK;
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
      .from("clients").select("name").eq("id", c.client_id).maybeSingle();
    const name = str(cli?.name);
    const doc = str(c.subject) || "(sin asunto)";
    const sentDay = str(c.sent_at).slice(0, 10);

    // Aviso SOLO al canal interno de legalidad. Al canal privado del cliente ya
    // NO se le recuerda la firma pendiente (pedido de Matías 2026-07-05).
    await postSlack(botToken, legalChannel,
      `:hourglass_flowing_sand: *Pendiente de firma (+${afterDays} días)* — *${name || "Cliente"}*\n• Documento: ${doc}${sentDay ? `\n• Enviado: ${sentDay}` : ""}`);

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

  // ─── Avisos de VENCIMIENTO de contratos ───
  // Mira los contratos con fecha de vencimiento/renovación que están por vencer o
  // ya vencieron. Avisa a legal + canal del cliente + #contratos-legalidad. No repite antes de N días.
  const renewalDays = Number(onb.contract_renewal_days) || 30;   // avisar X días antes
  const renewalRepeatDays = Number(onb.contract_renewal_repeat_days) || 7; // no repetir antes de M días
  const todayStr = new Date().toISOString().slice(0, 10);

  const { data: withRenewal } = await supabase
    .from("contracts")
    .select("id, client_id, title, status, renewal_date, renewal_alerted_at")
    .not("renewal_date", "is", null)
    .neq("status", "vencido");

  const soonCutoff = new Date(Date.now() + renewalDays * 86400000).toISOString().slice(0, 10);
  const renewalRepeatCutoff = daysAgoIso(renewalRepeatDays).slice(0, 10);
  let renewals = 0;

  for (const c of (withRenewal ?? [])) {
    if (!c.client_id || !c.renewal_date) continue;
    const expired = c.renewal_date < todayStr;
    const soon = !expired && c.renewal_date <= soonCutoff;
    if (!expired && !soon) continue;
    // No repetir si ya avisamos hace poco (salvo que recién venza).
    if (!expired && c.renewal_alerted_at && c.renewal_alerted_at > renewalRepeatCutoff) continue;

    const { data: cli } = await supabase
      .from("clients").select("name, slack_channel_id").eq("id", c.client_id).maybeSingle();
    const name = str(cli?.name);
    const channelId = str(cli?.slack_channel_id);
    const titulo = str(c.title) || "Contrato";

    if (expired) {
      await supabase.from("contracts").update({ status: "vencido", renewal_alerted_at: todayStr }).eq("id", c.id);
      await postSlack(botToken, channelId,
        `:rotating_light: *El contrato "${titulo}" venció* (${c.renewal_date}). Coordinemos la renovación.`);
      await postSlack(botToken, legalChannel,
        `:rotating_light: *Contrato vencido* — *${name || "Cliente"}*\n• Documento: ${titulo}\n• Venció: ${c.renewal_date}`);
      await supabase.from("notifications").insert(
        LEGAL_RECIPIENTS.map((rid) => ({
          id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
          recipient_id: rid,
          type: "contract_renewal",
          title: "Contrato vencido",
          body: `El contrato "${titulo}" de ${name || "un cliente"} venció el ${c.renewal_date}.`,
        })),
      );
    } else {
      const daysLeft = Math.max(0, Math.round((new Date(c.renewal_date).getTime() - Date.now()) / 86400000));
      await supabase.from("contracts").update({ renewal_alerted_at: todayStr }).eq("id", c.id);
      await postSlack(botToken, channelId,
        `:calendar: *El contrato "${titulo}" vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"}* (${c.renewal_date}). ¿Coordinamos la renovación?`);
      await postSlack(botToken, legalChannel,
        `:calendar: *Contrato por vencer (${daysLeft} día${daysLeft === 1 ? "" : "s"})* — *${name || "Cliente"}*\n• Documento: ${titulo}\n• Vence: ${c.renewal_date}`);
      await supabase.from("notifications").insert(
        LEGAL_RECIPIENTS.map((rid) => ({
          id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
          recipient_id: rid,
          type: "contract_renewal",
          title: "Contrato por vencer",
          body: `El contrato "${titulo}" de ${name || "un cliente"} vence en ${daysLeft} día${daysLeft === 1 ? "" : "s"} (${c.renewal_date}).`,
        })),
      );
    }
    renewals++;
  }

  return new Response(JSON.stringify({ ok: true, checked: pend?.length ?? 0, reminded: sent, renewals }), {
    headers: { "Content-Type": "application/json" },
  });
});
