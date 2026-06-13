// supabase/functions/wa-labels-db/index.ts — importador de etiquetas leyendo
// DIRECTO la base de Evolution (Railway Postgres), porque la API de Evolution
// no expone la asociación chat↔etiqueta. La cadena de conexión se pasa en el
// body (no se guarda). Modos:
//   POST { mode:'inspect', dburl } → lista tablas/columnas relacionadas a labels
//   POST { mode:'apply',   dburl } → crea las etiquetas en soporte_config.tags
//                                    y las aplica a wa_conversations por jid
// verify_jwt: true.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { Client as PgClient } from "https://deno.land/x/postgres@v0.19.3/mod.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const jsonResp = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

const PALETTE = [
  "#22C55E", "#F59E0B", "#4A67D8", "#E11D48", "#7C3AED", "#0E7490",
  "#15803D", "#B45309", "#2563EB", "#DC2626", "#8E24AA", "#0891B2",
];
const colorFor = (i: unknown) => PALETTE[Math.abs(Number(i) || 0) % PALETTE.length];

function parseUrl(u: string) {
  const x = new URL(u);
  return {
    user: decodeURIComponent(x.username),
    password: decodeURIComponent(x.password),
    hostname: x.hostname,
    port: Number(x.port || 5432),
    database: x.pathname.replace(/^\//, "") || "railway",
  };
}

// Railway expone Postgres por un proxy TCP con cert autofirmado: intentamos
// primero SIN TLS (lo habitual en Railway) y, si el server exige SSL, con TLS
// sin forzar verificación.
async function pg(dburl: string): Promise<PgClient> {
  const o = parseUrl(dburl);
  const attempts = [{ enabled: false }, { enabled: true, enforce: false }];
  let lastErr: unknown;
  for (const tls of attempts) {
    try {
      const client = new PgClient({ ...o, tls });
      await client.connect();
      return client;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* */ }
  const dburl = String(body.dburl || "");
  const mode = body.mode === "apply" ? "apply" : "inspect";
  if (!/^postgres(ql)?:\/\//.test(dburl)) return jsonResp(400, { error: "bad_dburl" });

  let client: PgClient;
  try {
    client = await pg(dburl);
  } catch (e) {
    return jsonResp(200, { ok: false, error: "no_conecta", detail: String(e).slice(0, 300) });
  }

  try {
    if (mode === "inspect") {
      const tables = await client.queryObject<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema='public' order by table_name`,
      );
      const names = tables.rows.map((r) => r.table_name);
      // Detalle de las tablas que parecen de etiquetas / chats / contactos.
      const relevant = names.filter((n) => /label|chat|contact/i.test(n));
      const detail: Record<string, unknown> = {};
      for (const t of relevant) {
        const cols = await client.queryObject<{ column_name: string; data_type: string }>(
          `select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
          [t],
        );
        let count = null, sample = null;
        try {
          const c = await client.queryObject<{ n: bigint }>(`select count(*)::bigint as n from "${t}"`);
          count = Number(c.rows[0]?.n ?? 0);
          const s = await client.queryObject(`select * from "${t}" limit 1`);
          sample = s.rows[0] ?? null;
        } catch { /* */ }
        detail[t] = { columns: cols.rows, count, sample };
      }
      return jsonResp(200, { ok: true, mode, all_tables: names, relevant, detail });
    }

    // ── APPLY (con previsualización si confirm !== true) ──
    const confirm = body.confirm === true;

    // 1) Etiquetas de Evolution. La asociación en Chat.labels usa el id corto
    // de WhatsApp (Label.labelId, ej. "12"), no el id largo (cuid) de Prisma.
    const labelRows = (await client.queryObject<{ labelId: unknown; name: string; color: unknown }>(
      `select "labelId", name, color from "Label"`,
    )).rows;
    const labelMap = new Map<string, { name: string; color: unknown }>();
    for (const l of labelRows) {
      const name = String(l.name || "").trim();
      if (!name) continue; // etiquetas sin nombre: no crear tag vacío
      labelMap.set(String(l.labelId), { name, color: l.color });
    }

    // 2) Chats con etiquetas (la columna labels es jsonb array de ids string).
    const chatRows = (await client.queryObject<{ remoteJid: string; labels: unknown }>(
      `select "remoteJid", labels from "Chat" where labels is not null and labels::text <> '[]'`,
    )).rows;

    // 3) Nuestras conversaciones (match por wa_jid === remoteJid de Evolution).
    const { data: convs } = await admin.from("wa_conversations").select("id, wa_jid, tags").limit(5000);
    const convByJid = new Map<string, { id: string; tags: string[] | null }>();
    for (const c of convs || []) convByJid.set(c.wa_jid, { id: c.id, tags: c.tags });

    // Previsualización de los matches.
    let chatsWithLabels = 0, matched = 0, wouldTag = 0;
    const updates: { id: string; tags: string[] }[] = [];
    for (const ch of chatRows) {
      const ids = Array.isArray(ch.labels) ? (ch.labels as unknown[]).map(String) : [];
      if (!ids.length) continue;
      chatsWithLabels++;
      const conv = convByJid.get(ch.remoteJid);
      if (!conv) continue;
      matched++;
      const tagIds = ids.filter((id) => labelMap.has(id)).map((id) => `wa-${id}`);
      const cur = Array.isArray(conv.tags) ? conv.tags : [];
      const next = [...new Set([...cur, ...tagIds])];
      if (next.length !== cur.length) { updates.push({ id: conv.id, tags: next }); wouldTag++; }
    }

    if (!confirm) {
      return jsonResp(200, {
        ok: true, mode: "apply", dry_run: true,
        labels: labelRows.length,
        chats_with_labels: chatsWithLabels,
        conversations_in_panel: convByJid.size,
        matched_conversations: matched,
        would_tag: wouldTag,
        labels_preview: [...labelMap.entries()].map(([id, l]) => ({ id, name: l.name })),
      });
    }

    // 4) Crear/actualizar las etiquetas en soporte_config.tags.
    const { data: cfgRow } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    const cfg = (cfgRow?.value as { tags?: { id: string; label: string; color: string }[] }) ?? {};
    const byId = new Map((cfg.tags || []).map((t) => [t.id, t]));
    for (const [id, l] of labelMap) byId.set(`wa-${id}`, { id: `wa-${id}`, label: l.name, color: colorFor(l.color) });
    await admin.from("app_settings").update({ value: { ...cfg, tags: [...byId.values()] } }).eq("key", "soporte_config");

    // 5) Aplicar las etiquetas a las conversaciones que matchearon.
    let tagged = 0;
    for (const u of updates) {
      const { error: upErr } = await admin.from("wa_conversations").update({ tags: u.tags }).eq("id", u.id);
      if (!upErr) tagged++;
    }

    return jsonResp(200, {
      ok: true, mode: "apply", dry_run: false,
      labels_imported: labelMap.size,
      chats_with_labels: chatsWithLabels,
      matched_conversations: matched,
      conversations_tagged: tagged,
    });
  } catch (e) {
    return jsonResp(200, { ok: false, error: "query_error", detail: String(e).slice(0, 400) });
  } finally {
    try { await client.end(); } catch { /* */ }
  }
});
