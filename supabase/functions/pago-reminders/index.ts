// supabase/functions/pago-reminders/index.ts
// Aviso de cuotas por cobrar (Seguimiento de pagos). La llama pg_cron 1 vez al dia.
//
// Recorre las cuotas PENDIENTES de los planes de pago y avisa cuando una cuota:
//   - vence en exactamente N dias (lead, por defecto 3), o
//   - vence hoy o ya vencio (recordatorio diario hasta que se cobre).
// Postea un unico mensaje consolidado al canal #alertas-general (configurable) y deja
// una notificacion en la campana del panel para Matias. Marca alerted_at para no
// repetir mas de una vez por dia. NUNCA avisa de cuotas ya pagadas.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const PANEL_RECIPIENTS = ["matias"];
const BULLET = "•";
const DASH = "—";
const MID = "·";

function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
function todayStr() { return new Date().toISOString().slice(0, 10); }
function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso + "T00:00:00Z").getTime();
  const b = new Date(toIso + "T00:00:00Z").getTime();
  return Math.round((b - a) / 86400000);
}
function fmtMoney(v: number | null, cur: string): string {
  if (v == null) return "-";
  try { return cur + " " + new Intl.NumberFormat("es-AR").format(Math.round(v)); }
  catch { return cur + " " + v; }
}
function rnd(n = 6) { return Math.random().toString(36).slice(2, 2 + n); }

async function slackApi(token: string, method: string, payload: Record<string, unknown>) {
  const r = await fetch("https://slack.com/api/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: "Bearer " + token },
    body: JSON.stringify(payload),
  });
  return await r.json().catch(() => ({ ok: false }));
}

// Resuelve el id del canal por nombre (publico o privado). Best-effort.
async function resolveChannelId(token: string, name: string): Promise<string | null> {
  let cursor = "";
  for (let i = 0; i < 10; i++) {
    const res = await slackApi(token, "conversations.list", {
      exclude_archived: true,
      limit: 200,
      types: "public_channel,private_channel",
      cursor: cursor || undefined,
    });
    if (!res.ok || !Array.isArray(res.channels)) break;
    const hit = res.channels.find((c: Record<string, unknown>) => String(c.name) === name);
    if (hit) return String(hit.id);
    cursor = res.response_metadata?.next_cursor || "";
    if (!cursor) break;
  }
  return null;
}

