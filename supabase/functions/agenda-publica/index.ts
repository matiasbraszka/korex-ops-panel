// supabase/functions/agenda-publica/index.ts
// Backend de la página pública /agendar (leads reservan reuniones solos).
//
//   POST { action: 'slots', year, month }  → días/horarios libres del mes
//     (disponibilidad de soporte_config.availability menos citas tomadas,
//     con 2h mínimas de anticipación; zona horaria Argentina UTC-3 fija).
//   POST { action: 'book', date, time, name, email, dial, phone, notes? }
//     → valida el slot, crea Zoom + evento en Calendar (invitación al email,
//     Zoom como ubicación), upsert de la conversación de WhatsApp (asignada
//     a la asistente), inserta la cita (los recordatorios 24h/2h corren
//     solos) y manda la confirmación por WhatsApp al lead.
//
// verify_jwt: false — página pública. Validación estricta de inputs +
// límite de reservas futuras por teléfono.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const TZ_OFFSET = "-03:00"; // Argentina (sin horario de verano)
const MIN_NOTICE_MS = 2 * 3600_000; // no se puede reservar con menos de 2h
const MAX_FUTURE_PER_PHONE = 3;
const MAX_MONTHS_AHEAD = 3;

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

interface Cfg {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
  calendar_script_url?: string;
  calendar_script_secret?: string;
  zoom_account_id?: string;
  zoom_client_id?: string;
  zoom_client_secret?: string;
  default_assignee?: string;
  availability?: { slot_minutes?: number; days?: Record<string, { enabled: boolean; from: string; to: string }> } | null;
  public_agenda?: { title?: string; description?: string; host_name?: string; host_role?: string; confirmation_template?: string };
}

async function getCfg(): Promise<Cfg> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as Cfg) ?? {};
}

const pad = (n: number) => String(n).padStart(2, "0");

// Instante UTC de una fecha+hora local argentina.
const toUTC = (date: string, time: string) => new Date(`${date}T${time}:00${TZ_OFFSET}`);

// Slots configurados de un día (sin filtrar conflictos).
function rawSlotsForDay(cfg: Cfg, date: Date): string[] {
  const av = cfg.availability;
  if (!av?.days) return [];
  const idx = (date.getUTCDay() + 6) % 7; // 0=Lun (mismo índice que el panel)
  const day = av.days[String(idx)];
  if (!day?.enabled || !day.from || !day.to) return [];
  const step = Math.max(15, Number(av.slot_minutes) || 60);
  const [fh, fm] = day.from.split(":").map(Number);
  const [th, tm] = day.to.split(":").map(Number);
  const out: string[] = [];
  for (let m = fh * 60 + fm; m + step <= th * 60 + tm; m += step) {
    out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  }
  return out;
}

// Días y horarios libres de un mes (descartando pasado y citas tomadas).
async function computeMonth(cfg: Cfg, year: number, month: number) {
  const step = Math.max(15, Number(cfg.availability?.slot_minutes) || 60);
  const first = new Date(Date.UTC(year, month, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));

  // Citas tomadas del mes (cualquier estado scheduled bloquea el horario).
  const { data: taken } = await admin
    .from("appointments")
    .select("start_at, end_at")
    .eq("status", "scheduled")
    .gte("start_at", new Date(first.getTime() - 86400_000).toISOString())
    .lt("start_at", new Date(next.getTime() + 86400_000).toISOString())
    .limit(500);
  const busy = (taken || []).map((a) => ({
    s: new Date(a.start_at).getTime(),
    e: a.end_at ? new Date(a.end_at).getTime() : new Date(a.start_at).getTime() + 3600_000,
  }));

  const minStart = Date.now() + MIN_NOTICE_MS;
  const days: Record<string, string[]> = {};
  for (let d = new Date(first); d < next; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const slots = rawSlotsForDay(cfg, d).filter((t) => {
      const s = toUTC(dateStr, t).getTime();
      if (s < minStart) return false;
      const e = s + step * 60000;
      return !busy.some((b) => s < b.e && e > b.s);
    });
    if (slots.length) days[dateStr] = slots;
  }
  return days;
}

// ── Zoom / Calendar / WhatsApp (mismos helpers del resto del módulo) ──

