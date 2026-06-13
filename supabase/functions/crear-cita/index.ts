// supabase/functions/crear-cita/index.ts
// Citas de la bandeja de Soporte (crear / reagendar / cancelar / sync RSVP):
//   - create (default): evento en Google Calendar (Apps Script en
//     admin@metodokorex.com) + reunión Zoom (S2S OAuth, best-effort) + fila en
//     `appointments` + WhatsApp de confirmación opcional. Si viene
//     invite_email, el prospecto recibe la invitación por mail (RSVP).
//   - action:'reschedule': mueve el evento de Calendar y la reunión de Zoom,
//     resetea los recordatorios y avisa por WhatsApp opcionalmente.
//   - action:'cancel': borra el evento de Calendar y la reunión de Zoom.
//   - action:'sync_rsvp': lee la asistencia (sí/no/quizás) de los invitados
//     desde Calendar y la refleja en appointments.rsvp_status.
//
// Auth: verify_jwt=true + permiso soporte:write (mismo patron que whatsapp-send).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function authorizeSoporteWrite(req: Request): Promise<{ userId: string; memberId: string | null } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  let allowed = roleNames.includes("admin");
  if (!allowed && roleNames.length > 0) {
    const { data: perms } = await admin
      .from("role_permissions").select("role")
      .in("role", roleNames).eq("module", "soporte").eq("can_write", true).limit(1);
    allowed = (perms || []).length > 0;
  }
  if (!allowed) return null;
  const { data: member } = await admin
    .from("team_members").select("id").eq("user_id", user.id).maybeSingle();
  return { userId: user.id, memberId: member?.id ?? null };
}

interface SoporteConfig {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
  calendar_script_url?: string;
  calendar_script_secret?: string;
  zoom_account_id?: string;
  zoom_client_id?: string;
  zoom_client_secret?: string;
}

async function getConfig(): Promise<SoporteConfig> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as SoporteConfig) ?? {};
}

// ── Zoom (Server-to-Server OAuth) — todo best-effort ──

