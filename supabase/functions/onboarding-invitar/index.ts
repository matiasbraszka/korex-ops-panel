// supabase/functions/onboarding-invitar/index.ts
//
// Le da acceso al cliente a su onboarding en la plataforma: asegura la cuenta,
// genera un magic link y manda el mail. Devuelve además el mensaje ya armado
// para que el equipo lo pegue por WhatsApp, que es como se entrega hoy.
//
// POR QUÉ NO VIVE DENTRO DE crear-venta
//   crear-venta son 1168 líneas y es el único camino por el que entra plata; su
//   propia doctrina es "si algo falla, la venta IGUAL se carga". Además la
//   invitación necesita vida propia: reenvío, link vencido, email mal tipeado,
//   cliente que se suma tarde. crear-venta la llama al final, fire-and-forget.
//
// EL FALLO QUE ESTA FUNCIÓN EXISTE PARA EVITAR
//   portal_cliente_client() resuelve al cliente comparando
//   fin_norm(clients.name) contra fin_directory.nombre + aliases, y crear-venta
//   escribe esos dos campos desde inputs distintos del formulario de venta. Un
//   cliente que no matchea entra a la plataforma y la ve VACÍA, sin error y sin
//   aviso. Por eso lo primero es onboarding_vincular(), y si no resuelve NO se
//   manda nada: se avisa al equipo.
//
// Auth (dual, mismo patrón que client-brain-sync):
//   header  x-onboarding-secret   contra app_settings.portal_config.onboarding_invite_secret
//   o       Bearer <jwt>          de un usuario del equipo con operaciones:write
//
// Body: { client_id, email?, motivo?: 'alta'|'reenvio', enviar_email?: boolean }
//
// Deploy:  supabase functions deploy onboarding-invitar --no-verify-jwt
// Secrets: RESEND_API_KEY (ya existe), PORTAL_URL (opcional)

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") || "";
const PORTAL_URL = (Deno.env.get("PORTAL_URL") || "https://clientes.metodokorex.com").replace(/\/+$/, "");

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-onboarding-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResp(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}

// ── Auth ─────────────────────────────────────────────────────────────────────
async function authorize(req: Request): Promise<boolean> {
  const secretHeader = req.headers.get("x-onboarding-secret") || "";
  if (secretHeader) {
    const { data } = await admin.from("app_settings").select("value").eq("key", "portal_config").maybeSingle();
    const expected = String((data?.value as Record<string, unknown> | null)?.onboarding_invite_secret || "");
    if (expected && secretHeader === expected) return true;
  }

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
    .in("role", roleNames).eq("module", "operaciones").eq("can_write", true).limit(1);
  return (perms || []).length > 0;
}

// ── Contraseña legible por teléfono ──────────────────────────────────────────
// Sin caracteres ambiguos (l/1/I, O/0) porque alguien se la va a dictar en voz
// alta o el cliente la va a copiar de un mail a mano en el celular.
const PALABRAS = [
  "luna", "campo", "rio", "sol", "monte", "playa", "puente", "faro",
  "roble", "delta", "cima", "bahia", "prado", "cauce", "senda", "duna",
];
function generarPassword(): string {
  const n = 2000 + Math.floor(Math.random() * 7999);
  const w = PALABRAS[Math.floor(Math.random() * PALABRAS.length)];
  return `korex-${n}-${w}`;
}

// ── Email ────────────────────────────────────────────────────────────────────
interface EmailCfg {
  test_mode: boolean; test_email: string; from_email: string;
  from_name: string; reply_to: string; subject: string;
}

async function getEmailCfg(): Promise<EmailCfg> {
  // Clave PROPIA, separada de global.historial_email: apagarle el test_mode a
  // esa clave también desmutearía los resúmenes semanales internos.
  const { data } = await admin.from("app_settings").select("value").eq("key", "onboarding_email").maybeSingle();
  const c = (data?.value as Record<string, unknown>) || {};
  return {
    test_mode: c.test_mode !== false,                      // default true (seguro)
    test_email: String(c.test_email || "metodokorex@gmail.com"),
    from_email: String(c.from_email || "onboarding@resend.dev"),
    from_name: String(c.from_name || "Equipo Korex"),
    reply_to: String(c.reply_to || "soporte@metodokorex.com"),
    subject: String(c.subject || "Tu acceso a la plataforma de Korex"),
  };
}

