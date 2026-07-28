// fbcrm-forms-sync: trae los formularios de cada página activa desde Meta y los
// guarda en fbcrm_forms, INCLUYENDO las preguntas (key/label/options) para poder
// mostrar el texto legible de cada pregunta/respuesta. Cron cada 30 min. ?page_id= opcional.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const G = 'https://graph.facebook.com/v21.0'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]) as Promise<T>
}
async function graph(url: string) {
  try { const r = await withTimeout(fetch(url), 9000); const t = await withTimeout(r.text(), 6000); return JSON.parse(t) }
  catch (e) { return { error: { message: String(e) } } }
}
Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const onlyPage = new URL(req.url).searchParams.get('page_id')
  let q = db.from('fbcrm_pages').select('page_id, client_name, page_access_token').eq('active', true)
  if (onlyPage) q = q.eq('page_id', onlyPage)
  const { data: pages } = await q
  const out: any[] = []
  for (const page of pages || []) {
    if (!page.page_access_token) continue
    const j = await graph(`${G}/${page.page_id}/leadgen_forms?fields=id,name,status,created_time,questions{key,label,type,options}&limit=200&access_token=${page.page_access_token}`)
    if (j.error) { out.push({ page: page.client_name || page.page_id, error: j.error.message }); continue }
    let n = 0
    for (const f of j.data || []) {
      const questions = f.questions?.data || f.questions || []
      await db.from('fbcrm_forms').upsert({
        form_id: String(f.id), page_id: page.page_id, client_name: page.client_name,
        form_name: f.name, status: f.status, created_time: f.created_time,
        questions, synced_at: new Date().toISOString(),
      }, { onConflict: 'form_id' })
      n++
    }
    out.push({ page: page.client_name || page.page_id, formularios: n })
  }
  return json({ ok: true, out })
})
