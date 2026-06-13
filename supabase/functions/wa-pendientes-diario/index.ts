// supabase/functions/wa-pendientes-diario/index.ts
// Informe diario de PENDIENTES SIN RESPONDER. Lo llama pg_cron 1 vez al día
// (net.http_post con x-cron-secret), o se invoca a mano con { dry_run: true }.
//
// Recorre los grupos de clientes (etiqueta G-Clientes) y los chats privados 1-a-1
// con actividad reciente, y por cada uno le pide a la IA si quedó alguna
// pregunta/pedido del cliente SIN respuesta de Korex —aunque la charla haya seguido—.
// Guarda el set vivo en wa_pending_items, avisa por Slack y lo vuelca al Google Doc.
//
// "Korex respondió" = mensaje saliente del WhatsApp de soporte, o mensaje de un
// número del equipo (soporte/Matías/Cristian) en soporte_config.korex_responder_phones.
//
// verify_jwt: false — auth por secreto compartido (?secret= o x-cron-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { analyze } from "../_shared/anthropic.ts";
import {
  loadConfig, korexSet, buildTranscript, tagIdsByLabel, convHasAnyTag,
  resolveClientId, fetchMessagesSince, postDocs, postSlack, slackToken,
  checkCron, isoDaysAgo, type WaConversation,
} from "../_shared/intel.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

