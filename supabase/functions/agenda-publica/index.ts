// supabase/functions/agenda-publica/index.ts — v2
// Backend de la página pública /agendar[/<slug>] (leads reservan solos).
//
//   POST { action: 'slots', year, month, slug? } → días/horarios libres del mes
//     para ese calendario de reserva (booking_calendars): intersección de la
//     disponibilidad semanal de CADA miembro del equipo, menos citas internas
//     que pisen a algún miembro, menos los bloques ocupados de sus Google
//     Calendars reales (freebusy vía Apps Script). 2h mínimas de anticipación,
//     zona horaria Argentina UTC-3 fija.
//   POST { action: 'book', date, time, name, email, dial, phone, notes?, slug? }
//     → revalida el slot, crea Zoom + evento en Calendar (título y color del
//     calendario, invitación al lead y a los miembros — así Fathom entra solo
//     y su freebusy lo bloquea), upsert de la conversación de WhatsApp,
//     inserta la cita (recordatorios 24h/2h corren solos) y manda la
//     confirmación por WhatsApp al lead.
//
// verify_jwt: false — página pública. Validación estricta + límite de
// reservas futuras por teléfono. Si el freebusy falla, degrada a bloqueos
// internos (no rompe la página) y lo loguea.

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
  public_agenda?: { description?: string; host_name?: string; host_role?: string; confirmation_template?: string };
}

interface BookingCalendar {
  id: string;
  slug: string;
  name: string;
  purpose: string;
  duration_min: number;
  gcal_title_template: string | null;
  gcal_color_id: string | null;
  member_ids: string[];
  active: boolean;
}

interface Member {
  id: string;
  name: string;
  email: string | null;
  availability: {
    days?: Record<string, { enabled?: boolean; ranges?: { from?: string; to?: string }[]; from?: string; to?: string }>;
  } | null;
}

async function getCfg(): Promise<Cfg> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as Cfg) ?? {};
}

// Calendario de reserva: por slug, o el primero activo (link viejo /agendar).
async function getCalendar(slug: string | null): Promise<BookingCalendar | null> {
  let q = admin.from("booking_calendars")
    .select("id, slug, name, purpose, duration_min, gcal_title_template, gcal_color_id, member_ids, active")
    .eq("active", true);
  if (slug) q = q.eq("slug", slug);
  else q = q.order("created_at", { ascending: true }).limit(1);
  const { data } = await q;
  return (data?.[0] as BookingCalendar) ?? null;
}

async function getMembers(cal: BookingCalendar): Promise<Member[]> {
  if (!cal.member_ids?.length) return [];
  const { data } = await admin.from("team_members")
    .select("id, name, email, availability")
    .in("id", cal.member_ids);
  // Mantener el orden y exigir que estén todos (si falta uno, no hay agenda).
  return cal.member_ids.map((id) => (data || []).find((m) => m.id === id)).filter(Boolean) as Member[];
}

const pad = (n: number) => String(n).padStart(2, "0");
const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + (m || 0);
};

// Instante UTC de una fecha+hora local argentina.
const toUTC = (date: string, time: string) => new Date(`${date}T${time}:00${TZ_OFFSET}`);

type Range = { s: number; e: number }; // minutos del día

// Franjas habilitadas de un miembro para un día de semana (0=Lun).
// Soporta el formato nuevo {ranges:[{from,to}]} y el viejo {from,to}.
function memberDayRanges(m: Member, weekdayIdx: number): Range[] {
  const day = m.availability?.days?.[String(weekdayIdx)];
  if (!day?.enabled) return [];
  const raw = Array.isArray(day.ranges)
    ? day.ranges
    : (day.from && day.to ? [{ from: day.from, to: day.to }] : []);
  return raw
    .filter((r) => r?.from && r?.to)
    .map((r) => ({ s: toMin(r.from!), e: toMin(r.to!) }))
    .filter((r) => r.e > r.s);
}

