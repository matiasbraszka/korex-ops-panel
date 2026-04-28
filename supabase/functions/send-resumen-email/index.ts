// Supabase Edge Function: send-resumen-email
// Envía el resumen semanal del Historial a través de Resend.
// Lee el modo (test/prod) y el destinatario de test desde app_settings.value.historial_email.
// Loguea cada envío en historial_emails_enviados (audit).
//
// Deploy:
//   supabase functions deploy send-resumen-email --no-verify-jwt
//
// Secrets:
//   supabase secrets set RESEND_API_KEY=re_...
// (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY ya están disponibles automáticamente.)

// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

async function sb(path: string, init: RequestInit = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
  return res;
}

async function getEmailSettings() {
  const r = await sb("app_settings?key=eq.global&select=value");
  if (!r.ok) throw new Error(`app_settings fetch failed: ${r.status}`);
  const rows = await r.json();
  const cfg = rows?.[0]?.value?.historial_email || {};
  return {
    test_mode: cfg.test_mode !== false, // default true (seguro)
    test_email: cfg.test_email || "troksgamer777@gmail.com",
    from_email: cfg.from_email || "onboarding@resend.dev",
    from_name: cfg.from_name || "Equipo Korex",
    reply_to: cfg.reply_to || "soporte@metodokorex.com",
  };
}

async function logEnvio(row: any) {
  await sb("historial_emails_enviados", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).catch((e) => console.error("audit log failed", e));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const { cliente_id, destinatario_real, asunto, cuerpo } = await req.json();

    if (!destinatario_real || !asunto || !cuerpo) {
      return new Response(JSON.stringify({ error: "missing_fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!RESEND_API_KEY) {
      const err = "RESEND_API_KEY no está configurada en Edge Function secrets";
      await logEnvio({
        cliente_id, destinatario_real, destinatario_efectivo: destinatario_real,
        asunto, cuerpo, test_mode: true, status: "error", error_msg: err,
      });
      return new Response(JSON.stringify({ ok: false, error: err }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cfg = await getEmailSettings();
    const destinatarioEfectivo = cfg.test_mode ? cfg.test_email : destinatario_real;
    const asuntoFinal = cfg.test_mode
      ? `[TEST → ${destinatario_real}] ${asunto}`
      : asunto;

    // Convierte el body de texto plano a HTML simple (preserva saltos de línea).
    const html = `<pre style="font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #1A1D26;">${
      cuerpo
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
    }</pre>`;

    const resendRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${cfg.from_name} <${cfg.from_email}>`,
        to: [destinatarioEfectivo],
        reply_to: cfg.reply_to,
        subject: asuntoFinal,
        text: cuerpo,
        html,
      }),
    });

    const resendBody = await resendRes.json().catch(() => ({}));

    if (!resendRes.ok) {
      const errorMsg = resendBody?.message || resendBody?.name || `resend_${resendRes.status}`;
      await logEnvio({
        cliente_id, destinatario_real, destinatario_efectivo: destinatarioEfectivo,
        asunto: asuntoFinal, cuerpo, test_mode: cfg.test_mode,
        status: "error", error_msg: errorMsg,
      });
      return new Response(JSON.stringify({ ok: false, error: errorMsg, detail: resendBody }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logEnvio({
      cliente_id, destinatario_real, destinatario_efectivo: destinatarioEfectivo,
      asunto: asuntoFinal, cuerpo, test_mode: cfg.test_mode,
      resend_id: resendBody?.id || null, status: "sent",
    });

    return new Response(JSON.stringify({
      ok: true,
      resend_id: resendBody?.id || null,
      destinatario_efectivo: destinatarioEfectivo,
      test_mode: cfg.test_mode,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("send-resumen-email error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
