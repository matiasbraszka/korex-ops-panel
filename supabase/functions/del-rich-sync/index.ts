// supabase/functions/del-rich-sync/index.ts
//
// Trae el DEL CON SU FORMATO (títulos, negritas, colores, tablas, links) y lo
// guarda en del_sections.html.
//
// ── Por qué existe ───────────────────────────────────────────────────────────
// client-brain-sync llama a `read_doc`, que usa getBody().getText() del lado de
// Google: eso devuelve TEXTO PELADO y el formato muere ahí, antes de llegar a la
// base. Esta función llama a `read_doc_rich`, la acción NUEVA del Apps Script, que
// recorre las mismas pestañas pero serializa la estructura.
//
// NO reemplaza a client-brain-sync ni a read_doc. Corre aparte, sobre lo que ya
// está importado, y solo COMPLETA la columna html. Si esto falla o nunca corre, el
// lector muestra el texto plano de siempre: no rompe nada.
//
// ── Requiere que Matías deploye el Apps Script ───────────────────────────────
// El script vive en su cuenta de Google, no en el repo. Hasta que se re-deploye
// con la acción read_doc_rich, esta función devuelve accion_no_deployada y no
// escribe nada. Es la respuesta esperada, no un error.
//
// Config (sin secretos en el código): app_settings
//   venta_form_config → appscript_url, appscript_secret
//   soporte_config    → cron_secret
//
// Uso:
//   POST /del-rich-sync                      → todos los DEL
//   POST /del-rich-sync  { doc_id: "cbd_x" } → uno solo (para probar)

import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const str = (v: unknown) => (typeof v === "string" ? v : "");

// Mismo reintento que client-brain-sync: el Apps Script se cae seguido y un
// timeout suelto no puede tirar la corrida entera.
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
        if (res.status < 500 && res.status !== 429) break;
      }
    } catch (e) {
      lastErr = String((e as Error)?.message || e);
    }
    if (attempt < tries) await new Promise((r) => setTimeout(r, attempt * 1500));
  }
  return { ok: false, error: lastErr };
}

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

