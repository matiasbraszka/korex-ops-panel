// Supabase Edge Function: enviar-factura
// Envia una factura del panel por email (Resend) con un MENSAJE FORMAL SIMPLE y la
// factura como PDF ADJUNTO (si llega pdf_base64). Si no llega, cae al HTML inline.
// Admin/finanzas unicamente.
// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const esc = (s: any) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function verifyFinanceUser(authHeader: string | null) {
  if (!authHeader || !authHeader.startsWith("Bearer ")) return { ok: false, status: 401, error: "missing_token" };
  const jwt = authHeader.slice("Bearer ".length);
  const u = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: `Bearer ${jwt}`, apikey: SERVICE_KEY } });
  if (!u.ok) return { ok: false, status: 401, error: "invalid_token" };
  const user = await u.json().catch(() => null);
  if (!user?.id) return { ok: false, status: 401, error: "invalid_token" };
  const rr = await fetch(`${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user.id}&select=role`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const roles: string[] = (await rr.json().catch(() => [])).map((x: any) => x.role).filter(Boolean);
  if (roles.includes("admin")) return { ok: true };
  if (!roles.length) return { ok: false, status: 403, error: "forbidden" };
  const inList = roles.map((r) => `"${r}"`).join(",");
  const pr = await fetch(`${SUPABASE_URL}/rest/v1/role_permissions?module=eq.finance&submodule=eq.%2A&can_write=is.true&role=in.(${inList})&select=role`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } });
  const perms = await pr.json().catch(() => []);
  if (Array.isArray(perms) && perms.length) return { ok: true };
  return { ok: false, status: 403, error: "forbidden" };
}

async function getCfg() {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/app_settings?key=eq.global&select=value`, {
    headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` },
  });
  const rows = await r.json().catch(() => []);
  const v = rows?.[0]?.value || {};
  const fc = v.factura_email || {};
  const he = v.historial_email || {};
  return {
    test_mode: fc.test_mode !== undefined ? fc.test_mode !== false : (he.test_mode !== false),
    test_email: fc.test_email || he.test_email || "metodokorex@gmail.com",
    from_email: fc.from_email || he.from_email || "onboarding@resend.dev",
    from_name: fc.from_name || "Korex Facturación",
    reply_to: fc.reply_to || he.reply_to || "soporte@metodokorex.com",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

  const auth = await verifyFinanceUser(req.headers.get("Authorization"));
  if (!auth.ok) return json(auth.status, { ok: false, error: auth.error });
  if (!RESEND_API_KEY) return json(500, { ok: false, error: "RESEND_API_KEY no esta configurada" });

  let body: any;
  try { body = await req.json(); } catch { return json(400, { ok: false, error: "invalid_json" }); }
  const to = String(body.to || "").trim();
  const html = String(body.html || "");
  const numeroFmt = String(body.numeroFmt || "").trim();
  const nombreFactura = String(body.nombreFactura || "").trim();
  const pdfB64 = String(body.pdf_base64 || "");
  if (!to || (!html && !pdfB64)) return json(400, { ok: false, error: "missing_fields" });

  const cfg = await getCfg();
  const dest = cfg.test_mode ? cfg.test_email : to;
  const subject = `Factura N° ${numeroFmt} — KOREX PROJECT LLC`.trim();
  const subjectFinal = cfg.test_mode ? `[TEST → ${to}] ${subject}` : subject;
  const saludo = nombreFactura ? `Estimado/a ${esc(nombreFactura)},` : "Estimado/a cliente,";
  // Mensaje formal simple (cuerpo del correo). La factura va como PDF adjunto.
  const cuerpo = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827;line-height:1.6;max-width:560px;">` +
    `<p>${saludo}</p>` +
    `<p>Adjuntamos la factura <b>N° ${esc(numeroFmt)}</b> correspondiente a los servicios de KOREX PROJECT LLC.</p>` +
    `<p>Quedamos a disposición ante cualquier consulta.</p>` +
    `<p>Saludos cordiales,<br/>Equipo Korex</p></div>`;
  const texto = `${nombreFactura ? "Estimado/a " + nombreFactura + "," : "Estimado/a cliente,"}\n\nAdjuntamos la factura N° ${numeroFmt} correspondiente a los servicios de KOREX PROJECT LLC.\nQuedamos a disposición ante cualquier consulta.\n\nSaludos cordiales,\nEquipo Korex`;

  const payload: any = {
    from: `${cfg.from_name} <${cfg.from_email}>`,
    to: [dest],
    reply_to: cfg.reply_to,
    subject: subjectFinal,
    html: pdfB64 ? cuerpo : html,
    text: texto,
  };
  if (pdfB64) payload.attachments = [{ filename: `Factura ${numeroFmt || ""}.pdf`.replace(/\s+/g, " ").trim(), content: pdfB64 }];

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const rb = await res.json().catch(() => ({}));
  if (!res.ok) {
    return json(502, { ok: false, error: rb?.message || rb?.name || `resend_${res.status}`, detail: rb });
  }
  return json(200, { ok: true, resend_id: rb?.id || null, sent_to: dest, test_mode: cfg.test_mode, pdf: !!pdfB64 });
});
