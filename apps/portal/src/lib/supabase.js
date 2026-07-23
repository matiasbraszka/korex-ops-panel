import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Cliente Supabase del portal.
//
// AL MERGEAR AL MONOREPO (apps/portal): podés borrar este archivo y reemplazar
// los imports por `import { supabase } from '@korex/db'`. Es idéntico al de
// packages/db/src/index.js — lo dejamos self-contained solo para que la app
// corra sola fuera del monorepo mientras trabajamos aparte.
// ─────────────────────────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const STORAGE_BUCKET = import.meta.env.VITE_STORAGE_BUCKET || 'funnel-recursos';

export const envMissing = !SUPABASE_URL || !SUPABASE_ANON_KEY;

if (envMissing) {
  console.error('Faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Configuralas en .env');
}

export const supabase = envMissing
  ? createClient('https://invalid.invalid', 'invalid')
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });

export { SUPABASE_URL, SUPABASE_ANON_KEY };
