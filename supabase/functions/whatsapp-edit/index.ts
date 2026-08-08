// supabase/functions/whatsapp-edit/index.ts
// Edita un mensaje ya enviado (el "editar" de WhatsApp) vía Evolution API.
//
// WhatsApp solo deja editar mensajes PROPIOS y dentro de una ventana de ~15 minutos.
// Pasado ese rato Evolution rechaza y devolvemos el error tal cual: mejor un "ya no
// se puede" claro que un cambio que se ve en el panel pero no en el teléfono del
// cliente. Por eso primero se manda a Evolution y recién si acepta se guarda acá.
//
// Al editarse OK, se guarda edited_at (para el rótulo "editado" en la burbuja) y,
// la primera vez, el texto original en body_original.
//
// Auth: verify_jwt=true + soporte:write + (admin O asignado al chat). Es la misma
// puerta que whatsapp-delete: editar lo que se le dijo a un cliente pesa igual que
// borrarlo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// Ventana de edición de WhatsApp. Se chequea acá para dar un mensaje entendible en
// vez del error crudo de Evolution; la palabra final igual la tiene el servidor.
const VENTANA_MIN = 15;
const MAX_LARGO = 4096;

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

  let body: { message_id?: string; text?: string };
  try { body = await req.json(); } catch { return jsonResp(400, { error: "bad_json" }); }
  const msgId = String(body.message_id || "");
  const texto = String(body.text ?? "").trim();
  if (!msgId || !texto) return jsonResp(400, { error: "missing_fields" });
  if (texto.length > MAX_LARGO) return jsonResp(400, { error: "too_long" });

  const { data: msg } = await admin.from("wa_messages")
    .select("id, conversation_id, wa_message_id, direction, msg_type, body, body_original, payload, deleted_at, wa_timestamp, created_at")
    .eq("id", msgId).maybeSingle();
  if (!msg) return jsonResp(404, { error: "message_not_found" });
  if (msg.direction !== "out") return jsonResp(400, { error: "not_own_message" });
  if (msg.deleted_at) return jsonResp(400, { error: "already_deleted" });
  // Solo texto: editar el pie de una foto no es lo mismo y Evolution lo trata aparte.
  if (msg.msg_type && msg.msg_type !== "conversation") return jsonResp(400, { error: "not_text" });
  if (String(msg.body ?? "") === texto) return jsonResp(200, { ok: true, sin_cambios: true });

  const enviado = new Date(String(msg.wa_timestamp || msg.created_at || Date.now())).getTime();
  const minutos = (Date.now() - enviado) / 60000;
  if (minutos > VENTANA_MIN) return jsonResp(400, { error: "ventana_vencida", minutos: Math.round(minutos) });

  if (!(await canActOnConv(auth, String(msg.conversation_id)))) return jsonResp(403, { error: "forbidden" });

  // El key de Baileys guardado: Evolution lo necesita para saber qué mensaje editar.
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

  let evoRes: Response;
  try {
    evoRes = await fetch(`${serverUrl}/chat/updateMessage/${instance}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      body: JSON.stringify({ number: remoteJid, text: texto, key: { id: waId, remoteJid, fromMe: true } }),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    console.error("whatsapp-edit: Evolution inalcanzable", e);
    return jsonResp(502, { error: "evolution_unreachable" });
  }
  const evoData = await evoRes.json().catch(() => null);
  if (!evoRes.ok) {
    console.error("whatsapp-edit: Evolution error", evoRes.status, evoData);
    return jsonResp(502, { error: "evolution_error", detail: evoData?.message || evoRes.status });
  }

  // El original se guarda UNA sola vez: si se edita tres veces, lo que interesa
  // conservar es lo que se mandó de verdad, no la penúltima corrección.
  const patch: Record<string, unknown> = { body: texto, edited_at: new Date().toISOString() };
  if (!msg.body_original) patch.body_original = msg.body ?? "";
  await admin.from("wa_messages").update(patch).eq("id", msg.id);

  // La lista de chats muestra el último mensaje: si era este, hay que refrescarlo.
  const { data: ultimo } = await admin.from("wa_messages")
    .select("id").eq("conversation_id", msg.conversation_id)
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (ultimo?.id === msg.id) {
    await admin.from("wa_conversations")
      .update({ last_message_preview: texto.slice(0, 120) }).eq("id", msg.conversation_id);
  }

  return jsonResp(200, { ok: true, text: texto });
});
