// supabase/functions/apply-improvement/index.ts
// Aplica UNA propuesta de mejora (agent_improvements) ya aprobada por Matías. Determinístico:
//  - kind='example' → inserta un ejemplo aprobado en marketing_ad_library (aprendizaje por ejemplo, barato).
//  - kind='rule'    → aplica un find/replace EXACTO sobre marketing_subagents.instructions (con topes de largo).
//  - kind='note'    → informativo, no aplica nada.
// El texto del cambio YA viene redactado por el triage y aprobado por un humano → aplicar es mecánico y seguro.
// Auth: usuario logueado del panel O x-cron-secret (para el barrido del triage). Self-contained (deploy por MCP).

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
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const MAX_INSTRUCTIONS = 24000; // tope duro: si una regla haría superar esto, se rechaza (anti-bloat)

async function authedUser(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || !ANON_KEY || token === ANON_KEY) return false;
  try {
    const uc = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data } = await uc.auth.getUser();
    return !!data?.user;
  } catch { return false; }
}

async function applyOne(imp: Record<string, unknown>): Promise<{ ok: boolean; note: string }> {
  const kind = str(imp.kind);
  const payload = (imp.payload as Record<string, unknown>) || {};
  if (kind === "note") return { ok: true, note: "nota informativa (sin cambios)" };

  if (kind === "example") {
    const niche = str(payload.niche) || "sin nicho";
    const content = str(payload.content);
    if (!content) return { ok: false, note: "ejemplo sin contenido" };
    const id = `mal_fb_${str(imp.id)}`.slice(0, 60);
    const tags = Array.isArray(payload.niche_tags) ? (payload.niche_tags as string[]) : [niche];
    const { error } = await supabase.from("marketing_ad_library").insert({
      id, part: "example", status: "approved", niche, niche_tags: tags,
      avatar: str(payload.avatar) || null, title: str(payload.title) || `Ejemplo (feedback) · ${niche}`,
      content, char_count: content.length,
    });
    if (error && !/duplicate|unique/i.test(error.message)) return { ok: false, note: `error insert: ${error.message}` };
    return { ok: true, note: `ejemplo agregado a la biblioteca (${niche})` };
  }

  if (kind === "rule") {
    const subagentKey = str(imp.subagent_key) || "anuncios";
    const find = str(payload.find);
    const replace = str(payload.replace);
    if (!find || !replace) return { ok: false, note: "regla sin find/replace" };
    const { data: row } = await supabase.from("marketing_subagents").select("instructions").eq("key", subagentKey).maybeSingle();
    const instr = str(row?.instructions);
    if (!instr.includes(find)) return { ok: false, note: "el texto a reemplazar (find) ya no existe en las instrucciones — revisá la propuesta" };
    const next = instr.replace(find, replace);
    if (next.length > MAX_INSTRUCTIONS) return { ok: false, note: `la regla haría superar el tope de ${MAX_INSTRUCTIONS} caracteres (anti-bloat) — hay que consolidar` };
    const { error } = await supabase.from("marketing_subagents").update({ instructions: next, updated_at: new Date().toISOString() }).eq("key", subagentKey);
    if (error) return { ok: false, note: `error update: ${error.message}` };
    return { ok: true, note: `regla aplicada en ${subagentKey} (${instr.length}→${next.length} car.)` };
  }
  return { ok: false, note: `kind desconocido: ${kind}` };
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

  // Modo barrido (cron): aplica TODAS las aprobadas no aplicadas.
  if (body.sweep === true) {
    const { data: pend } = await supabase.from("agent_improvements").select("*").eq("status", "approved").is("applied_at", null).limit(50);
    let applied = 0; const results: unknown[] = [];
    for (const imp of (pend || [])) {
      const r = await applyOne(imp);
      await supabase.from("agent_improvements").update({ status: r.ok ? "applied" : "approved", applied_note: r.note, applied_at: r.ok ? new Date().toISOString() : null }).eq("id", imp.id);
      if (r.ok) applied++;
      results.push({ id: imp.id, ...r });
    }
    return j({ ok: true, mode: "sweep", applied, results });
  }

  // Modo individual: {id, approve?}. approve=true marca aprobada y aplica al toque.
  const id = str(body.id);
  if (!id) return j({ ok: false, error: "missing_id" }, 400);
  const { data: imp } = await supabase.from("agent_improvements").select("*").eq("id", id).maybeSingle();
  if (!imp) return j({ ok: false, error: "not_found" }, 404);
  if (str(imp.status) === "applied") return j({ ok: true, already: true, note: "ya estaba aplicada" });

  if (body.approve === true && str(imp.status) === "proposed") {
    await supabase.from("agent_improvements").update({ status: "approved" }).eq("id", id);
    imp.status = "approved";
  }
  if (str(imp.status) !== "approved") return j({ ok: false, error: "not_approved", detail: "La propuesta no está aprobada." }, 400);

  const r = await applyOne(imp);
  await supabase.from("agent_improvements").update({ status: r.ok ? "applied" : "approved", applied_note: r.note, applied_at: r.ok ? new Date().toISOString() : null }).eq("id", id);
  return j({ ok: r.ok, note: r.note });
});