// Intersección de listas de franjas (todos los miembros libres a la vez).
function intersectRanges(a: Range[], b: Range[]): Range[] {
  const out: Range[] = [];
  for (const x of a) {
    for (const y of b) {
      const s = Math.max(x.s, y.s);
      const e = Math.min(x.e, y.e);
      if (e > s) out.push({ s, e });
    }
  }
  return out;
}

// Slots configurados de un día (sin filtrar conflictos): turnos de `step`
// minutos dentro de la intersección de las franjas de todos los miembros.
function rawSlotsForDay(members: Member[], step: number, date: Date): string[] {
  if (!members.length) return [];
  const idx = (date.getUTCDay() + 6) % 7; // 0=Lun (mismo índice que el panel)
  let inter = memberDayRanges(members[0], idx);
  for (let i = 1; i < members.length && inter.length; i++) {
    inter = intersectRanges(inter, memberDayRanges(members[i], idx));
  }
  const out: string[] = [];
  for (const r of inter) {
    for (let m = r.s; m + step <= r.e; m += step) {
      out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
    }
  }
  return [...new Set(out)].sort();
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

// Bloques ocupados de los Google Calendars reales de los miembros (freebusy).
// Si el script falla, devuelve [] (degradar a bloqueos internos, no romper).
async function googleBusy(cfg: Cfg, members: Member[], fromISO: string, toISO: string): Promise<Range2[]> {
  const emails = members.map((m) => (m.email || "").trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return [];
  const res = await callCalendarScript(cfg, { action: "freebusy", emails, timeMin: fromISO, timeMax: toISO });
  if (!res?.ok) {
    console.error("agenda-publica: freebusy falló", res);
    return [];
  }
  const out: Range2[] = [];
  for (const email of emails) {
    for (const b of (res.busy?.[email] || [])) {
      const s = new Date(b.start).getTime();
      const e = new Date(b.end).getTime();
      if (Number.isFinite(s) && Number.isFinite(e) && e > s) out.push({ s, e });
    }
  }
  if (res.errors && Object.keys(res.errors).length) {
    console.error("agenda-publica: freebusy sin acceso a", res.errors);
  }
  return out;
}

type Range2 = { s: number; e: number }; // epoch ms

// Días y horarios libres de un mes para un calendario (descartando pasado,
// citas internas que pisen a algún miembro y ocupados de Google Calendar).
async function computeMonth(cfg: Cfg, cal: BookingCalendar, members: Member[], year: number, month: number) {
  const step = Math.max(15, Number(cal.duration_min) || 60);
  const first = new Date(Date.UTC(year, month, 1));
  const next = new Date(Date.UTC(year, month + 1, 1));
  const fromISO = new Date(first.getTime() - 86400_000).toISOString();
  const toISO = new Date(next.getTime() + 86400_000).toISOString();

  // Citas internas: bloquean si comparten miembro con este calendario o si
  // son viejas/manuales (sin member_ids → conservador, bloquean todo).
  const memberList = `{${cal.member_ids.join(",")}}`;
  const apptQ = admin
    .from("appointments")
    .select("start_at, end_at")
    .eq("status", "scheduled")
    .gte("start_at", fromISO)
    .lt("start_at", toISO)
    .or(`member_ids.is.null,member_ids.ov.${memberList}`)
    .limit(500);

  const [{ data: taken }, gbusy] = await Promise.all([
    apptQ,
    googleBusy(cfg, members, fromISO, toISO),
  ]);

  const busy: Range2[] = (taken || []).map((a) => ({
    s: new Date(a.start_at).getTime(),
    e: a.end_at ? new Date(a.end_at).getTime() : new Date(a.start_at).getTime() + 3600_000,
  })).concat(gbusy);

  const minStart = Date.now() + MIN_NOTICE_MS;
  const days: Record<string, string[]> = {};
  for (let d = new Date(first); d < next; d.setUTCDate(d.getUTCDate() + 1)) {
    const dateStr = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
    const slots = rawSlotsForDay(members, step, d).filter((t) => {
      const s = toUTC(dateStr, t).getTime();
      if (s < minStart) return false;
      const e = s + step * 60000;
      return !busy.some((b) => s < b.e && e > b.s);
    });
    if (slots.length) days[dateStr] = slots;
  }
  return days;
}

function isConfigured(cal: BookingCalendar | null, members: Member[]): boolean {
  if (!cal || !members.length) return false;
  // Todos los miembros tienen al menos una franja habilitada.
  return members.every((m) =>
    Object.keys(m.availability?.days || {}).some((k) => memberDayRanges(m, Number(k)).length > 0)
  );
}

// ── Zoom / WhatsApp (mismos helpers del resto del módulo) ──

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

  const slug = typeof body.slug === "string" && /^[a-z0-9-]{1,60}$/.test(body.slug) ? body.slug : null;
  const cfg = await getCfg();
  const cal = await getCalendar(slug);
  const members = cal ? await getMembers(cal) : [];
  const pub = cfg.public_agenda || {};
  const slotMin = Math.max(15, Number(cal?.duration_min) || 60);
  const configured = isConfigured(cal, members);

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
    const days = (cal && configured) ? await computeMonth(cfg, cal, members, year, month) : {};
    return jsonResp(200, {
      ok: true,
      days,
      event: {
        title: cal?.name || "Reunión",
        description: pub.description || "",
        host_name: pub.host_name || "Método Korex",
        host_role: pub.host_role || "",
        slot_minutes: slotMin,
      },
      configured,
    });
  }

  // ── Reservar ──
  if (body.action === "book") {
    if (!cal || !configured) return jsonResp(409, { error: "not_configured" });
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

    // El slot tiene que seguir libre (recalcular el mes de esa fecha — incluye
    // citas internas y el freebusy fresco de los Google Calendars).
    const slotDate = toUTC(date, time);
    const [yy, mm] = date.split("-").map(Number);
    const dayMap = await computeMonth(cfg, cal, members, yy, mm - 1);
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
    const title = (cal.gcal_title_template || `${cal.name} — {nombre}`)
      .replaceAll("{nombre}", name)
      .replaceAll("{telefono}", `+${waDigits}`)
      .slice(0, 150);

    // Zoom + Calendar: invitación al lead Y a los miembros del equipo (les
    // aparece en su calendario → Fathom entra solo y su freebusy lo bloquea).
    const zoom = await createZoomMeeting(cfg, { title, startAt, durationMin: slotMin });
    const meetingLink = zoom?.joinUrl ?? null;
    const guestEmails = [...new Set([email, ...members.map((m) => (m.email || "").trim().toLowerCase()).filter(Boolean)])];
    let gcalEventId: string | null = null;
    let gcalLink: string | null = null;
    if (cfg.calendar_script_url) {
      const calRes = await callCalendarScript(cfg, {
        action: "create_event",
        title,
        description: [
          `Reserva desde la agenda pública (${cal.name}).`,
          `Lead: ${name} · ${email} · +${waDigits}`,
          notes ? `Quiere resolver: ${notes}` : null,
          meetingLink ? `Zoom: ${meetingLink}` : null,
        ].filter(Boolean).join("\n"),
        start: startAt,
        end: endAt,
        guests: guestEmails.join(","),
        location: meetingLink || undefined,
        colorId: cal.gcal_color_id || undefined,
      });
      if (!calRes?.ok) {
        console.error("agenda-publica: fallo el Apps Script", calRes);
        return jsonResp(502, { error: "calendar_error" });
      }
      gcalEventId = (calRes.eventId as string) || null;
      gcalLink = (calRes.htmlLink as string) || null;
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
      calendar_id: cal.id,
      member_ids: cal.member_ids,
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
      event: { title: cal.name, start_at: startAt, end_at: endAt, host_name: pub.host_name || "Método Korex" },
    });
  }

  return jsonResp(400, { error: "unknown_action" });
});
