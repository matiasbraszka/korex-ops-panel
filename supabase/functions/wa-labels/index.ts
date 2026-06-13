// supabase/functions/wa-labels/index.ts — v1
// Importa las ETIQUETAS de WhatsApp Business (Evolution API) a la bandeja del
// panel: crea las etiquetas en soporte_config.tags y las asocia a los chats
// (wa_conversations.tags). Idempotente: la etiqueta de WA con id X siempre
// mapea al tag local "wa-X".
//
//   POST { mode: 'inspect' } → diagnóstico: qué devuelve Evolution (labels +
//      forma de los chats) SIN tocar nada. Para confirmar shapes.
//   POST { mode: 'apply' }   → crea las etiquetas y las asocia a los chats.
//
// verify_jwt: true — solo usuarios logueados del panel.

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
const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

interface Cfg {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
  tags?: { id: string; label: string; color: string }[];
}

// Paleta para mapear el color (índice) de la etiqueta de WhatsApp a un hex.
const PALETTE = [
  "#22C55E", "#F59E0B", "#4A67D8", "#E11D48", "#7C3AED", "#0E7490",
  "#15803D", "#B45309", "#2563EB", "#DC2626", "#8E24AA", "#0891B2",
];
const colorFor = (i: unknown) => PALETTE[Math.abs(Number(i) || 0) % PALETTE.length];

async function evo(server: string, key: string, path: string, method = "GET", body?: unknown) {
  const r = await fetch(`${server.replace(/\/$/, "")}${path}`, {
    method,
    headers: { "Content-Type": "application/json", apikey: key },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(25000),
  });
  const text = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(text); } catch { /* deja text */ }
  return { status: r.status, json, text };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* default inspect */ }
  const mode = body.mode === "apply" ? "apply" : "inspect";

  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (data?.value as Cfg) ?? {};
  const server = cfg.server_url || "";
  const key = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!server || !key) return jsonResp(200, { ok: false, error: "evolution_no_configurado" });

  // 1) Etiquetas de WhatsApp Business.
  const labelsRes = await evo(server, key, `/label/findLabels/${instance}`);
  const rawLabels = Array.isArray(labelsRes.json)
    ? labelsRes.json
    : (labelsRes.json && Array.isArray((labelsRes.json as any).labels) ? (labelsRes.json as any).labels : []);
  const labels = (rawLabels as any[]).map((l) => ({
    id: String(l?.id ?? l?.labelId ?? l?.name ?? ""),
    name: String(l?.name ?? l?.label ?? ""),
    color: l?.color,
  })).filter((l) => l.id && l.name);

  // 2) Chats (para ver/usar la asociación chat ↔ etiqueta).
  const chatsRes = await evo(server, key, `/chat/findChats/${instance}`, "POST", {});
  const chats = Array.isArray(chatsRes.json) ? chatsRes.json as any[] : [];
  // En Evolution v2 cada chat suele traer `labels` (array de ids de etiqueta).
  const chatsWithLabels = chats.filter((c) => Array.isArray(c?.labels) && c.labels.length);

  if (mode === "inspect") {
    // Probar rutas alternativas para encontrar la asociación chat↔etiqueta.
    const probes: Record<string, unknown> = {};
    const tryProbe = async (label: string, path: string, method = "POST", b?: unknown) => {
      try {
        const r = await evo(server, key, path, method, b);
        const arr = Array.isArray(r.json) ? r.json : null;
        probes[label] = {
          status: r.status,
          count: arr ? arr.length : null,
          sample_keys: arr && arr[0] ? Object.keys(arr[0]) : (r.json ? Object.keys(r.json as any).slice(0, 12) : null),
          with_labels: arr ? arr.filter((x: any) => Array.isArray(x?.labels) && x.labels.length).length : null,
          text_sample: arr ? undefined : r.text?.slice(0, 200),
        };
      } catch (e) { probes[label] = { error: String(e) }; }
    };
    await tryProbe("findContacts", `/chat/findContacts/${instance}`, "POST", {});
    await tryProbe("findChats_where", `/chat/findChats/${instance}`, "POST", { where: {} });
    // Asociación de la primera etiqueta (si la API la expone por id).
    if (labels[0]) await tryProbe("label_0_handle", `/label/findLabels/${instance}`, "GET");

    return jsonResp(200, {
      ok: true,
      mode,
      labels_status: labelsRes.status,
      labels_count: labels.length,
      labels,
      labels_raw_sample: Array.isArray(rawLabels) ? rawLabels.slice(0, 2) : labelsRes.text?.slice(0, 300),
      chats_status: chatsRes.status,
      chats_count: chats.length,
      chats_with_labels: chatsWithLabels.length,
      chat_sample_keys: chats[0] ? Object.keys(chats[0]) : [],
      probes,
    });
  }

  // ── APPLY ──
  // a) Crear/actualizar las etiquetas en soporte_config.tags (id estable wa-<id>).
  const existing = Array.isArray(cfg.tags) ? cfg.tags : [];
  const byId = new Map(existing.map((t) => [t.id, t]));
  for (const l of labels) {
    const tagId = `wa-${l.id}`;
    byId.set(tagId, { id: tagId, label: l.name, color: colorFor(l.color) });
  }
  const mergedTags = [...byId.values()];
  await admin.from("app_settings").update({ value: { ...cfg, tags: mergedTags } }).eq("key", "soporte_config");

  // b) Asociar a los chats. Normaliza el jid del chat y matchea wa_conversations.
  let tagged = 0, matchedChats = 0;
  for (const c of chatsWithLabels) {
    const jid = String(c.remoteJid || c.id || c.jid || "");
    if (!jid) continue;
    const tagIds = (c.labels as any[]).map((lid) => `wa-${String(lid)}`);
    const { data: conv } = await admin.from("wa_conversations").select("id, tags").eq("wa_jid", jid).maybeSingle();
    if (!conv) continue;
    matchedChats++;
    const cur: string[] = Array.isArray(conv.tags) ? conv.tags : [];
    const next = [...new Set([...cur, ...tagIds])];
    if (next.length !== cur.length) {
      await admin.from("wa_conversations").update({ tags: next }).eq("id", conv.id);
      tagged++;
    }
  }

  return jsonResp(200, {
    ok: true,
    mode,
    labels_imported: labels.length,
    chats_with_labels: chatsWithLabels.length,
    chats_matched: matchedChats,
    conversations_tagged: tagged,
  });
});
