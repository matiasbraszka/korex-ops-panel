// supabase/functions/marketing-resumen/index.ts
// Resumen automático de las reuniones del EQUIPO DE MARKETING → Slack.
// Detección = pre-filtro (título + participantes) + compuerta de IA (Claude confirma).
// Modo prueba (reuniones_config.marketing_auto.test_mode = true): DM a test_dm_to (Matías).
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const DEFAULT_MODEL = "claude-opus-4-8";
const DEFAULT_LOOKBACK_DAYS = 4;
const DEFAULT_MAX_PER_RUN = 4;
const CANDIDATE_SCAN_LIMIT = 60;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...CORS } });
}

async function slackToken(): Promise<string> {
  const { data } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  return String((data?.value as any)?.slack_bot_token || "");
}

async function postSlack(token: string, channel: string, text: string): Promise<boolean> {
  if (!token || !channel) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
      signal: AbortSignal.timeout(15000),
    });
    const d = await res.json().catch(() => null);
    if (!d?.ok) console.error("postSlack fallo", d?.error || res.status);
    return !!d?.ok;
  } catch (e) {
    console.error("postSlack error", e);
    return false;
  }
}

async function postSlackDM(token: string, slackUserId: string, text: string): Promise<boolean> {
  if (!token || !slackUserId) return false;
  try {
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ users: slackUserId }),
      signal: AbortSignal.timeout(15000),
    });
    const openData = await openRes.json().catch(() => null);
    const dmChannel = openData?.channel?.id as string | undefined;
    if (!openData?.ok || !dmChannel) {
      console.error("postSlackDM conversations.open fallo", openData?.error || openRes.status);
      return false;
    }
    return await postSlack(token, dmChannel, text);
  } catch (e) {
    console.error("postSlackDM error", e);
    return false;
  }
}

function norm(s: unknown): string {
  return String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}
const firstToken = (s: string) => norm(s).split(" ")[0] || "";

function titleLooksMarketing(titulo: string): boolean {
  const t = norm(titulo);
  return /marketing|semanal|planificac|retrospectiv/.test(t);
}

function marketingParticipantOverlap(participantes: string[], rosterNames: string[]): number {
  const roster = rosterNames.map(norm).filter(Boolean);
  const rosterFirst = new Set(roster.map(firstToken));
  let count = 0;
  for (const p of participantes || []) {
    const np = norm(p);
    if (!np) continue;
    const hit = roster.some((r) => r === np || r.includes(np) || np.includes(r)) || rosterFirst.has(firstToken(np));
    if (hit) count++;
  }
  return count;
}

