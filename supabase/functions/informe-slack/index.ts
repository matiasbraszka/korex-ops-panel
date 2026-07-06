// supabase/functions/informe-slack/index.ts
// Envía a Slack lo que se carga en los informes (sección Accountability).
// Por cada cliente del informe que tenga canal de Slack, postea sus bullets
// (avances + entregables) en el canal específico de ESE cliente, y si el bullet
// tiene capturas las adjunta como imágenes.
//
// Lo invoca el panel después de guardar un informe:
//   supabase.functions.invoke('informe-slack', { body: { report_id, only_bullet_ids? } })
// - report_id: el informe recién guardado.
// - only_bullet_ids: opcional. Al EDITAR, mandamos solo los bullets nuevos para
//   no repetir en Slack lo ya enviado. Si no viene, se envía todo (alta).
//
// Los canales por cliente son internos (solo equipo), así que se manda todo.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function str(v: unknown) { return v === null || v === undefined ? "" : String(v).trim(); }
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

type Att = { url?: string; name?: string };
type Bullet = { id?: string; text?: string; category?: string | null; attachments?: Att[] };
type Block = { client_id?: string | null; bullets?: Bullet[]; text?: string };

// Igual criterio que getBullets del front: usa `bullets` si hay; si no, parsea
// el `text` legacy (líneas) como bullets sin categoría.
function readBullets(block: Block): Bullet[] {
  if (Array.isArray(block?.bullets) && block.bullets.length) {
    return block.bullets
      .map((b) => ({ ...b, text: str(b?.text) }))
      .filter((b) => b.text);
  }
  return str(block?.text)
    .split("\n")
    .map((l) => l.replace(/^[\s\-•·*]+/, "").trim())
    .filter(Boolean)
    .map((text) => ({ text, category: null }));
}

const MARK: Record<string, string> = { entregable: ":white_check_mark:", avance: ":large_blue_circle:" };

async function postSlackBlocks(token: string, channel: string, text: string, blocks: unknown[]) {
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel, text, blocks, unfurl_links: false, unfurl_media: false }),
    signal: AbortSignal.timeout(15000),
  });
  const data = await res.json().catch(() => null);
  if (!data?.ok) console.error("informe-slack postMessage error", data?.error || res.status, "channel", channel);
  return !!data?.ok;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  try {
    const { report_id, only_bullet_ids } = await req.json().catch(() => ({}));
    if (!report_id) return json({ ok: false, error: "missing report_id" }, 400);

    // Interruptor de PAUSA: si app_settings.informe_slack_config.enabled === false,
    // NO se envía nada a Slack al cargar informes. Se re-activa cambiando el flag
    // a true (o borrando la clave), sin necesidad de re-deployar la función.
    const { data: cfg } = await supabase.from("app_settings").select("value").eq("key", "informe_slack_config").maybeSingle();
    if ((cfg?.value as Record<string, unknown>)?.enabled === false) {
      return json({ ok: true, paused: true, sent: 0 });
    }

    // Token del bot (mismo lugar que el resto de las funciones).
    const { data: s } = await supabase.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
    const token = str((s?.value as Record<string, unknown>)?.slack_bot_token);
    if (!token) return json({ ok: false, error: "no_slack_token" }, 200);

    const { data: report, error } = await supabase
      .from("team_reports")
      .select("id, user_id, report_type, report_date, progress_by_client")
      .eq("id", report_id)
      .maybeSingle();
    if (error || !report) return json({ ok: false, error: "report_not_found" }, 200);

    // Filtro opcional de bullets (al editar: solo los nuevos).
    const onlyIds: Set<string> | null = Array.isArray(only_bullet_ids) && only_bullet_ids.length
      ? new Set(only_bullet_ids.map(String)) : null;

    // Nombre del autor para el encabezado.
    const { data: author } = await supabase
      .from("team_members").select("name").eq("id", report.user_id).maybeSingle();
    const authorName = str(author?.name) || "Alguien del equipo";
    const tipoLabel = report.report_type === "weekly" ? "semanal" : "diario";

    const blocksData: Block[] = Array.isArray(report.progress_by_client) ? report.progress_by_client : [];
    let sent = 0;
    const skipped: string[] = [];

    for (const block of blocksData) {
      const clientId = str(block?.client_id);
      if (!clientId) continue; // "Korex – Interno": sin canal de cliente

      let bullets = readBullets(block);
      if (onlyIds) bullets = bullets.filter((b) => b.id && onlyIds.has(String(b.id)));
      if (!bullets.length) continue;

      const { data: cli } = await supabase
        .from("clients").select("name, slack_channel_id").eq("id", clientId).maybeSingle();
      const channel = str(cli?.slack_channel_id);
      const cname = str(cli?.name) || "Cliente";
      if (!channel) { skipped.push(cname); continue; }

      // Texto: encabezado + un renglón por bullet con su marcador.
      const lines = bullets.map((b) => {
        const mark = MARK[String(b.category || "")] || ":small_blue_diamond:";
        return `${mark} ${b.text}`;
      });
      const header = `:memo: *Informe ${tipoLabel} · ${authorName}* _(${report.report_date})_`;
      const bodyText = `${header}\n${lines.join("\n")}`;

      const blocks: unknown[] = [
        { type: "section", text: { type: "mrkdwn", text: bodyText.slice(0, 2900) } },
      ];
      // Capturas como bloques de imagen (URL pública del bucket informe-capturas).
      const imgs: Att[] = [];
      for (const b of bullets) {
        for (const a of (Array.isArray(b.attachments) ? b.attachments : [])) {
          if (a?.url) imgs.push(a);
        }
      }
      for (const a of imgs.slice(0, 10)) { // Slack permite hasta ~50 bloques; topamos en 10 imágenes
        blocks.push({ type: "image", image_url: a.url, alt_text: str(a.name) || "captura" });
      }

      const ok = await postSlackBlocks(token, channel, `Informe ${tipoLabel} de ${authorName} — ${cname}`, blocks);
      if (ok) sent++; else skipped.push(cname);
    }

    return json({ ok: true, sent, skipped });
  } catch (e) {
    console.error("informe-slack error", e);
    return json({ ok: false, error: String(e) }, 200);
  }
});
