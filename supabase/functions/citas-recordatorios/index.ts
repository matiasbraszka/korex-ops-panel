// supabase/functions/citas-recordatorios/index.ts — v6
// v6: los recordatorios al lead salen en la zona en que agendó (booking_tz);
// si no hay, hora de Argentina.
// Recordatorios/seguimientos automáticos de citas por WhatsApp. Lo llama
// pg_cron cada 10 minutos (net.http_post con x-cron-secret).
//
// v5: los seguimientos son configurables por calendario (booking_calendars.reminders
// = [{hours_before, message}]). Cada uno se manda una sola vez (se registra en
// appointments.reminders_sent). Las citas SIN calendario (cargadas a mano en el
// panel) siguen con la lógica vieja de 24h/2h y las plantillas globales.
// Además sincroniza el RSVP del invitado contra Google Calendar (la cita queda
// confirmada solo si el lead aceptó; si el evento se borró, pasa a cancelada).
//
// verify_jwt: false — auth por secreto compartido (?secret= o x-cron-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TZ = "America/Argentina/Buenos_Aires";
const H = 3600_000;

interface SoporteConfig {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
  calendar_script_url?: string;
  calendar_script_secret?: string;
  cron_secret?: string;
  reminder_24h_template?: string;
  reminder_2h_template?: string;
}

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Plantillas viejas (citas a mano) usan {{var}}; las nuevas por calendario {var}.
const resolveDouble = (tpl: string, v: Record<string, string>) => tpl.replace(/\{\{(\w+)\}\}/g, (_, k) => v[k] ?? "");
const resolveSingle = (tpl: string, v: Record<string, string>) => tpl.replace(/\{(\w+)\}/g, (_, k) => v[k] ?? "");

