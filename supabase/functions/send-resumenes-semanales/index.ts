// Supabase Edge Function: send-resumenes-semanales
// Corre semanalmente (vía pg_cron, viernes 12:00 UTC = 9 AM Buenos Aires).
// Para cada cliente activo con eventos en la última semana, genera el resumen
// y lo envía vía Resend. Mientras app_settings.historial_email.test_mode === true,
// todos los emails se redirigen a test_email.
//
// También se puede invocar manualmente con POST { dry_run?: true }.
//
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
  return await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function getEmailSettings() {
  const r = await sb("app_settings?key=eq.global&select=value");
  const rows = await r.json();
  const cfg = rows?.[0]?.value?.historial_email || {};
  return {
    test_mode: cfg.test_mode !== false,
    test_email: cfg.test_email || "metodokorex@gmail.com",
    from_email: cfg.from_email || "onboarding@resend.dev",
    from_name: cfg.from_name || "Equipo Korex",
    reply_to: cfg.reply_to || "soporte@metodokorex.com",
    auto_weekly_enabled: cfg.auto_weekly_enabled !== false,
  };
}

function isoDaysAgo(n: number) {
  const d = new Date(); d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function buildBody(cliente: any, eventos: any[], desde: string, hasta: string) {
  const nombre = (cliente?.name || "").split(" ")[0] || "cliente";
  const incluidos = eventos.filter((e) => e.incluir_resumen !== false);
  const entregables = incluidos.filter((e) => e.tipo === "entregable" || e.tipo === "hito");
  const decisiones  = incluidos.filter((e) => e.tipo === "decision" || e.tipo === "validacion");
  const bloqueos    = incluidos.filter((e) => e.tipo === "bloqueo");
  const metricas    = incluidos.filter((e) => e.tipo === "metrica");

  let txt = `Hola ${nombre},\n\n`;
  txt += `Te resumo el avance del proyecto entre el ${desde} y el ${hasta}.\n\n`;
  if (entregables.length) {
    txt += `LO QUE COMPLETAMOS:\n`;
    entregables.forEach((e: any) => { txt += `  ✓ ${e.titulo}\n`; });
    txt += `\n`;
  }
  if (decisiones.length) {
    txt += `DECISIONES Y APROBACIONES:\n`;
    decisiones.forEach((e: any) => { txt += `  ▶ ${e.titulo}\n`; });
    txt += `\n`;
  }
  if (bloqueos.length) {
    txt += `NECESITAMOS DE TI:\n`;
    bloqueos.forEach((e: any) => {
      txt += `  ⚠ ${e.titulo}`;
      if (e.bloqueo_dias) txt += ` (${e.bloqueo_dias} días esperando)`;
      txt += `\n`;
    });
    txt += `\n`;
  }
  if (metricas.length) {
    txt += `MÉTRICAS DEL PERÍODO:\n`;
    metricas.forEach((e: any) => { txt += `  ▲ ${e.titulo}\n`; });
    txt += `\n`;
  }
  txt += `Cualquier duda, respondeme este mismo email.\n\n— Equipo Korex`;
  return txt;
}

async function logEnvio(row: any) {
  await sb("historial_emails_enviados", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(row),
  }).catch(() => {});
}

async function sendOne({
  cfg, cliente, asunto, cuerpo, destinatario_real, dry_run,
}: any) {
  const destinatarioEfectivo = cfg.test_mode ? cfg.test_email : destinatario_real;
  const asuntoFinal = cfg.test_mode ? `[TEST → ${destinatario_real}] ${asunto}` : asunto;

  if (dry_run) {
    return { ok: true, dry_run: true, destinatarioEfectivo, asuntoFinal };
  }
  if (!RESEND_API_KEY) {
    await logEnvio({
      cliente_id: cliente.id, destinatario_real, destinatario_efectivo: destinatarioEfectivo,
      asunto: asuntoFinal, cuerpo, test_mode: cfg.test_mode,
      status: "error", error_msg: "RESEND_API_KEY no configurada",
    });
    return { ok: false, error: "RESEND_API_KEY no configurada" };
  }

  const html = `<pre style="font-family: Inter, system-ui, sans-serif; font-size: 14px; line-height: 1.6; white-space: pre-wrap; color: #1A1D26;">${
    cuerpo.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
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
      cliente_id: cliente.id, destinatario_real, destinatario_efectivo: destinatarioEfectivo,
      asunto: asuntoFinal, cuerpo, test_mode: cfg.test_mode,
      status: "error", error_msg: errorMsg,
    });
    return { ok: false, error: errorMsg };
  }

  await logEnvio({
    cliente_id: cliente.id, destinatario_real, destinatario_efectivo: destinatarioEfectivo,
    asunto: asuntoFinal, cuerpo, test_mode: cfg.test_mode,
    resend_id: resendBody?.id || null, status: "sent",
  });
  return { ok: true, resend_id: resendBody?.id, destinatarioEfectivo };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let body: any = {};
  if (req.method === "POST") {
    body = await req.json().catch(() => ({}));
  }
  const dryRun = !!body.dry_run;
  const force  = !!body.force; // ignora auto_weekly_enabled

  try {
    const cfg = await getEmailSettings();

    if (!cfg.auto_weekly_enabled && !force) {
      return new Response(JSON.stringify({
        ok: true, skipped: true,
        reason: "auto_weekly_enabled=false (apaga la pausa desde Settings → Email del Historial)",
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const desde = isoDaysAgo(7);
    const hasta = isoDaysAgo(0);

    // 1) Clientes activos
    const cR = await sb(`clients?select=id,name,company,status&order=name.asc`);
    const allClients = await cR.json();
    const clients = (allClients || []).filter((c: any) => {
      const s = (c.status || "").toLowerCase();
      return s !== "descartado" && s !== "pausado" && s !== "perdido";
    });

    const summary = {
      ok: true,
      processed: 0,
      sent: 0,
      errored: 0,
      skipped_no_events: 0,
      test_mode: cfg.test_mode,
      destinatario_efectivo: cfg.test_mode ? cfg.test_email : "(real-de-cliente)",
      details: [] as any[],
    };

    for (const cliente of clients) {
      summary.processed++;
      // 2) Eventos del cliente en el rango
      const eR = await sb(
        `historial_eventos?cliente_id=eq.${encodeURIComponent(cliente.id)}` +
        `&fecha=gte.${desde}&fecha=lte.${hasta}` +
        `&incluir_resumen=eq.true` +
        `&order=fecha.desc,hora.desc`
      );
      const eventos = await eR.json();
      if (!Array.isArray(eventos) || eventos.length === 0) {
        summary.skipped_no_events++;
        summary.details.push({ cliente_id: cliente.id, name: cliente.name, status: "skipped_no_events" });
        continue;
      }

      const cuerpo = buildBody(cliente, eventos, desde, hasta);
      const asunto = `Avance semanal · ${cliente.company || cliente.name}`;
      // No tenemos email real del cliente todavía. Lo dejo como placeholder
      // para auditoría — Resend nunca lo recibe mientras test_mode esté on.
      const destinatario_real = `cliente:${cliente.id}@pendiente`;

      const res = await sendOne({ cfg, cliente, asunto, cuerpo, destinatario_real, dry_run: dryRun });
      if (res.ok) summary.sent++; else summary.errored++;
      summary.details.push({ cliente_id: cliente.id, name: cliente.name, status: res.ok ? "sent" : "error", error: res.error });
    }

    return new Response(JSON.stringify(summary), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    console.error("send-resumenes-semanales error", e);
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
