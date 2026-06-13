// supabase/functions/wa-labels-db/index.ts — importador (etiquetas + chats +
// historial) leyendo DIRECTO la base de Evolution (Railway Postgres), porque la
// API no expone ni la asociación chat↔etiqueta ni un export cómodo. La cadena
// de conexión se pasa en el body (NO se guarda). Modos:
//   inspect  → esquema de tablas
//   measure  → volumen de mensajes (para dimensionar antes de importar)
//   apply    → crea etiquetas en soporte_config.tags y las aplica por jid
//   import   → trae chats + historial de texto (individuales completos, grupos
//              últimos 3 días) a wa_conversations/wa_messages. confirm!==true = preview.
// Idempotente: mensajes por wa_message_id (ignoreDuplicates), conversaciones por wa_jid.
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

// Cartelito para mensajes sin texto (no traemos el archivo en sí).
const MEDIA_LABEL: Record<string, string> = {
  imageMessage: "📷 Imagen", videoMessage: "🎥 Video", audioMessage: "🎤 Audio",
  pttMessage: "🎤 Audio", documentMessage: "📎 Archivo", documentWithCaptionMessage: "📎 Archivo",
  stickerMessage: "Sticker", locationMessage: "📍 Ubicación", liveLocationMessage: "📍 Ubicación",
  contactMessage: "👤 Contacto", contactsArrayMessage: "👤 Contactos",
};
const bodyOf = (text: string | null, mtype: string): string | null => {
  const t = (text || "").trim();
  if (t) return t.slice(0, 4000);
  return MEDIA_LABEL[mtype] || null; // null → mensaje sin contenido mostrable, se omite
};

function parseUrl(u: string) {
  const x = new URL(u);
  return {
    user: decodeURIComponent(x.username),
    password: decodeURIComponent(x.password),
    hostname: x.hostname,
    port: Number(x.port || 5432),
    database: x.pathname.slice(1) || "railway",
  };
}

