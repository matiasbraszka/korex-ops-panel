// wa-names — rellena el nombre (wa_profile_name) de las conversaciones que
// quedaron sin nombre (típico de los jids @lid de WhatsApp), tomándolo del
// pushName del autor en sus mensajes de Evolution (o del Contact). dburl en el
// body (NO se guarda). { mode:'apply', dburl, confirm? }. verify_jwt: true.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const jsonResp = (s: number, b: unknown) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json", ...cors } });

function parseUrl(u: string) {
  const x = new URL(u);
  return { user: decodeURIComponent(x.username), password: decodeURIComponent(x.password), hostname: x.hostname, port: Number(x.port || 5432), database: x.pathname.slice(1) || "railway" };
}
async function pg(dburl: string): Promise<PgClient> {
  const o = parseUrl(dburl);
  for (const tls of [{ enabled: false }, { enabled: true, enforce: false }]) {
    try { const c = new PgClient({ ...o, tls }); await c.connect(); return c; } catch { /* next */ }
  }
  throw new Error("no_conecta");
}
// Un nombre "pobre" (hay que reemplazarlo): vacío o parece un jid crudo.
const poor = (n: string | null) => !n || n.includes("@") || /^[0-9]{6,}$/.test(n);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* */ }
  const dburl = String(body.dburl || "");
  if (!dburl.startsWith("postgres")) return jsonResp(400, { error: "bad_dburl" });
  const confirm = body.confirm === true;

  let client: PgClient;
  try { client = await pg(dburl); } catch (e) { return jsonResp(200, { ok: false, error: "no_conecta", detail: String(e).slice(0, 200) }); }

  try {
    // pushName más reciente por chat individual (en grupos el pushName es el autor, no el grupo).
    const msgNames = (await client.queryObject<{ jid: string; name: string }>(
      `select distinct on ("key"->>'remoteJid') "key"->>'remoteJid' as jid, "pushName" as name
       from "Message"
       where "pushName" is not null and "pushName" <> '' and ("key"->>'remoteJid') not like '%@g.us'
         and ("key"->>'fromMe')::boolean is not true
       order by "key"->>'remoteJid', "messageTimestamp" desc`)).rows;
    const contactNames = (await client.queryObject<{ jid: string; name: string }>(
      `select "remoteJid" as jid, "pushName" as name from "Contact" where "pushName" is not null and "pushName" <> ''`)).rows;

    const nameByJid = new Map<string, string>();
    for (const c of contactNames) nameByJid.set(c.jid, c.name);   // fallback
    for (const m of msgNames) nameByJid.set(m.jid, m.name);       // pushName del mensaje gana

    const { data: convs } = await admin.from("wa_conversations").select("id, wa_jid, wa_profile_name").limit(8000);
    const updates: { id: string; name: string }[] = [];
    for (const c of convs || []) {
      if (!poor(c.wa_profile_name)) continue;       // ya tiene un nombre bueno
      const nm = nameByJid.get(c.wa_jid);
      if (nm && !poor(nm)) updates.push({ id: c.id, name: nm });
    }

    if (!confirm) return jsonResp(200, { ok: true, dry_run: true, conversaciones: (convs || []).length, a_renombrar: updates.length, ejemplos: updates.slice(0, 10).map((u) => u.name) });

    let done = 0;
    for (const u of updates) { const { error } = await admin.from("wa_conversations").update({ wa_profile_name: u.name }).eq("id", u.id); if (!error) done++; }
    return jsonResp(200, { ok: true, dry_run: false, renombradas: done, de: updates.length });
  } catch (e) {
    return jsonResp(200, { ok: false, error: "error", detail: String(e).slice(0, 300) });
  } finally {
    try { await client.end(); } catch { /* */ }
  }
});
