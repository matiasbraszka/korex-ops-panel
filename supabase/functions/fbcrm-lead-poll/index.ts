// fbcrm-lead-poll (self-contained).
// Params:
//   ?page_id=ID     solo esa pagina
//   ?all=1          trae historico (sin filtro de fecha), ignora cursor, no lo actualiza
//   ?limit=N        max leads por formulario cuando all=1 (default 25)
//   ?since_days=N   ventana inicial en modo normal (default 3)
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const G = 'https://graph.facebook.com/v21.0'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
const digits = (s: any) => (s || '').toString().replace(/\D/g, '')
const maskPhone = (p: string) => p ? ('•••• ' + p.slice(-4)) : ''
const maskEmail = (e: string) => e ? (e[0] + '•••@' + (e.split('@')[1] || '')) : ''

function parseFieldData(fieldData: any[]) {
  const answers = (fieldData || []).map((f: any) => ({
    name: f.name, label: f.name,
    value: Array.isArray(f.values) ? (f.values.length === 1 ? f.values[0] : f.values) : f.values,
  }))
  const get = (keys: string[]) => {
    for (const a of answers) {
      const n = (a.name || '').toLowerCase()
      if (keys.some(k => n.includes(k))) return Array.isArray(a.value) ? a.value.join(' ') : a.value
    }
    return ''
  }
  const phoneRaw = get(['phone', 'telefono', 'teléfono', 'whatsapp', 'celular', 'movil'])
  const email = get(['email', 'correo'])
  let name = get(['full_name', 'nombre_completo', 'nombre', 'name'])
  if (!name) name = [get(['first_name', 'primer']), get(['last_name', 'apellido'])].filter(Boolean).join(' ')
  return { answers, full_name: name || '', phone: digits(phoneRaw), phone_raw: phoneRaw || '', email: email || '' }
}

Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const url = new URL(req.url)
  const onlyPage = url.searchParams.get('page_id')
  const all = url.searchParams.get('all') === '1'
  const perForm = Number(url.searchParams.get('limit') || 25)
  const sinceDays = Number(url.searchParams.get('since_days') || 3)

  let q = db.from('fbcrm_pages').select('page_id, client_name, page_access_token').eq('active', true)
  if (onlyPage) q = q.eq('page_id', onlyPage)
  const { data: pages } = await q

  const out: any[] = []
  const sample: any[] = []
  let total = 0
  for (const page of pages || []) {
    if (!page.page_access_token) continue
    const token = page.page_access_token
    const key = `last_poll_${page.page_id}`
    let since = Math.floor(Date.now() / 1000) - sinceDays * 86400
    if (!all) {
      const { data: st } = await db.from('fbcrm_settings').select('value').eq('key', key).maybeSingle()
      if (st?.value) since = Number(st.value)
    }
    let maxTime = since

    const fr = await (await fetch(`${G}/${page.page_id}/leadgen_forms?fields=id,name&limit=100&access_token=${token}`)).json()
    if (fr.error) { out.push({ page: page.page_id, error: fr.error.message }); continue }
    for (const form of fr.data || []) {
      const fields = 'id,created_time,field_data,ad_id,adset_id,campaign_id,ad_name,campaign_name,platform'
      let next: string
      if (all) {
        next = `${G}/${form.id}/leads?fields=${fields}&limit=${perForm}&access_token=${token}`
      } else {
        const filtering = encodeURIComponent(JSON.stringify([{ field: 'time_created', operator: 'GREATER_THAN', value: since }]))
        next = `${G}/${form.id}/leads?fields=${fields}&filtering=${filtering}&limit=100&access_token=${token}`
      }
      let count = 0
      let guard = 0
      while (next) {
        const leads = await (await fetch(next)).json()
        if (leads.error) { out.push({ form: form.name, error: leads.error.message }); break }
        for (const lead of leads.data || []) {
          const p = parseFieldData(lead.field_data || [])
          const created = Math.floor(new Date(lead.created_time).getTime() / 1000)
          if (created > maxTime) maxTime = created
          await db.from('fbcrm_leads').upsert({
            lead_id: lead.id, page_id: page.page_id, form_id: form.id, form_name: form.name,
            client_name: page.client_name, created_time: lead.created_time,
            full_name: p.full_name, phone: p.phone, phone_raw: p.phone_raw, email: p.email, answers: p.answers,
            campaign_id: lead.campaign_id?.toString(), campaign_name: lead.campaign_name,
            adset_id: lead.adset_id?.toString(), ad_id: lead.ad_id?.toString(), ad_name: lead.ad_name, platform: lead.platform,
          }, { onConflict: 'lead_id' })
          if (sample.length < 8) sample.push({ form: form.name, nombre: p.full_name, tel: maskPhone(p.phone), email: maskEmail(p.email), fecha: lead.created_time, respuestas: p.answers.length })
          count++; total++
        }
        // en modo all solo la primera pagina (hasta perForm)
        next = all ? '' : (leads.paging?.next || '')
        if (++guard > 50) break
      }
      if (count) out.push({ page: page.client_name || page.page_id, form: form.name, nuevos: count })
    }
    if (!all) await db.from('fbcrm_settings').upsert({ key, value: maxTime }, { onConflict: 'key' })
  }
  return json({ ok: true, total_nuevos: total, detalle: out, muestra: sample })
})