function esc(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function emailHtml(a: { nombre: string; link: string; email: string; password: string }): string {
  const primer = (a.nombre || "").split(/\s+/)[0] || "Hola";
  return `<!doctype html><html lang="es"><body style="margin:0;padding:0;background:#F7F8FA;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F7F8FA;padding:32px 16px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fff;border-radius:20px;padding:36px 32px;font-family:Inter,-apple-system,Segoe UI,sans-serif;color:#1A1D26;">
  <tr><td style="font-family:Montserrat,Inter,sans-serif;font-size:26px;font-weight:800;letter-spacing:-0.03em;color:#0D1117;padding-bottom:14px;">
    ${esc(primer)}, ya podés entrar
  </td></tr>
  <tr><td style="font-size:16px;line-height:1.6;color:#3F4653;padding-bottom:8px;">
    Te creamos tu espacio en la plataforma. Ahí adentro vas a hacer dos cosas:
    reservar el día de tu sesión de arranque y contarnos todo sobre tu negocio.
  </td></tr>
  <tr><td style="font-size:16px;line-height:1.6;color:#3F4653;padding-bottom:24px;">
    Te va a llevar unos <strong>40 minutos</strong>, y podés hacerlo en varias veces:
    se guarda solo a medida que respondés. La mayoría de las preguntas las podés
    contestar <strong>hablando</strong>, sin escribir.
  </td></tr>
  <tr><td align="center" style="padding-bottom:26px;">
    <a href="${esc(a.link)}" style="display:inline-block;background:#5B7CF5;color:#fff;text-decoration:none;
       font-size:13px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;
       padding:16px 34px;border-radius:999px;">Entrar a mi espacio</a>
  </td></tr>
  <tr><td style="background:#F5F7FF;border-radius:14px;padding:18px 20px;font-size:14px;line-height:1.7;color:#3F4653;">
    <div style="font-size:10px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:#9CA3AF;padding-bottom:8px;">
      Si el botón no te funciona
    </div>
    Entrá a <a href="${esc(PORTAL_URL)}" style="color:#2E69E0;">${esc(PORTAL_URL.replace(/^https?:\/\//, ""))}</a> con estos datos:<br>
    <strong>Usuario:</strong> ${esc(a.email)}<br>
    <strong>Contraseña:</strong> ${esc(a.password)}
  </td></tr>
  <tr><td style="font-size:14px;line-height:1.6;color:#6B7280;padding-top:24px;">
    Cualquier duda respondé este mail o escribinos por WhatsApp. Nos vemos adentro.
  </td></tr>
</table>
</td></tr></table></body></html>`;
}

function emailTexto(a: { nombre: string; link: string; email: string; password: string }): string {
  const primer = (a.nombre || "").split(/\s+/)[0] || "Hola";
  return `${primer}, ya podés entrar.

Te creamos tu espacio en la plataforma. Ahí adentro vas a reservar el día de tu
sesión de arranque y contarnos todo sobre tu negocio.

Te va a llevar unos 40 minutos y podés hacerlo en varias veces: se guarda solo.
La mayoría de las preguntas las podés contestar hablando, sin escribir.

Entrar: ${a.link}

Si el link no te funciona, entrá a ${PORTAL_URL} con:
  Usuario: ${a.email}
  Contraseña: ${a.password}

Cualquier duda respondé este mail. Nos vemos adentro.`;
}

// El equipo lo pega tal cual por WhatsApp, que es como se entrega hoy.
function mensajeWhatsapp(a: { nombre: string; link: string; email: string; password: string }): string {
  const primer = (a.nombre || "").split(/\s+/)[0] || "Hola";
  return `¡Hola ${primer}! 👋 Ya te dejamos listo tu espacio en nuestra plataforma.

Ahí adentro vas a hacer dos cosas:
1️⃣ Reservar el día de tu sesión de arranque
2️⃣ Contarnos todo sobre tu negocio

Te lleva unos *40 minutos* y lo podés hacer en varias veces, se guarda solo. Y casi todo lo podés contestar *hablando*, sin escribir 🎤

👉 ${a.link}

Si ese link no te abre, entrá a ${PORTAL_URL}
Usuario: ${a.email}
Contraseña: ${a.password}

Cualquier cosa me escribís por acá 🙌`;
}

// ── Handler ──────────────────────────────────────────────────────────────────
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });
  if (!(await authorize(req))) return jsonResp(403, { ok: false, error: "forbidden" });

  let body: { client_id?: string; email?: string; motivo?: string; enviar_email?: boolean };
  try { body = await req.json(); } catch { return jsonResp(400, { ok: false, error: "bad_json" }); }

  const clientId = String(body.client_id || "");
  if (!clientId) return jsonResp(400, { ok: false, error: "missing_client_id" });
  const enviarEmail = body.enviar_email !== false;
  const warnings: string[] = [];

  // ── 1 · Cliente ────────────────────────────────────────────────────────────
  const { data: cli } = await admin
    .from("clients").select("id,name,email,phone,slack_channel_id").eq("id", clientId).maybeSingle();
  if (!cli) return jsonResp(404, { ok: false, error: "cliente_inexistente" });

  const emailPedido = String(body.email || cli.email || "").trim().toLowerCase();

  // Una cuenta del equipo con acceso de cliente mezclaría identidades: el mismo
  // JWT resolvería a persona del portal y a team_member a la vez.
  if (emailPedido.endsWith("@metodokorex.com")) {
    return jsonResp(400, { ok: false, error: "email_del_equipo",
      detail: "No se puede crear un acceso de cliente sobre un email de Korex." });
  }

  // ── 2 · Vínculo (lo primero, antes de mandar nada) ─────────────────────────
  const { data: vinc, error: vincErr } = await admin.rpc("onboarding_vincular", {
    p_client_id: clientId,
    p_email: emailPedido || null,
  });

  if (vincErr || !vinc?.ok) {
    const motivo = vinc?.error || vincErr?.message || "sin_vinculo";
    const detalle = vinc?.detail || "";
    await admin.rpc("_portal_slack", {
      p_client: clientId,
      p_texto: `🛑 No pude invitar a *${cli.name}* al onboarding: \`${motivo}\`. ${detalle}\n` +
               `El acceso no se envió. Revisá su ficha en el directorio (nombre y email) y volvé a intentar.`,
    }).catch(() => {});

    await admin.from("tasks").insert({
      id: `tsk_${crypto.randomUUID().replace(/-/g, "")}`,
      title: `Arreglar el acceso al portal de ${cli.name}`,
      client_id: clientId, priority: "alta", status: "backlog",
      description: `onboarding-invitar falló con "${motivo}". ${detalle}\n` +
                   `Su nombre en clients no matchea con fin_directory, o falta el email. ` +
                   `Sin esto el cliente entra a la plataforma y la ve vacía.`,
      created_by: "onboarding",
    }).catch(() => {});

    return jsonResp(409, { ok: false, error: motivo, detail: detalle });
  }

  const loginEmail = String(vinc.login_email || emailPedido);
  if (vinc.reparado) warnings.push("Se reparó el vínculo con el directorio (alias agregado).");

  // ── 3 · Cuenta de Auth + contraseña ────────────────────────────────────────
  // La cuenta suele existir ya: el trigger fin_directory_portal_provision la
  // crea al insertar en fin_directory desde crear-venta, con una contraseña
  // "apellido123" guardada en claro. La rotamos SOLO si nadie entró todavía y
  // sigue siendo la autogenerada — si alguien ya se la pasó al cliente por
  // WhatsApp, rotarla lo dejaría afuera.
  let password = String(vinc.password || "");
  let authUserId = vinc.auth_user_id as string | null;

  const { data: acc } = await admin
    .from("portal_access").select("id,notes,auth_user_id,shared_secret")
    .eq("login_email", loginEmail).maybeSingle();

  let lastSignIn: string | null = null;
  if (authUserId) {
    const { data: u } = await admin.auth.admin.getUserById(authUserId);
    lastSignIn = u?.user?.last_sign_in_at ?? null;
  }

  const debeRotar = !lastSignIn && (acc?.notes === "auto-provision" || !password);

  if (!authUserId) {
    password = generarPassword();
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: loginEmail, password, email_confirm: true,
    });
    if (cErr && !/already/i.test(cErr.message || "")) {
      return jsonResp(500, { ok: false, error: "no_pude_crear_cuenta", detail: cErr.message });
    }
    authUserId = created?.user?.id ?? null;
    if (!authUserId) {
      // Ya existía en auth pero portal_access no lo tenía linkeado: lo buscamos.
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      authUserId = list?.users?.find((u) => (u.email || "").toLowerCase() === loginEmail)?.id ?? null;
      if (authUserId) await admin.auth.admin.updateUserById(authUserId, { password });
    }
  } else if (debeRotar) {
    password = generarPassword();
    const { error: uErr } = await admin.auth.admin.updateUserById(authUserId, { password });
    if (uErr) { warnings.push(`No pude rotar la contraseña: ${uErr.message}`); password = String(vinc.password || ""); }
  }

  if (authUserId) {
    await admin.from("portal_access").upsert({
      login_email: loginEmail, auth_user_id: authUserId, enabled: true,
      shared_secret: password, person_id: vinc.person_id,
      notes: "onboarding-invitar",
    }, { onConflict: "login_email" });
  }

  // ── 4 · Run + pedidos ──────────────────────────────────────────────────────
  await admin.rpc("_onboarding_run", { p_client_id: clientId });
  await admin.rpc("portal_pedidos_seed", { p_client: clientId }).catch(() => {});

  // ── 5 · Magic link ─────────────────────────────────────────────────────────
  // UNA SOLA generación por invocación: GoTrue guarda un único token por
  // usuario, así que un segundo generateLink invalidaría el primero. El mismo
  // link va al mail, al mensaje de WhatsApp y al botón de copiar del panel.
  let magicLink = `${PORTAL_URL}/onboarding`;
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: loginEmail,
    options: { redirectTo: `${PORTAL_URL}/onboarding` },
  });
  if (linkErr || !linkData?.properties?.action_link) {
    warnings.push(`No pude generar el magic link (${linkErr?.message || "sin detalle"}). ` +
                  `El cliente puede entrar igual con usuario y contraseña.`);
  } else {
    magicLink = linkData.properties.action_link;
  }

  // ── 6 · Email ──────────────────────────────────────────────────────────────
  const args = { nombre: cli.name as string, link: magicLink, email: loginEmail, password };
  let emailEnviado = false;

  if (enviarEmail) {
    if (!RESEND_API_KEY) {
      warnings.push("RESEND_API_KEY no está configurada: no se envió el mail.");
    } else if (!loginEmail.includes("@")) {
      warnings.push("El cliente no tiene un email válido: no se envió el mail.");
    } else {
      const cfg = await getEmailCfg();
      const destino = cfg.test_mode ? cfg.test_email : loginEmail;
      const asunto = cfg.test_mode ? `[TEST → ${loginEmail}] ${cfg.subject}` : cfg.subject;
      if (cfg.test_mode) {
        warnings.push(`onboarding_email está en test_mode: el mail fue a ${cfg.test_email}, no al cliente.`);
      }

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: `${cfg.from_name} <${cfg.from_email}>`,
          to: [destino], reply_to: cfg.reply_to, subject: asunto,
          text: emailTexto(args), html: emailHtml(args),
        }),
      });
      const rb = await res.json().catch(() => ({}));
      emailEnviado = res.ok;
      if (!res.ok) warnings.push(`Resend falló: ${rb?.message || rb?.name || res.status}`);

      await admin.from("historial_emails_enviados").insert({
        cliente_id: clientId, destinatario_real: loginEmail, destinatario_efectivo: destino,
        asunto, cuerpo: emailTexto(args), test_mode: cfg.test_mode,
        status: res.ok ? "enviado" : "error",
        error_msg: res.ok ? null : String(rb?.message || res.status),
      }).catch(() => {});
    }
  }

  // ── 7 · Registro ───────────────────────────────────────────────────────────
  const { data: run } = await admin
    .from("onboarding_runs").select("id,invite_count")
    .eq("client_id", clientId).neq("estado", "archivado").maybeSingle();

  if (run) {
    await admin.from("onboarding_runs").update({
      invitado_at: new Date().toISOString(),
      invite_count: (run.invite_count ?? 0) + 1,
      invite_canal: emailEnviado ? "email" : "solo_link",
      invite_last_error: warnings.length ? warnings.join(" | ") : null,
    }).eq("id", run.id);
  }

  const esReenvio = body.motivo === "reenvio" || (run?.invite_count ?? 0) > 0;
  await admin.rpc("_portal_slack", {
    p_client: clientId,
    p_texto: `${esReenvio ? "🔁 Reenviado" : "🚀 Enviado"} el acceso al onboarding de *${cli.name}*` +
             (emailEnviado ? ` por mail a ${loginEmail}.` : ` (sin mail — hay que pasarle el link a mano).`) +
             (warnings.length ? `\n⚠️ ${warnings.join("\n⚠️ ")}` : ""),
  }).catch(() => {});

  return jsonResp(200, {
    ok: true,
    client_id: clientId,
    login_email: loginEmail,
    password,
    magic_link: magicLink,
    email_enviado: emailEnviado,
    mensaje_whatsapp: mensajeWhatsapp(args),
    vinculo_reparado: !!vinc.reparado,
    warnings,
  });
});
