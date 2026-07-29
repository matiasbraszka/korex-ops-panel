// ============================================================
// fbcrm-cpl-daily  (cron)
// Para cada cuenta publicitaria mapeada en fbcrm_pages:
//   - gasto por ANUNCIO del día (insights level=ad)
//   - mapea cada anuncio -> formulario de lead (por el creative; y de respaldo
//     por el ad_id de los leads ya capturados)
//   - agrega gasto por formulario -> USD -> × impuesto (1.07625)
//   - CPL por formulario = gasto formulario / leads de ese formulario ese día
//   Guarda por formulario en fbcrm_spend_form_daily y un rollup por cuenta en
//   fbcrm_spend_daily (compat con la vista de CPL existente).
//
// Token: fbcrm_settings.meta_user_token (long-lived) con fallback a META_ADS_TOKEN.
// Cron cada 2h. Acepta ?date=YYYY-MM-DD (default: ayer UTC) y ?days=N (backfill).
//
// Auto-contenida (sin _shared) para deploy directo por MCP.
// ============================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const GRAPH = 'https://graph.facebook.com/v21.0'
function admin() {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function getToken(db: any): Promise<string> {
  const { data } = await db.from('fbcrm_settings').select('value').eq('key', 'meta_user_token').maybeSingle()
  const t = data?.value?.token
  if (t) return t
  return Deno.env.get('META_ADS_TOKEN') || ''
}

async function fetchAllPaged(url: string): Promise<any[]> {
  const out: any[] = []
  let next = url
  let guard = 0
  while (next && guard < 25) {
    const r = await fetch(next)
    const j = await r.json()
    if (j.error) throw new Error(j.error.message)
    out.push(...(j.data || []))
    next = j.paging?.next || ''
    guard++
  }
  return out
}

// Saca el lead_gen_form_id del creative del anuncio (varias ubicaciones posibles).
function extractFormId(ad: any): string | null {
  const c = ad?.creative || {}
  const oss = c.object_story_spec || {}
  const cands = [
    oss.link_data?.call_to_action?.value?.lead_gen_form_id,
    oss.video_data?.call_to_action?.value?.lead_gen_form_id,
    oss.photo_data?.call_to_action?.value?.lead_gen_form_id,
  ]
  for (const p of cands) if (p) return String(p)
  const afs = c.asset_feed_spec || {}
  for (const cta of (afs.call_to_actions || [])) {
    const id = cta?.value?.lead_gen_form_id
    if (id) return String(id)
  }
  return null
}

Deno.serve(async (req) => {
  const db = admin()
  const token = await getToken(db)
  if (!token) return json({ ok: false, error: 'falta token (fbcrm_settings.meta_user_token o META_ADS_TOKEN)' }, 400)

  const url = new URL(req.url)
  const days = Math.max(1, Math.min(30, Number(url.searchParams.get('days') || 1)))
  const baseDate = url.searchParams.get('date') || new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  const dates: string[] = []
  for (let i = 0; i < days; i++) {
    dates.push(new Date(new Date(baseDate + 'T00:00:00Z').getTime() - i * 86400000).toISOString().slice(0, 10))
  }

  const { data: taxRow } = await db.from('fbcrm_settings').select('value').eq('key', 'tax_factor').maybeSingle()
  const tax = Number(taxRow?.value ?? 1.07625)
  let fx: Record<string, number> = { USD: 1 }
  try {
    const { data } = await db.from('fbcrm_settings').select('value').eq('key', 'fx_rates').maybeSingle()
    if (data?.value) fx = data.value
  } catch (_) { /* usa USD:1 */ }

  const { data: pages } = await db
    .from('fbcrm_pages')
    .select('ad_account_id, client_name, currency, page_id')
    .not('ad_account_id', 'is', null)

  const out: any[] = []
  for (const p of pages || []) {
    const accId = p.ad_account_id as string
    const client = p.client_name as string
    const currency = p.currency || 'USD'
    const rate = fx[currency] && fx[currency] > 0 ? fx[currency] : 1

    try {
      // ── mapeo anuncio -> formulario (una vez por cuenta) ──
      const ads = await fetchAllPaged(
        `${GRAPH}/act_${accId}/ads?fields=id,creative{object_story_spec,asset_feed_spec}&limit=500&access_token=${token}`)
      const formByAd = new Map<string, string>()
      for (const ad of ads) {
        const fid = extractFormId(ad)
        if (fid) formByAd.set(String(ad.id), fid)
      }
      // respaldo: ad_id -> form_id de los leads ya capturados + nombres de formulario
      const formNameById = new Map<string, string>()
      const { data: leadMap } = await db
        .from('fbcrm_leads').select('ad_id, form_id, form_name')
        .eq('client_name', client).not('form_id', 'is', null)
      for (const lm of leadMap || []) {
        if (lm.ad_id && lm.form_id && !formByAd.has(String(lm.ad_id))) formByAd.set(String(lm.ad_id), String(lm.form_id))
        if (lm.form_id && lm.form_name) formNameById.set(String(lm.form_id), lm.form_name)
      }
      // nombres desde el catálogo sincronizado (fbcrm_forms) — fuente confiable
      const { data: catForms } = await db.from('fbcrm_forms').select('form_id, form_name').eq('client_name', client)
      for (const cf of catForms || []) if (cf.form_id && cf.form_name) formNameById.set(String(cf.form_id), cf.form_name)
      // respaldo: nombres reales desde la página vía Meta (si el token tiene permiso)
      try {
        const forms = await fetchAllPaged(`${GRAPH}/${p.page_id}/leadgen_forms?fields=id,name&limit=200&access_token=${token}`)
        for (const f of forms) if (!formNameById.has(String(f.id))) formNameById.set(String(f.id), f.name)
      } catch (_) { /* opcional */ }

      for (const date of dates) {
        const tr = encodeURIComponent(JSON.stringify({ since: date, until: date }))
        const insights = await fetchAllPaged(
          `${GRAPH}/act_${accId}/insights?level=ad&fields=ad_id,spend,impressions,clicks&time_range=${tr}&limit=500&access_token=${token}`)

        // agrega gasto por formulario
        const agg = new Map<string, { spend: number; impressions: number; clicks: number }>()
        for (const row of insights) {
          const fid = formByAd.get(String(row.ad_id)) || '_unmapped'
          const cur = agg.get(fid) || { spend: 0, impressions: 0, clicks: 0 }
          cur.spend += Number(row.spend || 0)
          cur.impressions += Number(row.impressions || 0)
          cur.clicks += Number(row.clicks || 0)
          agg.set(fid, cur)
        }

        let accTaxed = 0, accNative = 0, accImpr = 0, accClicks = 0
        for (const [fid, a] of agg) {
          const spendUsd = currency === 'USD' ? a.spend : a.spend / rate
          const spendUsdTaxed = spendUsd * tax
          let leads = 0
          if (fid !== '_unmapped') {
            const { count } = await db.from('fbcrm_leads').select('id', { count: 'exact', head: true })
              .eq('client_name', client).eq('form_id', fid)
              .gte('created_time', `${date}T00:00:00Z`).lte('created_time', `${date}T23:59:59Z`)
            leads = count || 0
          }
          const cpl = leads > 0 ? spendUsdTaxed / leads : 0
          const formName = formNameById.get(fid) || (fid === '_unmapped' ? 'Sin formulario asignado' : fid)
          await db.from('fbcrm_spend_form_daily').upsert({
            date, ad_account_id: accId, client_name: client, form_id: fid, form_name: formName,
            currency, spend_native: a.spend.toFixed(2), spend_usd: spendUsd.toFixed(2),
            spend_usd_taxed: spendUsdTaxed.toFixed(2), impressions: a.impressions, clicks: a.clicks,
            leads_count: leads, cpl_usd: cpl.toFixed(2), updated_at: new Date().toISOString(),
          }, { onConflict: 'date,ad_account_id,form_id' })
          accTaxed += spendUsdTaxed; accNative += a.spend; accImpr += a.impressions; accClicks += a.clicks
        }

        // rollup por cuenta (leads = todos los del cliente ese día)
        const { count: accLeads } = await db.from('fbcrm_leads').select('id', { count: 'exact', head: true })
          .eq('client_name', client)
          .gte('created_time', `${date}T00:00:00Z`).lte('created_time', `${date}T23:59:59Z`)
        const accSpendUsd = currency === 'USD' ? accNative : accNative / rate
        const accCpl = (accLeads || 0) > 0 ? accTaxed / (accLeads || 1) : 0
        await db.from('fbcrm_spend_daily').upsert({
          date, ad_account_id: accId, ad_account_name: client, client_name: client, currency,
          spend_native: accNative.toFixed(2), spend_usd: accSpendUsd.toFixed(2),
          spend_usd_taxed: accTaxed.toFixed(2), impressions: accImpr, clicks: accClicks,
          leads_count: accLeads || 0, cpl_usd: accCpl.toFixed(2),
        }, { onConflict: 'date,ad_account_id' })

        out.push({ accId, client, date, forms: agg.size, spendTaxed: accTaxed.toFixed(2), leads: accLeads || 0 })
      }
    } catch (e) {
      out.push({ accId, client, error: String((e as Error)?.message || e) })
    }
  }

  return json({ ok: true, dates, out })
})
