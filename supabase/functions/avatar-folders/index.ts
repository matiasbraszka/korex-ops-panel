// supabase/functions/avatar-folders/index.ts
// Orden máximo de las carpetas audiovisuales: bajo la carpeta "Anuncios" del cliente,
// asegura "Grabaciones" y "Ediciones" y crea una SUBCARPETA POR AVATAR dentro de cada una.
// Devuelve, por avatar, el link de cada carpeta y cuántos archivos tiene (para saber si el
// cliente ya grabó / editó). NO escribe la base: el panel toma la respuesta y persiste los
// links en strategy_pages.avatars con su flujo normal.
//
// La creación de carpetas la hace el Apps Script (acción ensure_avatar_folders). Esta función
// encuentra la carpeta "Anuncios" de la estrategia del funnel y se la pasa.
//
// Config: venta_form_config → appscript_url, appscript_secret · soporte_config → cron_secret

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
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// Puente resiliente a Apps Script: reintenta ante blips (timeout/5xx/cold start/no-JSON).
// Lanza "appscript_unreachable: <motivo>" si sigue caído tras los intentos.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callAppScript(url: string, payload: Record<string, unknown>, tries = 3, timeoutMs = 120000): Promise<any> {
  let lastErr = "desconocido";
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (res.ok) {
        const txt = await res.text();
        try { return JSON.parse(txt); }
        catch { lastErr = "respuesta no-JSON (deploy/permisos del Apps Script)"; }
      } else {
        lastErr = "http " + res.status;
        if (res.status < 500 && res.status !== 429) break; // 4xx duro: no reintenta
      }
    } catch (e) { lastErr = String((e as Error)?.message || e); } // red/timeout: transitorio
    if (attempt < tries) await new Promise((r) => setTimeout(r, 800 * attempt)); // backoff 0.8s, 1.6s
  }
  throw new Error("appscript_unreachable: " + lastErr);
}

async function authorize(req: Request, cronSecret: string): Promise<boolean> {
  const url = new URL(req.url);
  const got = req.headers.get("x-cron-secret") || url.searchParams.get("secret") || "";
  if (cronSecret && got === cronSecret) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (token && ANON_KEY && token !== ANON_KEY) {
    try {
      const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
      const { data } = await uc.auth.getUser();
      if (data?.user) return true;
    } catch { /* ignore */ }
  }
  return false;
}

// Elige la carpeta "Anuncios" principal de la estrategia (prefiere la que dice "audiovisual",
// si no la de menor profundidad). Evita las carpetas ad-hoc por avatar ("Anuncios Mujeres…").
function pickAnunciosFolder(nodes: Array<{ id: string; name: string; depth: number }>): string | null {
  if (!nodes.length) return null;
  const av = nodes.filter((n) => /audiovisual/i.test(n.name));
  const pool = av.length ? av : nodes;
  pool.sort((a, b) => (a.depth ?? 99) - (b.depth ?? 99));
  return pool[0].id;
}

