// supabase/functions/fathom-webhook/index.ts
// Webhook + polling: recibe llamadas de Fathom y las guarda en llamadas_inbox.
// Auth relajada: acepta Standard Webhooks, x-fathom-secret, o sin auth (la URL es secreta).
// GET /fathom-webhook?poll=true -> polling manual desde Fathom API

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FATHOM_API_KEY = Deno.env.get("FATHOM_API_KEY") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function generateInboxId(): string {
  const ts = Math.floor(Date.now() / 1000);
  const rnd = Math.random().toString(36).slice(2, 10);
  return `inb_${ts}_${rnd}`;
}

// --- Convert Fathom transcript array to plain text ---

interface TranscriptItem {
  speaker?: { display_name?: string };
  text?: string;
  timestamp?: string;
}

function transcriptToPlainText(items: TranscriptItem[]): string {
  if (!Array.isArray(items) || items.length === 0) return "";
  return items
    .map((item) => {
      const ts = item.timestamp ?? "";
      const speaker = item.speaker?.display_name ?? "Unknown";
      const text = item.text ?? "";
      return `[${ts}] ${speaker}: ${text}`;
    })
    .join("\n");
}

function computeDurationMin(start?: string, end?: string): number | null {
  if (!start || !end) return null;
  try {
    const ms = new Date(end).getTime() - new Date(start).getTime();
    if (isNaN(ms) || ms < 0) return null;
    return Math.round(ms / 60000);
  } catch {
    return null;
  }
}

// --- Poll Fathom API for recent meetings ---

async function pollFathomAPI(): Promise<{ inserted: number; skipped: number; errors: string[] }> {
  if (!FATHOM_API_KEY) {
    return { inserted: 0, skipped: 0, errors: ["FATHOM_API_KEY not configured"] };
  }

  const errors: string[] = [];
  let inserted = 0;
  let skipped = 0;

  try {
    // Fetch meetings from last 3 hours with transcripts
    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString();
    const res = await fetch(
      `https://api.fathom.ai/external/v1/meetings?created_after=${threeHoursAgo}&include_transcript=true`,
      { headers: { "X-Api-Key": FATHOM_API_KEY } }
    );

    if (!res.ok) {
      return { inserted: 0, skipped: 0, errors: [`Fathom API returned ${res.status}`] };
    }

    const data = await res.json();
    const meetings = data?.items ?? [];

    for (const m of meetings) {
      const fathomId = String(m.recording_id);

      // Check if already in inbox
      const { data: existing } = await supabase
        .from("llamadas_inbox")
        .select("id")
        .eq("fathom_id", fathomId)
        .maybeSingle();

      if (existing) {
        skipped++;
        continue;
      }

      // Also check if already in llamadas
      const { data: existingLlamada } = await supabase
        .from("llamadas")
        .select("id")
        .like("id", `%${fathomId}%`)
        .maybeSingle();

      if (existingLlamada) {
        skipped++;
        continue;
      }

      const transcript = Array.isArray(m.transcript) && m.transcript.length > 0
        ? transcriptToPlainText(m.transcript as TranscriptItem[])
        : null;

      // Skip very short calls (< 5 transcript entries)
      if (!transcript || (Array.isArray(m.transcript) && m.transcript.length < 5)) {
        skipped++;
        continue;
      }

      const invitees = Array.isArray(m.calendar_invitees) ? m.calendar_invitees : [];
      const participants = invitees
        .map((inv: Record<string, unknown>) => (inv.name as string) ?? (inv.email as string))
        .filter(Boolean);
      if (m.recorded_by?.name && !participants.includes(m.recorded_by.name)) {
        participants.unshift(m.recorded_by.name);
      }

      const id = generateInboxId();
      const { error } = await supabase.from("llamadas_inbox").insert({
        id,
        fathom_id: fathomId,
        raw_payload: {
          webhook: m,
          auth_method: "poll",
          participants,
          duration_min: computeDurationMin(m.recording_start_time, m.recording_end_time),
          summary: m.default_summary?.markdown_formatted ?? null,
          action_items: m.action_items ?? null,
        },
        transcript,
        recording_url: m.share_url ?? null,
        title_fathom: m.title ?? m.meeting_title ?? null,
        processed: false,
      });

      if (error) {
        if (error.code === "23505") { skipped++; }
        else { errors.push(`Insert error for ${fathomId}: ${error.message}`); }
      } else {
        inserted++;
        console.log(`fathom-poll: inserted ${fathomId} - ${m.title}`);
      }
    }
  } catch (err) {
    errors.push(`Poll error: ${String(err)}`);
  }

  return { inserted, skipped, errors };
}

