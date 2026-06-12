// supabase/functions/whatsapp-send/index.ts
// Envia un mensaje de WhatsApp desde el panel via Evolution API (Railway).
//
// Auth: verify_jwt=true (Supabase valida el JWT) + chequeo de permiso
// soporte:write contra user_roles/role_permissions con service role.
// El panel llama via supabase.functions.invoke('whatsapp-send', { body }).
//
// Flujo: busca la conversacion -> POST a Evolution /message/sendText con el
// wa_jid (funciona para personas Y grupos) -> inserta la fila en wa_messages
// con el key.id devuelto (idempotente: el eco fromMe del webhook se descarta
// o, si llego primero, reusamos su fila) -> patchea el preview -> devuelve la
// fila para que la UI reconcilie su burbuja optimista.

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

// Valida el JWT del caller y su permiso. Devuelve { userId, memberId } o null.
export async function authorizeSoporteWrite(req: Request): Promise<{ userId: string; memberId: string | null } | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) return null;

  const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
  const roleNames = (roles || []).map((r: { role: string }) => r.role);
  let allowed = roleNames.includes("admin");
  if (!allowed && roleNames.length > 0) {
    const { data: perms } = await admin
      .from("role_permissions").select("role")
      .in("role", roleNames).eq("module", "soporte").eq("can_write", true).limit(1);
    allowed = (perms || []).length > 0;
  }
  if (!allowed) return null;

  const { data: member } = await admin
    .from("team_members").select("id").eq("user_id", user.id).maybeSingle();
  return { userId: user.id, memberId: member?.id ?? null };
}

interface SoporteConfig {
  server_url?: string;
  evolution_api_key?: string;
  instance_name?: string;
}

async function getConfig(): Promise<SoporteConfig> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as SoporteConfig) ?? {};
}

// Envia el texto via Evolution y persiste el mensaje. Reusada por crear-cita
// (copia del mismo helper alla; los edge functions no comparten archivos).
export async function sendWhatsAppText(args: {
  conversation: { id: string; wa_jid: string };
  text: string;
  memberId: string | null;
  cfg: SoporteConfig;
}): Promise<{ ok: true; message: Record<string, unknown> } | { ok: false; error: string }> {
  const { conversation, text, memberId, cfg } = args;
  const serverUrl = (cfg.server_url || "").replace(/\/$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!serverUrl || !apiKey) return { ok: false, error: "evolution_not_configured" };

  let evoRes: Response;
  try {
    evoRes = await fetch(`${serverUrl}/message/sendText/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: conversation.wa_jid, text }),
      signal: AbortSignal.timeout(25000),
    });
  } catch (e) {
    console.error("whatsapp-send: Evolution inalcanzable", e);
    return { ok: false, error: "evolution_unreachable" };
  }
  const evoData = await evoRes.json().catch(() => null);
  if (!evoRes.ok || !evoData?.key?.id) {
    console.error("whatsapp-send: Evolution respondio error", evoRes.status, evoData);
    return { ok: false, error: "evolution_error" };
  }

  const tsRaw = Number(evoData.messageTimestamp ?? 0);
  const waTimestamp = tsRaw > 0 ? new Date(tsRaw * 1000).toISOString() : new Date().toISOString();
  const row = {
    conversation_id: conversation.id,
    wa_message_id: String(evoData.key.id),
    direction: "out",
    msg_type: "conversation",
    body: text,
    status: "sent",
    sent_by: memberId,
    payload: evoData,
    wa_timestamp: waTimestamp,
  };

  // Idempotente: si el eco del webhook llego primero, reusar su fila.
  const { data: inserted } = await admin
    .from("wa_messages")
    .upsert(row, { onConflict: "wa_message_id", ignoreDuplicates: true })
    .select("*");
  let message = inserted?.[0];
  if (!message) {
    const { data: existing } = await admin
      .from("wa_messages").select("*").eq("wa_message_id", row.wa_message_id).maybeSingle();
    message = existing ?? row;
  }

  await admin.from("wa_conversations").update({
    last_message_at: waTimestamp,
    last_message_preview: text.slice(0, 120),
  }).eq("id", conversation.id);

  return { ok: true, message };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  const auth = await authorizeSoporteWrite(req);
  if (!auth) return jsonResp(403, { error: "forbidden" });

  let body: { conversation_id?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const convId = String(body.conversation_id || "");
  const text = String(body.text || "").trim();
  if (!convId || !text) return jsonResp(400, { error: "missing_fields" });
  if (text.length > 4096) return jsonResp(400, { error: "too_long" });

  const { data: conv } = await admin
    .from("wa_conversations").select("id, wa_jid").eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });

  const cfg = await getConfig();
  const result = await sendWhatsAppText({ conversation: conv, text, memberId: auth.memberId, cfg });
  if (!result.ok) return jsonResp(502, { error: result.error });
  return jsonResp(200, { ok: true, message: result.message });
});