// Normaliza un nombre para matchear carpeta ↔ avatar (sin acentos, minúsculas, alfanumérico).
function normName(s: string) {
  return str(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
}
// ¿La carpeta corresponde a este avatar? (nombre exacto normalizado, o una contiene a la otra).
function folderMatchesAvatar(folderName: string, avatarName: string) {
  const f = normName(folderName), a = normName(avatarName);
  if (!f || !a) return false;
  if (f === a) return true;
  // "Grabacion Pelayo Padre" contra avatar "Pelayo Padre", o viceversa.
  return f.includes(a) || a.includes(f);
}

// MODO LECTURA (sin crear nada): resuelve las carpetas por avatar desde el árbol de Drive YA
// sincronizado (client_drive_nodes) y cuenta sus archivos. Cero riesgo de crear carpetas.
async function readFoldersFromTree(anunciosFolderId: string, names: string[]) {
  // Hijos directos de "Anuncios": buscamos las carpetas Grabaciones y Ediciones.
  const { data: lvl1 } = await supabase
    .from("client_drive_nodes").select("id, name, web_url, node_type")
    .eq("parent_id", anunciosFolderId).eq("node_type", "folder");
  const pick = (re: RegExp) => (lvl1 ?? []).find((n) => re.test(str(n.name)));
  const grab = pick(/grabaci/i);
  // El bucket de "editado" varía por cliente (legacy): Ediciones / Terminados / Editados / Finales.
  const edic = pick(/edici|editad|termina|final|listo/i);
  const bucketIds = [grab?.id, edic?.id].filter(Boolean) as string[];

  const byName: Record<string, unknown> = {};
  if (!bucketIds.length) {
    for (const nm of names) byName[nm] = { rec_folder_url: null, edit_folder_url: null, rec_files: 0, edit_files: 0 };
    return { grabacionesUrl: grab?.web_url ?? null, edicionesUrl: edic?.web_url ?? null, byName, found: false };
  }

  // Subcarpetas por avatar dentro de Grabaciones/Ediciones.
  const { data: subs } = await supabase
    .from("client_drive_nodes").select("id, name, web_url, parent_id")
    .in("parent_id", bucketIds).eq("node_type", "folder");
  const subList = (subs ?? []) as Array<{ id: string; name: string; web_url: string | null; parent_id: string }>;

  // Conteo de archivos (no-carpetas) por subcarpeta de avatar.
  const subIds = subList.map((s) => s.id);
  const counts: Record<string, number> = {};
  if (subIds.length) {
    const { data: files } = await supabase
      .from("client_drive_nodes").select("id, parent_id")
      .in("parent_id", subIds).neq("node_type", "folder");
    for (const f of (files ?? [])) counts[str((f as Record<string, unknown>).parent_id)] = (counts[str((f as Record<string, unknown>).parent_id)] || 0) + 1;
  }

  for (const nm of names) {
    const recSub = subList.find((s) => s.parent_id === grab?.id && folderMatchesAvatar(s.name, nm));
    const edSub = subList.find((s) => s.parent_id === edic?.id && folderMatchesAvatar(s.name, nm));
    byName[nm] = {
      rec_folder_url: recSub?.web_url ?? null,
      edit_folder_url: edSub?.web_url ?? null,
      rec_files: recSub ? (counts[recSub.id] || 0) : 0,
      edit_files: edSub ? (counts[edSub.id] || 0) : 0,
    };
  }
  const found = subList.length > 0;
  return { grabacionesUrl: grab?.web_url ?? null, edicionesUrl: edic?.web_url ?? null, byName, found };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const scfg = (sp?.value as Record<string, unknown>) ?? {};

  if (!(await authorize(req, str(scfg.cron_secret)))) return j({ ok: false, error: "unauthorized" }, 401);

  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);

  let funnelId = "", mode = "create";
  try { const b = await req.json() as Record<string, unknown>; funnelId = str(b?.funnel_id); mode = str(b?.mode) || "create"; } catch { /* sin body */ }
  if (!funnelId) return j({ ok: false, error: "missing_funnel_id" }, 400);

  const { data: page, error: pErr } = await supabase
    .from("strategy_pages").select("id, strategy_id, avatars").eq("id", funnelId).maybeSingle();
  if (pErr || !page) return j({ ok: false, error: "funnel_not_found" }, 404);

  const avatars = Array.isArray(page.avatars) ? page.avatars : [];
  const names = avatars.map((a: Record<string, unknown>) => str(a?.name)).filter(Boolean);
  if (!names.length) return j({ ok: false, error: "no_avatars" }, 400);

  const { data: folders } = await supabase
    .from("client_drive_nodes").select("id, name, depth")
    .eq("strategy_id", page.strategy_id).eq("node_type", "folder").ilike("name", "%anuncios%");
  const anunciosFolderId = pickAnunciosFolder((folders ?? []) as Array<{ id: string; name: string; depth: number }>);
  if (!anunciosFolderId) return j({ ok: false, error: "no_anuncios_folder", hint: "Falta la carpeta Anuncios en el Drive de esta estrategia (sincronizá Carpetas)." }, 404);

  // MODO LECTURA: solo vincula/lee las carpetas existentes del árbol ya sincronizado. NO crea nada.
  if (mode === "read") {
    const r = await readFoldersFromTree(anunciosFolderId, names);
    return j({ ok: true, mode: "read", ...r });
  }

  if (!appscriptUrl) return j({ ok: false, error: "missing_appscript_url" }, 500);

  // Apps Script crea/asegura las subcarpetas por avatar y devuelve links + conteo de archivos.
  // callAppScript reintenta ante blips (timeout/5xx/cold start); lanza si sigue caído.
  let out;
  try {
    out = await callAppScript(appscriptUrl, { secret: appscriptSecret, action: "ensure_avatar_folders", anunciosFolderId, avatars: names });
  } catch (e) { return j({ ok: false, error: "appscript_unreachable", detail: String((e as Error)?.message || e) }, 502); }
  if (!out?.ok) return j({ ok: false, error: "appscript_error", detail: out?.error }, 502);

  // Mapa por nombre de avatar → carpetas (para que el panel lo mergee a strategy_pages.avatars).
  const data = out as Record<string, any>;
  const byName: Record<string, unknown> = {};
  for (const a of (data.avatars ?? [])) {
    byName[str(a.name)] = {
      rec_folder_url: str(a.grabaciones?.url) || null,
      edit_folder_url: str(a.ediciones?.url) || null,
      rec_files: Number(a.grabaciones?.files || 0),
      edit_files: Number(a.ediciones?.files || 0),
    };
  }
  return j({ ok: true, grabacionesUrl: data.grabacionesUrl, edicionesUrl: data.edicionesUrl, byName });
});
