// Crea/actualiza un usuario de acceso al CRM y (opcional) lo mapea a un cliente.
// POST body JSON: { email, password?, client? }  (o query ?email=&password=&client=)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const u = new URL(req.url)
  let body: any = {}
  try { body = await req.json() } catch { /* sin body */ }
  const email = (body.email || u.searchParams.get('email') || '').trim()
  const client = (body.client || u.searchParams.get('client') || '').trim()
  const password = body.password || u.searchParams.get('password') || ('Kx' + crypto.randomUUID().replace(/-/g, '').slice(0, 10))
  if (!email) return json({ ok: false, error: 'falta email' }, 400)

  let userId: string | null = null
  const { data: created, error } = await db.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) {
    const { data: list } = await db.auth.admin.listUsers()
    const found = list?.users?.find((x: any) => x.email === email)
    if (!found) return json({ ok: false, error: error.message })
    await db.auth.admin.updateUserById(found.id, { password, email_confirm: true })
    userId = found.id
  } else {
    userId = created.user?.id || null
  }

  let mapped = false
  if (client && userId) {
    await db.from('fbcrm_client_access').delete().eq('user_id', userId).eq('client_name', client)
    const { error: e2 } = await db.from('fbcrm_client_access').insert({ user_id: userId, client_name: client })
    mapped = !e2
  }
  return json({ ok: true, email, user_id: userId, client: client || null, mapped })
})
