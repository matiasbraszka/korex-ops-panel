// supabase/functions/client-brain-sync/index.ts
// Ingesta del "mini-cerebro" de cada cliente: lee el TEXTO de los documentos de
// contexto —DEL, Onboarding, Investigación (auto por nombre) + los fijados a mano
// (pins)— y lo guarda en client_brain_docs para que el cerebro de marketing razone.
//
// Por cada cliente:
//   1. Recorre client_drive_nodes (ya sincronizado por drive-sync). Marca como
//      contexto: los Google Docs cuyo nombre matchea DEL/Onboarding/Investigación
//      (puede haber varios por tipo) + los node_id de client_brain_pins (kind=extra).
//   2. Si el doc cambió desde la última extracción (modified_time), pide su texto a
//      un Apps Script (acción read_doc) y hace upsert. Borra lo que ya no corresponde.
//
// La llama el botón "Sincronizar" del panel (?client_id=) y un pg_cron diario
// (después del drive-sync de las 06:00 BUE). SOLO esta función escribe (service_role).
//
// Config (sin secretos en el código):
//   venta_form_config → appscript_url, appscript_secret   (mismo Apps Script que drive-sync)
//   soporte_config    → cron_secret

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }

// Auto por nombre: SOLO el DEL (maestro de estrategia). El onboarding, la
// investigación, etc. pasan por CASILLEROS (slot) de cliente, asignados a mano.
function isDelDoc(name: string): boolean {
  return /\bDEL\b/.test(name) || /documento\s+en\s+limpio/i.test(name);
}

// ── Apps Script: texto de un documento ───────────────────────────────────────────
async function fetchDocText(
  url: string, secret: string, docId: string, mimeType: string,
): Promise<{ text: string; title: string } | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, action: "read_doc", docId, mimeType }),
      signal: AbortSignal.timeout(120000),
    });
    if (!res.ok) { console.error("read_doc http", res.status, docId); return null; }
    const j = await res.json();
    if (!j.ok) { console.error("read_doc appscript", j.error, docId); return null; }
    return { text: String(j.text ?? ""), title: String(j.title ?? "") };
  } catch (e) { console.error("read_doc error", docId, e); return null; }
}

