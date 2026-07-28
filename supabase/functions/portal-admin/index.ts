// portal-admin: gestiona accesos del Portal de Socios.
// Acciones: create_access | reset_password | set_enabled
// Seguridad: requiere JWT (verify_jwt=true) y que el llamante sea del EQUIPO
// (has_permission('finance','*','write')). Crea/actualiza el usuario en Auth con service role.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const norm = (e) => (e ?? "").trim().toLowerCase();

// Busca un usuario de Auth por email (paginado; escala suficiente para decenas/cientos).
async function findUserByEmail(admin, email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => norm(u.email ?? "") === norm(email));
    if (hit) return hit;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader) return json({ error: "missing_authorization" }, 401);

  // 1) Verificar que el llamante es del equipo con permiso de finanzas (escritura).
  const caller = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
  const { data: allowed, error: permErr } = await caller.rpc("has_permission", {
    p_module: "finance", p_submodule: "*", p_action: "write",
  });
  if (permErr) return json({ error: "permission_check_failed", detail: permErr.message }, 500);
  if (allowed !== true) return json({ error: "forbidden" }, 403);

  let body;
  try { body = await req.json(); } catch { return json({ error: "invalid_json" }, 400); }

  const action = String(body.action ?? "");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  try {
    if (action === "create_access") {
      const email = norm(String(body.login_email ?? ""));
      const password = String(body.password ?? "");
      const personId = body.person_id ? String(body.person_id) : null;
      const store = body.store_secret !== false; // por defecto guardamos para reenviar luego
      if (!email || !password) return json({ error: "email_y_password_requeridos" }, 400);

      // Crear o reusar el usuario de Auth.
      let userId;
      const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (created.error) {
        const existing = await findUserByEmail(admin, email);
        if (!existing) return json({ error: "auth_create_failed", detail: created.error.message }, 500);
        userId = existing.id;
        const upd = await admin.auth.admin.updateUserById(userId, { password });
        if (upd.error) return json({ error: "auth_update_failed", detail: upd.error.message }, 500);
      } else {
        userId = created.data.user.id;
      }

      const { error: upErr } = await admin.from("portal_access").upsert(
        {
          person_id: personId,
          login_email: email,
          auth_user_id: userId,
          enabled: true,
          shared_secret: store ? password : null,
        },
        { onConflict: "login_email" },
      );
      if (upErr) return json({ error: "portal_access_upsert_failed", detail: upErr.message }, 500);
      return json({ ok: true, action, email, auth_user_id: userId });
    }

    if (action === "reset_password") {
      const email = norm(String(body.login_email ?? ""));
      const password = String(body.password ?? "");
      if (!email || !password) return json({ error: "email_y_password_requeridos" }, 400);
      const u = await findUserByEmail(admin, email);
      if (!u) return json({ error: "usuario_no_encontrado" }, 404);
      const upd = await admin.auth.admin.updateUserById(u.id, { password });
      if (upd.error) return json({ error: "auth_update_failed", detail: upd.error.message }, 500);
      await admin.from("portal_access").update({ shared_secret: password, auth_user_id: u.id })
        .eq("login_email", email);
      return json({ ok: true, action, email });
    }

    if (action === "set_enabled") {
      const email = norm(String(body.login_email ?? ""));
      const enabled = body.enabled !== false;
      if (!email) return json({ error: "email_requerido" }, 400);
      const { error } = await admin.from("portal_access").update({ enabled }).eq("login_email", email);
      if (error) return json({ error: "update_failed", detail: error.message }, 500);
      return json({ ok: true, action, email, enabled });
    }

    return json({ error: "accion_desconocida", action }, 400);
  } catch (e) {
    return json({ error: "unexpected", detail: String(e) }, 500);
  }
});
