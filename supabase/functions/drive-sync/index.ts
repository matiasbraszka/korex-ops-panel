// supabase/functions/drive-sync/index.ts
// Espejo automático del árbol de Google Drive por cliente. La llama pg_cron 1 vez
// al día (06:00 BUE) y también el botón "Sincronizar ahora" del panel (?client_id=).
//
// Por cada cliente con drive_folder_url:
//   1. Pide a un Apps Script (acción list_folder_tree) todo el árbol de carpetas/archivos.
//   2. Lo guarda en client_drive_nodes (upsert idempotente) y borra lo que ya no existe.
//   3. Vincula cada carpeta a su estrategia del panel (por el id de carpeta guardado en
//      strategies.folders / archivos / drive_url) y propaga strategy_id a todo el subárbol.
//   4. Detecta duplicados / nombres muy parecidos DENTRO de la misma carpeta (carpetas,
//      documentos y videos) y avisa por Slack al canal de alertas del equipo (1 vez por grupo).
//
// El panel SOLO lee client_drive_nodes; toda la escritura pasa por acá (service_role).
//
// Config (sin secretos en el código):
//   venta_form_config → appscript_url, appscript_secret, slack_bot_token
//   soporte_config    → cron_secret  (mismo secreto que las otras rutinas en la nube)

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

function rnd(n = 6) { return Math.random().toString(36).slice(2, 2 + n); }
function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
// "1/04/2026" -> "2026-04-01" (d/m/y). null si no parsea.
function parseDmy(s: string): string | null {
  const m = (s || "").match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = m[3]; if (y.length === 2) y = "20" + y;
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

// ── Drive helpers ──────────────────────────────────────────────────────────────
function driveId(url?: string | null): string | null {
  if (!url) return null;
  const s = String(url);
  let m = s.match(/\/folders\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/\/d\/([A-Za-z0-9_-]+)/); if (m) return m[1];
  m = s.match(/[?&]id=([A-Za-z0-9_-]+)/); if (m) return m[1];
  return null;
}

function mimeToType(m?: string | null): string {
  const s = m || "";
  if (s === "application/vnd.google-apps.folder") return "folder";
  if (s === "application/vnd.google-apps.document") return "document";
  if (s === "application/vnd.google-apps.spreadsheet") return "sheet";
  if (s === "application/vnd.google-apps.presentation") return "slides";
  if (s === "application/pdf") return "pdf";
  if (s.startsWith("image/")) return "image";
  if (s.startsWith("video/")) return "video";
  return "other";
}

// ── Duplicados: normalización + comparación tolerante ───────────────────────────
function stripCopy(s: string): string {
  return s.replace(/^(copia de|copy of|copia|copy)\s+/i, "").trim();
}
function normName(s: string): string {
  return stripCopy(
    (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/\p{M}/gu, "") // sin tildes (marcas combinantes)
      .replace(/\.[a-z0-9]{1,5}$/i, "")                 // sin extensión
      .replace(/[_\-|.,()\[\]]+/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}
function trailingNum(s: string): string | null {
  const m = s.match(/\s+v?(\d+)$/i);
  return m ? m[1] : null;
}
function baseName(s: string): string {
  return s.replace(/\s+v?\d+$/i, "").trim();
}
function lev(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const dp = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0]; dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = Math.min(dp[j] + 1, dp[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[n];
}
function ratio(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max === 0 ? 1 : 1 - lev(a, b) / max;
}
// ¿Son el mismo nombre o uno muy parecido (confuso)? Una secuencia numerada a
// propósito (Anuncio 1 / Anuncio 2) NO cuenta como duplicado.
// Conservador y preciso: avisa solo cuando los nombres son realmente el MISMO
// (idénticos, o "Copia de X" vs "X", o tildes/mayúsculas), o el caso "X" vs "X 2"
// (mismo nombre con uno numerado y el otro no). NO marca series (a/b/c, 1/2/3) ni
// nombres largos solo parecidos — eso generaba falsos positivos.
function isDup(an: string, bn: string): boolean {
  const a = normName(an), b = normName(bn);
  if (!a || !b) return false;
  if (a === b) return true;                                        // idénticos (incluye copia/tildes/mayúsculas)
  const ska = a.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  const skb = b.replace(/\d+/g, " ").replace(/\s+/g, " ").trim();
  if (ska === skb) {                                               // mismo texto, difieren solo en números
    const da = a.match(/\d+/g) || [];
    const db = b.match(/\d+/g) || [];
    return da.length === 0 || db.length === 0;                     // "X" vs "X 2" -> avisar; ambos numerados -> no
  }
  return false;
}
function dupBucket(t: string): string | null {
  if (t === "folder") return "carpeta";
  if (t === "document" || t === "sheet" || t === "slides") return "documento";
  if (t === "video") return "video";
  return null;
}

// ── Slack ────────────────────────────────────────────────────────────────────────
async function postSlack(token: string, channelId: string, text: string): Promise<boolean> {
  if (!token || !channelId) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: channelId, text, unfurl_links: false }),
      signal: AbortSignal.timeout(15000),
    });
    const j = await res.json().catch(() => ({}));
    return !!j.ok;
  } catch (e) { console.error("drive-sync slack error", e); return false; }
}