// ── Sincroniza los docs de un cliente ────────────────────────────────────────────
// Ingiere: (a) TODOS los Google Docs que matchean DEL/onboarding/investigación por
// nombre (permite guardar varios, ej. onboarding estructurado + transcripción), y
// (b) los documentos FIJADOS a mano en client_brain_pins (doc_kind='extra', de
// cualquier tipo). Borra de client_brain_docs lo que ya no corresponde (desfijado).
async function syncClient(
  client: { id: string; name: string },
  cfg: { appscriptUrl: string; appscriptSecret: string },
): Promise<{ ok: boolean; docs: number; skipped: number; error?: string }> {
  const clientId = client.id;

  const { data: nodes, error: nErr } = await supabase
    .from("client_drive_nodes")
    .select("id, name, node_type, mime_type, web_url, modified_time, strategy_id")
    .eq("client_id", clientId)
    .neq("node_type", "folder");
  if (nErr) return { ok: false, docs: 0, skipped: 0, error: String(nErr.message) };

  // Pins: con `slot` = casillero de nivel cliente; sin slot = marca de estrategia (🧠 Carpetas).
  const { data: pins } = await supabase
    .from("client_brain_pins").select("node_id, slot").eq("client_id", clientId);
  const slotByNode = new Map<string, string>();
  const plainPins = new Set<string>();
  for (const p of (pins ?? [])) {
    if (p.slot) slotByNode.set(p.node_id, p.slot); else plainPins.add(p.node_id);
  }

  // Specs vinculadas a un avatar (avatars[].spec_node_id) en los funnels del cliente.
  const { data: strats } = await supabase.from("strategies").select("id").eq("client_id", clientId);
  const stratIds = (strats ?? []).map((s) => s.id);
  const avatarSpecIds = new Set<string>();
  if (stratIds.length) {
    const { data: pages } = await supabase.from("strategy_pages").select("avatars").in("strategy_id", stratIds);
    for (const p of (pages ?? [])) {
      for (const av of (Array.isArray(p.avatars) ? p.avatars : [])) {
        if (av?.spec_node_id) avatarSpecIds.add(av.spec_node_id);
      }
    }
  }

  // Documentos deseados: node_id -> { node, kind, scope }
  // Prioridad: casillero de cliente > DEL (estrategia) > spec de avatar > marca 🧠 (estrategia).
  const desired = new Map<string, { node: typeof nodes[number]; kind: string; scope: string }>();
  for (const n of (nodes ?? [])) {
    if (slotByNode.has(n.id)) { desired.set(n.id, { node: n, kind: slotByNode.get(n.id)!, scope: "client" }); continue; }
    if (n.node_type === "document" && isDelDoc(n.name || "")) { desired.set(n.id, { node: n, kind: "del", scope: "strategy" }); continue; }
    if (avatarSpecIds.has(n.id)) { desired.set(n.id, { node: n, kind: "extra", scope: "avatar" }); continue; }
    if (plainPins.has(n.id)) { desired.set(n.id, { node: n, kind: "extra", scope: "strategy" }); }
  }

  // Estado actual (para saltar lo que no cambió y borrar lo que sobra).
  const { data: existing } = await supabase
    .from("client_brain_docs").select("node_id, source_modified_time, char_count").eq("client_id", clientId);
  const byNode = new Map((existing ?? []).map((e) => [e.node_id, e]));

  let docs = 0, skipped = 0;
  for (const [nodeId, { node: n, kind, scope }] of desired) {
    const stratId = scope === "client" ? null : (n.strategy_id || null);
    const prev = byNode.get(nodeId);
    const unchanged = prev && prev.char_count > 0
      && str(prev.source_modified_time) && str(n.modified_time)
      && new Date(prev.source_modified_time as string).getTime() === new Date(n.modified_time as string).getTime();
    if (unchanged) {
      // El texto no cambió, pero el nivel (scope/estrategia) sí pudo cambiar (ej. se vinculó a un avatar).
      await supabase.from("client_brain_docs").update({ scope, strategy_id: stratId }).eq("client_id", clientId).eq("node_id", nodeId);
      skipped++; continue;
    }

    const got = await fetchDocText(cfg.appscriptUrl, cfg.appscriptSecret, n.id, n.mime_type || "");
    if (!got) { skipped++; continue; }
    const text = got.text || "";

    const { error: uErr } = await supabase.from("client_brain_docs").upsert({
      id: `cbd_${n.id}`,
      client_id: clientId,
      node_id: n.id,
      doc_kind: kind,
      scope,
      strategy_id: stratId,
      title: got.title || n.name || "",
      text,
      char_count: text.length,
      web_url: n.web_url || null,
      source_modified_time: n.modified_time || null,
      synced_at: new Date().toISOString(),
    }, { onConflict: "client_id,node_id" });
    if (uErr) { console.error("brain upsert error", clientId, nodeId, uErr); skipped++; continue; }
    docs++;
  }

  // Borrar lo que ya no corresponde (docs viejos o pins removidos).
  const toDelete = (existing ?? []).map((e) => e.node_id).filter((id) => !desired.has(id));
  if (toDelete.length) {
    await supabase.from("client_brain_docs").delete().eq("client_id", clientId).in("node_id", toDelete);
  }

  return { ok: true, docs, skipped };
}

// ── Auth: cron secret O usuario logueado del panel (botón "Sincronizar") ──────────
async function authorize(req: Request, cronSecret: string): Promise<boolean> {
  const url = new URL(req.url);
  const got = req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (cronSecret && got === cronSecret) return true;

  const authz = req.headers.get("Authorization") || "";
  const token = authz.replace(/^Bearer\s+/i, "").trim();
  if (token && ANON_KEY && token !== ANON_KEY) {
    try {
      const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data } = await userClient.auth.getUser();
      if (data?.user) return true;
    } catch { /* ignore */ }
  }
  return false;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const scfg = (sp?.value as Record<string, unknown>) ?? {};

  if (!(await authorize(req, str(scfg.cron_secret)))) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  if (!appscriptUrl) {
    return new Response(JSON.stringify({ ok: false, error: "missing_appscript_url" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const url = new URL(req.url);
  let bodyClientId = "";
  try { const b = await req.json(); bodyClientId = str((b as Record<string, unknown>)?.client_id); } catch { /* sin body */ }
  const onlyClient = bodyClientId || url.searchParams.get("client_id") || "";

  let q = supabase.from("clients").select("id, name").not("drive_folder_url", "is", null);
  if (onlyClient) q = q.eq("id", onlyClient);
  const { data: clients, error } = await q;
  if (error) return new Response(JSON.stringify({ ok: false, error: String(error.message) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const sharedCfg = { appscriptUrl, appscriptSecret };
  const results: Record<string, unknown>[] = [];
  let okCount = 0, totalDocs = 0;
  for (const c of (clients ?? [])) {
    const r = await syncClient(c as { id: string; name: string }, sharedCfg);
    if (r.ok) { okCount++; totalDocs += r.docs; }
    results.push({ client: c.id, ...r });
  }

  return new Response(JSON.stringify({ ok: true, clients: results.length, synced: okCount, docs: totalDocs, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