async function zoomToken(cfg: SoporteConfig): Promise<string | null> {
  if (!cfg.zoom_account_id || !cfg.zoom_client_id || !cfg.zoom_client_secret) return null;
  try {
    const basic = btoa(`${cfg.zoom_client_id}:${cfg.zoom_client_secret}`);
    const r = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.zoom_account_id)}`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15000) },
    );
    const data = await r.json().catch(() => null);
    if (!r.ok || !data?.access_token) {
      console.error("crear-cita: Zoom token error", r.status, data);
      return null;
    }
    return String(data.access_token);
  } catch (e) {
    console.error("crear-cita: Zoom inalcanzable", e);
    return null;
  }
}

async function createZoomMeeting(
  cfg: SoporteConfig,
  args: { title: string; startAt: string; durationMin: number },
): Promise<{ joinUrl: string; meetingId: string } | null> {
  const token = await zoomToken(cfg);
  if (!token) return null;
  try {
    const r = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        topic: args.title,
        type: 2,
        start_time: args.startAt,
        duration: args.durationMin,
        settings: { join_before_host: true, waiting_room: false },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const meet = await r.json().catch(() => null);
    if (!r.ok || !meet?.join_url) {
      console.error("crear-cita: Zoom meeting error", r.status, meet);
      return null;
    }
    return { joinUrl: String(meet.join_url), meetingId: String(meet.id) };
  } catch (e) {
    console.error("crear-cita: Zoom create fallo", e);
    return null;
  }
}

// Mueve la reunión a la nueva fecha (requiere scope meeting:update; si no
// está, el link viejo sigue sirviendo igual — Zoom no expira los links).
async function updateZoomMeeting(
  cfg: SoporteConfig,
  meetingId: string,
  args: { title?: string; startAt: string; durationMin: number },
): Promise<void> {
  const token = await zoomToken(cfg);
  if (!token) return;
  try {
    const r = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        ...(args.title ? { topic: args.title } : {}),
        start_time: args.startAt,
        duration: args.durationMin,
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) console.error("crear-cita: Zoom update fallo", r.status, await r.text().catch(() => ""));
  } catch (e) {
    console.error("crear-cita: Zoom update inalcanzable", e);
  }
}

async function deleteZoomMeeting(cfg: SoporteConfig, meetingId: string): Promise<void> {
  const token = await zoomToken(cfg);
  if (!token) return;
  try {
    const r = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000),
    });
    if (!r.ok && r.status !== 404) {
      console.error("crear-cita: Zoom delete fallo (¿falta scope meeting:delete?)", r.status);
    }
  } catch (e) {
    console.error("crear-cita: Zoom delete inalcanzable", e);
  }
}

// ── Google Calendar via Apps Script ──

async function callCalendarScript(cfg: SoporteConfig, payload: Record<string, unknown>): Promise<Record<string, unknown> | null> {
  if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return null;
  try {
    const r = await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, ...payload }),
      signal: AbortSignal.timeout(60000),
    });
    return await r.json().catch(() => null);
  } catch (e) {
    console.error("crear-cita: Apps Script inalcanzable", e);
    return null;
  }
}

// Copia del helper de whatsapp-send (los edge functions no comparten archivos).
async function sendWhatsAppText(args: {
  conversation: { id: string; wa_jid: string };
  text: string;
  memberId: string | null;
  cfg: SoporteConfig;
}): Promise<boolean> {
  const { conversation, text, memberId, cfg } = args;
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
    sent_by: memberId,
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

// Lee Calendar para las citas vigentes: si el evento fue BORRADO desde
// Google Calendar la cita pasa a cancelada, y si tiene invitado se refleja
// su asistencia en rsvp_status. Devuelve cuántas cambió.
async function syncRsvpForConversation(cfg: SoporteConfig, conversationId: string): Promise<number> {
  const { data: appts } = await admin
    .from("appointments")
    .select("id, gcal_event_id, invite_email, rsvp_status")
    .eq("conversation_id", conversationId)
    .eq("status", "scheduled")
    .not("gcal_event_id", "is", null)
    .gte("start_at", new Date(Date.now() - 2 * 3600_000).toISOString())
    .limit(10);
  let changed = 0;
  for (const a of appts || []) {
    const res = await callCalendarScript(cfg, { action: "get_rsvp", eventId: a.gcal_event_id });
    if (res?.error === "not_found") {
      // Borrada/rechazada directamente en Google Calendar.
      await admin.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
      changed++;
      continue;
    }
    if (!res?.ok || !Array.isArray(res.guests) || !a.invite_email) continue;
    const guest = (res.guests as { email: string; status: string }[])
      .find((g) => g.email?.toLowerCase() === String(a.invite_email).toLowerCase());
    const status = guest ? (RSVP_MAP[guest.status] || "needs_action") : null;
    if (status && status !== a.rsvp_status) {
      // El chip refleja la asistencia del lead: confirmada solo si aceptó.
      await admin.from("appointments").update({ rsvp_status: status }).eq("id", a.id);
      changed++;
    }
  }
  return changed;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const auth = await authorizeSoporteWrite(req);
  if (!auth) return jsonResp(403, { error: "forbidden" });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }

  const cfg = await getConfig();

  // ── Cancelar (borra evento de Calendar y reunión de Zoom) ──
  if (body.action === "cancel") {
    const id = String(body.appointment_id || "");
    if (!id) return jsonResp(400, { error: "missing_fields" });
    const { data: appt } = await admin.from("appointments").select("*").eq("id", id).maybeSingle();
    if (!appt) return jsonResp(404, { error: "not_found" });
    if (appt.gcal_event_id) {
      await callCalendarScript(cfg, { action: "delete_event", eventId: appt.gcal_event_id });
    }
    if (appt.zoom_meeting_id) await deleteZoomMeeting(cfg, appt.zoom_meeting_id);
    await admin.from("appointments").update({ status: "cancelled" }).eq("id", id);
    return jsonResp(200, { ok: true });
  }

  // ── Reagendar ──
  if (body.action === "reschedule") {
    const id = String(body.appointment_id || "");
    const startAt = String(body.start_at || "");
    const endAt = String(body.end_at || "") || null;
    if (!id || !startAt) return jsonResp(400, { error: "missing_fields" });
    if (isNaN(new Date(startAt).getTime())) return jsonResp(400, { error: "bad_date" });

    const { data: appt } = await admin.from("appointments").select("*").eq("id", id).maybeSingle();
    if (!appt) return jsonResp(404, { error: "not_found" });
    if (appt.status !== "scheduled") return jsonResp(409, { error: "not_scheduled" });

    const title = body.title ? String(body.title).trim() : appt.title;
    const notes = body.notes !== undefined ? (body.notes ? String(body.notes) : null) : appt.notes;
    const durationMin = endAt
      ? Math.max(15, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000))
      : 60;

    // Calendar: si el evento existe, moverlo es obligatorio (si falla avisamos).
    if (appt.gcal_event_id && cfg.calendar_script_url) {
      const cal = await callCalendarScript(cfg, {
        action: "update_event",
        eventId: appt.gcal_event_id,
        title,
        start: startAt,
        end: endAt || startAt,
      });
      if (!cal?.ok) {
        console.error("crear-cita: fallo update_event", cal);
        return jsonResp(502, { error: "calendar_error" });
      }
    }
    if (appt.zoom_meeting_id) {
      await updateZoomMeeting(cfg, appt.zoom_meeting_id, { title, startAt, durationMin });
    }

    // Al moverla, los recordatorios se resetean para la nueva fecha.
    const { data: updated, error: updErr } = await admin.from("appointments").update({
      title,
      notes,
      start_at: startAt,
      end_at: endAt,
      reminder_24h_sent_at: null,
      reminder_2h_sent_at: null,
      reminders_sent: [],
    }).eq("id", id).select("*").single();
    if (updErr) {
      console.error("crear-cita: error actualizando appointment", updErr);
      return jsonResp(500, { error: "db_error" });
    }

    // Aviso del cambio por WhatsApp (best-effort).
    let updateSent = false;
    if (body.send_update === true && body.update_text && appt.conversation_id) {
      const { data: conv } = await admin
        .from("wa_conversations").select("id, wa_jid")
        .eq("id", appt.conversation_id).maybeSingle();
      if (conv) {
        const text = appt.meeting_link
          ? `${String(body.update_text)}\n\n🔗 Link de la reunión: ${appt.meeting_link}`
          : String(body.update_text);
        updateSent = await sendWhatsAppText({ conversation: conv, text, memberId: auth.memberId, cfg });
      }
    }
    return jsonResp(200, { ok: true, appointment: updated, update_sent: updateSent });
  }

  // ── Sync de asistencia (RSVP) ──
  if (body.action === "sync_rsvp") {
    const convId = String(body.conversation_id || "");
    if (!convId) return jsonResp(400, { error: "missing_fields" });
    const changed = await syncRsvpForConversation(cfg, convId);
    const { data: rows } = await admin
      .from("appointments").select("*")
      .eq("conversation_id", convId)
      .order("start_at", { ascending: false }).limit(50);
    return jsonResp(200, { ok: true, changed, appointments: rows || [] });
  }

  // ── Crear ──
  const convId = String(body.conversation_id || "");
  const title = String(body.title || "").trim();
  const startAt = String(body.start_at || "");
  const endAt = String(body.end_at || "") || null;
  const notes = body.notes ? String(body.notes) : null;
  const inviteEmail = String(body.invite_email || "").trim().toLowerCase() || null;
  if (!convId || !title || !startAt) return jsonResp(400, { error: "missing_fields" });
  if (isNaN(new Date(startAt).getTime())) return jsonResp(400, { error: "bad_date" });
  if (inviteEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(inviteEmail)) {
    return jsonResp(400, { error: "bad_email" });
  }

  const { data: conv } = await admin
    .from("wa_conversations")
    .select("id, wa_jid, wa_phone, wa_profile_name, contact_id")
    .eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });

  // Link de Zoom (si hay credenciales configuradas).
  const durationMin = endAt
    ? Math.max(15, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000))
    : 60;
  const zoom = await createZoomMeeting(cfg, { title, startAt, durationMin });
  const meetingLink = zoom?.joinUrl ?? null;

  // Evento en Google Calendar (si el script esta configurado, es obligatorio
  // que funcione; si no esta configurado, la cita se guarda igual sin evento).
  let gcalEventId: string | null = null;
  let gcalLink: string | null = null;
  if (cfg.calendar_script_url) {
    const cal = await callCalendarScript(cfg, {
      action: "create_event",
      title,
      description: [
        notes,
        meetingLink ? `Zoom: ${meetingLink}` : null,
        `Agendado desde el panel Korex · WhatsApp ${conv.wa_phone || conv.wa_jid}`,
      ].filter(Boolean).join("\n"),
      start: startAt,
      end: endAt || startAt,
      guests: inviteEmail || undefined,
      // El link de Zoom como ubicación: ahí lo detectan Fathom y las apps
      // de calendario como la videollamada "real" del evento.
      location: meetingLink || undefined,
    });
    if (!cal?.ok) {
      console.error("crear-cita: fallo el Apps Script", cal);
      return jsonResp(502, { error: "calendar_error" });
    }
    gcalEventId = (cal.eventId as string) || null;
    gcalLink = (cal.htmlLink as string) || null;
  }

  const { data: appt, error: insErr } = await admin.from("appointments").insert({
    conversation_id: conv.id,
    contact_id: conv.contact_id,
    wa_jid: conv.wa_jid,
    title,
    notes,
    start_at: startAt,
    end_at: endAt,
    gcal_event_id: gcalEventId,
    gcal_link: gcalLink,
    meeting_link: meetingLink,
    zoom_meeting_id: zoom?.meetingId ?? null,
    invite_email: inviteEmail,
    rsvp_status: inviteEmail ? "needs_action" : null,
    created_by: auth.memberId,
  }).select("*").single();
  if (insErr) {
    console.error("crear-cita: error insertando appointment", insErr);
    return jsonResp(500, { error: "db_error" });
  }

  // Confirmacion por WhatsApp (best-effort: la cita ya quedo creada).
  // Si hay link de Zoom, se agrega al final del mensaje automaticamente.
  let confirmationSent = false;
  if (body.send_confirmation === true && body.confirmation_text) {
    const confirmText = meetingLink
      ? `${String(body.confirmation_text)}\n\n🔗 Link de la reunión: ${meetingLink}`
      : String(body.confirmation_text);
    confirmationSent = await sendWhatsAppText({
      conversation: conv,
      text: confirmText,
      memberId: auth.memberId,
      cfg,
    });
  }

  return jsonResp(200, { ok: true, appointment: appt, confirmation_sent: confirmationSent });
});
