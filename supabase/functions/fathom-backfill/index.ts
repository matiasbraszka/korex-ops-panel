// Backfill histórico de Fathom: trae llamadas desde una fecha pasada hasta hoy
// y las inserta en llamadas_inbox (skipea duplicados por fathom_id).
// GET /fathom-backfill?since=2026-01-01&limit=500&dry=true

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FATHOM_API_KEY = Deno.env.get("FATHOM_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function j(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function newId(): string {
  return `inb_bf_${Math.floor(Date.now()/1000)}_${Math.random().toString(36).slice(2,10)}`;
}
interface TI { speaker?: { display_name?: string }; text?: string; timestamp?: string }
function toText(items: TI[]): string {
  if (!Array.isArray(items) || !items.length) return "";
  return items.map((it) => `[${it.timestamp ?? ""}] ${it.speaker?.display_name ?? "Unknown"}: ${it.text ?? ""}`).join("\n");
}
function durMin(s?: string, e?: string): number | null {
  if (!s || !e) return null;
  try { const ms = new Date(e).getTime() - new Date(s).getTime(); return ms<0||isNaN(ms)?null:Math.round(ms/60000); } catch { return null; }
}

Deno.serve(async (req: Request) => {
  if (!FATHOM_API_KEY) return j(500, { error: "FATHOM_API_KEY missing" });
  const url = new URL(req.url);
  const since = url.searchParams.get("since") ?? "2026-01-01";
  const limit = parseInt(url.searchParams.get("limit") ?? "500", 10);
  const dry = url.searchParams.get("dry") === "true";
  const sinceISO = new Date(since).toISOString();

  let inserted = 0, skipped = 0, totalSeen = 0, pages = 0;
  const errors: string[] = [];
  let cursor: string | null = null;

  try {
    while (totalSeen < limit) {
      const params = new URLSearchParams({ created_after: sinceISO, include_transcript: "true" });
      if (cursor) params.set("cursor", cursor);
      const res = await fetch(`https://api.fathom.ai/external/v1/meetings?${params.toString()}`, { headers: { "X-Api-Key": FATHOM_API_KEY } });
      if (!res.ok) { errors.push(`API ${res.status}: ${(await res.text()).slice(0,300)}`); break; }
      const data = await res.json();
      const meetings = data?.items ?? [];
      pages++;
      totalSeen += meetings.length;

      for (const m of meetings) {
        const fathomId = String(m.recording_id);
        const { data: existing } = await supabase.from("llamadas_inbox").select("id").eq("fathom_id", fathomId).maybeSingle();
        if (existing) { skipped++; continue; }
        const transcript = Array.isArray(m.transcript) && m.transcript.length>0 ? toText(m.transcript as TI[]) : null;
        if (!transcript) { skipped++; continue; }
        const invitees = Array.isArray(m.calendar_invitees) ? m.calendar_invitees : [];
        const participants = invitees.map((i: Record<string, unknown>) => (i.name as string) ?? (i.email as string)).filter(Boolean);
        if (m.recorded_by?.name && !participants.includes(m.recorded_by.name)) participants.unshift(m.recorded_by.name);
        if (dry) { inserted++; continue; }
        const id = newId();
        const { error } = await supabase.from("llamadas_inbox").insert({
          id, fathom_id: fathomId,
          raw_payload: { webhook: m, auth_method: "backfill", participants, duration_min: durMin(m.recording_start_time, m.recording_end_time), summary: m.default_summary?.markdown_formatted ?? null, action_items: m.action_items ?? null, source: "fathom_backfill" },
          transcript, recording_url: m.share_url ?? null,
          title_fathom: m.title ?? m.meeting_title ?? null,
          processed: false,
        });
        if (error) { if (error.code === "23505") skipped++; else errors.push(`${fathomId}: ${error.message}`); }
        else inserted++;
      }
      cursor = data?.next_cursor ?? null;
      if (!cursor || meetings.length === 0) break;
    }
  } catch (e) { errors.push(String(e)); }

  return j(200, { since: sinceISO, pages, totalSeen, inserted, skipped, errors, dry });
});
