// supabase/functions/wa-analisis-semanal/index.ts
// Informe SEMANAL (domingos) de satisfacción + briefings vivos por cliente.
// Lo llama pg_cron los domingos (net.http_post con x-cron-secret), o a mano con
// { dry_run: true } / { force: true }.
//
// Analiza SOLO los últimos 7 días (no reprocesa el historial):
//   • Grupos de USUARIOS (etiqueta G usuarios): satisfacción + temas + problemas
//     técnicos + FAQs → nutre la Guía de soporte (Google Docs).
//   • Grupos de CLIENTES (etiqueta G-Clientes): satisfacción + dudas + quejas +
//     calidad de la respuesta de Korex.
//   • Chats privados 1-a-1 vinculados a cliente: satisfacción de la relación directa.
// Luego sintetiza un BRIEFING vivo por cliente (estado + riesgos + historial) y
// lo vuelca a Google Docs (una sección/pestaña por cliente) + Slack.
//
// "Korex respondió" = saliente de soporte o número del equipo (soporte/Matías/Cristian).
// verify_jwt: false — auth por secreto compartido (?secret= o x-cron-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analyze } from "../_shared/anthropic.ts";
import {
  loadConfig, korexSet, buildTranscript, tagIdsByLabel, convHasAnyTag,
  resolveClientId, fetchMessagesSince, postDocs, postSlack, slackToken,
  checkCron, isoDaysAgo, weekStartDate, type WaConversation, type WaMessage,
} from "../_shared/intel.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const WINDOW_DAYS = 7;
const MAX_MSGS = 500;     // tope de mensajes por análisis (evita transcripts enormes)
const MAX_FAQS_DOC = 40;  // tope de FAQs que se mandan a la guía por corrida

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const clampScore = (n: any) => { const v = Math.round(Number(n)); return isNaN(v) ? null : Math.max(0, Math.min(100, v)); };

// ── Prompts y schemas ──────────────────────────────────────────────────────────
const SYS_USUARIOS = `Sos analista de soporte de Korex. Te paso el transcript de 7 días de un GRUPO DE USUARIOS del CRM de un cliente (ahí están todos los usuarios del cliente; se hacen preguntas entre ellos y surgen problemas técnicos). Los "KOREX:" son del equipo.

Devolvé: satisfaccion {score 0-100, label corto}, resumen (3-4 oraciones del clima y lo que pasó), temas_frecuentes, problemas_tecnicos, y faqs (preguntas que se repiten o que conviene documentar, con una respuesta sugerida breve y una categoría). Si no hay actividad relevante, score null-ish bajo y listas vacías.`;

const SYS_CLIENTE = `Sos analista de soporte de Korex. Te paso el transcript de 7 días de un GRUPO PRIVADO con un cliente (suele estar el cliente y su equipo interno). Los "KOREX:" son del equipo de Korex (soporte/Matías/Cristian) y cuentan como respuesta de la empresa.

Devolvé: satisfaccion {score 0-100, label}, resumen (3-4 oraciones), dudas (lo que preguntó el cliente), quejas (lo que reclamó o le molestó), y calidad_respuesta {score 0-100, notas} evaluando cómo respondió Korex (rapidez, claridad, si resolvió).`;

const SYS_BRIEFING = `Sos analista de soporte de Korex. Te paso los resúmenes de esta semana de un cliente desde tres ángulos (grupo de usuarios, grupo privado del cliente, chats 1-a-1). Sintetizá un briefing ejecutivo.

Devolvé: estado (2-3 oraciones de la situación general del cliente esta semana), riesgos (señales de alerta o churn; vacío si no hay), sat_overall (0-100, satisfacción consolidada) y resumen_semana (1 oración para el historial).`;

const SAT = { type: "object", additionalProperties: false, properties: { score: { type: ["integer", "null"] }, label: { type: "string" } }, required: ["score", "label"] };
const SCHEMA_USUARIOS = {
  type: "object", additionalProperties: false,
  properties: {
    satisfaccion: SAT, resumen: { type: "string" },
    temas_frecuentes: { type: "array", items: { type: "string" } },
    problemas_tecnicos: { type: "array", items: { type: "string" } },
    faqs: { type: "array", items: { type: "object", additionalProperties: false, properties: { pregunta: { type: "string" }, respuesta: { type: "string" }, categoria: { type: "string" } }, required: ["pregunta", "respuesta", "categoria"] } },
  },
  required: ["satisfaccion", "resumen", "temas_frecuentes", "problemas_tecnicos", "faqs"],
};
const SCHEMA_CLIENTE = {
  type: "object", additionalProperties: false,
  properties: {
    satisfaccion: SAT, resumen: { type: "string" },
    dudas: { type: "array", items: { type: "string" } },
    quejas: { type: "array", items: { type: "string" } },
    calidad_respuesta: { type: "object", additionalProperties: false, properties: { score: { type: ["integer", "null"] }, notas: { type: "string" } }, required: ["score", "notas"] },
  },
  required: ["satisfaccion", "resumen", "dudas", "quejas", "calidad_respuesta"],
};
const SCHEMA_BRIEFING = {
  type: "object", additionalProperties: false,
  properties: { estado: { type: "string" }, riesgos: { type: "string" }, sat_overall: { type: ["integer", "null"] }, resumen_semana: { type: "string" } },
  required: ["estado", "riesgos", "sat_overall", "resumen_semana"],
};