// ── Apps Script: árbol de una carpeta ─────────────────────────────────────────────
interface RawNode { id: string; name: string; parentId: string | null; mimeType: string; url: string; modified: string | null; depth: number; isRoot: boolean; }
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

async function fetchTree(url: string, secret: string, folderId: string): Promise<{ nodes: RawNode[]; truncated: boolean }> {
  const j = await callAppScript(url, { secret, action: "list_folder_tree", folderId }); // reintenta; lanza si está caído
  if (!j.ok) throw new Error("appscript: " + (j.error || "unknown"));
  return { nodes: (j.nodes || []) as RawNode[], truncated: !!j.truncated };
}

// ── Sincroniza un cliente ────────────────────────────────────────────────────────
async function syncClient(
  client: { id: string; name: string; drive_folder_url: string; slack_channel_id: string },
  cfg: { appscriptUrl: string; appscriptSecret: string; botToken: string; adminIds: string[]; alertsChannel: string },
): Promise<{ ok: boolean; nodes?: number; dupes?: number; error?: string }> {
  const clientId = client.id;
  const folderId = driveId(client.drive_folder_url);
  if (!folderId) return { ok: false, error: "no_folder_id" };

  let tree;
  try { tree = await fetchTree(cfg.appscriptUrl, cfg.appscriptSecret, folderId); }
  catch (e) { console.error("drive-sync tree error", clientId, e); return { ok: false, error: String(e) }; }

  const raw = tree.nodes;
  if (!raw.length) return { ok: true, nodes: 0, dupes: 0 };

  // Tipado + índices.
  const typed = raw.map((n) => ({ ...n, node_type: mimeToType(n.mimeType) }));
  const nodeById = new Map(typed.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  for (const n of typed) {
    if (!n.parentId) continue;
    if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
    childrenMap.get(n.parentId)!.push(n.id);
  }

  // Vínculo con estrategias del panel: carpeta de estrategia -> strategy_id, propagado al subárbol.
  const { data: strats } = await supabase
    .from("strategies").select("id, position, name, drive_folder_id, start_date, folders, archivos, drive_url")
    .eq("client_id", clientId).order("position", { ascending: true });
  // Raíz del árbol (carpeta del cliente entero). Un link de estrategia que apunte
  // acá NO debe propagar: se tragaría TODO el árbol y dejaría las demás estrategias
  // "sin sincronizar". La dueña de cada subárbol la define la carpeta "Estrategia #N".
  const rootId = (typed.find((n) => n.isRoot) || typed.find((n) => !n.parentId))?.id ?? null;
  const strategyOf = new Map<string, string>();
  for (const s of (strats ?? [])) {
    const ids: string[] = [];
    for (const f of (Array.isArray(s.folders) ? s.folders : [])) { const id = driveId(f?.url); if (id) ids.push(id); }
    for (const a of (Array.isArray(s.archivos) ? s.archivos : [])) { if (str(a?.category) === "folder") { const id = driveId(a?.url); if (id) ids.push(id); } }
    { const id = driveId(s.drive_url); if (id) ids.push(id); }
    for (const fid of ids) {
      const fnode = nodeById.get(fid);
      if (!fnode) continue;                       // link viejo/roto: el panel lo marca aparte
      if (fnode.isRoot || fid === rootId) continue; // mislink a la carpeta raíz del cliente
      const stack = [fid];
      while (stack.length) {
        const cur = stack.pop()!;
        if (strategyOf.has(cur)) continue; // primera estrategia (menor position) gana
        strategyOf.set(cur, s.id);
        for (const ch of (childrenMap.get(cur) ?? [])) stack.push(ch);
      }
    }
  }

  // ── La estrategia la DEFINE la carpeta "Estrategia #N" del Drive ──
  // Por cada carpeta de estrategia (hija de la raíz) auto-creamos/actualizamos su
  // registro en `strategies` (nombre, número y fecha salen de la carpeta) y
  // propagamos su strategy_id al subárbol. Mati ya no crea estrategias a mano.
  const root = typed.find((n) => n.isRoot) || typed.find((n) => !n.parentId);
  const estrFolders = typed
    .filter((n) => n.node_type === "folder" && (root ? n.parentId === root.id : (n.depth ?? 0) === 1))
    .map((n) => {
      const nm = n.name || "";
      const m = nm.match(/estrategia\s*#?\s*(\d+)/i);
      const num = m ? parseInt(m[1], 10) : 0;
      const parts = nm.split("|").map((p) => p.trim());
      const last = parts[parts.length - 1] || "";
      const hasDate = /\d{1,2}\/\d{1,2}\/\d{2,4}/.test(last);
      const stratName = parts.length >= 2 ? (hasDate ? parts.slice(1, -1) : parts.slice(1)).join(" | ").trim() : "";
      return { node: n, num, name: stratName, created: hasDate ? last : "" };
    })
    .filter((x) => x.num > 0)
    .sort((a, b) => a.num - b.num);

  // deno-lint-ignore no-explicit-any
  const byFolder = new Map<string, any>();
  // deno-lint-ignore no-explicit-any
  const byPos = new Map<number, any>();
  for (const s of (strats ?? [])) {
    if (s.drive_folder_id) byFolder.set(s.drive_folder_id, s);
    byPos.set(s.position ?? 0, s);
  }
  for (const ef of estrFolders) {
    const pos = ef.num - 1;
    // deno-lint-ignore no-explicit-any
    let s: any = byFolder.get(ef.node.id) || byPos.get(pos);
    const startDate = parseDmy(ef.created);
    if (s) {
      const patch: Record<string, unknown> = {};
      if (ef.name && str(s.name) !== ef.name) patch.name = ef.name;
      if (s.drive_folder_id !== ef.node.id) patch.drive_folder_id = ef.node.id;
      if ((s.position ?? 0) !== pos) patch.position = pos;
      if (startDate && !s.start_date) patch.start_date = startDate;
      if (Object.keys(patch).length) await supabase.from("strategies").update(patch).eq("id", s.id);
    } else {
      const row = {
        id: `strat_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
        client_id: clientId, position: pos, name: ef.name || `Estrategia #${ef.num}`,
        status: "activa", version: "v1", drive_folder_id: ef.node.id, start_date: startDate,
      };
      const { error } = await supabase.from("strategies").insert(row);
      if (!error) { s = row; byPos.set(pos, row); byFolder.set(ef.node.id, row); }
      else console.error("drive-sync strategy insert error", clientId, error);
    }
    if (s) {
      const stack = [ef.node.id];
      while (stack.length) {
        const cur = stack.pop()!;
        if (strategyOf.has(cur)) continue;
        strategyOf.set(cur, s.id);
        for (const ch of (childrenMap.get(cur) ?? [])) stack.push(ch);
      }
    }
  }

  // Upsert de nodos + borrado de lo que ya no existe.
  const runStart = new Date().toISOString();
  const rows = typed.map((n) => ({
    id: n.id, client_id: clientId, parent_id: n.parentId || null,
    name: n.name || "", node_type: n.node_type, mime_type: n.mimeType || null,
    web_url: n.url || null, modified_time: n.modified || null, depth: n.depth ?? 0,
    is_root: !!n.isRoot, strategy_id: strategyOf.get(n.id) || null, last_seen_at: runStart,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from("client_drive_nodes").upsert(rows.slice(i, i + 500), { onConflict: "id" });
    if (error) { console.error("drive-sync upsert error", clientId, error); return { ok: false, error: String(error.message) }; }
  }
  await supabase.from("client_drive_nodes").delete().eq("client_id", clientId).lt("last_seen_at", runStart);

  // ── Duplicados dentro de la misma carpeta ──
  const groups = new Map<string, typeof typed>();
  for (const n of typed) {
    const b = dupBucket(n.node_type);
    if (!b || !n.parentId) continue;
    const k = n.parentId + "|" + b;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(n);
  }
  const dupeGroups: { parentId: string; bucket: string; members: typeof typed }[] = [];
  for (const [k, list] of groups) {
    if (list.length < 2) continue;
    const [parentId, bucket] = k.split("|");
    const uf = list.map((_, i) => i);
    const find = (i: number): number => { while (uf[i] !== i) { uf[i] = uf[uf[i]]; i = uf[i]; } return i; };
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++)
        if (isDup(list[i].name, list[j].name)) uf[find(i)] = find(j);
    const comp = new Map<number, typeof typed>();
    for (let i = 0; i < list.length; i++) { const r = find(i); if (!comp.has(r)) comp.set(r, []); comp.get(r)!.push(list[i]); }
    for (const members of comp.values()) if (members.length >= 2) dupeGroups.push({ parentId, bucket, members });
  }

  // Avisar solo los grupos NUEVOS; limpiar los que ya se resolvieron.
  const { data: existingAlerts } = await supabase
    .from("client_drive_dupe_alerts").select("id, dupe_key").eq("client_id", clientId);
  const existingKeys = new Set((existingAlerts ?? []).map((a) => a.dupe_key));
  const currentKeys = new Set<string>();
  let newDupes = 0;

  for (const g of dupeGroups) {
    const ids = g.members.map((m) => m.id).sort();
    const key = ids.join("|");
    currentKeys.add(key);
    if (existingKeys.has(key)) continue;

    const parentName = nodeById.get(g.parentId)?.name || "una carpeta";
    const tipo = g.bucket === "carpeta" ? "carpetas" : g.bucket === "documento" ? "documentos" : "videos";
    const lines = g.members.map((m) => `• ${m.name} → ${m.url}`).join("\n");
    const text = `:warning: *Posible duplicado* en la carpeta de *${client.name}*\n` +
      `En «${parentName}» hay ${g.members.length} ${tipo} con nombre muy parecido:\n${lines}\n` +
      `Dejá uno o renombrá el otro para mantener el orden.`;

    // Las alertas de duplicados van al canal de alertas del equipo (no al canal
    // de cada cliente); el mensaje ya nombra al cliente para ubicarlo.
    const posted = await postSlack(cfg.botToken, cfg.alertsChannel, text);
    if (!posted && cfg.adminIds.length) {
      // Fallback: el bot no está en el canal -> aviso al equipo en la campana del panel.
      await supabase.from("notifications").insert(cfg.adminIds.map((rid) => ({
        id: `ntf_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
        recipient_id: rid, type: "drive_duplicate",
        title: "Posible duplicado en Drive",
        body: `${client.name}: ${g.members.length} ${tipo} con nombre parecido en «${parentName}».`,
      })));
    }
    await supabase.from("client_drive_dupe_alerts").insert({
      id: `cda_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
      client_id: clientId, dupe_key: key, node_ids: ids, names: g.members.map((m) => m.name),
    });
    newDupes++;
  }

  const toDelete = (existingAlerts ?? []).filter((a) => !currentKeys.has(a.dupe_key)).map((a) => a.id);
  if (toDelete.length) await supabase.from("client_drive_dupe_alerts").delete().in("id", toDelete);

  return { ok: true, nodes: rows.length, dupes: newDupes };
}

// ── Auth: cron secret O usuario logueado del panel (botón "Sincronizar ahora") ────
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

  // Config.
  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const scfg = (sp?.value as Record<string, unknown>) ?? {};

  if (!(await authorize(req, str(scfg.cron_secret)))) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
  }

  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  const botToken = str(vcfg.slack_bot_token);
  // Canal de alertas del equipo (configurable; por defecto #alertas-general).
  const alertsChannel = str(vcfg.drive_alerts_channel) || "#alertas-general";
  if (!appscriptUrl) {
    return new Response(JSON.stringify({ ok: false, error: "missing_appscript_url" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }

  // ids de admins para el fallback de notificaciones del panel.
  let adminIds: string[] = [];
  try { const { data } = await supabase.rpc("korex_admin_member_ids"); if (Array.isArray(data)) adminIds = data as string[]; } catch { /* ignore */ }

  // Un solo cliente (botón) o todos (cron).
  const url = new URL(req.url);
  let bodyClientId = "";
  try { const b = await req.json(); bodyClientId = str((b as Record<string, unknown>)?.client_id); } catch { /* sin body */ }
  const onlyClient = bodyClientId || url.searchParams.get("client_id") || "";

  let q = supabase.from("clients").select("id, name, drive_folder_url, slack_channel_id").not("drive_folder_url", "is", null);
  if (onlyClient) q = q.eq("id", onlyClient);
  const { data: clients, error } = await q;
  if (error) return new Response(JSON.stringify({ ok: false, error: String(error.message) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  const sharedCfg = { appscriptUrl, appscriptSecret, botToken, adminIds, alertsChannel };
  const results: Record<string, unknown>[] = [];
  let okCount = 0, totalDupes = 0, unreachable = 0;
  for (const c of (clients ?? [])) {
    if (!str(c.drive_folder_url)) continue;
    const r = await syncClient(c as { id: string; name: string; drive_folder_url: string; slack_channel_id: string }, sharedCfg);
    if (r.ok) { okCount++; totalDupes += r.dupes || 0; }
    else if (String(r.error || "").includes("appscript_unreachable")) unreachable++;
    results.push({ client: c.id, ...r });
  }

  // Apps Script caído (tras reintentos) en ≥1 cliente → un aviso al canal de alertas.
  if (unreachable > 0) {
    await postSlack(botToken, alertsChannel,
      `⚠️ *Drive-sync:* no pude conectar con Apps Script (Google) en ${unreachable} cliente(s) tras reintentar. Suele ser el *deploy o los permisos* del Apps Script (revisar que esté publicado y con acceso). Afecta también al cerebro (lectura de documentos y carpetas).`);
  }

  return new Response(JSON.stringify({ ok: true, clients: results.length, synced: okCount, new_dupes: totalDupes, appscript_down: unreachable, results }), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
