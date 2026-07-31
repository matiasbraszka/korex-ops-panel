// colaborador-registro: alta AUTO-SERVICIO de un colaborador del cliente.
// Es PÚBLICA (verify_jwt=false): la abre cualquiera con el link del cliente.
//
// Dos acciones:
//   · info     { token }  → nombre del cliente para mostrar en la pantalla ("Sumate al equipo de X").
//   · register { token, full_name, phone, email, password, role }
//       → crea el usuario (auth) + su fila portal_access con el MISMO person_id
//         que la cuenta del cliente → al entrar ve el 100% de lo que ve el cliente.
//
// Todo el alta corre con service role. El colaborador después entra normal por
// email+password en el login del portal.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (e: string) => (e ?? "").trim().toLowerCase();

// Busca un usuario de Auth por email (paginado).
async function findUserByEmail(admin: any, email: string) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u: any) => norm(u.email ?? "") === norm(email));
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid_json" }, 400); }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const token = String(body.token ?? "").trim();
  if (!token) return json({ ok: false, error: "falta_token" }, 400);

  // Resolver el token → cliente (debe estar habilitado).
  const { data: invite } = await admin
    .from("portal_collab_invites")
    .select("client_id, enabled")
    .eq("token", token)
    .maybeSingle();
  if (!invite || invite.enabled === false) return json({ ok: false, error: "invite_invalido" }, 200);

  const clientId = String(invite.client_id);
  const { data: cli } = await admin.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!cli) return json({ ok: false, error: "cliente_no_encontrado" }, 200);

  const action = String(body.action ?? "register");

  // ── INFO: solo el nombre del cliente para la pantalla ──
  if (action === "info") {
    return json({ ok: true, client_name: cli.name || "tu equipo" });
  }

  // ── REGISTER ──
  const email = norm(String(body.email ?? ""));
  const password = String(body.password ?? "");
  const fullName = String(body.full_name ?? "").trim();
  const phone = String(body.phone ?? "").trim();
  const role = String(body.role ?? "").trim() || "Otro";

  if (!fullName) return json({ ok: false, error: "falta_nombre", detail: "Escribe tu nombre completo." }, 200);
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json({ ok: false, error: "email_invalido", detail: "Revisa el email." }, 200);
  if (email.endsWith("@metodokorex.com"))
    return json({ ok: false, error: "email_equipo", detail: "Ese email es del equipo Korex; usa tu email personal." }, 200);
  if (password.length < 6)
    return json({ ok: false, error: "password_corta", detail: "La contraseña necesita al menos 6 caracteres." }, 200);

  // La persona del cliente: el colaborador comparte este person_id para ver lo mismo.
  const { data: personId, error: pErr } = await admin.rpc("_portal_person_de_cliente", { p_client_id: clientId });
  if (pErr) return json({ ok: false, error: "person_lookup_failed", detail: pErr.message }, 500);
  if (!personId)
    return json({ ok: false, error: "cliente_sin_cuenta",
      detail: "El cliente todavía no tiene su cuenta lista. Pídele al equipo Korex que active su acceso primero." }, 200);

  try {
    // Crear el usuario de Auth (o error claro si el email ya existe).
    let userId: string;
    const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error) {
      const existing = await findUserByEmail(admin, email);
      if (existing) {
        return json({ ok: false, error: "email_en_uso",
          detail: "Ese email ya tiene una cuenta. Entra con tu contraseña o recupérala desde el login." }, 200);
      }
      return json({ ok: false, error: "auth_create_failed", detail: created.error.message }, 500);
    }
    userId = created.data.user.id;

    // Su fila portal_access, colgada de la MISMA persona que el cliente.
    const { error: paErr } = await admin.from("portal_access").upsert(
      {
        person_id: personId,
        login_email: email,
        auth_user_id: userId,
        enabled: true,
        shared_secret: password,
        notes: "colaborador: " + role,
      },
      { onConflict: "login_email" },
    );
    if (paErr) return json({ ok: false, error: "portal_access_failed", detail: paErr.message }, 500);

    // Registro para que Operaciones lo vea/controle.
    const { error: cErr } = await admin.from("portal_collaborators").insert({
      client_id: clientId, person_id: personId, full_name: fullName,
      phone, email, role, auth_user_id: userId,
    });
    if (cErr) return json({ ok: false, error: "collaborator_insert_failed", detail: cErr.message }, 500);

    return json({ ok: true, email, client_name: cli.name });
  } catch (e) {
    return json({ ok: false, error: "unexpected", detail: String(e) }, 500);
  }
});
