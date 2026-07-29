// clarity-qa-alert — detecta problemas de tracking en los funnels de Clarity y avisa a Slack.
// La llama pg_cron 1x/dia. Mismo patron que automations-alert (#alertas-general, bot token de venta_form_config).
//   ?dry=true   -> arma el mensaje y lo DEVUELVE sin postear (para probar).
//   ?force=true -> postea aunque ya se haya enviado hoy.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

const hostOf = (u: string) => { try { return new URL(u).hostname; } catch { return ""; } };
function stepInfo(u: string) {
  let p = ""; try { p = new URL(u).pathname.toLowerCase(); } catch { /* noop */ }
  if (p === "" || p === "/") return { type: "prelanding", label: "Prelanding" };
  if (/(thanku|thank-?you|gracias|thanks)/.test(p)) return { type: "gracias", label: "Gracias" };
  if (/(vsl|landing|focus|register|registro|oferta|checkout)/.test(p)) return { type: "vsl", label: "Landing/VSL" };
  return { type: "other", label: p };
}
const RANK: Record<string, number> = { prelanding: 0, vsl: 1, other: 2, gracias: 3 };
const shortDom = (h: string) => (h || "").replace(/^www\./, "").replace(/\.metodokorex\.com$/, "").replace(/\.com$/, "");

function domainsOf(topPaths: any[]) {
  const tp = (topPaths || []).map((x: any) => ({ count: Number(x.count) || 0, host: hostOf(x.url), ...stepInfo(x.url) })).filter((x: any) => x.host);
  const roots: Record<string, number> = {};
  for (const s of tp) if (s.type === "prelanding") roots[s.host] = Math.max(roots[s.host] || 0, s.count);
  let doms = Object.entries(roots).filter(([, c]) => c >= 10).sort((a, b) => b[1] - a[1]).map(([h]) => h);
  if (!doms.length) { const p = tp.slice().sort((a, b) => b.count - a.count)[0]?.host; if (p) doms = [p]; }
  return doms;
}
function buildSteps(topPaths: any[], domain: string) {
  const tp = (topPaths || []).map((x: any) => ({ url: x.url, count: Number(x.count) || 0, host: hostOf(x.url), ...stepInfo(x.url) })).filter((x: any) => x.host);
  return tp.filter((s: any) => s.host === domain).sort((a: any, b: any) => (RANK[a.type] - RANK[b.type]) || (b.count - a.count));
}

// Detecta anomalias de un funnel (mismo criterio que el panel).
function anomaliesFor(f: any): string[] {
  const out: string[] = [];
  const r = f.range_30d || {};
  const sessions = Number(r.sessions) || 0;
  const bots = Number(r.bot_sessions) || 0;
  if (bots > sessions && (sessions + bots) > 0) out.push(`bots (${bots}) superan a las sesiones humanas (${sessions})`);
  const doms = domainsOf(r.top_paths);
  for (const d of doms) {
    const steps = buildSteps(r.top_paths, d);
    const tag = doms.length > 1 ? ` [${shortDom(d)}]` : "";
    for (let i = 1; i < steps.length; i++) {
      if (steps[i].count > steps[i - 1].count)
        out.push(`"${steps[i].label}" (${steps[i].count}) supera al paso anterior "${steps[i - 1].label}" (${steps[i - 1].count})${tag}`);
    }
    if (sessions > 0 && !steps.some((s: any) => s.type === "prelanding"))
      out.push(`hay trafico pero no se detecta prelanding${tag}`);
  }
  return out;
}

async function postSlack(token: string, channel: string, text: string) {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, unfurl_links: false }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j?.ok) throw new Error("slack: " + JSON.stringify(j));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const dry = url.searchParams.get("dry") === "true";
  const force = url.searchParams.get("force") === "true";
  const channel = "#alertas-general";

  const { data: funnels, error } = await supabase
    .from("clarity_funnels")
    .select("label, client_id, range_30d, client:clients(name)")
    .eq("active", true);
  if (error) { console.error("clarity-qa-alert rpc", error); return new Response("err", { status: 500 }); }

  const problems = (funnels || [])
    .map((f: any) => ({ name: f.client?.name || f.label, issues: anomaliesFor(f) }))
    .filter((p: any) => p.issues.length > 0);

  if (problems.length === 0) {
    return Response.json(dry ? { message: null, note: "Sin anomalias — no se enviaria nada." } : { ok: true, note: "Sin anomalias." });
  }

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Argentina/Buenos_Aires" });
  if (!dry && !force) {
    const { data: stRow } = await supabase.from("app_settings").select("value").eq("key", "clarity_qa_alert_state").maybeSingle();
    if (str((stRow?.value as any)?.last_sent_date) === today) return Response.json({ ok: true, note: "Ya se envio hoy." });
  }

  const head = `:mag: *Tracking de embudos (Clarity) — posibles problemas* · ${today}`;
  const sub = `${problems.length} funnel(s) con datos raros`;
  const lines = problems.map((p: any) => `:small_red_triangle: *${p.name}*\n${p.issues.map((i: string) => `        ↳ ${i}`).join("\n")}`);
  const foot = "Revisalo en el panel: *Marketing › Embudo* (el funnel con △).";
  const text = [head, sub, "", ...lines, "", foot].join("\n");

  if (dry) return Response.json({ channel, text });

  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const botToken = str((vf?.value as any)?.slack_bot_token);
  if (!botToken) return new Response("sin slack_bot_token", { status: 500 });

  try { await postSlack(botToken, channel, text); }
  catch (e) { console.error("clarity-qa-alert slack", e); return new Response("slack error", { status: 502 }); }

  await supabase.from("app_settings").upsert({ key: "clarity_qa_alert_state", value: { last_sent_date: today } }, { onConflict: "key" });
  return Response.json({ sent: true, count: problems.length });
});
