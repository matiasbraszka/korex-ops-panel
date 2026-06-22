// supabase/functions/reunion-reporte/index.ts
// Reportes accionables de reuniones de equipo.
//
//   POST { action: "prepare", llamada_id }  -> arma el borrador (NO manda nada,
//          NO toca tareas). Usa Claude para asignar cada accionable a una persona,
//          matchearlo (o no) con una tarea del sprint activo y decidir subtarea vs
//          comentario. Guarda en llamadas.reporte_payload, reporte_status='draft'.
//
//   POST { action: "send", llamada_id }     -> aplica el borrador (relee payload,
//          pudo editarse): agrega subtareas/comentarios, manda DM por Slack a cada
//          persona (fallback: mencion en canal + notificacion de panel) y postea
//          los puntos clave + link al canal del grupo. reporte_status='sent'.
//
// deno-lint-ignore-file no-explicit-any

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// ── Slack helpers (mismos que _shared/intel.ts; inline para deploy self-contained) ──
async function slackToken(admin: any): Promise<string> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  return String((data?.value as any)?.slack_bot_token || "");
}

async function postSlack(token: string, channel: string, text: string): Promise<boolean> {
  if (!token || !channel) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch (e) {
    console.error("postSlack error", e);
    return false;
  }
}

// DM a un usuario: abre la conversacion directa y postea. Requiere scopes chat:write + im:write.
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

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function rndId(prefix: string): string {
  return `${prefix}_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 8)}`;
}

const SUBTIPO_LABEL: Record<string, string> = {
  marketing: "Marketing",
  socios: "Socios",
  programacion: "Programación",
  abogada: "Legal",
  equipo: "Equipo",
};

