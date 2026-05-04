import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const envMissing = !SUPABASE_URL || !SUPABASE_ANON_KEY;

if (envMissing) {
  console.error('Faltan VITE_SUPABASE_URL/ANON_KEY. Configurá las env vars en Vercel.');
}

// Si faltan vars usamos un cliente dummy para evitar crash al import; la UI
// muestra un banner explicando el problema (ver apps/operations/src/main.jsx).
export const supabase = envMissing
  ? createClient('https://invalid.invalid', 'invalid')
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Low-level REST fetch para PostgREST. Usa el JWT del usuario autenticado
// cuando hay sesión (para que RLS vea auth.uid() correctamente); cae a
// la anon key solamente si no hay sesión.
export async function sbFetch(path, opts = {}) {
  // throwOnError: si el request falla (status no-2xx), tira un Error con
  // el body de la respuesta. Por default sigue siendo "log + return null"
  // para mantener el comportamiento histórico de los callers existentes.
  const { headers: extraH, throwOnError, ...restOpts } = opts;
  const { data: { session } } = await supabase.auth.getSession();
  const bearer = session?.access_token || SUPABASE_ANON_KEY;
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: 'Bearer ' + bearer,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
    ...(extraH || {}),
  };
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, { headers, ...restOpts });
  if (!r.ok && r.status !== 406) {
    const body = await r.text();
    console.warn('SB error:', r.status, body);
    if (throwOnError) {
      const err = new Error(`HTTP ${r.status}: ${body}`);
      err.status = r.status;
      err.body = body;
      throw err;
    }
    return null;
  }
  if (restOpts.method === 'PATCH' || restOpts.method === 'DELETE' || restOpts.method === 'POST') {
    return true;
  }
  return r.json();
}