async function sendWhatsAppText(cfg: SoporteConfig, conversation: { id: string; wa_jid: string }, text: string): Promise<boolean> {
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return false;
  let evoData: Record<string, any> | null = null;
  try {
    const evoRes = await fetch(`${serverUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: conversation.wa_jid, text }),
      signal: AbortSignal.timeout(25000),
    });
    evoData = await evoRes.json().catch(() => null);
    if (!evoRes.ok || !evoData?.key?.id) return false;
  } catch {
    return false;
  }
  const tsRaw = Number(evoData.messageTimestamp ?? 0);
  const waTimestamp = tsRaw > 0 ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString();
  await admin.from("wa_messages").upsert({
    conversation_id: conversation.id,
    wa_message_id: String(evoData.key.id),
    direction: "out",
    msg_type: "conversation",
    body: text,
    status: "sent",
    sent_by: null,
    payload: evoData,
    wa_timestamp: waTimestamp,
  }, { onConflict: "wa_message_id", ignoreDuplicates: true });
  await admin.from("wa_conversations").update({
    last_message_at: waTimestamp,
    last_message_preview: text.slice(0, 120),
    last_message_direction: "out",
  }).eq("id", conversation.id);
  return true;
}

const RSVP_MAP: Record<string, string> = {
  YES: "accepted",
  NO: "declined",
  MAYBE: "tentative",
  INVITED: "needs_action",
};

async function callCalendarScript(cfg: SoporteConfig, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return null;
  try {
    const r = await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, ...payload }),
      signal: AbortSignal.timeout(30000),
    });
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

interface ReminderCfg { hours_before: number; message: string }
function parseReminders(raw: unknown): ReminderCfg[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((r: any) => ({ hours_before: Math.round(Number(r?.hours_before)), message: String(r?.message || "").trim() }))
    .filter((r) => Number.isFinite(r.hours_before) && r.hours_before > 0 && r.message)
    .sort((a, b) => a.hours_before - b.hours_before); // imminentes primero
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const { data: s } = await admin
    .from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (s?.value as SoporteConfig) ?? {};

  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  if (!cfg.cron_secret || got !== cfg.cron_secret) return jsonResp(401, { error: "unauthorized" });

  const now = Date.now();

  // Citas vigentes en las próximas 25 horas, con conversación y reminders del
  // calendario (si tiene). Las de hasta 25h cubren el seguimiento de 24h.
  const { data: appts, error } = await admin
    .from("appointments")
    .select("id, title, start_at, created_at, booking_tz, meeting_link, reminder_24h_sent_at, reminder_2h_sent_at, reminders_sent, calendar:booking_calendars(reminders), conversation:wa_conversations(id, wa_jid, wa_profile_name, is_group, contact:contacts(full_name))")
    .eq("status", "scheduled")
    .gt("start_at", new Date(now).toISOString())
    .lt("start_at", new Date(now + 25 * H).toISOString())
    .limit(100);
  if (error) {
    console.error("citas-recordatorios: error leyendo citas", error);
    return jsonResp(500, { error: "db_error" });
  }

  const tpl24 = cfg.reminder_24h_template ||
    "Hola {{nombre}}! Te recuerdo que mañana, el {{fecha}} a las {{hora}}, tenemos nuestra reunión agendada. Te espero 👍";
  const tpl2 = cfg.reminder_2h_template ||
    "Hola {{nombre}}! En un rato, a las {{hora}}, tenemos nuestra reunión. Nos vemos ahí 👋";

  let sentCustom = 0, sent24 = 0, sent2 = 0;
  for (const a of appts || []) {
    const conv = a.conversation as unknown as
      { id: string; wa_jid: string; wa_profile_name: string | null; is_group: boolean; contact: { full_name: string | null } | null } | null;
    if (!conv?.wa_jid || conv.is_group) continue;

    const startMs = new Date(a.start_at).getTime();
    const createdMs = new Date(a.created_at).getTime();
    const untilStart = startMs - now;
    const noticeMs = startMs - createdMs; // con cuánta anticipación se agendó

    const start = new Date(a.start_at);
    const fullName = conv.contact?.full_name || conv.wa_profile_name || "";
    // Zona del lead (en la que agendó); si no hay, hora de Argentina.
    const leadTz = (typeof a.booking_tz === "string" && a.booking_tz) ? a.booking_tz : TZ;
    const vars = {
      nombre: fullName.split(" ")[0] || "",
      fecha: start.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: leadTz }),
      hora: start.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: leadTz }),
      zoom: a.meeting_link || "",
    };
    const withLink = (text: string) =>
      a.meeting_link && !text.includes(a.meeting_link) ? `${text}\n\n🔗 Link de la reunión: ${a.meeting_link}` : text;

    const calReminders = parseReminders((a.calendar as any)?.reminders);

    // ── Citas con calendario: seguimientos configurables ──
    if (calReminders.length) {
      const sentList: number[] = Array.isArray(a.reminders_sent) ? a.reminders_sent.map(Number) : [];
      // Umbrales ya cruzados (untilStart <= hb) y todavía no enviados.
      const due = calReminders.filter((r) => untilStart <= r.hours_before * H && !sentList.includes(r.hours_before));
      if (!due.length) continue;
      // El más imminente de los vencidos; los más lejanos cruzados se dan por
      // superados (no se mandan tarde), pero se marcan como enviados.
      const pick = due[0]; // due viene ordenado asc por hours_before
      const supersede = due.map((r) => r.hours_before);
      let ok = false;
      if (noticeMs > pick.hours_before * H) {
        ok = await sendWhatsAppText(cfg, conv, withLink(resolveSingle(pick.message, vars)));
      }
      // Marcar enviados (o superados) para no reintentar.
      const newSent = [...new Set([...sentList, ...supersede])];
      await admin.from("appointments").update({ reminders_sent: newSent }).eq("id", a.id);
      if (ok) sentCustom++;
      continue;
    }

    // ── Citas a mano (sin calendario): lógica vieja 24h/2h ──
    if (untilStart <= 2 * H && !a.reminder_2h_sent_at && noticeMs > 2 * H) {
      const ok = await sendWhatsAppText(cfg, conv, withLink(resolveDouble(tpl2, vars)));
      if (ok) {
        await admin.from("appointments").update({
          reminder_2h_sent_at: new Date().toISOString(),
          ...(a.reminder_24h_sent_at ? {} : { reminder_24h_sent_at: new Date().toISOString() }),
        }).eq("id", a.id);
        sent2++;
      }
      continue;
    }
    if (untilStart <= 24 * H && untilStart > 2 * H && !a.reminder_24h_sent_at && noticeMs > 24 * H) {
      const ok = await sendWhatsAppText(cfg, conv, withLink(resolveDouble(tpl24, vars)));
      if (ok) {
        await admin.from("appointments").update({ reminder_24h_sent_at: new Date().toISOString() }).eq("id", a.id);
        sent24++;
      }
    }
  }

  // ── Sync contra Calendar: eventos borrados → cita cancelada; RSVP del
  // invitado → rsvp_status (la cita queda confirmada solo si el lead aceptó) ──
  let rsvpChanged = 0;
  let cancelledSynced = 0;
  const { data: upcoming } = await admin
    .from("appointments")
    .select("id, gcal_event_id, invite_email, rsvp_status")
    .eq("status", "scheduled")
    .not("gcal_event_id", "is", null)
    .gt("start_at", new Date(now - 2 * H).toISOString())
    .lt("start_at", new Date(now + 14 * 24 * H).toISOString())
    .limit(20);
  for (const a of upcoming || []) {
    const res = await callCalendarScript(cfg, { action: "get_rsvp", eventId: a.gcal_event_id });
    if (res?.error === "not_found") {
      await admin.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
      cancelledSynced++;
      continue;
    }
    if (!res?.ok || !Array.isArray(res.guests) || !a.invite_email) continue;
    const guest = (res.guests as { email: string; status: string }[])
      .find((g) => g.email?.toLowerCase() === String(a.invite_email).toLowerCase());
    const status = guest ? (RSVP_MAP[guest.status] || "needs_action") : null;
    if (status && status !== a.rsvp_status) {
      await admin.from("appointments").update({ rsvp_status: status }).eq("id", a.id);
      rsvpChanged++;
    }
  }

  return jsonResp(200, { ok: true, sent_custom: sentCustom, sent_24h: sent24, sent_2h: sent2, rsvp_changed: rsvpChanged, cancelled_synced: cancelledSynced });
});