// ── Claude: arma el reporte por persona ──────────────────────────────────────
async function buildReport(
  llamada: any,
  team: any[],
  sprintTasks: any[],
  clientsById: Record<string, string>,
): Promise<any | null> {
  if (!ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY no configurada");

  const rosterText = team
    .map((m) => `- ${m.name} [member_id: ${m.id}]`)
    .join("\n");

  const tasksText = sprintTasks.length
    ? sprintTasks
        .map((t) =>
          `- [task_id: ${t.id}] "${t.title}" | responsable: ${t.assignee || "—"} | cliente: ${
            clientsById[t.client_id] || "—"
          } | estado: ${t.status}`,
        )
        .join("\n")
    : "(no hay tareas en el sprint activo)";

  const pasosText = JSON.stringify(llamada.proximos_pasos || [], null, 0);
  const problemasText = JSON.stringify(llamada.problemas_detectados || [], null, 0);

  const prompt = `Sos el COO de Metodo Korex organizando el seguimiento de una reunion interna de equipo.
Recibis los proximos pasos de una reunion y tenes que armar un reporte ACCIONABLE por persona.
Devolve SOLO un JSON valido (sin texto antes ni despues, sin markdown).

ESTRUCTURA EXACTA:
{
  "personas": [
    {
      "member_id": "<id del roster o null si no matchea nadie>",
      "nombre": "<nombre de la persona>",
      "accionables": [
        {
          "texto": "<que tiene que hacer, en imperativo y concreto>",
          "cliente": "<cliente/objetivo relacionado o null>",
          "match_task_id": "<task_id del sprint si este accionable se relaciona con una tarea existente, sino null>",
          "modo": "subtask" | "comment",
          "detalle": "<si modo=subtask: el texto exacto de la subtarea a agregar. si modo=comment: los puntos clave para accionar/destrabar esa tarea>"
        }
      ]
    }
  ],
  "canal_post": "<resumen para el canal del grupo: puntos clave + decisiones de la reunion, en 4-8 vinetas con guion. NO incluyas el link, se agrega aparte.>"
}

REGLAS:
- Asigna cada proximo paso a la persona responsable (matchea por nombre contra el roster). Si el responsable no esta en el roster, member_id=null pero igual incluilo.
- match_task_id: SOLO si el accionable claramente se relaciona con una tarea del sprint listada abajo (mismo cliente/tema). Sino null.
- modo:
  - "subtask": cuando el accionable es un paso nuevo y concreto que se agrega como item de checklist a la tarea matcheada (o, si no hay tarea, es un nuevo to-do de la persona).
  - "comment": cuando es una aclaracion, contexto o desbloqueo de un cuello de botella sobre una tarea existente (requiere match_task_id).
- Agrupa todos los accionables de una misma persona en un solo objeto.
- Se concreto y breve. Espanol rioplatense, sin relleno.

ROSTER DEL EQUIPO:
${rosterText}

TAREAS DEL SPRINT ACTIVO (candidatas para matchear):
${tasksText}

RESUMEN DE LA REUNION:
${llamada.resumen || "(sin resumen)"}

PROXIMOS PASOS DETECTADOS:
${pasosText}

PROBLEMAS DETECTADOS:
${problemasText}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    }),
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

// ── prepare ──────────────────────────────────────────────────────────────────
async function handlePrepare(llamadaId: string): Promise<Response> {
  const { data: llamada, error: lErr } = await supabase
    .from("llamadas")
    .select("id, categoria, equipo_subtipo, titulo, resumen, proximos_pasos, problemas_detectados, notas_clave, recording_url, participantes, fecha")
    .eq("id", llamadaId)
    .maybeSingle();

  if (lErr) return j(500, { error: lErr.message });
  if (!llamada) return j(404, { error: "llamada_no_encontrada" });
  if (llamada.categoria !== "equipo" && llamada.categoria !== "mentoria") {
    return j(400, { error: "no_es_reunion_de_equipo" });
  }

  // Roster
  const { data: team } = await supabase
    .from("team_members")
    .select("id, name, slack_id");

  // Sprint activo + sus tareas
  const { data: sprintRow } = await supabase
    .from("sprints")
    .select("id")
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let sprintTasks: any[] = [];
  if (sprintRow?.id) {
    const { data: tks } = await supabase
      .from("tasks")
      .select("id, title, client_id, assignee, status")
      .eq("sprint_id", sprintRow.id);
    sprintTasks = tks || [];
  }

  // Clientes (para nombrar en el contexto)
  const { data: clients } = await supabase.from("clients").select("id, name");
  const clientsById: Record<string, string> = {};
  for (const c of clients || []) clientsById[c.id] = c.name;

  const report = await buildReport(llamada, team || [], sprintTasks, clientsById);
  if (!report) return j(502, { error: "claude_no_json" });

  // Adjuntar disponibilidad de Slack por persona (para que la UI avise fallbacks)
  const slackById: Record<string, string> = {};
  for (const m of team || []) if (m.slack_id) slackById[m.id] = m.slack_id;
  for (const p of report.personas || []) {
    p.has_slack = !!(p.member_id && slackById[p.member_id]);
  }

  const payload = {
    ...report,
    subtipo: llamada.equipo_subtipo || "equipo",
    recording_url: llamada.recording_url || null,
    sprint_id: sprintRow?.id || null,
    generated_at: new Date().toISOString(),
  };

  const { error: upErr } = await supabase
    .from("llamadas")
    .update({ reporte_payload: payload, reporte_status: "draft" })
    .eq("id", llamadaId);
  if (upErr) return j(500, { error: upErr.message });

  return j(200, { ok: true, status: "draft", payload });
}

// ── send ─────────────────────────────────────────────────────────────────────
async function handleSend(llamadaId: string): Promise<Response> {
  const { data: llamada, error: lErr } = await supabase
    .from("llamadas")
    .select("id, titulo, equipo_subtipo, recording_url, reporte_payload, reporte_status")
    .eq("id", llamadaId)
    .maybeSingle();

  if (lErr) return j(500, { error: lErr.message });
  if (!llamada) return j(404, { error: "llamada_no_encontrada" });
  const payload = llamada.reporte_payload as any;
  if (!payload || !Array.isArray(payload.personas)) {
    return j(400, { error: "sin_borrador. Prepara el reporte primero." });
  }
  if (llamada.reporte_status === "sent") {
    return j(409, { error: "ya_enviado" });
  }

  const subtipo = String(payload.subtipo || llamada.equipo_subtipo || "equipo");
  const recordingUrl = llamada.recording_url || payload.recording_url || "";

  // Config de grupos + flags + token de slack
  const { data: cfgRow } = await supabase
    .from("app_settings").select("value").eq("key", "reuniones_config").maybeSingle();
  const cfg = (cfgRow?.value as any) || {};
  const grupos = cfg.grupos || {};
  const groupChannel = String(grupos?.[subtipo]?.channel || "");
  // Modo prueba: NO toca tareas, NO DMea al equipo, NO postea al canal. En su lugar
  // manda un unico DM con el preview completo a test_dm_to (por defecto Matias).
  const testMode = cfg.test_mode === true;
  const testDmTo = String(cfg.test_dm_to || "matias");
  const token = await slackToken(supabase);

  // Roster (slack_id por persona)
  const { data: team } = await supabase.from("team_members").select("id, name, slack_id");
  const memberById: Record<string, any> = {};
  for (const m of team || []) memberById[m.id] = m;

  // 1) Armar el reporte por persona (sin aplicar nada todavia).
  const reportes: any[] = [];
  for (const persona of payload.personas as any[]) {
    const member = persona.member_id ? memberById[persona.member_id] : null;
    const nombre = persona.nombre || member?.name || "Equipo";
    const lines: string[] = [];
    const muts: any[] = [];
    for (const acc of persona.accionables || []) {
      const taskId = acc.match_task_id || null;
      const detalle = acc.detalle || acc.texto || "";
      if (taskId && acc.modo === "subtask") {
        muts.push({ taskId, modo: "subtask", detalle });
        lines.push(`• [subtarea] ${detalle}`);
      } else if (taskId && acc.modo === "comment") {
        muts.push({ taskId, modo: "comment", detalle, texto: acc.texto });
        lines.push(`• [comentario en tarea] ${acc.texto}`);
      } else {
        lines.push(`• ${acc.texto}${acc.cliente ? ` _(${acc.cliente})_` : ""}`);
      }
    }
    if (lines.length) reportes.push({ persona, member, nombre, lines, muts });
  }

  // ── MODO PRUEBA: preview consolidado a una sola persona, sin efectos reales ──
  if (testMode) {
    const tester = memberById[testDmTo];
    let preview =
      `:test_tube: *MODO PRUEBA — Reporte de "${llamada.titulo}"*\n` +
      `_(nada se envió al equipo ni se modificaron tareas)_\n`;
    for (const r of reportes) {
      preview += `\n*→ ${r.nombre}* (DM):\n${r.lines.join("\n")}\n`;
    }
    const bullets = String(payload.canal_post || "").trim();
    preview +=
      `\n*→ Iría al canal de ${SUBTIPO_LABEL[subtipo] || "Equipo"}${groupChannel ? "" : " (SIN canal configurado)"}*:\n` +
      (bullets ? `${bullets}\n` : "(sin texto)\n") +
      (recordingUrl ? `:movie_camera: ${recordingUrl}\n` : "");

    let delivered = false;
    if (tester?.slack_id && token) delivered = await postSlackDM(token, tester.slack_id, preview);
    // En prueba NO se marca como enviado: queda en draft para el envío real luego.
    return j(200, {
      ok: true,
      status: "draft",
      test_mode: true,
      preview_dm_to: testDmTo,
      preview_delivered: delivered,
      personas: reportes.length,
    });
  }

  // ── ENVÍO REAL ──
  const applied: any[] = [];
  const channelMentions: string[] = [];
  for (const r of reportes) {
    const { persona, member, nombre, lines, muts } = r;
    // 2) Aplicar mutaciones a tareas
    for (const m of muts) {
      if (m.modo === "subtask") {
        const { data: tk } = await supabase.from("tasks").select("checklist").eq("id", m.taskId).maybeSingle();
        if (tk) {
          const checklist = Array.isArray(tk.checklist) ? tk.checklist : [];
          checklist.push({ id: rndId("cl"), text: m.detalle, done: false });
          await supabase.from("tasks").update({ checklist }).eq("id", m.taskId);
          applied.push({ member_id: persona.member_id, task_id: m.taskId, modo: "subtask" });
        }
      } else {
        await supabase.from("task_comments").insert({
          id: rndId("tc"), task_id: m.taskId, parent_id: null, author_id: "matias",
          body: `📋 *De la reunión "${llamada.titulo}":*\n${m.detalle}`, kind: "report",
        });
        applied.push({ member_id: persona.member_id, task_id: m.taskId, modo: "comment" });
      }
    }

    // 3) DM personal (con fallback)
    const dmText =
      `:wave: *Reporte de la reunión: ${llamada.titulo}*\n` +
      `Estos son tus accionables:\n${lines.join("\n")}` +
      (recordingUrl ? `\n\n:movie_camera: Grabación: ${recordingUrl}` : "");
    let delivered = false;
    if (member?.slack_id && token) delivered = await postSlackDM(token, member.slack_id, dmText);
    if (!delivered) {
      if (member?.slack_id) channelMentions.push(`<@${member.slack_id}>`);
      else channelMentions.push(`*${nombre}*`);
      if (persona.member_id) {
        await supabase.from("notifications").insert({
          id: rndId("ntf"), recipient_id: persona.member_id, type: "reunion_reporte",
          title: `Accionables de la reunión: ${llamada.titulo}`, body: lines.join("\n").slice(0, 1000),
        });
      }
    }
    applied.push({ member_id: persona.member_id, dm: delivered });
  }

  // 4) Post al canal del grupo
  let channelPosted = false;
  if (token && groupChannel) {
    const bullets = String(payload.canal_post || "").trim();
    let text =
      `:loudspeaker: *${SUBTIPO_LABEL[subtipo] || "Equipo"} — ${llamada.titulo}*\n` +
      (bullets ? `${bullets}\n` : "") +
      (recordingUrl ? `\n:movie_camera: Grabación: ${recordingUrl}` : "");
    if (channelMentions.length) {
      text += `\n\n:bell: Accionables para: ${channelMentions.join(", ")} (revisá tu panel / DM)`;
    }
    channelPosted = await postSlack(token, groupChannel, text);
  }

  await supabase
    .from("llamadas")
    .update({ reporte_status: "sent", reporte_sent_at: new Date().toISOString() })
    .eq("id", llamadaId);

  return j(200, {
    ok: true,
    status: "sent",
    channel_posted: channelPosted,
    channel: groupChannel || null,
    applied,
    fallbacks: channelMentions.length,
  });
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return j(405, { error: "method_not_allowed" });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return j(400, { error: "invalid_json" });
  }

  const action = String(body?.action || "");
  const llamadaId = String(body?.llamada_id || "");
  if (!llamadaId) return j(400, { error: "falta llamada_id" });

  try {
    if (action === "prepare") return await handlePrepare(llamadaId);
    if (action === "send") return await handleSend(llamadaId);
    return j(400, { error: "action_invalida (prepare|send)" });
  } catch (e: any) {
    return j(500, { error: String(e?.message || e) });
  }
});
