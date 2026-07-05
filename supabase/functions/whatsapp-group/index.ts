// supabase/functions/whatsapp-group/index.ts
// Administra un grupo de WhatsApp desde el panel via Evolution API:
// cambiar nombre (subject), descripcion, y agregar/quitar participantes.
// La cuenta del puente (numero de Matias) debe ser ADMIN del grupo; si no,
// Evolution rechaza y devolvemos el error para mostrarlo en la UI.
//
// Auth: verify_jwt=true + permiso soporte:write (mismo patron que whatsapp-send).
// Body: { conversation_id, action, value?, op?, participants? }
//   action: 'set_subject' | 'set_description' | 'update_participants'
//   value:  texto (subject o description)
//   op:     'add' | 'remove'         (solo update_participants)
//   participants: string[] (telefonos o jids)  (solo update_participants)

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

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
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

interface Cfg { server_url: string; apiKey: string; instance: string; }
async function getConfig(): Promise<Cfg | null> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const cfg = (data?.value as Record<string, string> | null) ?? {};
  const server_url = (cfg.server_url || "").replace(/\/+$/, "");
  const apiKey = cfg.evolution_api_key || "";
  const instance = cfg.instance_name || "korex-soporte";
  if (!server_url || !apiKey) return null;
  return { server_url, apiKey, instance };
}

// Normaliza un participante a jid de WhatsApp: "<digitos>@s.whatsapp.net".
function toJid(p: string): string {
  const s = str(p);
  if (s.includes("@")) return s;
  const digits = s.replace(/\D/g, "");
  return digits ? `${digits}@s.whatsapp.net` : "";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Trae subject/desc/participantes actuales del grupo (best-effort).
async function fetchGroupInfo(cfg: Cfg, jid: string) {
  try {
    const r = await fetch(
      `${cfg.server_url}/group/findGroupInfos/${cfg.instance}?groupJid=${encodeURIComponent(jid)}`,
      { headers: { apikey: cfg.apiKey }, signal: AbortSignal.timeout(8000) },
    );
    if (!r.ok) return null;
    const info = await r.json().catch(() => null);
    if (!info) return null;
    const participants = Array.isArray(info.participants)
      ? info.participants.map((p: Record<string, unknown>) => {
          const pjid = str(p.id);
          return { jid: pjid, phone: pjid.split("@")[0].split(":")[0], admin: Boolean(p.admin) };
        }).filter((p: { jid: string }) => p.jid)
      : null;
    return { subject: str(info.subject) || null, description: str(info.desc) || null, participants };
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  if (!(await authorizeSoporteWrite(req))) return jsonResp(403, { error: "forbidden" });

  let body: Record<string, any>;
  try {
    body = await req.json();
  } catch {
    return jsonResp(400, { error: "bad_json" });
  }
  const convId = str(body.conversation_id);
  const action = str(body.action);
  if (!convId || !action) return jsonResp(400, { error: "missing_fields" });

  const { data: conv } = await admin
    .from("wa_conversations").select("id, wa_jid, is_group").eq("id", convId).maybeSingle();
  if (!conv) return jsonResp(404, { error: "conversation_not_found" });
  if (!conv.is_group) return jsonResp(400, { error: "not_a_group" });

  const cfg = await getConfig();
  if (!cfg) return jsonResp(502, { error: "evolution_not_configured" });
  const jid = conv.wa_jid;
  const evoHeaders = { "Content-Type": "application/json", apikey: cfg.apiKey };
  const groupQs = `?groupJid=${encodeURIComponent(jid)}`;

  let evoRes: Response;
  try {
    if (action === "set_subject") {
      const subject = str(body.value);
      if (!subject) return jsonResp(400, { error: "empty_subject" });
      evoRes = await fetch(`${cfg.server_url}/group/updateGroupSubject/${cfg.instance}${groupQs}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify({ subject }),
        signal: AbortSignal.timeout(20000),
      });
    } else if (action === "set_description") {
      const description = str(body.value);
      evoRes = await fetch(`${cfg.server_url}/group/updateGroupDescription/${cfg.instance}${groupQs}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify({ description }),
        signal: AbortSignal.timeout(20000),
      });
    } else if (action === "update_participants") {
      const op = str(body.op).toLowerCase();
      if (op !== "add" && op !== "remove") return jsonResp(400, { error: "bad_op" });
      const participants = (Array.isArray(body.participants) ? body.participants : [])
        .map((p: string) => toJid(p)).filter(Boolean);
      if (!participants.length) return jsonResp(400, { error: "no_participants" });
      evoRes = await fetch(`${cfg.server_url}/group/updateParticipant/${cfg.instance}${groupQs}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify({ action: op, participants }),
        signal: AbortSignal.timeout(20000),
      });
    } else if (action === "set_picture") {
      // La imagen llega en base64; la subimos a Storage (privado) y le pasamos a
      // Evolution una URL firmada corta (Evolution la descarga para setearla).
      const b64 = str(body.image);
      const mimetype = str(body.mimetype) || "image/jpeg";
      if (!b64) return jsonResp(400, { error: "missing_image" });
      let bytes: Uint8Array;
      try { bytes = base64ToBytes(b64); } catch { return jsonResp(400, { error: "bad_image" }); }
      if (bytes.length > 5 * 1024 * 1024) return jsonResp(413, { error: "image_too_big" });
      const ext = mimetype.includes("png") ? "png" : "jpg";
      const path = `group-pics/${jid.split("@")[0]}-${Date.now()}.${ext}`;
      const { error: upErr } = await admin.storage.from("wa-media").upload(path, bytes, {
        contentType: mimetype, upsert: true,
      });
      if (upErr) { console.error("whatsapp-group: storage", upErr); return jsonResp(500, { error: "storage_error" }); }
      const { data: signed } = await admin.storage.from("wa-media").createSignedUrl(path, 600);
      if (!signed?.signedUrl) return jsonResp(500, { error: "sign_error" });
      evoRes = await fetch(`${cfg.server_url}/group/updateGroupPicture/${cfg.instance}${groupQs}`, {
        method: "POST", headers: evoHeaders, body: JSON.stringify({ image: signed.signedUrl }),
        signal: AbortSignal.timeout(30000),
      });
    } else {
      return jsonResp(400, { error: "bad_action" });
    }
  } catch (e) {
    console.error("whatsapp-group: Evolution inalcanzable", e);
    return jsonResp(502, { error: "evolution_unreachable" });
  }

  const evoData = await evoRes.json().catch(() => null);
  if (!evoRes.ok) {
    console.error("whatsapp-group: Evolution error", evoRes.status, evoData);
    // 403/forbidden de Evolution suele ser "no sos admin del grupo".
    return jsonResp(502, { error: "evolution_error", detail: evoData?.message || evoData || null });
  }

  // Refrescar el estado del grupo en la conversacion (best-effort).
  const info = await fetchGroupInfo(cfg, jid);
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (action === "set_subject") patch.wa_profile_name = str(body.value);
  if (action === "set_description") patch.description = str(body.value);
  if (info) {
    if (info.subject) patch.wa_profile_name = info.subject;
    if (info.description !== null) patch.description = info.description;
    if (info.participants) patch.participants = info.participants;
  }
  await admin.from("wa_conversations").update(patch).eq("id", convId);

  return jsonResp(200, {
    ok: true,
    subject: info?.subject ?? (action === "set_subject" ? str(body.value) : undefined),
    description: info?.description ?? (action === "set_description" ? str(body.value) : undefined),
    participants: info?.participants ?? undefined,
  });
});
