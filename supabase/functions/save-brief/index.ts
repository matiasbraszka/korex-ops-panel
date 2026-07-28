// supabase/functions/save-brief/index.ts
// Crea o actualiza el BRIEFING / PERSONALIDAD de un cliente: guarda el texto en un Google Doc
// real (vía Apps Script write_brief), lo registra en el árbol de Drive, lo ingiere al cerebro
// (client_brain_docs doc_kind='briefing') y lo FIJA solo en el casillero "briefing" (client_brain_pins).
// Lo usa el botón "Escribir briefing / personalidad" del panel. Sin IA (el texto lo escribe el equipo).
//
// Auth: usuario logueado del panel O el cron_secret interno.

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
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cronSecret = str((sp?.value as Record<string, unknown>)?.cron_secret);
  const gotSecret = req.headers.get("x-cron-secret") || "";
  const authed = (cronSecret && gotSecret === cronSecret) || (await authedUser(req));
  if (!authed) return j({ ok: false, error: "unauthorized" }, 401);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const clientId = str(body.client_id);
  const content = String(body.content ?? "");
  if (!clientId) return j({ ok: false, error: "missing_client_id" }, 400);
  if (!content.trim()) return j({ ok: false, error: "empty", detail: "El briefing está vacío." }, 400);

  // Config del Apps Script.
  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  if (!appscriptUrl || !appscriptSecret) return j({ ok: false, error: "missing_appscript_config" }, 500);

  // Cliente + carpeta raíz (donde va el doc del brief).
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return j({ ok: false, error: "client_not_found" }, 404);
  const { data: rootNode } = await supabase.from("client_drive_nodes")
    .select("id").eq("client_id", clientId).eq("is_root", true).limit(1).maybeSingle();
  const rootId = str(rootNode?.id);

  const title = `Briefing y Personalidad - ${str(client.name) || "Cliente"}`;

  // Si ya existe un briefing, reusamos SU Google Doc (para editar el mismo, no crear otro).
  const { data: prev } = await supabase.from("client_brain_docs")
    .select("node_id").eq("client_id", clientId).eq("doc_kind", "briefing")
    .order("synced_at", { ascending: false }).limit(1).maybeSingle();
  const prevDocId = str(prev?.node_id);

  // Escribir/actualizar el Google Doc vía Apps Script.
  let asRes: Record<string, unknown> = {};
  try {
    const r = await fetch(appscriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "write_brief", secret: appscriptSecret, docId: prevDocId || undefined, content, title, clientFolderId: rootId || undefined }),
      signal: AbortSignal.timeout(60000),
    });
    asRes = await r.json();
  } catch (e) {
    return j({ ok: false, error: "appscript_unreachable", detail: String((e as Error)?.message || e) }, 502);
  }
  if (!asRes?.ok) return j({ ok: false, error: "appscript_failed", detail: str(asRes?.error) || "El Apps Script no pudo guardar el brief. ¿Está deployado con la acción write_brief?" }, 502);

  const docId = str(asRes.docId);
  const url = str(asRes.url);
  if (!docId) return j({ ok: false, error: "no_doc_id" }, 502);

  const nowIso = new Date().toISOString();
  // Registrar el doc en el árbol de Drive (para que aparezca como documento del cliente).
  await supabase.from("client_drive_nodes").upsert({
    id: docId, client_id: clientId, parent_id: rootId || null, name: title,
    node_type: "document", mime_type: "application/vnd.google-apps.document",
    web_url: url || null, depth: 1, is_root: false, strategy_id: null, last_seen_at: nowIso,
  }, { onConflict: "id" });

  // Ingerir el texto al cerebro (doc_kind='briefing'). Reemplazamos el/los briefing viejos de este doc.
  await supabase.from("client_brain_docs").delete().eq("client_id", clientId).eq("node_id", docId);
  await supabase.from("client_brain_docs").insert({
    id: crypto.randomUUID(),
    client_id: clientId, node_id: docId, doc_kind: "briefing", title,
    text: content, char_count: content.length, web_url: url || null, synced_at: nowIso,
  });

  // Fijar solo en el casillero "briefing" (personalidad) de arriba.
  await supabase.from("client_brain_pins").upsert(
    { client_id: clientId, node_id: docId, slot: "briefing", label: title },
    { onConflict: "client_id,node_id" },
  );

  return j({ ok: true, doc_id: docId, url, chars: content.length });
});