// --- Insert a single meeting from webhook payload ---

async function insertFromWebhook(payload: Record<string, unknown>): Promise<Response> {
  const recordingId = payload.recording_id ?? payload.fathom_id ?? payload.id;
  if (!recordingId) {
    return jsonResponse(400, { error: "missing_recording_id" });
  }
  const fathomId = String(recordingId);

  const titleFathom = (payload.title as string) ?? (payload.meeting_title as string) ?? null;
  const recordingUrl = (payload.share_url as string) ?? (payload.url as string) ?? null;

  let transcript: string | null = null;
  if (Array.isArray(payload.transcript) && payload.transcript.length > 0) {
    transcript = transcriptToPlainText(payload.transcript as TranscriptItem[]);
  } else if (typeof payload.transcript === "string" && payload.transcript.length > 0) {
    transcript = payload.transcript as string;
  }

  const invitees = Array.isArray(payload.calendar_invitees) ? payload.calendar_invitees : [];
  const participants = invitees
    .map((inv: Record<string, unknown>) => (inv.name as string) ?? (inv.email as string))
    .filter(Boolean);
  const recordedBy = payload.recorded_by as Record<string, unknown> | undefined;
  if (recordedBy?.name && !participants.includes(recordedBy.name as string)) {
    participants.unshift(recordedBy.name as string);
  }

  const durationMin = computeDurationMin(
    payload.recording_start_time as string,
    payload.recording_end_time as string
  );

  const id = generateInboxId();
  const { error } = await supabase.from("llamadas_inbox").insert({
    id,
    fathom_id: fathomId,
    raw_payload: {
      webhook: payload,
      auth_method: "webhook-open",
      participants,
      duration_min: durationMin,
      summary: (payload.default_summary as Record<string, unknown>)?.markdown_formatted ?? null,
      action_items: Array.isArray(payload.action_items) ? payload.action_items : null,
    },
    transcript,
    recording_url: recordingUrl,
    title_fathom: titleFathom,
    processed: false,
  });

  if (error) {
    if (error.code === "23505") {
      return jsonResponse(200, { status: "duplicate", fathom_id: fathomId });
    }
    return jsonResponse(500, { error: error.message });
  }

  console.log("fathom-webhook: inserted", { id, fathom_id: fathomId, title: titleFathom, has_transcript: !!transcript });
  return jsonResponse(200, { status: "ok", id, has_transcript: !!transcript });
}

// --- Main handler ---

Deno.serve(async (req: Request) => {
  // GET: health check or polling
  if (req.method === "GET" || req.method === "HEAD") {
    const url = new URL(req.url);
    if (url.searchParams.get("poll") === "true") {
      console.log("fathom-poll: starting poll...");
      const result = await pollFathomAPI();
      console.log("fathom-poll: done", result);
      return jsonResponse(200, { status: "polled", ...result });
    }
    return jsonResponse(200, { status: "ok", service: "fathom-webhook" });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "method_not_allowed" });
  }

  // Accept ALL POST requests (URL is secret enough)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return jsonResponse(400, { error: "invalid_body" });
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse(400, { error: "invalid_json" });
  }

  return await insertFromWebhook(payload);
});