async function summarizeMarketing(titulo: string, participantes: string[], transcript: string, model: string): Promise<any | null> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

  const prompt = `Sos el analista de marketing de Metodo Korex. Te paso la TRANSCRIPCIÓN de una reunión interna del equipo de marketing (suelen estar José Martín/CMO, David/Trafficker, José Zerillo/Diseño, María, Zil y a veces Matías/COO). Cada línea indica quién habla.

PRIMERO decidí si de verdad es una reunión del EQUIPO DE MARKETING (planificación del lunes, retrospectiva del viernes, o daily de marketing: campañas, creativos, landings, copy, funnels, performance de clientes). Si en realidad es de socios, de programación, de ventas, legal o con un cliente, poné es_reunion_marketing=false y NO resumas.

Si es de marketing, escribí un resumen ejecutivo para el equipo en 5 secciones fijas. Español rioplatense, claro y concreto, sin relleno. Si una sección no tiene contenido real, dejala vacía (no inventes).

1. CONTEXTO — 2 a 4 oraciones: de qué se habló y por qué (el foco de la reunión).
2. WINS — logros, avances y buenas noticias concretas (viñetas cortas).
3. CUELLOS DE BOTELLA — qué está trabado o demorado y POR QUÉ (con el motivo real, no genérico).
4. INSIGHTS — aprendizajes, ideas, datos o conclusiones que valga la pena recordar.
5. TAREAS NUEVAS Y FOCO — tareas nuevas que salieron (con responsable y plazo si se dijeron) y en qué hay que poner el foco de acá en adelante.

Devolvé SOLO un JSON válido, sin markdown ni texto afuera:
{
  "es_reunion_marketing": true|false,
  "contexto": "string",
  "wins": ["..."],
  "cuellos": ["..."],
  "insights": ["..."],
  "tareas": [{"texto":"...","responsable":"nombre o null","plazo":"cuándo o null"}],
  "foco": ["..."]
}

TÍTULO: ${titulo}
PARTICIPANTES: ${(participantes || []).join(", ")}

TRANSCRIPT:
${transcript.slice(0, 120000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model, max_tokens: 4000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(120000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Claude API ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = await res.json();
  let text = data?.content?.[0]?.text ?? "";
  text = text.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

function fmtFecha(fecha: string): string {
  try {
    return new Date(fecha).toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "short" });
  } catch {
    return String(fecha || "").slice(0, 10);
  }
}

function bullets(arr: any[]): string {
  const list = (arr || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!list.length) return "_—_\n";
  return list.map((x) => `• ${x}`).join("\n") + "\n";
}

function buildMessage(llamada: any, r: any, testMode: boolean): string {
  const fecha = fmtFecha(llamada.fecha);
  const url = llamada.recording_url || "";
  const tareas = (r.tareas || [])
    .map((t: any) => {
      const who = t.responsable && String(t.responsable).toLowerCase() !== "null" ? ` — ${t.responsable}` : "";
      const plazo = t.plazo && String(t.plazo).toLowerCase() !== "null" ? ` _(${t.plazo})_` : "";
      return `• *[Tarea]* ${String(t.texto || "").trim()}${who}${plazo}`;
    })
    .filter((s: string) => String(s || "").length > 12);
  const foco = (r.foco || []).map((x: any) => `• ${String(x || "").trim()}`).filter((s: string) => s.length > 2);
  const seccion5 = [...tareas, ...foco].join("\n") || "_—_";

  let head = `:chart_with_upwards_trend: *Marketing — «${llamada.titulo}»*  ·  ${fecha}`;
  if (testMode) {
    head = `:test_tube: *MODO PRUEBA — no se posteó al canal*\n${head}`;
  }

  return (
    `${head}\n\n` +
    `*1. Contexto*\n${String(r.contexto || "").trim() || "_—_"}\n\n` +
    `*2. Wins*\n${bullets(r.wins)}\n` +
    `*3. Cuellos de botella*\n${bullets(r.cuellos)}\n` +
    `*4. Insights*\n${bullets(r.insights)}\n` +
    `*5. Tareas nuevas y foco*\n${seccion5}\n` +
    (url ? `\n:movie_camera: Grabación: ${url}` : "")
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  let body: any = {};
  try { body = await req.json(); } catch { body = {}; }

  const { data: cfgRow } = await supabase.from("app_settings").select("value").eq("key", "reuniones_config").maybeSingle();
  const cfg = (cfgRow?.value as any) || {};
  const auto = cfg.marketing_auto || {};
  const grupos = cfg.grupos || {};
  const mktGroup = grupos.marketing || {};

  const secret = String(auto.cron_secret || "");
  const given = req.headers.get("x-cron-secret") || "";
  if (!secret || given !== secret) return j(401, { error: "unauthorized" });

  if (auto.enabled === false && !body.force && !body.sample_limit && !body.only_id) {
    return j(200, { ok: true, skipped: "disabled", processed: 0 });
  }
  if (!ANTHROPIC_API_KEY) return j(500, { error: "ANTHROPIC_API_KEY no configurada" });

  const model = String(auto.model || DEFAULT_MODEL);
  const lookbackDays = Number(auto.lookback_days || DEFAULT_LOOKBACK_DAYS);
  const maxPerRun = Number(body.sample_limit || auto.max_per_run || DEFAULT_MAX_PER_RUN);
  const testMode = auto.test_mode !== false;
  const testDmTo = String(cfg.test_dm_to || "matias");
  const dry = body.dry === true;
  const sampleMode = !!body.sample_limit;
  const force = body.force === true || sampleMode;

  const token = await slackToken();

  const { data: team } = await supabase.from("team_members").select("id, name, slack_id");
  const memberById: Record<string, any> = {};
  for (const m of team || []) memberById[m.id] = m;
  const rosterIds: string[] = Array.isArray(mktGroup.members) ? mktGroup.members : ["josem", "maria", "zerillos", "david"];
  const rosterNames = rosterIds.map((id) => memberById[id]?.name).filter(Boolean) as string[];

  let q = supabase
    .from("llamadas")
    .select("id, titulo, fecha, participantes, recording_url, inbox_id, mkt_resumen_status")
    .eq("categoria", "equipo")
    .order("fecha", { ascending: false });

  if (body.only_id) {
    q = supabase
      .from("llamadas")
      .select("id, titulo, fecha, participantes, recording_url, inbox_id, mkt_resumen_status")
      .eq("id", String(body.only_id));
  } else {
    if (!force) {
      const since = new Date(Date.now() - lookbackDays * 864e5).toISOString();
      q = q.is("mkt_resumen_status", null).gte("fecha", since);
    }
    q = q.limit(CANDIDATE_SCAN_LIMIT);
  }

  const { data: rows, error: qErr } = await q;
  if (qErr) return j(500, { error: qErr.message });

  const candidates = (rows || []).filter((l: any) => {
    const parts = Array.isArray(l.participantes) ? l.participantes : [];
    return titleLooksMarketing(l.titulo) || marketingParticipantOverlap(parts, rosterNames) >= 2;
  });

  candidates.sort((a: any, b: any) => String(a.fecha || "").localeCompare(String(b.fecha || "")));
  const batch = force ? candidates.slice(-maxPerRun) : candidates.slice(0, maxPerRun);

  if (!batch.length) return j(200, { ok: true, processed: 0, posted: 0, skipped: 0, message: "sin candidatas de marketing" });

  const inboxIds = batch.map((b: any) => b.inbox_id).filter(Boolean);
  const transcriptById: Record<string, string> = {};
  if (inboxIds.length) {
    const { data: inbox } = await supabase.from("llamadas_inbox").select("id, transcript").in("id", inboxIds);
    for (const r of inbox || []) transcriptById[r.id] = String(r.transcript || "");
  }

  const results: any[] = [];
  let posted = 0, skipped = 0, errors = 0;

  for (const l of batch) {
    try {
      const transcript = transcriptById[l.inbox_id] || "";
      if (transcript.length < 400) {
        results.push({ id: l.id, titulo: l.titulo, outcome: "sin_transcript" });
        continue;
      }
      const r = await summarizeMarketing(l.titulo, l.participantes || [], transcript, model);
      if (!r) { errors++; results.push({ id: l.id, titulo: l.titulo, outcome: "claude_no_json" }); continue; }

      if (r.es_reunion_marketing !== true) {
        if (!dry) {
          await supabase.from("llamadas")
            .update({ mkt_resumen_status: "skipped", mkt_resumen_at: new Date().toISOString(), mkt_resumen_payload: r })
            .eq("id", l.id);
        }
        skipped++;
        results.push({ id: l.id, titulo: l.titulo, outcome: "skipped_no_marketing" });
        continue;
      }

      const msg = buildMessage(l, r, testMode || dry);
      let delivered = false;
      let dest = "";
      if (testMode || dry) {
        const tester = memberById[testDmTo];
        dest = `DM:${testDmTo}`;
        if (tester?.slack_id && token) delivered = await postSlackDM(token, tester.slack_id, msg);
      } else {
        const channel = String(mktGroup.channel || "");
        dest = `channel:${channel}`;
        if (channel && token) delivered = await postSlack(token, channel, msg);
      }

      // Solo marca 'sent' si de verdad se entregó. Si falló el post (ej. scopes de
      // Slack), queda null y se reintenta en la próxima corrida (no se pierde).
      if (!dry && delivered) {
        await supabase.from("llamadas")
          .update({ mkt_resumen_status: "sent", mkt_resumen_at: new Date().toISOString(), mkt_resumen_payload: r })
          .eq("id", l.id);
      }
      if (delivered) posted++;
      results.push({ id: l.id, titulo: l.titulo, outcome: delivered ? "posted" : "post_failed", dest });
    } catch (e: any) {
      errors++;
      results.push({ id: l.id, titulo: l.titulo, outcome: "error", error: String(e?.message || e) });
    }
  }

  return j(200, {
    ok: true,
    test_mode: testMode,
    dry,
    candidates: candidates.length,
    processed: batch.length,
    posted,
    skipped,
    errors,
    results,
  });
});
