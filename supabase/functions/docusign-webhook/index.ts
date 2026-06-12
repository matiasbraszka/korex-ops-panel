// supabase/functions/docusign-webhook/index.ts
// Recibe los avisos de DocuSign Connect cuando un contrato (sobre/envelope) cambia
// de estado y los vincula con el cliente correcto en el panel.
//
// Vinculación (de más a menos confiable):
//   1. Código Korex (KX-XXXXX) en el asunto del sobre o en un custom field.
//   2. Email del firmante == clients.contract_signer_email / clients.email.
//   3. Si no matchea, el contrato queda SIN VINCULAR (client_id null) y se avisa
//      a Matías + Sioux para asignarlo a mano desde el panel.
//
// Efectos:
//   - Espeja el estado del sobre en la tabla `contracts`.
//   - Al firmarse (completed): marca clients.contract_signed_date, postea en el
//     canal de Slack del cliente y notifica al equipo legal.
//   - Si lo rechazan/anulan, también avisa.
//
// verify_jwt: false (la auth es por un secreto en la URL: ?secret=...).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// A quién avisar de novedades de contratos (ids de team_members).
const LEGAL_RECIPIENTS = ["matias", "sioux-carrera"];
const SIGNED_RECIPIENTS = ["matias", "sioux-carrera", "zil"];

function rnd(n = 6): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

// Extrae los datos del sobre del payload de Connect (formato JSON "aggregate"),
// con fallbacks por si la estructura viene distinta.
interface Envelope {
  envelopeId: string;
  status: string;
  subject: string;
  signerEmail: string;
  signerName: string;
  sentAt: string | null;
  completedAt: string | null;
  declinedReason: string | null;
  searchText: string; // asunto + custom fields + nombres (para buscar el código)
}

function parseEnvelope(body: Record<string, unknown>): Envelope | null {
  const data = (body.data ?? body) as Record<string, unknown>;
  const summary = (data.envelopeSummary ?? data ?? {}) as Record<string, unknown>;
  const envelopeId = str(data.envelopeId) || str(summary.envelopeId) || str(body.envelopeId);
  if (!envelopeId) return null;

  // Estado: puede venir como summary.status o derivarse del nombre del evento
  // (ej "envelope-completed" / "envelope-sent").
  let status = str(summary.status).toLowerCase();
  if (!status) {
    const ev = str(body.event).toLowerCase(); // "envelope-completed"
    status = ev.replace(/^envelope-/, "") || str(body.status).toLowerCase();
  }
  if (status === "signed") status = "completed";

  const subject = str(summary.emailSubject) || str(data.emailSubject);

  // Firmantes
  const recipients = (summary.recipients ?? {}) as Record<string, unknown>;
  const signers = Array.isArray(recipients.signers) ? (recipients.signers as Record<string, unknown>[]) : [];
  // Preferimos un firmante con email; si no, el primero.
  const signer = signers.find((s) => str(s.email)) ?? signers[0] ?? {};
  const signerEmail = str(signer.email);
  const signerName = str(signer.name);
  const declinedReason = str(signer.declinedReason) || null;

  // Custom fields (texto) para buscar el código Korex.
  const cf = (summary.customFields ?? {}) as Record<string, unknown>;
  const textCF = Array.isArray(cf.textCustomFields) ? (cf.textCustomFields as Record<string, unknown>[]) : [];
  const cfValues = textCF.map((f) => `${str(f.name)} ${str(f.value)}`).join(" ");

  const searchText = [subject, cfValues, signerName, ...signers.map((s) => str(s.name))].join(" ");

  return {
    envelopeId,
    status: status || "sent",
    subject,
    signerEmail,
    signerName,
    sentAt: str(summary.sentDateTime) || null,
    completedAt: str(summary.completedDateTime) || null,
    declinedReason,
    searchText,
  };
}

// Inserta notificaciones para varios destinatarios (ids de team_members).
async function notify(recipients: string[], type: string, title: string, bodyTxt: string) {
  const rows = recipients.map((rid) => ({
    id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
    recipient_id: rid,
    type,
    title,
    body: bodyTxt,
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) console.error("docusign-webhook: error insert notifications", error);
}

// Postea en el canal de Slack del cliente (si tiene canal y hay bot token).
async function postToClientChannel(token: string, channelId: string, text: string) {
  if (!token || !channelId) return;
  try {
    await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
    });
  } catch (e) {
    console.error("docusign-webhook: error posteando a slack", e);
  }
}

