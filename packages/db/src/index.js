import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    'Faltan variables de entorno VITE_SUPABASE_URL y/o VITE_SUPABASE_ANON_KEY. ' +
    'Copiá apps/operations/.env.example a apps/operations/.env y completá los valores.'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Low-level REST fetch para PostgREST. Usa el JWT del usuario autenticado
// cuando hay sesión (para que RLS vea auth.uid() correctamente); cae a
// la anon key solamente si no hay sesión.
export async function sbFetch(path, opts = {}) {
  const { headers: extraH, ...restOpts } = opts;
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
    console.warn('SB error:', r.status, await r.text());
    return null;
  }
  if (restOpts.method === 'PATCH' || restOpts.method === 'DELETE' || restOpts.method === 'POST') {
    return true;
  }
  return r.json();
}
