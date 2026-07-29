// Diagnóstico: para el ad account de un cliente, lista anuncios -> formulario
// mapeado (por el creative) + gasto últimos 7 días. Muestra cómo se reconoce
// qué campaña/anuncio va con cada formulario.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
const G = 'https://graph.facebook.com/v21.0'
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { 'content-type': 'application/json' } })
function wt<T>(p: Promise<T>, ms: number): Promise<T> { return Promise.race([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), ms))]) as Promise<T> }
async function graph(url: string) { try { const r = await wt(fetch(url), 9000); return await r.json() } catch (e) { return { error: { message: String(e) } } } }
function extractFormId(ad: any): string | null {
  const c = ad?.creative || {}; const oss = c.object_story_spec || {}
  const cands = [oss.link_data?.call_to_action?.value?.lead_gen_form_id, oss.video_data?.call_to_action?.value?.lead_gen_form_id, oss.photo_data?.call_to_action?.value?.lead_gen_form_id]
  for (const p of cands) if (p) return String(p)
  for (const cta of (c.asset_feed_spec?.call_to_actions || [])) if (cta?.value?.lead_gen_form_id) return String(cta.value.lead_gen_form_id)
  return null
}
Deno.serve(async (req) => {
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const client = new URL(req.url).searchParams.get('client') || 'Antonio & Madelaine'
  const { data: page } = await db.from('fbcrm_pages').select('ad_account_id,page_id').eq('client_name', client).not('ad_account_id', 'is', null).maybeSingle()
  if (!page?.ad_account_id) return json({ error: 'cliente sin ad_account_id vinculado', client })
  const { data: tk } = await db.from('fbcrm_settings').select('value').eq('key', 'meta_user_token').maybeSingle()
  const token = tk?.value?.token || Deno.env.get('META_ADS_TOKEN') || ''
  if (!token) return json({ error: 'sin token de ads' })
  const acc = page.ad_account_id
  // nombres de formularios
  const { data: forms } = await db.from('fbcrm_forms').select('form_id,form_name').eq('client_name', client)
  const formName = new Map((forms || []).map((f: any) => [String(f.form_id), f.form_name]))
  // anuncios
  const adsRes = await graph(`${G}/act_${acc}/ads?fields=name,effective_status,campaign{name},adset{name},creative{object_story_spec,asset_feed_spec}&limit=200&access_token=${token}`)
  if (adsRes.error) return json({ error_meta: adsRes.error.message, ad_account: acc })
  const ads = adsRes.data || []
  // gasto últimos 7d por anuncio
  const insRes = await graph(`${G}/act_${acc}/insights?level=ad&fields=ad_id,spend&date_preset=last_7d&limit=500&access_token=${token}`)
  const spendByAd = new Map<string, number>()
  for (const r of (insRes.data || [])) spendByAd.set(String(r.ad_id), Number(r.spend || 0))
  const res = ads.map((ad: any) => {
    const fid = extractFormId(ad)
    return { anuncio: ad.name, campana: ad.campaign?.name || null, estado: ad.effective_status, formulario: fid ? (formName.get(fid) || fid) : 'SIN formulario detectado', gasto_7d_usd: spendByAd.get(String(ad.id)) || 0 }
  })
  return json({ client, ad_account: acc, total_anuncios: ads.length, anuncios: res })
})
