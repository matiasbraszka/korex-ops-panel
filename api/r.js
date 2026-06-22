// Función de servidor (Vercel) para el acortador propio: redirige
// go.metodokorex.com/<code> al link de WhatsApp largo guardado en Supabase.
//
// El subdominio go.metodokorex.com se rutea acá por un rewrite por host en
// vercel.json (/:code → /api/r?code=:code). Resuelve el code vía la RPC
// short_link_resolve (SECURITY DEFINER), que además suma 1 a clicks, y devuelve
// un 302 al destino. Si el code no existe o falla algo, manda al sitio principal.

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.VITE_SUPABASE_ANON_KEY;
const FALLBACK = 'https://metodokorex.com';

export default async function handler(req, res) {
  // El code llega por el rewrite (?code=) o, por las dudas, del propio path.
  let code = String((req.query && req.query.code) || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 16);
  if (!code) {
    const m = String(req.url || '').match(/\/([A-Za-z0-9]{4,16})(?:[/?#]|$)/);
    if (m) code = m[1];
  }

  const go = (url) => {
    res.statusCode = 302;
    res.setHeader('Location', url);
    res.setHeader('Cache-Control', 'no-store');
    res.end();
  };

  if (!code || !SB_URL || !SB_KEY) return go(FALLBACK);

  try {
    const r = await fetch(`${SB_URL}/rest/v1/rpc/short_link_resolve`, {
      method: 'POST',
      headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
    });
    if (r.ok) {
      const url = await r.json().catch(() => null); // RPC escalar → string o null
      if (typeof url === 'string' && /^https?:\/\//i.test(url)) return go(url);
    }
  } catch { /* cae al fallback */ }

  return go(FALLBACK);
}