const MAX_CONVS = 120;        // tope por corrida (se loguea si se supera)
const WINDOW_DAYS = 2;        // ventana de contexto

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const SYSTEM = `Sos un analista de soporte de Korex. Te paso el transcript reciente de UN chat de WhatsApp (grupo de cliente o chat privado). Los mensajes marcados "KOREX:" son del equipo (soporte/Matías/Cristian); los "USUARIO(...)" son del cliente o sus usuarios.

Tu tarea: detectar preguntas o pedidos CONCRETOS del cliente que NO recibieron respuesta de Korex, aunque la conversación haya seguido con otros temas. No marques saludos, agradecimientos ni charla resuelta. Si Korex ya respondió (aunque sea más abajo), NO es pendiente.

Devolvé SOLO lo que de verdad quedó sin responder. Para cada pendiente: "pregunta" (qué pidió, en una línea), "last_msg" (cita corta del mensaje del cliente) y "urgencia" (alta/media/baja). Si no hay nada pendiente, devolvé una lista vacía.`;

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    pendientes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          pregunta: { type: "string" },
          last_msg: { type: "string" },
          urgencia: { type: "string", enum: ["alta", "media", "baja"] },
        },
        required: ["pregunta", "last_msg", "urgencia"],
      },
    },
  },
  required: ["pendientes"],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok");
  let body: any = {};
  if (req.method === "POST") body = await req.json().catch(() => ({}));
  const dryRun = !!body.dry_run;

  const cfg = await loadConfig(admin);
  // dry_run a mano salta el chequeo de cron; la corrida automática lo exige.
  if (!dryRun && !checkCron(req, cfg)) return jsonResp(401, { error: "unauthorized" });

  const sinceIso = isoDaysAgo(WINDOW_DAYS);
  const korex = korexSet(cfg);
  const clientesTagIds = tagIdsByLabel(cfg, cfg.clientes_tag_label || "G-Clientes");

  // Clientes para resolver nombres / grupo→cliente.
  const { data: clientsRows } = await admin.from("clients").select("id, name");
  const clientNameById = new Map<string, string>();
  const clientsByNameLower = new Map<string, string>();
  for (const c of clientsRows ?? []) {
    clientNameById.set(c.id, c.name || c.id);
    if (c.name) clientsByNameLower.set(c.name.toLowerCase().trim(), c.id);
  }

  // Conversaciones con actividad reciente: 1-a-1 + grupos de clientes (NO grupos de usuarios).
  const { data: convsRaw } = await admin
    .from("wa_conversations")
    .select("id, wa_jid, wa_phone, is_group, wa_profile_name, client_id, tags, contact_id, last_message_at, archived")
    .gte("last_message_at", sinceIso)
    .order("last_message_at", { ascending: false })
    .limit(400);

  const convs = (convsRaw ?? []).filter((c: any) => {
    if (c.archived) return false;
    if (!c.is_group) return true;                       // chats privados 1-a-1
    return convHasAnyTag(c as WaConversation, clientesTagIds); // grupos de clientes
  });

  const capped = convs.length > MAX_CONVS;
  const toProcess = convs.slice(0, MAX_CONVS);

  const { data: run } = await admin.from("wa_intel_runs")
    .insert({ kind: "daily", period_start: sinceIso.slice(0, 10), period_end: new Date().toISOString().slice(0, 10) })
    .select("id").single();
  const runId = run?.id;

  const groups: { title: string; client_id: string | null; items: any[] }[] = [];
  let analyzed = 0, withPending = 0, errors = 0;

  for (const conv of toProcess) {
    const msgs = await fetchMessagesSince(admin, conv.id, sinceIso);
    if (!msgs.length) continue;
    const transcript = buildTranscript(msgs, korex);
    if (!transcript.trim()) continue;

    let pendientes: any[] = [];
    try {
      const out = await analyze<{ pendientes: any[] }>({
        system: SYSTEM, user: transcript, schema: SCHEMA,
        model: cfg.analysis_model, maxTokens: 2048,
      });
      pendientes = out.pendientes || [];
      analyzed++;
    } catch (e) {
      console.error("wa-pendientes-diario: IA error", conv.id, e);
      errors++;
      continue;
    }

    const clientId = resolveClientId(conv as WaConversation, cfg, clientsByNameLower);
    const title = (clientId && clientNameById.get(clientId)) ||
      conv.wa_profile_name || conv.wa_phone || "Chat";

    if (!dryRun) {
      // Set vivo por conversación: resolver lo que ya no figura, insertar lo nuevo.
      const { data: openRows } = await admin.from("wa_pending_items")
        .select("id, pregunta").eq("conversation_id", conv.id).is("resolved_at", null);
      const newSet = new Set(pendientes.map((p) => norm(p.pregunta)));
      const stillOpenIds = new Set<string>();
      for (const r of openRows ?? []) {
        if (newSet.has(norm(r.pregunta))) stillOpenIds.add(norm(r.pregunta));
        else await admin.from("wa_pending_items").update({ resolved_at: new Date().toISOString() }).eq("id", r.id);
      }
      for (const p of pendientes) {
        if (stillOpenIds.has(norm(p.pregunta))) continue; // ya estaba abierto
        await admin.from("wa_pending_items").insert({
          conversation_id: conv.id, client_id: clientId,
          pregunta: p.pregunta, last_msg_preview: (p.last_msg || "").slice(0, 300),
          urgencia: ["alta", "media", "baja"].includes(p.urgencia) ? p.urgencia : "media",
          wa_timestamp: msgs[msgs.length - 1]?.wa_timestamp || null,
        });
      }
    }

    if (pendientes.length) {
      withPending++;
      groups.push({ title, client_id: clientId, items: pendientes });
    }
  }

  // Slack (1 mensaje) + Google Doc.
  const today = new Date().toISOString().slice(0, 10);
  if (!dryRun) {
    const token = await slackToken(admin);
    const channel = cfg.intel_slack_pendientes_channel || "";
    if (token && channel) {
      let text = `:hourglass_flowing_sand: *Pendientes sin responder — ${today}*\n`;
      if (!groups.length) text += "Todo respondido, sin pendientes. :white_check_mark:";
      else {
        const emo: Record<string, string> = { alta: ":red_circle:", media: ":large_yellow_circle:", baja: ":white_circle:" };
        for (const g of groups) {
          text += `\n*${g.title}*\n`;
          for (const it of g.items) text += `  ${emo[it.urgencia] || ":large_yellow_circle:"} ${it.pregunta}\n`;
        }
      }
      if (capped) text += `\n_(se analizaron los primeros ${MAX_CONVS} chats; quedaron ${convs.length - MAX_CONVS} para la próxima corrida)_`;
      await postSlack(token, channel, text);
    }
    await postDocs(cfg, "write_daily_pending", {
      doc_url: cfg.pending_doc_url, date: today,
      groups: groups.map((g) => ({ title: g.title, items: g.items })),
    });
    if (runId) await admin.from("wa_intel_runs").update({
      status: errors && !analyzed ? "error" : "ok", finished_at: new Date().toISOString(),
      stats: { convs: convs.length, analyzed, with_pending: withPending, errors, capped },
    }).eq("id", runId);
  }

  return jsonResp(200, {
    ok: true, dry_run: dryRun, convs: convs.length, analyzed,
    with_pending: withPending, errors, capped,
    groups: dryRun ? groups : undefined,
  });
});
