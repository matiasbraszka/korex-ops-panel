// supabase/functions/client-brain-sync/index.ts
// Ingesta del "mini-cerebro" de cada cliente: lee el TEXTO de sus 3 documentos
// clave —DEL (documento en limpio), Onboarding e Investigación— y lo guarda en
// client_brain_docs para que el cerebro de marketing pueda razonar sobre ellos.
//
// Por cada cliente:
//   1. Recorre client_drive_nodes (ya sincronizado por drive-sync) y detecta los
//      3 docs por nombre (mismas reglas que el panel: DEL / Onboarding / Investigación).
//   2. Si el doc cambió desde la última extracción (modified_time), pide su texto a
//      un Apps Script (acción read_doc) y hace upsert en client_brain_docs. Idempotente.
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

// ── Detección de los 3 docs (mismas reglas que recursosShared.jsx del panel) ─────
function isDelDoc(name: string): boolean {
  return /\bDEL\b/.test(name) || /documento\s+en\s+limpio/i.test(name);
}
function isOnboardingDoc(name: string): boolean {
  return /\bonboarding\b/i.test(name);
}
function isInvestigacionDoc(name: string): boolean {
  return /investigaci[oó]n/i.test(name);
}
function docKind(name: string): "del" | "onboarding" | "investigacion" | null {
  if (isDelDoc(name)) return "del";
  if (isOnboardingDoc(name)) return "onboarding";
  if (isInvestigacionDoc(name)) return "investigacion";
  return null;
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
async function syncClient(
  client: { id: string; name: string },
  cfg: { appscriptUrl: string; appscriptSecret: string },
): Promise<{ ok: boolean; docs: number; skipped: number; error?: string }> {
  const clientId = client.id;

  // Nodos del árbol (documentos; excluye carpetas).
  const { data: nodes, error: nErr } = await supabase
    .from("client_drive_nodes")
    .select("id, name, node_type, mime_type, web_url, modified_time")
    .eq("client_id", clientId)
    .neq("node_type", "folder");
  if (nErr) return { ok: false, docs: 0, skipped: 0, error: String(nErr.message) };

  // Elegir el mejor candidato por tipo (el primero que matchea; docs > otros).
  const chosen = new Map<string, typeof nodes[number]>();
  for (const n of (nodes ?? [])) {
    const kind = docKind(n.name || "");
    if (!kind) continue;
    const prev = chosen.get(kind);
    // Preferir Google Docs sobre otros formatos, y el más recientemente modificado.
    const better = !prev
      || (n.node_type === "document" && prev.node_type !== "document")
      || (n.node_type === prev.node_type && (n.modified_time || "") > (prev.modified_time || ""));
    if (better) chosen.set(kind, n);
  }
  if (!chosen.size) return { ok: true, docs: 0, skipped: 0 };

  // Estado actual de lo ya ingerido (para saltar lo que no cambió).
  const { data: existing } = await supabase
    .from("client_brain_docs").select("doc_kind, source_modified_time, char_count").eq("client_id", clientId);
  const byKind = new Map((existing ?? []).map((e) => [e.doc_kind, e]));

  let docs = 0, skipped = 0;
  for (const [kind, n] of chosen) {
    const prev = byKind.get(kind);
    const unchanged = prev && prev.char_count > 0
      && str(prev.source_modified_time) && str(n.modified_time)
      && new Date(prev.source_modified_time as string).getTime() === new Date(n.modified_time as string).getTime();
    if (unchanged) { skipped++; continue; }

    const got = await fetchDocText(cfg.appscriptUrl, cfg.appscriptSecret, n.id, n.mime_type || "");
    if (!got) { skipped++; continue; }
    const text = got.text || "";

    const { error: uErr } = await supabase.from("client_brain_docs").upsert({
      id: `cbd_${clientId}_${kind}`,
      client_id: clientId,
      node_id: n.id,
      doc_kind: kind,
      title: got.title || n.name || "",
      text,
      char_count: text.length,
      web_url: n.web_url || null,
      source_modified_time: n.modified_time || null,
      synced_at: new Date().toISOString(),
    }, { onConflict: "client_id,doc_kind" });
    if (uErr) { console.error("brain upsert error", clientId, kind, uErr); skipped++; continue; }
    docs++;
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
