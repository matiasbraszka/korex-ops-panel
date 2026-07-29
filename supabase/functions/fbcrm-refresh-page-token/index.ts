// Refresca el page_access_token de una página usando el token de usuario
// long-lived (fbcrm_settings.meta_user_token / META_ADS_TOKEN). El page token
// derivado de un user token long-lived NO caduca. No expone el token en la respuesta.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const G = 'https://graph.facebook.com/v21.0'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const pageId = new URL(req.url).searchParams.get('page_id')
  if (!pageId) return json({ error: 'falta page_id' }, 400)
  const { data: tk } = await db.from('fbcrm_settings').select('value').eq('key', 'meta_user_token').maybeSingle()
  const userToken = tk?.value?.token || Deno.env.get('META_ADS_TOKEN') || ''
  if (!userToken) return json({ error: 'no hay token de usuario (fbcrm_settings.meta_user_token / META_ADS_TOKEN)' }, 400)

  // 1) traer el page token
  const pr = await (await fetch(`${G}/${pageId}?fields=name,access_token&access_token=${userToken}`)).json()
  if (pr.error) return json({ error_meta: pr.error.message, hint: 'el token de usuario quizá no administra esta página o venció' })
  const pageToken = pr.access_token
  if (!pageToken) return json({ error: 'la página no devolvió access_token (permiso insuficiente)' })

  // 2) validar el page token
  const dbg = await (await fetch(`${G}/debug_token?input_token=${pageToken}&access_token=${userToken}`)).json()
  const d = dbg.data || {}
  const scopes = d.scopes || []
  const tieneLeads = scopes.includes('leads_retrieval')

  // 3) guardar
  await db.from('fbcrm_pages').update({ page_access_token: pageToken }).eq('page_id', pageId)

  return json({
    ok: true, page: pr.name, token_type: d.type, is_valid: d.is_valid,
    expires_at: d.expires_at, nunca_caduca: d.expires_at === 0,
    leads_retrieval: tieneLeads, largo: pageToken.length,
  })
})
