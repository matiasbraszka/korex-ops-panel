// supabase/functions/whatsapp-agendar/index.ts
// Agenda un chat 1-a-1 con un nombre a elección: guarda custom_name en la
// conversación (para mostrarlo en el panel) y da de alta el contacto en Google
// Contacts (vía el Apps Script de Calendar, acción upsert_contact) para que el
// WhatsApp del teléfono muestre ese nombre. La base de datos SIEMPRE tiene
// prioridad: si el chat está vinculado a una persona de la base, ese nombre gana.
//
// Auth: verify_jwt=true + soporte:write + (admin O asignado al chat).

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
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });
}

async function authorizeSoporteWrite(req: Request): Promise<{ memberId: string | null; isAdmin: boolean } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;
  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  const isAdmin = roleNames.includes("admin");
  let allowed = isAdmin;
  if (!allowed && roleNames.length > 0) {
    const { data: perms } = await admin
      .from("role_permissions").select("role")
      .in("role", roleNames).eq("module", "soporte").eq("can_write", true).limit(1);
    allowed = (perms || []).length > 0;
  }
  if (!allowed) return null;
  const { data: member } = await admin.from("team_members").select("id").eq("user_id", user.id).maybeSingle();
  return { memberId: member?.id ?? null, isAdmin };
}

async function canActOnConv(auth: { memberId: string | null; isAdmin: boolean }, conversationId: string): Promise<boolean> {
  if (auth.isAdmin) return true;
  if (!auth.memberId) return false;
  const { data } = await admin.from("wa_conversation_assignees").select("member_id")
    .eq("conversation_id", conversationId).eq("member_id", auth.memberId).maybeSingle();
  return !!data;
}

// Alta en Google Contacts vía el Apps Script de Calendar (upsert_contact).
async function upsertGoogleContact(name: string, phone: string): Promise<Record<string, unknown> | null> {
  const { data: s } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (s?.value as Record<string, string> | null) ?? {};
  if (!cfg.calendar_script_url || !cfg.calendar_script_secret) return null;
  try {
    const r = await fetch(cfg.calendar_script_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.calendar_script_secret, action: "upsert_contact", name, phone }),
      signal: AbortSignal.timeout(30000),
    });
    return await r.json().catch(() => null);
  } catch (e) {
    console.error("whatsapp-agendar: google contacts fallo", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const auth = await authorizeSoporteWrite(req);
  if (!auth) return jsonResp(403, { error: "forbidden" });

  let body: { conversation_id?: string; name?: string };
  try { body = await req.json(); } catch { return jsonResp(400, { error: "bad_json" }); }
  const convId = String(body.conversation_id || "");
  const name = String(body.name || "").trim().slice(0, 120);
  if (!convId) return jsonResp(400, { error: "missing_fields" });

  if (!(await canActOnConv(auth, convId))) return jsonResp(403, { error: "forbidden" });

  const { data: conv } = await admin.from("wa_conversations")
    .select("id, wa_phone, is_group").eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });
  if (conv.is_group) return jsonResp(400, { error: "is_group" });

  // Guardar (o limpiar) el nombre manual en la conversación.
  await admin.from("wa_conversations").update({ custom_name: name || null }).eq("id", convId);

  // Agendar en Google Contacts (best-effort) solo si hay nombre y teléfono.
  let google: Record<string, unknown> | null = null;
  if (name && conv.wa_phone) {
    google = await upsertGoogleContact(name, String(conv.wa_phone));
  }

  return jsonResp(200, { ok: true, custom_name: name || null, google });
});