// El título de la pestaña es la llave: read_doc lo pone entre "=====" (y de ahí
// salió del_sections.title) y read_doc_rich lo devuelve en tabs[].title. Los dos
// leen tab.getTitle(), así que son el mismo string. Se normaliza igual que el
// importador (espacios colapsados) para que un espacio de más no rompa el match.
const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const { data: vf } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const { data: sp } = await supabase.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const vcfg = (vf?.value as Record<string, unknown>) ?? {};
  const scfg = (sp?.value as Record<string, unknown>) ?? {};

  if (!(await authorize(req, str(scfg.cron_secret)))) return json({ ok: false, error: "unauthorized" }, 401);

  const appscriptUrl = str(vcfg.appscript_url);
  const appscriptSecret = str(vcfg.appscript_secret);
  if (!appscriptUrl) return json({ ok: false, error: "missing_appscript_url" }, 500);

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* sin body = todos */ }
  const soloDoc = str(body.doc_id);
  // Cada Doc de Google tarda ~4s (abrir + serializar + reintentos). En 150s de
  // límite entran ~6 antes del timeout. Por eso se procesa de a TANDAS:
  //   · pending_only: solo los que todavía no tienen html (para reanudar sin repetir)
  //   · limit: cuántos hacer en esta corrida (default 6, que entra cómodo en 150s)
  const pendingOnly = body.pending_only === true;
  const limit = Math.max(1, Math.min(Number(body.limit) || 6, 36));

  // Los DEL a sincronizar. Solo Google Docs: un .txt o un PDF no tienen formato.
  let q = supabase
    .from("client_brain_docs")
    .select("id,node_id,title,client_id")
    .eq("doc_kind", "del")
    .order("id", { ascending: true });
  if (soloDoc) q = q.eq("id", soloDoc);
  let { data: docs, error: qErr } = await q;

  // pending_only: descarta los DEL que ya tienen alguna sección con html. Se filtra
  // acá (y no en el query) porque el html vive en del_sections, no en el doc.
  if (docs && pendingOnly && !soloDoc) {
    const { data: hechos } = await supabase
      .from("del_sections").select("doc_id").not("html", "is", null);
    const ya = new Set((hechos ?? []).map((r) => r.doc_id));
    docs = docs.filter((d) => !ya.has(d.id));
  }
  // Recorta a la tanda de esta corrida.
  if (docs && !soloDoc) docs = docs.slice(0, limit);
  // OJO: supabase-js NO lanza excepción, devuelve el error como valor.
  if (qErr) return json({ ok: false, error: qErr.message }, 500);
  if (!docs?.length) return json({ ok: true, docs: 0, secciones: 0, nota: "no hay DEL para sincronizar" });

  let okDocs = 0, okSecs = 0, sinMatch = 0;
  const fallos: Array<{ doc: string; error: string }> = [];

  for (const d of docs) {
    const j = await callAppScript(appscriptUrl, {
      secret: appscriptSecret,
      action: "read_doc_rich",
      docId: d.node_id,
      mimeType: "application/vnd.google-apps.document",
    });

    if (!j?.ok) {
      const err = str(j?.error) || "sin detalle";
      // El Apps Script viejo no conoce la acción y devuelve unknown_action (o
      // simplemente no la reconoce). Es la respuesta ESPERADA hasta que se deploye:
      // se corta la corrida entera, no tiene sentido pegarle 36 veces.
      if (/unknown_action|invalid_action|no_action/i.test(err)) {
        return json({
          ok: false,
          error: "accion_no_deployada",
          detalle: "El Apps Script todavía no tiene la acción read_doc_rich. Hay que re-deployarlo desde la cuenta de Google (Implementar → Gestionar implementaciones → editar → Nueva versión).",
        }, 409);
      }
      fallos.push({ doc: d.title, error: err });
      continue;
    }

    const tabs: Array<{ title: string; html: string }> = Array.isArray(j.tabs) ? j.tabs : [];
    if (!tabs.length) { fallos.push({ doc: d.title, error: "el Doc no devolvió pestañas" }); continue; }

    // Las secciones que ya importó del_sections_import() desde el texto plano.
    const { data: secs } = await supabase
      .from("del_sections")
      .select("id,title")
      .eq("doc_id", d.id);
    if (!secs?.length) continue;

    const porTitulo = new Map<string, string>();
    for (const s of secs) porTitulo.set(norm(s.title), s.id);

    const ahora = new Date().toISOString();
    for (const t of tabs) {
      const id = porTitulo.get(norm(str(t.title)));
      // Sin match: la pestaña existe en el Doc pero no en del_sections. Pasa si el
      // Doc cambió después del último client-brain-sync. No se inventa la fila: el
      // importador de texto es el que manda el alta.
      if (!id) { sinMatch++; continue; }
      const { error: upErr } = await supabase
        .from("del_sections")
        .update({ html: str(t.html), html_at: ahora })
        .eq("id", id);
      if (upErr) fallos.push({ doc: d.title + " / " + t.title, error: upErr.message });
      else okSecs++;
    }
    okDocs++;
  }

  // Cuántos DEL quedan sin html después de esta tanda (para saber si hace falta otra).
  const { data: faltan } = await supabase
    .from("client_brain_docs").select("id").eq("doc_kind", "del");
  const { data: listos } = await supabase
    .from("del_sections").select("doc_id").not("html", "is", null);
  const yaListos = new Set((listos ?? []).map((r) => r.doc_id));
  const pendientes = (faltan ?? []).filter((d) => !yaListos.has(d.id)).length;

  return json({
    ok: true,
    docs: okDocs,
    secciones_con_formato: okSecs,
    pestanas_sin_match: sinMatch,
    dels_pendientes: pendientes,
    fallos: fallos.slice(0, 10),
    nota: pendientes > 0
      ? `Faltan ${pendientes} DEL. Volvé a llamar con {"pending_only":true} hasta que dels_pendientes sea 0.`
      : "Listo: todos los DEL tienen formato.",
  });
});
