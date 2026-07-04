// supabase/functions/whatsapp-link/index.ts
// Vincula manualmente una conversacion 1-a-1 con una persona del Directorio de
// Finanzas (fin_directory). Deriva el cliente, puentea al CRM (contacts) y
// agenda en Google Contacts con el NOMBRE DE LA BASE. Centraliza lo que el
// panel no puede hacer directo (RLS: soporte no lee finanzas/clients/contacts).
//
// Auth: verify_jwt=true + permiso soporte:write (mismo patron que whatsapp-send).
// Body: { conversation_id, directory_id }
// Responde: { ok, contact_id, client_id, client_name, name }

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

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

async function authorizeSoporteWrite(req: Request): Promise<boolean> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return false;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return false;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  if (roleNames.includes("admin")) return true;
  if (roleNames.length === 0) return false;
  const { data: perms } = await admin
    .from("role_permissions").select("role")
    .in("role", roleNames).eq("module", "soporte").eq("can_write", true).limit(1);
  return (perms || []).length > 0;
}

// Alta/actualizacion del contacto en Google Contacts (via el Apps Script de
// Calendar) con el nombre de la base. Best-effort, no bloquea la respuesta.
async function upsertGoogleContact(name: string, phone: string): Promise<void> {
  try {
    const { data: s } = await admin
      .from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    const cfg = (s?.value as Record<string, string> | null) ?? {};
    if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return;
    await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, action: "upsert_contact", name, phone }),
      signal: AbortSignal.timeout(30000),
    });
  } catch (e) {
    console.error("whatsapp-link: alta de contacto en Google fallo", e);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  if (!(await authorizeSoporteWrite(req))) return jsonResp(403, { error: "forbidden" });

  let body: { conversation_id?: string; directory_id?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const convId = String(body.conversation_id || "");
  const directoryId = String(body.directory_id || "");
  if (!convId || !directoryId) return jsonResp(400, { error: "missing_fields" });

  const { data: conv } = await admin
    .from("wa_conversations").select("id, wa_phone, is_group").eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });
  if (conv.is_group) return jsonResp(400, { error: "cannot_link_group" });

  // Resolver la persona elegida (deriva cliente + puentea al CRM).
  const { data: r, error: rpcErr } = await admin.rpc("soporte_resolve_fin", {
    p_wa_phone: conv.wa_phone, p_directory_id: directoryId,
  });
  if (rpcErr) {
    console.error("whatsapp-link: soporte_resolve_fin error", rpcErr);
    return jsonResp(500, { error: "resolve_error" });
  }
  const hit = Array.isArray(r) ? r[0] : r;
  if (!hit?.matched) return jsonResp(404, { error: "person_not_found" });

  const patch: Record<string, unknown> = {
    contact_id: hit.contact_id ?? null,
    wa_profile_name: hit.name ?? null,
    updated_at: new Date().toISOString(),
  };
  if (hit.client_id) patch.client_id = hit.client_id;
  await admin.from("wa_conversations").update(patch).eq("id", convId);

  // Agendar en Google Contacts con el nombre de la base (best-effort).
  if (hit.name && conv.wa_phone) {
    const bg = upsertGoogleContact(hit.name, conv.wa_phone);
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil
      ? (globalThis as any).EdgeRuntime.waitUntil(bg)
      : await bg;
  }

  return jsonResp(200, {
    ok: true,
    contact_id: hit.contact_id ?? null,
    client_id: hit.client_id ?? null,
    client_name: hit.client_name ?? null,
    name: hit.name ?? null,
  });
});
