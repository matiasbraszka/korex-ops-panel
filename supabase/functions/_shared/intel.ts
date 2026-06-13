// _shared/intel.ts — utilidades compartidas por los análisis de soporte.
// Identificación de Korex, armado de transcripts, resolución grupo→cliente,
// y los puentes a Google Docs (Apps Script) y Slack.
//
// deno-lint-ignore-file no-explicit-any

const TZ = "America/Argentina/Buenos_Aires";

export interface SoporteCfg {
  analysis_model?: string;
  korex_responder_phones?: string[];
  support_guide_doc_url?: string;
  docs_script_url?: string;
  docs_script_secret?: string;
  briefings_doc_url?: string;
  satisfaction_doc_url?: string;
  pending_doc_url?: string;
  usuarios_tag_label?: string;
  clientes_tag_label?: string;
  intel_slack_pendientes_channel?: string;
  intel_slack_informe_channel?: string;
  cron_secret?: string;
  tags?: { id: string; label: string }[];
  tag_client_aliases?: Record<string, string>;
  // (server_url / evolution_api_key etc. también viven acá pero no se usan aquí)
}

export interface WaMessage {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  sender_jid?: string | null;
  msg_type?: string | null;
  body?: string | null;
  wa_timestamp?: string | null;
  created_at?: string | null;
}

export interface WaConversation {
  id: string;
  wa_jid: string;
  wa_phone?: string | null;
  is_group?: boolean;
  wa_profile_name?: string | null;
  client_id?: string | null;
  tags?: string[] | null;
}

// ── Config ────────────────────────────────────────────────────────────────────
export async function loadConfig(admin: any): Promise<SoporteCfg> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "soporte_config").maybeSingle();
  return (data?.value as SoporteCfg) ?? {};
}

// ── Teléfonos / Korex ──────────────────────────────────────────────────────────
// Normaliza a solo dígitos (E.164 sin '+'). De un jid "549...@s.whatsapp.net"
// o de un teléfono suelto.
export function normPhone(v?: string | null): string {
  if (!v) return "";
  const at = String(v).split("@")[0];
  return at.replace(/\D/g, "");
}

export function korexSet(cfg: SoporteCfg): Set<string> {
  const set = new Set<string>();
  for (const p of cfg.korex_responder_phones || []) {
    const n = normPhone(p);
    if (n) set.add(n);
  }
  return set;
}

// Un mensaje cuenta como respuesta de Korex si salió del WhatsApp de soporte
// (direction='out') o si lo escribió un número del equipo (soporte/Matías/Cristian).
export function isKorex(msg: WaMessage, korex: Set<string>): boolean {
  if (msg.direction === "out") return true;
  const ph = normPhone(msg.sender_jid);
  return ph !== "" && korex.has(ph);
}

// ── Transcript compacto para la IA ──────────────────────────────────────────────
const MEDIA_LABEL: Record<string, string> = {
  imageMessage: "[imagen]", videoMessage: "[video]", audioMessage: "[audio]",
  documentMessage: "[documento]", stickerMessage: "[sticker]", locationMessage: "[ubicación]",
};

function fmtTs(iso?: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("es-AR", {
      timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  } catch { return ""; }
}

// Devuelve el transcript como texto, marcando claramente quién es Korex.
export function buildTranscript(messages: WaMessage[], korex: Set<string>): string {
  const lines: string[] = [];
  for (const m of messages) {
    const when = fmtTs(m.wa_timestamp || m.created_at);
    const who = isKorex(m, korex) ? "KOREX" : `USUARIO(${normPhone(m.sender_jid) || m.direction})`;
    let text = (m.body || "").trim();
    if (!text) text = MEDIA_LABEL[m.msg_type || ""] || "";
    if (!text) continue;
    lines.push(`[${when}] ${who}: ${text}`);
  }
  return lines.join("\n");
}

// ── Etiquetas y resolución grupo→cliente ────────────────────────────────────────
// IDs de etiqueta cuyo label matchea (tolerante a guion/espacio y mayúsculas).
export function tagIdsByLabel(cfg: SoporteCfg, label: string): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
  const want = norm(label);
  return (cfg.tags || []).filter((t) => norm(t.label || "") === want).map((t) => t.id);
}

export function convHasAnyTag(conv: WaConversation, tagIds: string[]): boolean {
  const set = new Set(conv.tags || []);
  return tagIds.some((id) => set.has(id));
}

// Resuelve el cliente del grupo: client_id directo → alias por etiqueta →
// match del subject del grupo contra clients.name.
export function resolveClientId(
  conv: WaConversation,
  cfg: SoporteCfg,
  clientsByNameLower: Map<string, string>,
): string | null {
  if (conv.client_id) return conv.client_id;
  const aliases = cfg.tag_client_aliases || {};
  for (const tid of conv.tags || []) {
    if (aliases[tid]) return aliases[tid];
  }
  const subj = (conv.wa_profile_name || "").toLowerCase().trim();
  if (subj) {
    for (const [name, id] of clientsByNameLower) {
      if (name && (subj.includes(name) || name.includes(subj))) return id;
    }
  }
  return null;
}

// ── Mensajes de una conversación en un rango ────────────────────────────────────
export async function fetchMessagesSince(admin: any, convId: string, sinceIso: string): Promise<WaMessage[]> {
  const { data } = await admin
    .from("wa_messages")
    .select("id, conversation_id, direction, sender_jid, msg_type, body, wa_timestamp, created_at")
    .eq("conversation_id", convId)
    .gte("wa_timestamp", sinceIso)
    .order("wa_timestamp", { ascending: true })
    .limit(2000);
  return (data as WaMessage[]) ?? [];
}

// ── Google Docs (Apps Script) ────────────────────────────────────────────────────
// Best-effort: nunca rompe el análisis si Docs falla.
export async function postDocs(cfg: SoporteCfg, action: string, payload: any): Promise<boolean> {
  const url = (cfg.docs_script_url || "").trim();
  if (!url) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: cfg.docs_script_secret || "", action, ...payload }),
      signal: AbortSignal.timeout(30000),
    });
    return res.ok;
  } catch (e) {
    console.error(`intel.postDocs(${action}) error`, e);
    return false;
  }
}

// ── Slack ────────────────────────────────────────────────────────────────────────
export async function postSlack(token: string, channel: string, text: string): Promise<boolean> {
  if (!token || !channel) return false;
  try {
    const res = await fetch("https://slack.com/api/chat.postMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ channel, text, unfurl_links: false }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch (e) {
    console.error("intel.postSlack error", e);
    return false;
  }
}

// Token del bot de Slack (vive en venta_form_config, igual que contract-reminders).
export async function slackToken(admin: any): Promise<string> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "venta_form_config").maybeSingle();
  return String((data?.value as any)?.slack_bot_token || "");
}

// ── Misc ───────────────────────────────────────────────────────────────────────
export function isoDaysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

export function weekStartDate(): string {
  // lunes de la semana actual (YYYY-MM-DD), para indexar la serie semanal.
  const d = new Date();
  const day = (d.getUTCDay() + 6) % 7; // 0 = lunes
  d.setUTCDate(d.getUTCDate() - day);
  return d.toISOString().slice(0, 10);
}

// Auth de cron compartida (?secret= o x-cron-secret) contra soporte_config.cron_secret.
export function checkCron(req: Request, cfg: SoporteCfg): boolean {
  const url = new URL(req.url);
  const got = url.searchParams.get("secret") || req.headers.get("x-cron-secret") || "";
  return !!cfg.cron_secret && got === cfg.cron_secret;
}
