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

// Low-level REST fetch for upsert operations with custom headers
const SB_HEADERS = {
  apikey: SUPABASE_ANON_KEY,
  Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  Prefer: 'return=minimal',
};

export async function sbFetch(path, opts = {}) {
  const { headers: extraH, ...restOpts } = opts;
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { ...SB_HEADERS, ...(extraH || {}) },
    ...restOpts,
  });
  if (!r.ok && r.status !== 406) {
    console.warn('SB error:', r.status, await r.text());
    return null;
  }
  if (restOpts.method === 'PATCH' || restOpts.method === 'DELETE' || restOpts.method === 'POST') {
    return true;
  }
  return r.json();
}