const STATUS_LABEL: Record<string, string> = {
  created: "creado (borrador)",
  sent: "enviado a firmar",
  delivered: "recibido por el firmante",
  completed: "firmado ✅",
  declined: "rechazado ❌",
  voided: "anulado",
};

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  // Config (secreto + bot token de Slack) en app_settings(key='venta_form_config').
  let cfg: Record<string, unknown> = {};
  try {
    const { data: s } = await supabase
      .from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    cfg = (s?.value as Record<string, unknown>) ?? {};
  } catch (_e) { /* ignore */ }

  // Auth: secreto en la URL (?secret=) o header x-docusign-secret.
  const expected = str(cfg.docusign_secret) || Deno.env.get("DOCUSIGN_WEBHOOK_SECRET") || "";
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-docusign-secret") || "";
  if (!expected || got !== expected) return jsonResp(401, { error: "unauthorized" });

  // Parsear el payload (JSON). Si no se puede, 200 para que DocuSign no reintente infinito.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    console.error("docusign-webhook: payload no JSON");
    return jsonResp(200, { ok: false, error: "not_json" });
  }

  const env = parseEnvelope(body);
  if (!env) return jsonResp(200, { ok: false, error: "no_envelope_id" });

  // --- Vincular con el cliente ---
  const codeMatch = env.searchText.toUpperCase().match(/KX-[A-Z0-9]{4,8}/);
  const korexCode = codeMatch ? codeMatch[0] : null;

  let clientId: string | null = null;
  let matchMethod = "none";

  if (korexCode) {
    const { data: byCode } = await supabase
      .from("clients").select("id").eq("korex_code", korexCode).maybeSingle();
    if (byCode?.id) { clientId = byCode.id; matchMethod = "code"; }
  }
  if (!clientId && env.signerEmail) {
    const em = env.signerEmail.toLowerCase();
    const { data: byEmail } = await supabase
      .from("clients").select("id")
      .or(`contract_signer_email.ilike.${em},email.ilike.${em}`)
      .limit(1).maybeSingle();
    if (byEmail?.id) { clientId = byEmail.id; matchMethod = "email"; }
  }

  // --- Upsert del contrato por envelope_id ---
  const { data: existing } = await supabase
    .from("contracts").select("*").eq("envelope_id", env.envelopeId).maybeSingle();

  const wasCompleted = existing?.status === "completed";
  const nowCompleted = env.status === "completed";
  const becameCompleted = nowCompleted && !wasCompleted;
  const becameDeclined = (env.status === "declined" || env.status === "voided") &&
    existing?.status !== env.status;

  const row = {
    envelope_id: env.envelopeId,
    // Solo seteamos client_id si lo encontramos; nunca lo borramos si ya estaba vinculado.
    client_id: clientId ?? existing?.client_id ?? null,
    status: env.status,
    subject: env.subject || existing?.subject || null,
    signer_email: env.signerEmail || existing?.signer_email || null,
    signer_name: env.signerName || existing?.signer_name || null,
    korex_code: korexCode ?? existing?.korex_code ?? null,
    match_method: clientId ? matchMethod : (existing?.match_method ?? "none"),
    sent_at: env.sentAt ?? existing?.sent_at ?? null,
    completed_at: env.completedAt ?? existing?.completed_at ?? null,
    declined_reason: env.declinedReason ?? existing?.declined_reason ?? null,
    raw: body,
    updated_at: new Date().toISOString(),
  };

  const finalClientId = row.client_id;

  if (existing) {
    await supabase.from("contracts").update(row).eq("envelope_id", env.envelopeId);
  } else {
    await supabase.from("contracts").insert({ id: `ctr_${Math.floor(Date.now() / 1000)}_${rnd(6)}`, ...row });
  }

  // Datos del cliente para los avisos (canal de Slack + nombre).
  let clientName = "";
  let channelId = "";
  if (finalClientId) {
    const { data: cli } = await supabase
      .from("clients").select("name, slack_channel_id, contract_signed_date").eq("id", finalClientId).maybeSingle();
    clientName = str(cli?.name);
    channelId = str(cli?.slack_channel_id);

    // Al firmarse: marcar fecha de firma en el cliente (si no estaba).
    if (becameCompleted && !cli?.contract_signed_date) {
      const signedDate = (env.completedAt || new Date().toISOString()).slice(0, 10);
      await supabase.from("clients").update({ contract_signed_date: signedDate }).eq("id", finalClientId);
    }
  }

  const botToken = str(cfg.slack_bot_token);
  const label = STATUS_LABEL[env.status] || env.status;

  // --- Efectos según el cambio de estado ---
  if (becameCompleted && finalClientId) {
    const by = env.signerName ? ` por *${env.signerName}*` : "";
    await postToClientChannel(botToken, channelId,
      `:white_check_mark: *Contrato firmado*${by}. ¡Listo para avanzar!`);
    await notify(SIGNED_RECIPIENTS, "contract_signed",
      "Contrato firmado",
      `${clientName || "Un cliente"} firmó el contrato${env.signerName ? ` (${env.signerName})` : ""}.`);
  } else if (becameDeclined && finalClientId) {
    const reason = env.declinedReason ? ` Motivo: ${env.declinedReason}` : "";
    await postToClientChannel(botToken, channelId,
      `:x: *El contrato fue ${label}.*${reason}`);
    await notify(LEGAL_RECIPIENTS, "contract_signed",
      `Contrato ${label}`,
      `${clientName || "Un cliente"}: el contrato quedó ${label}.${reason}`);
  }

  // NOTA: NO notificamos los contratos sin vincular. Muchos sobres se mandan a
  // gente que no es cliente del sistema (es esperable que queden sin vincular).
  // Igual quedan guardados en `contracts` por si hace falta consultarlos. Matías
  // avisa manualmente si algún contrato de un cliente real no se vinculó bien.

  return jsonResp(200, { ok: true, envelope: env.envelopeId, status: env.status, client_id: finalClientId, match: row.match_method });
});