async function pg(dburl: string): Promise<PgClient> {
  const o = parseUrl(dburl);
  const attempts = [{ enabled: false }, { enabled: true, enforce: false }];
  let lastErr: unknown;
  for (const tls of attempts) {
    try { const c = new PgClient({ ...o, tls }); await c.connect(); return c; }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const chunk = <T>(a: T[], n: number) => { const o: T[][] = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" });

  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* */ }
  const dburl = String(body.dburl || "");
  const mode = ["apply", "measure", "import"].includes(body.mode) ? body.mode : "inspect";
  if (!dburl.startsWith("postgres")) return jsonResp(400, { error: "bad_dburl" });

  let client: PgClient;
  try { client = await pg(dburl); }
  catch (e) { return jsonResp(200, { ok: false, error: "no_conecta", detail: String(e).slice(0, 300) }); }

  try {
    if (mode === "inspect") {
      const tables = await client.queryObject<{ table_name: string }>(
        `select table_name from information_schema.tables where table_schema='public' order by table_name`);
      const names = tables.rows.map((r) => r.table_name);
      const relevant = names.filter((n) => /label|chat|contact|message/i.test(n));
      const detail: Record<string, unknown> = {};
      for (const t of relevant) {
        const cols = await client.queryObject<{ column_name: string; data_type: string }>(
          `select column_name, data_type from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`, [t]);
        let count = null, sample = null;
        try {
          count = Number((await client.queryObject<{ n: bigint }>(`select count(*)::bigint as n from "${t}"`)).rows[0]?.n ?? 0);
          sample = (await client.queryObject(`select * from "${t}" limit 1`)).rows[0] ?? null;
        } catch { /* */ }
        detail[t] = { columns: cols.rows, count, sample };
      }
      return jsonResp(200, { ok: true, mode, all_tables: names, relevant, detail });
    }

    if (mode === "measure") {
      const q1 = async (sql: string) => {
        try { return Number((await client.queryObject<{ n: bigint }>(sql)).rows[0]?.n ?? 0); }
        catch (e) { return "err:" + String(e).slice(0, 120); }
      };
      const total = await q1(`select count(*)::bigint n from "Message"`);
      const groups = await q1(`select count(*)::bigint n from "Message" where "key"->>'remoteJid' like '%@g.us'`);
      const recentGroup = await q1(`select count(*)::bigint n from "Message" where "key"->>'remoteJid' like '%@g.us' and "messageTimestamp" > extract(epoch from now() - interval '3 days')`);
      const chats = await q1(`select count(*)::bigint n from "Chat"`);
      const indiv = typeof total === "number" && typeof groups === "number" ? total - groups : null;
      return jsonResp(200, {
        ok: true, mode, chats, messages_total: total, messages_groups: groups,
        messages_individual: indiv, group_messages_last_3d: recentGroup,
        would_import_estimate: (typeof indiv === "number" ? indiv : 0) + (typeof recentGroup === "number" ? recentGroup : 0),
      });
    }

    // ── Etiquetas (común a apply e import) ──
    const labelRows = (await client.queryObject<{ labelId: unknown; name: string; color: unknown }>(
      `select "labelId", name, color from "Label"`)).rows;
    const labelMap = new Map<string, { name: string; color: unknown }>();
    for (const l of labelRows) {
      const name = String(l.name || "").trim();
      if (name) labelMap.set(String(l.labelId), { name, color: l.color });
    }
    const tagIdsForLabels = (labels: unknown): string[] =>
      (Array.isArray(labels) ? (labels as unknown[]).map(String) : [])
        .filter((id) => labelMap.has(id)).map((id) => `wa-${id}`);

    const confirm = body.confirm === true;

    if (mode === "apply") {
      const chatRows = (await client.queryObject<{ remoteJid: string; labels: unknown }>(
        `select "remoteJid", labels from "Chat" where labels is not null and labels::text <> '[]'`)).rows;
      const { data: convs } = await admin.from("wa_conversations").select("id, wa_jid, tags").limit(8000);
      const convByJid = new Map<string, { id: string; tags: string[] | null }>();
      for (const c of convs || []) convByJid.set(c.wa_jid, { id: c.id, tags: c.tags });
      let matched = 0, wouldTag = 0; const updates: { id: string; tags: string[] }[] = [];
      for (const ch of chatRows) {
        const tagIds = tagIdsForLabels(ch.labels);
        if (!tagIds.length) continue;
        const conv = convByJid.get(ch.remoteJid);
        if (!conv) continue;
        matched++;
        const cur = Array.isArray(conv.tags) ? conv.tags : [];
        const next = [...new Set([...cur, ...tagIds])];
        if (next.length !== cur.length) { updates.push({ id: conv.id, tags: next }); wouldTag++; }
      }
      if (!confirm) return jsonResp(200, { ok: true, mode, dry_run: true, labels_named: labelMap.size, matched_conversations: matched, would_tag: wouldTag });
      const { data: cfgRow } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
      const cfg = (cfgRow?.value as { tags?: any[] }) ?? {};
      const byId = new Map((cfg.tags || []).map((t: any) => [t.id, t]));
      for (const [id, l] of labelMap) byId.set(`wa-${id}`, { id: `wa-${id}`, label: l.name, color: colorFor(l.color) });
      await admin.from("app_settings").update({ value: { ...cfg, tags: [...byId.values()] } }).eq("key", "soporte_config");
      let tagged = 0;
      for (const u of updates) { const { error } = await admin.from("wa_conversations").update({ tags: u.tags }).eq("id", u.id); if (!error) tagged++; }
      return jsonResp(200, { ok: true, mode, dry_run: false, labels_imported: labelMap.size, conversations_tagged: tagged });
    }

    // ── IMPORT: chats + historial de texto ──
    // Chats (todos) con sus etiquetas y nombre.
    const chatRows = (await client.queryObject<{ remoteJid: string; labels: unknown; name: string | null; updatedAt: Date }>(
      `select "remoteJid", labels, name, "updatedAt" from "Chat"`)).rows;
    const contactRows = (await client.queryObject<{ remoteJid: string; pushName: string | null }>(
      `select "remoteJid", "pushName" from "Contact"`)).rows;
    const nameByJid = new Map<string, string>();
    for (const c of contactRows) if (c.pushName) nameByJid.set(c.remoteJid, c.pushName);

    // Mensajes a importar: individuales completos + grupos últimos 3 días.
    const msgRowsRaw = (await client.queryObject<{
      jid: string; from_me: boolean; msg_id: string; participant: string | null;
      mtype: string; ts: number; text: string | null;
    }>(
      `select "key"->>'remoteJid' as jid, ("key"->>'fromMe')::boolean as from_me,
              "key"->>'id' as msg_id, "key"->>'participant' as participant,
              "messageType" as mtype, "messageTimestamp"::bigint as ts,
              coalesce(message->>'conversation', message->'extendedTextMessage'->>'text',
                       message->'imageMessage'->>'caption', message->'videoMessage'->>'caption',
                       message->'documentMessage'->>'caption') as text
       from "Message"
       where (("key"->>'remoteJid') not like '%@g.us')
          or (("key"->>'remoteJid') like '%@g.us' and "messageTimestamp" > extract(epoch from now() - interval '3 days'))
       order by "messageTimestamp" asc`)).rows;

    // Filtrar a mensajes con contenido mostrable; trackear el último por chat.
    const msgs: { jid: string; from_me: boolean; msg_id: string; participant: string | null; mtype: string; ts: number; body: string }[] = [];
    const lastByJid = new Map<string, { ts: number; body: string; from_me: boolean }>();
    for (const m of msgRowsRaw) {
      if (!m.jid || !m.msg_id) continue;
      const b = bodyOf(m.text, m.mtype);
      if (!b) continue;
      const ts = Number(m.ts);
      msgs.push({ ...m, ts, body: b });
      lastByJid.set(m.jid, { ts, body: b, from_me: m.from_me });
    }

    // Conversaciones existentes.
    const { data: existing } = await admin.from("wa_conversations").select("id, wa_jid, tags").limit(8000);
    const convByJid = new Map<string, { id: string; tags: string[] | null }>();
    for (const c of existing || []) convByJid.set(c.wa_jid, { id: c.id, tags: c.tags });

    // Nuevas conversaciones (todos los chats que no existan aún).
    const newConvs: any[] = [];
    for (const ch of chatRows) {
      const jid = ch.remoteJid;
      if (!jid || convByJid.has(jid)) continue;
      const isGroup = jid.endsWith("@g.us");
      const last = lastByJid.get(jid);
      newConvs.push({
        wa_jid: jid,
        is_group: isGroup,
        wa_phone: jid.endsWith("@s.whatsapp.net") ? jid.split("@")[0].replace(/[^0-9]/g, "") : null,
        wa_profile_name: nameByJid.get(jid) || ch.name || null,
        tags: tagIdsForLabels(ch.labels),
        last_message_at: last ? new Date(last.ts * 1000).toISOString() : (ch.updatedAt ? new Date(ch.updatedAt).toISOString() : null),
        last_message_preview: last ? last.body.slice(0, 120) : null,
        last_message_direction: last ? (last.from_me ? "out" : "in") : null,
      });
    }

    if (!confirm) {
      return jsonResp(200, {
        ok: true, mode, dry_run: true,
        chats_total: chatRows.length,
        conversations_existing: convByJid.size,
        conversations_new: newConvs.length,
        messages_with_content: msgs.length,
        messages_read: msgRowsRaw.length,
      });
    }

    // 1) Etiquetas al catálogo.
    const { data: cfgRow } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
    const cfg = (cfgRow?.value as { tags?: any[] }) ?? {};
    const byId = new Map((cfg.tags || []).map((t: any) => [t.id, t]));
    for (const [id, l] of labelMap) byId.set(`wa-${id}`, { id: `wa-${id}`, label: l.name, color: colorFor(l.color) });
    await admin.from("app_settings").update({ value: { ...cfg, tags: [...byId.values()] } }).eq("key", "soporte_config");

    // 2) Insertar conversaciones nuevas (en lotes; idempotente por wa_jid).
    let convsCreated = 0;
    for (const part of chunk(newConvs, 500)) {
      const { data, error } = await admin.from("wa_conversations").upsert(part, { onConflict: "wa_jid", ignoreDuplicates: true }).select("id");
      if (!error && data) convsCreated += data.length;
    }

    // 3) Mapa jid → conversation_id (todas).
    const { data: allConvs } = await admin.from("wa_conversations").select("id, wa_jid").limit(8000);
    const idByJid = new Map<string, string>();
    for (const c of allConvs || []) idByJid.set(c.wa_jid, c.id);

    // 4) Etiquetar las conversaciones que ya existían y tienen labels.
    let tagged = 0;
    for (const ch of chatRows) {
      const tagIds = tagIdsForLabels(ch.labels);
      if (!tagIds.length) continue;
      const prev = convByJid.get(ch.remoteJid);
      if (!prev) continue; // las nuevas ya entraron con sus tags
      const cur = Array.isArray(prev.tags) ? prev.tags : [];
      const next = [...new Set([...cur, ...tagIds])];
      if (next.length !== cur.length) { const { error } = await admin.from("wa_conversations").update({ tags: next }).eq("id", prev.id); if (!error) tagged++; }
    }

    // 5) Insertar mensajes (lotes; idempotente por wa_message_id).
    const msgRows = msgs.map((m) => ({
      conversation_id: idByJid.get(m.jid),
      wa_message_id: m.msg_id,
      direction: m.from_me ? "out" : "in",
      sender_jid: m.jid.endsWith("@g.us") ? m.participant : null,
      msg_type: m.mtype,
      body: m.body,
      status: m.from_me ? "sent" : "received",
      wa_timestamp: new Date(m.ts * 1000).toISOString(),
    })).filter((r) => r.conversation_id);

    let msgsInserted = 0;
    for (const part of chunk(msgRows, 1000)) {
      const { data, error } = await admin.from("wa_messages").upsert(part, { onConflict: "wa_message_id", ignoreDuplicates: true }).select("id");
      if (!error && data) msgsInserted += data.length;
      else if (error) console.error("import msgs batch error", error.message);
    }

    return jsonResp(200, {
      ok: true, mode, dry_run: false,
      conversations_created: convsCreated,
      conversations_tagged: tagged,
      messages_inserted: msgsInserted,
      messages_candidates: msgRows.length,
    });
  } catch (e) {
    return jsonResp(200, { ok: false, error: "error", detail: String(e).slice(0, 400) });
  } finally {
    try { await client.end(); } catch { /* */ }
  }
});
