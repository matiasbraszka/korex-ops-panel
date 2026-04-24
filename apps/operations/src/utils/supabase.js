import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://cgdwieoxjoexzlfbxrfc.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNnZHdpZW94am9leHpsZmJ4cmZjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyODU4NDYsImV4cCI6MjA5MDg2MTg0Nn0.us1JjoN2cxYIexUHOSt8q-Ev70i7nUh-qixXgDCgc9A';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Low-level REST fetch for upsert operations with custom headers
const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal'
};

export async function sbFetch(path, opts = {}) {
  const { headers: extraH, ...restOpts } = opts;
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    headers: { ...SB_HEADERS, ...(extraH || {}) },
    ...restOpts
  });
  if (!r.ok && r.status !== 406) {
    console.warn('SB error:', r.status, await r.text());
    return null;
  }
  if (restOpts.method === 'PATCH' || restOpts.method === 'DELETE' || restOpts.method === 'POST') return true;
  return r.json();
}