interface ScopeData { score: number | null; label: string; resumen: string; }
interface ClientAccum { name: string; usuarios?: ScopeData; cliente_grupo?: ScopeData; privado?: ScopeData; }

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  let body: any = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const dryRun = !!body.dry_run;

  const cfg = await loadConfig(admin);
  if (!dryRun && !checkCron(req, cfg)) return jsonResp(401, { error: "unauthorized" });

  const sinceIso = isoDaysAgo(WINDOW_DAYS);
  const weekStart = weekStartDate();
  const korex = korexSet(cfg);
  const usuariosTagIds = tagIdsByLabel(cfg, cfg.usuarios_tag_label || "G usuarios");
  const clientesTagIds = tagIdsByLabel(cfg, cfg.clientes_tag_label || "G-Clientes");

  const { data: clientsRows } = await admin.from("clients").select("id, name");
  const clientNameById = new Map<string, string>();
  const clientsByNameLower = new Map<string, string>();
  for (const c of clientsRows ?? []) {
    clientNameById.set(c.id, c.name || c.id);
    if (c.name) clientsByNameLower.set(c.name.toLowerCase().trim(), c.id);
  }

  const { data: convsRaw } = await admin
    .from("wa_conversations")
    .select("id, wa_jid, wa_phone, is_group, wa_profile_name, client_id, tags, archived, last_message_at")
    .gte("last_message_at", sinceIso)
    .limit(800);
  const convs = (convsRaw ?? []).filter((c: any) => !c.archived) as (WaConversation & any)[];

  const { data: run } = await admin.from("wa_intel_runs")
    .insert({ kind: "weekly", period_start: sinceIso.slice(0, 10), period_end: new Date().toISOString().slice(0, 10) })
    .select("id").single();
  const runId = run?.id;

  const perClient = new Map<string, ClientAccum>();
  const accum = (cid: string): ClientAccum => {
    if (!perClient.has(cid)) perClient.set(cid, { name: clientNameById.get(cid) || cid });
    return perClient.get(cid)!;
  };
  const saveSat = async (cid: string, scope: string, score: number | null, label: string, notas: string) => {
    if (dryRun) return;
    await admin.from("wa_satisfaction_history").upsert(
      { client_id: cid, scope, week_start: weekStart, score, label, notas },
      { onConflict: "client_id,scope,week_start" });
  };

  const transcriptFor = async (convId: string) => {
    const msgs = await fetchMessagesSince(admin, convId, sinceIso);
    const sliced = msgs.length > MAX_MSGS ? msgs.slice(msgs.length - MAX_MSGS) : msgs;
    return { transcript: buildTranscript(sliced, korex), count: msgs.length };
  };

  const faqBucket: { pregunta: string; respuesta: string; categoria: string; cid: string | null }[] = [];
  const stats = { usuarios: 0, cliente_grupo: 0, privado: 0, briefings: 0, errors: 0 };

  // ── G usuarios ────────────────────────────────────────────────────────────────
  for (const conv of convs.filter((c) => c.is_group && convHasAnyTag(c, usuariosTagIds))) {
    const cid = resolveClientId(conv, cfg, clientsByNameLower);
    if (!cid) continue;
    const { transcript, count } = await transcriptFor(conv.id);
    if (count < 3) continue;
    try {
      const r = await analyze<any>({ system: SYS_USUARIOS, user: transcript, schema: SCHEMA_USUARIOS, model: cfg.analysis_model });
      const score = clampScore(r.satisfaccion?.score);
      await saveSat(cid, "usuarios", score, r.satisfaccion?.label || "", r.resumen || "");
      accum(cid).usuarios = { score, label: r.satisfaccion?.label || "", resumen: r.resumen || "" };
      for (const f of (r.faqs || []).slice(0, 10)) faqBucket.push({ pregunta: f.pregunta, respuesta: f.respuesta, categoria: f.categoria, cid });
      stats.usuarios++;
    } catch (e) { console.error("usuarios IA error", conv.id, e); stats.errors++; }
  }

  // ── G-Clientes ──────────────────────────────────────────────────────────────────
  for (const conv of convs.filter((c) => c.is_group && convHasAnyTag(c, clientesTagIds))) {
    const cid = resolveClientId(conv, cfg, clientsByNameLower);
    if (!cid) continue;
    const { transcript, count } = await transcriptFor(conv.id);
    if (count < 2) continue;
    try {
      const r = await analyze<any>({ system: SYS_CLIENTE, user: transcript, schema: SCHEMA_CLIENTE, model: cfg.analysis_model });
      const score = clampScore(r.satisfaccion?.score);
      const cal = r.calidad_respuesta || {};
      const notas = `${r.resumen || ""}${cal.notas ? ` | Respuesta Korex: ${cal.notas}` : ""}`;
      await saveSat(cid, "cliente_grupo", score, r.satisfaccion?.label || "", notas);
      accum(cid).cliente_grupo = { score, label: r.satisfaccion?.label || "", resumen: r.resumen || "" };
      stats.cliente_grupo++;
    } catch (e) { console.error("cliente IA error", conv.id, e); stats.errors++; }
  }

  // ── Privados 1-a-1 por cliente (mensajes combinados de sus DMs) ──────────────────
  const dmByClient = new Map<string, string[]>();
  for (const conv of convs.filter((c) => !c.is_group && c.client_id)) {
    const arr = dmByClient.get(conv.client_id!) || [];
    arr.push(conv.id);
    dmByClient.set(conv.client_id!, arr);
  }
  for (const [cid, convIds] of dmByClient) {
    let msgs: WaMessage[] = [];
    for (const id of convIds) msgs = msgs.concat(await fetchMessagesSince(admin, id, sinceIso));
    if (msgs.length < 2) continue;
    msgs.sort((a, b) => String(a.wa_timestamp || a.created_at).localeCompare(String(b.wa_timestamp || b.created_at)));
    if (msgs.length > MAX_MSGS) msgs = msgs.slice(msgs.length - MAX_MSGS);
    const transcript = buildTranscript(msgs, korex);
    if (!transcript.trim()) continue;
    try {
      const r = await analyze<any>({ system: SYS_CLIENTE, user: transcript, schema: SCHEMA_CLIENTE, model: cfg.analysis_model });
      const score = clampScore(r.satisfaccion?.score);
      await saveSat(cid, "privado", score, r.satisfaccion?.label || "", r.resumen || "");
      accum(cid).privado = { score, label: r.satisfaccion?.label || "", resumen: r.resumen || "" };
      stats.privado++;
    } catch (e) { console.error("privado IA error", cid, e); stats.errors++; }
  }

  // ── FAQs → tabla + Guía de soporte ──────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const faqsForDoc: { pregunta: string; respuesta: string; categoria: string }[] = [];
  if (!dryRun && faqBucket.length) {
    const { data: existingFaqs } = await admin.from("wa_support_faqs").select("id, pregunta, frecuencia");
    const byNorm = new Map<string, any>();
    for (const f of existingFaqs ?? []) byNorm.set(norm(f.pregunta), f);
    const seenThisRun = new Set<string>();
    for (const f of faqBucket) {
      const k = norm(f.pregunta);
      if (!k || seenThisRun.has(k)) continue;
      seenThisRun.add(k);
      const ex = byNorm.get(k);
      if (ex) {
        await admin.from("wa_support_faqs").update({ last_seen: today, frecuencia: (ex.frecuencia || 1) + 1 }).eq("id", ex.id);
      } else {
        await admin.from("wa_support_faqs").insert({ pregunta: f.pregunta, respuesta_sugerida: f.respuesta, categoria: f.categoria, fuente_client_id: f.cid });
      }
      if (faqsForDoc.length < MAX_FAQS_DOC) faqsForDoc.push({ pregunta: f.pregunta, respuesta: f.respuesta, categoria: f.categoria });
    }
    if (faqsForDoc.length) {
      await postDocs(cfg, "append_faqs", { doc_url: cfg.support_guide_doc_url, faqs: faqsForDoc });
    }
  }

  // ── Briefings vivos por cliente (Fase 5) ─────────────────────────────────────────
  const satRows: any[] = [];
  for (const [cid, acc] of perClient) {
    const present = [acc.usuarios, acc.cliente_grupo, acc.privado].filter(Boolean) as ScopeData[];
    const scores = present.map((s) => s.score).filter((n): n is number => n !== null);
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;

    let estado = "", riesgos = "", overall = avg, resumenSemana = "";
    try {
      const ctx = `GRUPO DE USUARIOS: ${acc.usuarios ? `(${acc.usuarios.score}/100) ${acc.usuarios.resumen}` : "sin datos"}\n` +
        `GRUPO DEL CLIENTE: ${acc.cliente_grupo ? `(${acc.cliente_grupo.score}/100) ${acc.cliente_grupo.resumen}` : "sin datos"}\n` +
        `CHATS 1-A-1: ${acc.privado ? `(${acc.privado.score}/100) ${acc.privado.resumen}` : "sin datos"}`;
      const b = await analyze<any>({ system: SYS_BRIEFING, user: `Cliente: ${acc.name}\n\n${ctx}`, schema: SCHEMA_BRIEFING, model: cfg.analysis_model, maxTokens: 2048 });
      estado = b.estado || ""; riesgos = b.riesgos || ""; resumenSemana = b.resumen_semana || "";
      if (b.sat_overall !== null && b.sat_overall !== undefined) overall = clampScore(b.sat_overall);
    } catch (e) { console.error("briefing IA error", cid, e); stats.errors++; }

    if (!dryRun) {
      const { data: prev } = await admin.from("wa_briefings").select("historial").eq("client_id", cid).maybeSingle();
      const historial = Array.isArray(prev?.historial) ? prev!.historial : [];
      historial.push({ week_start: weekStart, resumen: resumenSemana || estado, sat_overall: overall });
      const trimmed = historial.slice(-12);
      await admin.from("wa_briefings").upsert({
        client_id: cid,
        sat_usuarios: acc.usuarios?.score ?? null, sat_usuarios_label: acc.usuarios?.label ?? null,
        sat_cliente_grupo: acc.cliente_grupo?.score ?? null, sat_cliente_grupo_label: acc.cliente_grupo?.label ?? null,
        sat_privado: acc.privado?.score ?? null, sat_privado_label: acc.privado?.label ?? null,
        sat_overall: overall, estado, riesgos, historial: trimmed, updated_at: new Date().toISOString(),
      }, { onConflict: "client_id" });

      await postDocs(cfg, "upsert_briefing_tab", {
        doc_url: cfg.briefings_doc_url, client_id: cid, client_name: acc.name, week_start: weekStart,
        estado, riesgos, sat: { overall, usuarios: acc.usuarios?.score ?? null, cliente_grupo: acc.cliente_grupo?.score ?? null, privado: acc.privado?.score ?? null },
        historial: trimmed,
      });
      stats.briefings++;
    }

    satRows.push({
      client_id: cid, client_name: acc.name,
      sat_usuarios: acc.usuarios?.score ?? null, sat_cliente_grupo: acc.cliente_grupo?.score ?? null,
      sat_privado: acc.privado?.score ?? null, nota: estado,
    });
  }

  // ── Doc de satisfacción semanal + Slack ──────────────────────────────────────────
  if (!dryRun) {
    await postDocs(cfg, "write_weekly_satisfaction", {
      doc_url: cfg.satisfaction_doc_url, week_start: weekStart,
      resumen: `Análisis de ${perClient.size} cliente(s) — semana del ${weekStart}.`, rows: satRows,
    });

    const token = await slackToken(admin);
    const channel = cfg.intel_slack_informe_channel || "";
    if (token && channel) {
      let text = `:bar_chart: *Satisfacción semanal — semana del ${weekStart}*\n`;
      const sorted = [...satRows].sort((a, b) => (overallOf(a) ?? 999) - (overallOf(b) ?? 999));
      for (const r of sorted) {
        const o = overallOf(r);
        const dot = o === null ? ":white_circle:" : o >= 75 ? ":large_green_circle:" : o >= 50 ? ":large_yellow_circle:" : ":red_circle:";
        text += `\n${dot} *${r.client_name}* — ${o === null ? "s/d" : o + "/100"}` +
          ` _(U:${fmt(r.sat_usuarios)} · C:${fmt(r.sat_cliente_grupo)} · 1a1:${fmt(r.sat_privado)})_`;
      }
      if (!satRows.length) text += "\nSin actividad suficiente esta semana.";
      await postSlack(token, channel, text);
    }

    if (runId) await admin.from("wa_intel_runs").update({
      status: stats.errors && !(stats.usuarios + stats.cliente_grupo + stats.privado) ? "error" : "ok",
      finished_at: new Date().toISOString(), stats,
    }).eq("id", runId);
  }

  return jsonResp(200, { ok: true, dry_run: dryRun, week_start: weekStart, clients: perClient.size, stats, satRows: dryRun ? satRows : undefined });
});

function fmt(v: number | null) { return v === null || v === undefined ? "—" : String(v); }
function overallOf(r: any): number | null {
  const s = [r.sat_usuarios, r.sat_cliente_grupo, r.sat_privado].filter((n) => n !== null && n !== undefined) as number[];
  return s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null;
}