async function createZoomMeeting(cfg: Cfg, args: { title: string; startAt: string; durationMin: number }) {
  if (!cfg.zoom_account_id || !cfg.zoom_client_id || !cfg.zoom_client_secret) return null;
  try {
    const basic = btoa(`${cfg.zoom_client_id}:${cfg.zoom_client_secret}`);
    const tk = await fetch(
      `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(cfg.zoom_account_id)}`,
      { method: "POST", headers: { Authorization: `Basic ${basic}` }, signal: AbortSignal.timeout(15000) },
    );
    const tkData = await tk.json().catch(() => null);
    if (!tk.ok || !tkData?.access_token) return null;
    const r = await fetch("https://api.zoom.us/v2/users/me/meetings", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${tkData.access_token}` },
      body: JSON.stringify({
        topic: args.title, type: 2, start_time: args.startAt, duration: args.durationMin,
        settings: { join_before_host: true, waiting_room: false },
      }),
      signal: AbortSignal.timeout(15000),
    });
    const meet = await r.json().catch(() => null);
    if (!r.ok || !meet?.join_url) return null;
    return { joinUrl: String(meet.join_url), meetingId: String(meet.id) };
  } catch {
    return null;
  }
}

async function callCalendarScript(cfg: Cfg, payload: Record<string, unknown>) {
  if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return null;
  try {
    const r = await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, ...payload }),
      signal: AbortSignal.timeout(60000),
    });
    return await r.json().catch(() => null);
  } catch {
    return null;
  }
}

async function sendWhatsApp(cfg: Cfg, conversation: { id: string; wa_jid: string }, text: string): Promise<boolean> {
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return false;
  let evoData: Record<string, any> | null = null;
  try {
    const r = await fetch(`${serverUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: conversation.wa_jid, text }),
      signal: AbortSignal.timeout(25000),
    });
    evoData = await r.json().catch(() => null);
    if (!r.ok || !evoData?.key?.id) return false;
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