Deno.serve(async () => {
  let cfg: Record<string, unknown> = {};
  let onb: Record<string, unknown> = {};
  try {
    const { data: s } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    cfg = (s?.value as Record<string, unknown>) ?? {};
    const { data: g } = await supabase.from("app_settings").select("value").eq("key", "global").maybeSingle();
    onb = (((g?.value as Record<string, unknown>)?.onboarding_config) ?? {}) as Record<string, unknown>;
  } catch (_e) { /* ignore */ }

  const botToken = str(cfg.slack_bot_token);
  const leadDays = Number(onb.pago_reminder_days) || 3;          // avisar N dias antes
  const channelName = str(onb.pago_alert_channel) || "alertas-general";
  const channelIdCfg = str(onb.pago_alert_channel_id);
  const today = todayStr();

  // Cuotas pendientes que ya entraron en ventana de aviso (faltan <= leadDays o vencidas).
  const soonCutoff = new Date(Date.now() + leadDays * 86400000).toISOString().slice(0, 10);
  const { data: cuotas, error } = await supabase
    .from("fin_payment_cuotas")
    .select("id, plan_id, n, due_date, amount, status, alerted_at")
    .eq("status", "pendiente")
    .not("due_date", "is", null)
    .lte("due_date", soonCutoff)
    .order("due_date", { ascending: true });
  if (error) { console.error("pago-reminders: query error", error); return new Response("err", { status: 500 }); }

  // Filtrar: avisar si vence exactamente en leadDays, o si vence hoy/ya vencio. Una vez por dia.
  const due = (cuotas ?? []).filter((c) => {
    if (c.alerted_at && c.alerted_at >= today) return false; // ya avisamos hoy
    const d = daysBetween(today, c.due_date as string);
    return d === leadDays || d <= 0;
  });

  if (!due.length) {
    return new Response(JSON.stringify({ ok: true, checked: cuotas?.length ?? 0, alerted: 0 }), {
      headers: { "Content-Type": "application/json" },
    });
  }

  // Datos de los planes (cliente, moneda, total de cuotas) para el mensaje.
  const planIds = Array.from(new Set(due.map((c) => c.plan_id)));
  const { data: plans } = await supabase
    .from("fin_payment_plans").select("id, client_name, currency").in("id", planIds);
  const { data: counts } = await supabase
    .from("fin_payment_cuotas").select("plan_id, id").in("plan_id", planIds);
  const planMap = new Map((plans ?? []).map((p) => [p.id, p]));
  const totalByPlan = new Map<string, number>();
  for (const r of (counts ?? [])) totalByPlan.set(r.plan_id, (totalByPlan.get(r.plan_id) || 0) + 1);

  const lines: string[] = [":money_with_wings: *Cuotas por cobrar*"];
  for (const c of due) {
    const p = planMap.get(c.plan_id) as Record<string, unknown> | undefined;
    const cli = str(p?.client_name) || "Cliente";
    const cur = str(p?.currency) || "USD";
    const tot = totalByPlan.get(c.plan_id) || c.n;
    const d = daysBetween(today, c.due_date as string);
    let cuando: string;
    if (d > 0) cuando = "vence en " + d + " dia" + (d === 1 ? "" : "s");
    else if (d === 0) cuando = "*vence hoy*";
    else cuando = "*vencio hace " + (-d) + " dia" + (d === -1 ? "" : "s") + "* :warning:";
    lines.push(
      BULLET + " *" + cli + "* " + DASH + " cuota " + c.n + "/" + tot + " " + MID + " "
      + fmtMoney(Number(c.amount), cur) + " " + MID + " " + cuando + " (" + c.due_date + ")",
    );
  }
  lines.push("");
  lines.push("_Cargalas como cobradas en Finanzas > Seguimiento de pagos cuando entre el dinero._");
  const text = lines.join("\n");

  // Postear al canal #alertas-general (id de config, o resuelto por nombre, o por nombre directo).
  let posted = false;
  if (botToken) {
    const channelId = channelIdCfg || (await resolveChannelId(botToken, channelName)) || "";
    if (channelId) { try { await slackApi(botToken, "conversations.join", { channel: channelId }); } catch (_e) { /* ignore */ } }
    const target = channelId || channelName; // fallback: nombre directo
    const res = await slackApi(botToken, "chat.postMessage", { channel: target, text, unfurl_links: false });
    posted = !!res.ok;
    if (!res.ok) console.error("pago-reminders: slack postMessage", res.error);
  }

  // Campana del panel para Matias.
  try {
    await supabase.from("notifications").insert(
      PANEL_RECIPIENTS.map((rid) => ({
        id: "ntf_" + Math.floor(Date.now() / 1000) + "_" + rnd(6),
        recipient_id: rid,
        type: "pago_cuota",
        title: due.length === 1 ? "Cuota por cobrar" : due.length + " cuotas por cobrar",
        body: lines.slice(1, 6).join("  ").replace(/[*_]/g, ""),
      })),
    );
  } catch (e) { console.error("pago-reminders: notifications error", e); }

  // Marcar alerted_at para no repetir hoy.
  const ids = due.map((c) => c.id);
  await supabase.from("fin_payment_cuotas").update({ alerted_at: today }).in("id", ids);

  return new Response(JSON.stringify({ ok: true, checked: cuotas?.length ?? 0, alerted: due.length, posted }), {
    headers: { "Content-Type": "application/json" },
  });
});
