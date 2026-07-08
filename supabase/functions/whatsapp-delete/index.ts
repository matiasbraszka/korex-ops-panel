// supabase/functions/whatsapp-delete/index.ts
// Elimina un mensaje "para todos" (revoke estilo WhatsApp) vía Evolution API.
// Solo se pueden eliminar mensajes PROPIOS (salientes) y dentro de la ventana
// que permite WhatsApp; si ya pasó, Evolution rechaza y devolvemos el error.
//
// Al eliminarse OK, marcamos wa_messages.deleted_at para mostrar el cartelito
// "Eliminaste este mensaje" en el hilo.
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const auth = await authorizeSoporteWrite(req);
  if (!auth) return jsonResp(403, { error: "forbidden" });

  let body: { message_id?: string };
  try { body = await req.json(); } catch { return jsonResp(400, { error: "bad_json" }); }
  const msgId = String(body.message_id || "");
  if (!msgId) return jsonResp(400, { error: "missing_fields" });

  const { data: msg } = await admin.from("wa_messages")
    .select("id, conversation_id, wa_message_id, direction, payload, deleted_at").eq("id", msgId).maybeSingle();
  if (!msg) return jsonResp(404, { error: "message_not_found" });
  // Solo se pueden eliminar para todos los mensajes PROPIOS (salientes).
  if (msg.direction !== "out") return jsonResp(400, { error: "not_own_message" });
  if (msg.deleted_at) return jsonResp(200, { ok: true, already: true });

  if (!(await canActOnConv(auth, String(msg.conversation_id)))) return jsonResp(403, { error: "forbidden" });

  // Key Baileys guardado del mensaje (lo necesita Evolution para el revoke).
  const stored = (msg.payload as Record<string, any>) ?? {};
  const key = (stored.key as Record<string, any>) ?? {};
  const remoteJid = String(key.remoteJid || "");
  const waId = String(key.id || msg.wa_message_id || "");
  if (!remoteJid || !waId) return jsonResp(422, { error: "no_key" });

  const { data: s } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (s?.value as Record<string, string> | null) ?? {};
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return jsonResp(502, { error: "evolution_not_configured" });

  const delBody: Record<string, unknown> = { id: waId, remoteJid, fromMe: true };
  if (key.participant) delBody.participant = String(key.participant);

  let evoRes: Response;
  try {
    evoRes = await fetch(`${serverUrl}/chat/deleteMessageForEveryone/${instance}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify(delBody),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error("whatsapp-delete: Evolution inalcanzable", e);
    return jsonResp(502, { error: "evolution_unreachable" });
  }
  const evoData = await evoRes.json().catch(() => null);
  if (!evoRes.ok) {
    console.error("whatsapp-delete: Evolution error", evoRes.status, evoData);
    return jsonResp(502, { error: "evolution_error", detail: evoData?.message || evoRes.status });
  }

  await admin.from("wa_messages").update({ deleted_at: new Date().toISOString() }).eq("id", msg.id);
  return jsonResp(200, { ok: true });
});
