// Edge Function: crea una cuenta de auth + su perfil en team_members + roles.
// Solo puede invocarla un usuario con rol admin (validado via is_admin() RPC).
//
// Request body:
//   {
//     email: string,
//     password: string,
//     name: string,
//     role?: string,           // rol descriptivo de team_members (ej. 'Comercial')
//     initials?: string,
//     color?: string,
//     avatar_url?: string,
//     roles: string[],         // ['operations','sales','admin']
//     can_access_settings?: boolean,
//     team_member_id?: string  // si se indica, vincula a un team_member existente en vez de crear
//   }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.101.1';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function slugify(s: string): string {
  return s.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 40);
}

function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405, headers: cors });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // 1. Validar que el caller es admin.
  const authHeader = req.headers.get('Authorization') || '';
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser();
  if (userErr || !userData?.user) {
    return new Response(JSON.stringify({ error: 'no_auth' }), { status: 401, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const { data: isAdmin, error: rpcErr } = await callerClient.rpc('is_admin');
  if (rpcErr || !isAdmin) {
    return new Response(JSON.stringify({ error: 'not_admin' }), { status: 403, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // 2. Parsear payload.
  let body: any;
  try { body = await req.json(); } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const { email, password, name, role, initials, color, avatar_url, roles, can_access_settings, team_member_id } = body || {};
  if (!email || !password || !name) {
    return new Response(JSON.stringify({ error: 'missing_fields', required: ['email', 'password', 'name'] }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  if (password.length < 8) {
    return new Response(JSON.stringify({ error: 'weak_password', detail: 'La contraseña debe tener al menos 8 caracteres.' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // 3. Crear usuario con service_role.
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email: email.toLowerCase().trim(),
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createErr || !created?.user) {
    return new Response(JSON.stringify({ error: 'create_user_failed', detail: createErr?.message }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
  const newUserId = created.user.id;

  // 4. Vincular / crear team_members.
  let teamMemberId = team_member_id;
  try {
    if (teamMemberId) {
      const { error: updErr } = await admin.from('team_members').update({ user_id: newUserId }).eq('id', teamMemberId);
      if (updErr) throw updErr;
    } else {
      // Crear nuevo team_member. El id es un slug del nombre; si choca, agregamos sufijo.
      let baseId = slugify(name) || 'user';
      let tryId = baseId;
      let i = 2;
      while (true) {
        const { data: existing } = await admin.from('team_members').select('id').eq('id', tryId).maybeSingle();
        if (!existing) break;
        tryId = `${baseId}-${i++}`;
      }
      teamMemberId = tryId;
      const { error: insErr } = await admin.from('team_members').insert({
        id: teamMemberId,
        name,
        role: role || '',
        initials: initials || initialsOf(name),
        color: color || '#5B7CF5',
        avatar_url: avatar_url || null,
        user_id: newUserId,
        can_access_settings: !!can_access_settings,
      });
      if (insErr) throw insErr;
    }
  } catch (e) {
    // Rollback: borrar la cuenta de auth para no dejar huérfanos.
    await admin.auth.admin.deleteUser(newUserId).catch(() => {});
    return new Response(JSON.stringify({ error: 'team_member_link_failed', detail: (e as Error).message }), { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } });
  }

  // 5. Asignar roles.
  if (Array.isArray(roles) && roles.length > 0) {
    const rows = roles.map((r: string) => ({ user_id: newUserId, role: r }));
    const { error: roleErr } = await admin.from('user_roles').insert(rows);
    if (roleErr) {
      return new Response(JSON.stringify({ warn: 'roles_partial', detail: roleErr.message, user_id: newUserId, team_member_id: teamMemberId }), { status: 207, headers: { ...cors, 'Content-Type': 'application/json' } });
    }
  }

  return new Response(JSON.stringify({ ok: true, user_id: newUserId, team_member_id: teamMemberId, email }), {
    status: 200,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
});
