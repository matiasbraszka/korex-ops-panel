// Sonda temporal: lee META_ADS_TOKEN (secreto), prueba el token contra Meta,
// guarda los tokens de pagina en fbcrm_pages y devuelve un resumen SEGURO
// (sin exponer ningun token). Se elimina/repurposa despues.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const G = 'https://graph.facebook.com/v21.0'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })

Deno.serve(async () => {
  const token = Deno.env.get('META_ADS_TOKEN')
  if (!token) return json({ ok: false, error: 'No existe el secreto META_ADS_TOKEN' }, 400)

  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const out: any = { ok: true }

  // 1) validez del token / a quien pertenece
  const me = await (await fetch(`${G}/me?fields=id,name&access_token=${token}`)).json()
  if (me.error) return json({ ok: false, stage: 'me', error: me.error.message }, 200)
  out.token_de = me.name

  // 2) permisos otorgados
  const perms = await (await fetch(`${G}/me/permissions?access_token=${token}`)).json()
  const granted = (perms.data || []).filter((p: any) => p.status === 'granted').map((p: any) => p.permission)
  out.permisos = granted
  out.faltan = ['pages_show_list', 'leads_retrieval', 'pages_read_engagement', 'ads_read', 'business_management'].filter(p => !granted.includes(p))

  // 3) paginas accesibles (con su page token) + upsert en fbcrm_pages
  const pages = await (await fetch(`${G}/me/accounts?fields=id,name,access_token&limit=200&access_token=${token}`)).json()
  if (pages.error) { out.pages_error = pages.error.message; return json(out) }

  out.paginas = []
  let guardadas = 0
  for (const pg of pages.data || []) {
    let forms: any[] = []
    let formsError: string | null = null
    if (pg.access_token) {
      const fr = await (await fetch(`${G}/${pg.id}/leadgen_forms?fields=id,name,status&limit=100&access_token=${pg.access_token}`)).json()
      if (fr.error) formsError = fr.error.message
      else forms = (fr.data || []).map((f: any) => ({ name: f.name, status: f.status }))
      // guardamos el token de pagina para la ingesta de leads (NO se devuelve)
      await db.from('fbcrm_pages').upsert(
        { page_id: pg.id.toString(), page_name: pg.name, page_access_token: pg.access_token },
        { onConflict: 'page_id' }
      )
      guardadas++
    }
    out.paginas.push({ nombre: pg.name, page_id: pg.id, formularios: forms.length, forms: forms.map(f => f.name), formsError })
  }
  out.paginas_guardadas = guardadas
  out.total_paginas = (pages.data || []).length
  return json(out)
})