// Teléfono de WhatsApp normalizado: dial + número. Para +54 (Argentina) los
// celulares llevan el 9 después del 54.
function waPhoneFrom(dial: string, phone: string): string | null {
  const d = dial.replace(/\D/g, "");
  let p = phone.replace(/\D/g, "");
  if (!d || p.length < 6 || p.length > 13) return null;
  if (d === "54") {
    if (p.startsWith("0")) p = p.slice(1);
    if (!p.startsWith("9")) p = "9" + p;
  }
  return d + p;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }

  const cfg = await getCfg();
  const pub = cfg.public_agenda || {};
  const slotMin = Math.max(15, Number(cfg.availability?.slot_minutes) || 60);

  // ── Horarios libres del mes ──
  if (body.action === "slots") {
    const year = Number(body.year);
    const month = Number(body.month); // 0-11
    const now = new Date();
    const monthsAhead = (year - now.getUTCFullYear()) * 12 + (month - now.getUTCMonth());
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 ||
        monthsAhead < 0 || monthsAhead > MAX_MONTHS_AHEAD) {
      return jsonResp(400, { error: "bad_month" });
    }
    const days = await computeMonth(cfg, year, month);
    return jsonResp(200, {
      ok: true,
      days,
      event: {
        title: pub.title || "Reunión",
        description: pub.description || "",
        host_name: pub.host_name || "Método Korex",
        host_role: pub.host_role || "",
        slot_minutes: slotMin,
      },
      configured: Boolean(cfg.availability?.days &&
        Object.values(cfg.availability.days).some((d) => d?.enabled)),
    });
  }

  // ── Reservar ──
  if (body.action === "book") {
    const date = String(body.date || "");
    const time = String(body.time || "");
    const name = String(body.name || "").trim().slice(0, 80);
    const email = String(body.email || "").trim().toLowerCase().slice(0, 120);
    const dial = String(body.dial || "+54");
    const phone = String(body.phone || "");
    const notes = String(body.notes || "").trim().slice(0, 500) || null;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return jsonResp(400, { error: "bad_slot" });
    if (name.length < 2) return jsonResp(400, { error: "bad_name" });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return jsonResp(400, { error: "bad_email" });
    const waDigits = waPhoneFrom(dial, phone);
    if (!waDigits) return jsonResp(400, { error: "bad_phone" });

    // El slot tiene que seguir libre (recalcular el mes de esa fecha).
    const slotDate = toUTC(date, time);
    const [yy, mm] = date.split("-").map(Number);
    const dayMap = await computeMonth(cfg, yy, mm - 1);
    if (!(dayMap[date] || []).includes(time)) return jsonResp(409, { error: "slot_taken" });

    const waJid = `${waDigits}@s.whatsapp.net`;

    // Límite anti-abuso: máx reservas futuras por teléfono.
    const { count } = await admin
      .from("appointments")
      .select("id", { count: "exact", head: true })
      .eq("wa_jid", waJid)
      .eq("status", "scheduled")
      .gt("start_at", new Date().toISOString());
    if ((count ?? 0) >= MAX_FUTURE_PER_PHONE) return jsonResp(429, { error: "too_many" });

    const startAt = slotDate.toISOString();
    const endAt = new Date(slotDate.getTime() + slotMin * 60000).toISOString();
    const title = `${pub.title || "Reunión"} — ${name}`;

    // Zoom + Calendar (invitación al lead, Zoom como ubicación).
    const zoom = await createZoomMeeting(cfg, { title, startAt, durationMin: slotMin });
    const meetingLink = zoom?.joinUrl ?? null;
    let gcalEventId: string | null = null;
    let gcalLink: string | null = null;
    if (cfg.calendar_script_url) {
      const cal = await callCalendarScript(cfg, {
        action: "create_event",
        title,
        description: [
          `Reserva desde la agenda pública.`,
          `Lead: ${name} · ${email} · +${waDigits}`,
          notes ? `Quiere resolver: ${notes}` : null,
          meetingLink ? `Zoom: ${meetingLink}` : null,
        ].filter(Boolean).join("\n"),
        start: startAt,
        end: endAt,
        guests: email,
        location: meetingLink || undefined,
      });
      if (!cal?.ok) {
        console.error("agenda-publica: fallo el Apps Script", cal);
        return jsonResp(502, { error: "calendar_error" });
      }
      gcalEventId = (cal.eventId as string) || null;
      gcalLink = (cal.htmlLink as string) || null;
    }

    // Conversación de WhatsApp (se crea si no existe; asignada a la asistente).
    let convId: string | null = null;
    const { data: existingConv } = await admin
      .from("wa_conversations").select("id").eq("wa_jid", waJid).maybeSingle();
    if (existingConv) {
      convId = existingConv.id;
    } else {
      const { data: createdConv } = await admin
        .from("wa_conversations")
        .insert({
          wa_jid: waJid,
          wa_phone: waDigits,
          is_group: false,
          wa_profile_name: name,
          assigned_to: cfg.default_assignee || null,
        })
        .select("id").single();
      convId = createdConv?.id ?? null;
    }

    const { data: appt, error: insErr } = await admin.from("appointments").insert({
      conversation_id: convId,
      wa_jid: waJid,
      title,
      notes: notes ? `Quiere resolver: ${notes}` : null,
      start_at: startAt,
      end_at: endAt,
      gcal_event_id: gcalEventId,
      gcal_link: gcalLink,
      meeting_link: meetingLink,
      zoom_meeting_id: zoom?.meetingId ?? null,
      invite_email: email,
      rsvp_status: "needs_action",
      created_by: null,
    }).select("id").single();
    if (insErr) {
      console.error("agenda-publica: error insertando appointment", insErr);
      return jsonResp(500, { error: "db_error" });
    }

    // Alta del lead en Google Contacts (best-effort, no bloquea).
    const contactPromise = callCalendarScript(cfg, { action: "upsert_contact", name, phone: waDigits }).catch(() => null);

    // Confirmación por WhatsApp.
    const fecha = slotDate.toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long", timeZone: "America/Argentina/Buenos_Aires" });
    const tpl = pub.confirmation_template || "Hola {nombre}! Confirmamos tu reunión para el {fecha} a las {hora} (hora Argentina).";
    let confirmText = tpl
      .replaceAll("{nombre}", name.split(" ")[0])
      .replaceAll("{fecha}", fecha)
      .replaceAll("{hora}", time);
    if (meetingLink) confirmText += `\n\n🔗 Link de la reunión: ${meetingLink}`;
    let waSent = false;
    if (convId) waSent = await sendWhatsApp(cfg, { id: convId, wa_jid: waJid }, confirmText);

    try {
      // deno-lint-ignore no-explicit-any
      (globalThis as any).EdgeRuntime?.waitUntil?.(contactPromise);
    } catch { /* best-effort */ }

    return jsonResp(200, {
      ok: true,
      appointment_id: appt.id,
      whatsapp_sent: waSent,
      event: { title: pub.title || "Reunión", start_at: startAt, end_at: endAt, host_name: pub.host_name || "Método Korex" },
    });
  }

  return jsonResp(400, { error: "unknown_action" });
});
