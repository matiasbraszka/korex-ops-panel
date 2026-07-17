// supabase/functions/create-strategy/index.ts
// Crea la carpeta de Drive de una ESTRATEGIA nueva para un cliente EXISTENTE y la trae al panel.
// La usa el botón "Agregar estrategia" de la ficha del cliente.
//
// Flujo:
//   1. Calcula el próximo número (según las estrategias que ya tiene) y arma el título
//      "Estrategia #N | Tipo | dd/mm/aaaa".
//   2. Le pide al Apps Script (acción create_strategy) que cree la carpeta DENTRO de la carpeta
//      raíz del cliente, con el esqueleto estándar + un DEL en blanco (plantilla).
//   3. Dispara drive-sync para registrar las carpetas y crear la fila en `strategies`.
//
// Auth: cron_secret interno O usuario logueado del panel. Config del Apps Script en venta_form_config.

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

// dd/mm/aaaa en horario Argentina (UTC-3), sin librerías.
function fechaAR(): string {
  const d = new Date(Date.now() - 3 * 3600 * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
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
  const tipo = str(body.tipo) || "A DEFINIR";
  const withDel = body.with_del !== false;
  if (!clientId) return j({ ok: false, error: "missing_client_id" }, 400);

  // Config del Apps Script (mismo que drive-sync).
  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  if (!appscriptUrl || !appscriptSecret) return j({ ok: false, error: "missing_appscript_config" }, 500);

  // Cliente + carpeta raíz (el id del nodo raíz ES el id de la carpeta de Drive).
  const { data: client } = await supabase.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!client) return j({ ok: false, error: "client_not_found" }, 404);
  const { data: rootNode } = await supabase.from("client_drive_nodes")
    .select("id").eq("client_id", clientId).eq("is_root", true).limit(1).maybeSingle();
  const clientFolderId = str(rootNode?.id);
  if (!clientFolderId) return j({ ok: false, error: "no_root_folder", detail: "El cliente no tiene carpeta raíz sincronizada. Tocá “Sincronizar” primero." }, 400);

  // Próximo número de estrategia + título.
  const { count } = await supabase.from("strategies").select("id", { count: "exact", head: true }).eq("client_id", clientId);
  const n = (count ?? 0) + 1;
  const strategyName = `Estrategia #${n} | ${tipo} | ${fechaAR()}`;

  // Crear la carpeta en Drive vía Apps Script.
  let asRes: Record<string, unknown> = {};
  try {
    const r = await fetch(appscriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "create_strategy", secret: appscriptSecret, clientFolderId, strategyName, label: client.name, with_del: withDel }),
      signal: AbortSignal.timeout(120000),
    });
    asRes = await r.json();
  } catch (e) {
    return j({ ok: false, error: "appscript_unreachable", detail: String((e as Error)?.message || e) }, 502);
  }
  if (!asRes?.ok) {
    return j({ ok: false, error: "appscript_failed", detail: str(asRes?.error) || "El Apps Script no pudo crear la carpeta. ¿Está deployado con la acción create_strategy?" }, 502);
  }

  // Traer las carpetas al panel + crear la fila en `strategies` (drive-sync auto-crea desde "Estrategia #N").
  let synced = false;
  try {
    const sr = await fetch(`${SUPABASE_URL}/functions/v1/drive-sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-cron-secret": cronSecret },
      body: JSON.stringify({ client_id: clientId }),
      signal: AbortSignal.timeout(90000),
    });
    synced = sr.ok;
  } catch { /* si el sync falla/tarda, el cron diario lo trae igual */ }

  return j({ ok: true, strategyName, n, folderUrl: str(asRes.folderUrl), delDocUrl: str(asRes.delDocUrl), synced });
});
