// supabase/functions/portal-slack-notify/index.ts
// Avisa al EQUIPO por Slack cuando el cliente hace algo en el portal: sube
// material, marca un guion como grabado, comenta, dice que dio acceso a Meta.
// La llaman las RPCs del portal vía pg_net con el secret de app_settings
// (portal_config.slack_notify_secret). Token del bot: venta_form_config.slack_bot_token
// (el mismo lugar que usa informe-slack).
//
// CANAL: uno solo y central, `portal_config.slack_canal_notificaciones`
// (#notificaciones-clientes). Antes cada aviso caía en el canal privado del
// cliente, donde se mezclaba con la conversación del día y no había forma de ver
// de un vistazo qué hicieron todos. Si el canal central no está configurado,
// cae al canal del cliente como antes — así nada deja de avisar por un setting
// que falta.
// verify_jwt = false (autentica por x-portal-secret).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ ok: false, error: "method" }, 405);
  try {
    const { data: cfg } = await supabase.from("app_settings").select("value").eq("key", "portal_config").maybeSingle();
    const portalCfg = (cfg?.value ?? {}) as Record<string, unknown>;
    const secret = str(portalCfg.slack_notify_secret);
    if (!secret || req.headers.get("x-portal-secret") !== secret) return j({ ok: false, error: "unauthorized" }, 401);

    const { client_id, texto } = await req.json().catch(() => ({}));
    if (!client_id || !str(texto)) return j({ ok: false, error: "missing_params" }, 400);

    const { data: s } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    const token = str((s?.value as Record<string, unknown>)?.slack_bot_token);
    if (!token) return j({ ok: true, skipped: "no_slack_token" });

    const { data: cli } = await supabase.from("clients").select("name, slack_channel_id").eq("id", client_id).maybeSingle();
    const channel = str(portalCfg.slack_canal_notificaciones) || str(cli?.slack_channel_id);
    if (!channel) return j({ ok: true, skipped: "sin_canal", client: str(cli?.name) });

    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        channel,
        text: str(texto),
        blocks: [{ type: "section", text: { type: "mrkdwn", text: str(texto).slice(0, 2900) } }],
        unfurl_links: false, unfurl_media: false,
      }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!data?.ok) {
      console.error("portal-slack-notify error", data?.error || res.status, "channel", channel);
      return j({ ok: false, error: data?.error || "slack_error" });
    }
    return j({ ok: true });
  } catch (e) {
    console.error("portal-slack-notify", e);
    return j({ ok: false, error: String(e) }, 200);
  }
});
