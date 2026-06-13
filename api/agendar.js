// Función de servidor (Vercel) para /agendar y /agendar/<slug>.
//
// Por qué existe: la vista previa de un link (WhatsApp, etc.) la arman robots
// que NO ejecutan JavaScript, así que leen el <title> y las etiquetas Open
// Graph del HTML tal cual llega. Como el panel es una SPA con un único
// index.html, sin esto toda agenda compartida mostraría el título genérico
// "Korex — Panel de Operaciones". Acá tomamos el index.html ya construido
// (con sus <script> hasheados intactos) y le inyectamos un título y meta og:*
// con el NOMBRE de la llamada. El navegador real igual arranca la app normal.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const esc = (s) => String(s || '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Nombre/descripcion del calendario por slug (o el principal activo si no hay).
// Vía RPC agenda_calendar_meta (SECURITY DEFINER) porque la tabla tiene RLS
// solo para usuarios autenticados; el RPC expone solo nombre+descripción.
async function getCalendar(slug) {
  if (!SB_URL || !SB_KEY) return null;
  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/agenda_calendar_meta`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_slug: slug || null }),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch { return null; }
}

export default async function handler(req, res) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';

  // slug: del rewrite (?slug=) o, por las dudas, del propio path.
  let slug = (req.query && req.query.slug) || '';
  if (!slug) {
    const m = String(req.url || '').match(/\/agendar\/([^/?#]+)/i);
    if (m) slug = decodeURIComponent(m[1]);
  }
  slug = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 60);

  // 1) Plantilla = index.html ya construido (mantiene los assets con hash).
  let html;
  try {
    const tr = await fetch(`${proto}://${host}/index.html`, { headers: { 'user-agent': 'korex-og' } });
    if (!tr.ok) throw new Error('index ' + tr.status);
    html = await tr.text();
  } catch {
    // Si por algo no se pudo leer la plantilla, mandamos a la raíz (sin romper).
    res.statusCode = 302;
    res.setHeader('Location', '/');
    res.end();
    return;
  }

  // 2) Datos de la llamada para el título de la preview.
  const cal = await getCalendar(slug);
  const title = cal?.name ? `${cal.name} · Método Korex` : 'Agendá tu reunión · Método Korex';
  const desc = (cal?.description && String(cal.description).trim())
    || 'Reservá tu reunión por Zoom con el equipo de Método Korex.';
  const ogUrl = `${proto}://${host}/agendar${slug ? '/' + slug : ''}`;

  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Método Korex" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(desc)}" />`,
    `<meta property="og:url" content="${esc(ogUrl)}" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(desc)}" />`,
  ].join('\n    ');

  // 3) Saca el <title> viejo e inyecta las meta antes de cerrar el <head>.
  html = html.replace(/<title>[\s\S]*?<\/title>/i, '');
  html = html.replace(/<\/head>/i, `    ${meta}\n  </head>`);

  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  // La preview se cachea en CDN/WhatsApp; s-maxage permite refrescarla al rato.
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300, stale-while-revalidate=600');
  res.end(html);
}
