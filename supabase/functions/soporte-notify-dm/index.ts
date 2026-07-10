import { createClient } from "jsr:@supabase/supabase-js@2";

// Envía un DM de Slack a la persona a la que se le asignó un chat de soporte.
// Lo invoca el trigger `soporte_notify_on_assignee` (Postgres, vía pg_net) con
// un secreto compartido en el header x-korex-secret. verify_jwt=false porque el
// llamador es la base, no un usuario logueado.

const admin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const str = (v: unknown): string => (v == null ? "" : String(v));

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function slackDM(token: string, slackUserId: string, text: string): Promise<boolean> {
  if (!token || !slackUserId) return false;
  try {
    const openRes = await fetch("https://slack.com/api/conversations.open", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ users: slackUserId }),
      signal: AbortSignal.timeout(15000),
    });
    const openData = await openRes.json().catch(() => null);
    const dmChannel = openData?.channel?.id as string | undefined;
    if (!openData?.ok || !dmChannel) {
      console.error("conversations.open fallo", openData?.error || openRes.status);
      return false;
    }
    const postRes = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel: dmChannel, text, unfurl_links: false }),
      signal: AbortSignal.timeout(15000),
    });
    return postRes.ok;
  } catch (e) {
    console.error("slackDM error", e);
    return false;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let payload: any = null;
  try { payload = await req.json(); } catch { return json(400, { error: "bad_json" }); }

  const conversationId = str(payload?.conversation_id);
  const memberId = str(payload?.member_id);
  const actorId = str(payload?.actor_id);
  if (!memberId) return json(400, { error: "no_member" });

  // Config: secreto interno + bot token de Slack (mismo bot que el resto).
  const { data: sop } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  const { data: vf } = await admin.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  const expected = str((sop?.value as any)?.dm_notify_secret);
  const token = str((vf?.value as any)?.slack_bot_token);

  const got = req.headers.get("x-korex-secret") || "";
  if (!expected || got !== expected) return json(401, { error: "unauthorized" });

  // ¿La persona tiene Slack vinculado? (Reuniones de equipo carga slack_id)
  const { data: member } = await admin
    .from("team_members").select("name, slack_id").eq("id", memberId).maybeSingle();
  const slackId = str((member as any)?.slack_id);
  if (!slackId) return json(200, { ok: false, reason: "member_sin_slack_id" });

  // Nombre del chat + de quien asignó.
  let chatName = "un contacto";
  if (conversationId) {
    const { data: conv } = await admin
      .from("wa_conversations").select("custom_name, wa_profile_name, wa_phone").eq("id", conversationId).maybeSingle();
    chatName = str((conv as any)?.custom_name) || str((conv as any)?.wa_profile_name) || str((conv as any)?.wa_phone) || "un contacto";
  }
  let actorName = "Alguien";
  if (actorId) {
    const { data: actor } = await admin.from("team_members").select("name").eq("id", actorId).maybeSingle();
    actorName = str((actor as any)?.name) || "Alguien";
  }

  const text =
    `:speech_balloon: *Nuevo chat de soporte asignado*\n` +
    `${actorName} te asignó el chat de *${chatName}*.\n` +
    `Abrilo en el panel → *Soporte*.`;

  const ok = await slackDM(token, slackId, text);
  return json(200, { ok, member: str((member as any)?.name), chat: chatName });
});
