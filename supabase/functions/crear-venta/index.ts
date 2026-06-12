// supabase/functions/crear-venta/index.ts
// Formulario publico de carga de venta -> da de alta un cliente en operaciones.
//
// Recibe el POST del formulario publico (sin login), valida una contraseña de
// equipo y crea, con service role (bypass RLS):
//   1. El cliente en `clients` (replicando mkClient del panel).
//   2. Una factura 'pendiente' por lo que pagó el cliente.
//   3. Las tareas del roadmap en `tasks` (replicando createDefaultTasks).
//   4. Un resumen (preguntas-respuestas) al canal de Slack #onboarding-clientes.
//
// verify_jwt: false  (la auth la hace este codigo con la passphrase).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FORM_SECRET = Deno.env.get("VENTA_FORM_SECRET") ?? "";
// Webhook entrante de Slack para #onboarding-clientes. Fuente: env var o
// app_settings(key='venta_form_config').slack_webhook. Si falta, no se postea.
const SLACK_WEBHOOK_ENV = Deno.env.get("SLACK_ONBOARDING_WEBHOOK") ?? "";
// Apps Script (Web App) que escribe el alta en la planilla de finanzas. Fuente: env var
// o app_settings(key='venta_form_config').finanzas_sheet_url/secret. Si falta, no se escribe.
const FINANZAS_SHEET_URL_ENV = Deno.env.get("FINANZAS_SHEET_URL") ?? "";
const FINANZAS_SHEET_SECRET_ENV = Deno.env.get("FINANZAS_SHEET_SECRET") ?? "";

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function rnd(n = 6): string {
  return Math.random().toString(36).slice(2, 2 + n);
}

const CLIENT_COLORS = ["#5B7CF5", "#22C55E", "#EAB308", "#F97316", "#8B5CF6", "#06B6D4", "#EC4899"];

// Steps legacy (JSONB clients.steps) — mismo orden/deps que PROCESS_STEPS.
const LEGACY_STEPS_DEPS: string[][] = [
  [], [], [],
  [],
  ["onboarding"],
  ["estrategia"],
  ["estrategia"],
  ["estrategia"],
  ["guiones-ads", "guion-vsl", "landing-texto"],
  ["revision"],
  ["correcciones"],
  ["grabacion"],
  ["landing-texto", "revision"],
  ["diseno"],
  ["revision-dis"],
  [],
  ["vincular"],
  ["codigo", "cargar-saldo"],
  ["reunion"],
  ["lanzamiento"],
];

function buildLegacySteps() {
  return LEGACY_STEPS_DEPS.map((deps) => ({
    status: "pending",
    startDate: "",
    endDate: "",
    responsible: "",
    notes: "",
    dependsOn: [...deps],
  }));
}

const DEFAULT_PENDING_RESOURCES = [
  { label: "Logo en alta resolución", description: "Versión vectorial (.svg/.ai) o PNG transparente 2000px+." },
  { label: "Paleta de colores", description: "Si no tenés definida, decinos qué colores te gustan o representan tu marca." },
  { label: "Tipografía", description: "Fuente que usás en tu marca o referencias visuales que te gusten." },
  { label: "Imágenes profesionales tuyas", description: "Fotos de retrato, en cámara o producción profesional." },
  { label: "Imágenes de estilo de vida, viajes, con la familia", description: "Fotos reales que muestren tu día a día, lugares y entorno." },
  { label: "Imágenes y videos corporativos", description: "Eventos, escenarios, premios, material general de autoridad." },
  { label: "Grabación horizontal de mínimo 3 testimonios", description: "Para la landing page (producto y/o oportunidad). Horizontales, buena luz y audio." },
  { label: "Presentaciones grabadas en YouTube u otra plataforma", description: "Charlas, masterclasses o talks tuyos disponibles online." },
  { label: "PDF de la empresa, plan de compensación e info corporativa", description: "Material oficial del producto u oportunidad que representás." },
  { label: "Lista de competidores o referentes", description: "Cuentas, marcas o personas que admires o que sigan tu mismo público." },
  { label: "Agendar sesión para configurar Meta de FB/IG", description: "Coordinar llamada con nuestro equipo para dejar el Business Manager listo." },
];

function buildPendingResources() {
  return DEFAULT_PENDING_RESOURCES.map((it, i) => ({
    id: `pr_${Date.now()}_${i}_${rnd(4)}`,
    label: it.label,
    description: it.description,
    done: false,
  }));
}

// Fallback minimo si app_settings no tuviera roadmap_template.
const FALLBACK_TASKS = [
  { id: "registro", name: "Registro en finanzas", phaseId: "pre-onboarding", assignee: "Zil Oliveros", dependsOn: [], isClientTask: false, daysFromUnblock: 1 },
  { id: "onboarding", name: "Reunion de Onboarding", phaseId: "onboarding", assignee: "Matias Braszka", dependsOn: [], isClientTask: true, daysFromUnblock: 2 },
];

interface TplTask {
  id: string;
  name: string;
  phaseId?: string;
  phase?: string;
  assignee?: string;
  dependsOn?: string[];
  isClientTask?: boolean;
  client?: boolean;
  daysFromUnblock?: number;
  days?: number;
}

// Replica createDefaultTasks(): genera filas de `tasks` (snake_case) remapeando deps.
function buildTasks(clientId: string, taskList: TplTask[]) {
  const tplIdToNewId: Record<string, string> = {};
  const prepared = taskList.map((tpl) => {
    const newId = `t_${Date.now()}_${rnd(6)}_${tpl.id}`;
    tplIdToNewId[tpl.id] = newId;
    return { tpl, newId };
  });
  const created = today();
  return prepared.map(({ tpl, newId }) => {
    const phaseId = tpl.phaseId ?? tpl.phase ?? null;
    const isClientTask = tpl.isClientTask !== undefined ? tpl.isClientTask : !!tpl.client;
    const dfuRaw = tpl.daysFromUnblock !== undefined ? tpl.daysFromUnblock : tpl.days;
    const dfu = dfuRaw != null ? Number(dfuRaw) : null;
    const remappedDeps = (tpl.dependsOn ?? []).map((d) => tplIdToNewId[d] ?? d);
    return {
      id: newId,
      title: tpl.name,
      client_id: clientId,
      phase: phaseId,
      status: "backlog",
      assignee: tpl.assignee ?? "",
      priority: "normal",
      step_idx: null,
      depends_on: remappedDeps,
      is_roadmap_task: true,
      template_id: tpl.id,
      estimated_days: dfu != null ? Math.round(dfu) : null,
      days_from_unblock: dfu,
      is_client_task: isClientTask,
      notes: "",
      description: "",
      created_date: created,
      started_date: null,
      completed_date: null,
      blocked_since: null,
      due_date: null,
      accumulated_days: 0,
      timer_started_at: null,
      enabled_date: null,
    };
  });
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function str(v: unknown): string {
  return v === null || v === undefined ? "" : String(v).trim();
}

const COMMISSION_KEYS = [
  "setup_conector",
  "crm_cliente",
  "crm_afiliados",
  "crm_conector",
  "publicidad_cliente",
  "publicidad_conector",
];

// Etiquetas legibles para el resumen de Slack (agrupadas por rol).
const COMMISSION_LABELS: Record<string, string> = {
  setup_conector: "Setup (Conector)",
  crm_conector: "CRM (Conector)",
  publicidad_conector: "Publicidad (Conector)",
  crm_cliente: "CRM (Cliente)",
  publicidad_cliente: "Publicidad (Cliente)",
  crm_afiliados: "CRM (Afiliados)",
};

// Menciones fijas en #onboarding-clientes: Zil (asistente) y Sioux (abogada).
const ONBOARDING_MENTIONS = "<@U0AES9MPG8K> <@U0B3Z89122D>";

const PAYMENT_LABELS: Record<string, string> = {
  stripe: "Stripe",
  transferencia: "Transferencia",
  paypal: "PayPal",
  mercury: "Mercury",
  efectivo: "Efectivo",
  otro: "Otro",
};

function fmtMoney(v: number | null, cur: string): string {
  if (v === null) return "—";
  try {
    return `${cur} ${new Intl.NumberFormat("es-AR").format(v)}`;
  } catch {
    return `${cur} ${v}`;
  }
}

// Arma el mensaje de Slack con todas las preguntas-respuestas del closer.
function buildSlackSummary(args: {
  body: Record<string, unknown>;
  isTest: boolean;
  clientName: string;
  clientId: string;
  billingAmount: number | null;
  currency: string;
  cashCollect: number | null;
  remaining: number | null;
  installments: number;
  nextCharge: string | null;
  commission: Record<string, number>;
  receiptUrl: string | null;
  driveFolderUrl: string | null;
  onboardingUrl: string | null;
  slackChannel: string | null;
}): string {
  const b = args.body;
  const L: string[] = [];
  const line = (label: string, value: string) => {
    const v = value && value.trim() ? value.trim() : "—";
    L.push(`• *${label}:* ${v}`);
  };

  const header = args.isTest ? "🧪 *[PRUEBA] Nueva venta cargada*" : "🎉 *Nueva venta cargada*";
  L.push(`${header} — *${args.clientName}*`);
  const cargadoPor = str(b.closer) || "—";
  const conector = str(b.conector) || "—";
  L.push(`Cargado por: ${cargadoPor}  ·  Conector: ${conector}`);
  // En ventas reales etiqueta a Zil y Sioux; en pruebas no, para no molestarlos.
  if (!args.isTest) L.push(`👋 ${ONBOARDING_MENTIONS}`);
  L.push("");

  L.push("*👤 Cliente*");
  line("Fecha", str(b.start_date));
  line("Nombre", str(b.name));
  line("Correo Lead", str(b.email));
  line("Teléfono", str(b.phone));
  line("País", str(b.country));
  const tipo = str(b.client_type);
  if (tipo) line("Empresa o Líder", tipo);
  const niche = str(b.niche);
  if (niche) line("Empresa MLM", niche);
  L.push("");

  L.push("*💰 Venta*");
  line("Valor del servicio cerrado", fmtMoney(args.billingAmount, args.currency));
  line("CashCollect (cobrado)", fmtMoney(args.cashCollect, args.currency));
  line("Restante por cobrar", fmtMoney(args.remaining, args.currency));
  const pm = str(b.payment_method);
  line("Medio de pago", PAYMENT_LABELS[pm.toLowerCase()] ?? pm);
  line("Cuotas", String(args.installments));
  if (args.installments > 1) line("Próximo cobro", args.nextCharge ?? "—");
  L.push("");

  L.push("*📑 Contrato y soporte*");
  line("Datos del contrato", str(b.contract_data));
  const rec = str(b.call_recording_url);
  L.push(`• *Grabación de llamada:* ${rec ? `<${rec}|ver grabación>` : "—"}`);
  L.push(`• *Comprobante de pago:* ${args.receiptUrl ? `<${args.receiptUrl}|ver comprobante>` : "—"}`);
  L.push(`• *📁 Carpeta de Drive:* ${args.driveFolderUrl ? `<${args.driveFolderUrl}|abrir carpeta>` : "—"}`);
  L.push(`• *📝 Onboarding:* ${args.onboardingUrl ? `<${args.onboardingUrl}|abrir documento>` : "—"}`);
  if (args.slackChannel) L.push(`• *💬 Canal:* #${args.slackChannel}`);
  L.push("");

  const comLines = COMMISSION_KEYS
    .filter((k) => (args.commission[k] ?? 0) > 0)
    .map((k) => `• *${COMMISSION_LABELS[k] ?? k}:* ${args.commission[k]}%`);
  if (comLines.length) {
    L.push("*📊 Reparto de comisiones*");
    L.push(...comLines);
    L.push("");
  }

  const notes = str(b.notes);
  if (notes) {
    L.push("*📝 Notas internas*");
    L.push(notes);
    L.push("");
  }

  L.push(`_Cliente creado en el panel · id: ${args.clientId}_`);
  return L.join("\n");
}

// Convierte una fecha YYYY-MM-DD a DD-MM-AAAA para el nombre de la carpeta.
function toDDMMYYYY(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : isoDate;
}

// Llama al Apps Script (Web App) que crea la estructura de carpetas en Drive,
// duplica el onboarding y comparte con el email del cliente. Devuelve las URLs de
// la carpeta del cliente y del doc de onboarding (o null si falla). Nunca lanza.
interface DriveResult {
  folderUrl: string;
  docUrl: string | null;
  delDocUrl: string | null;               // doc de trabajo "DEL"
  strategyName: string | null;            // nombre de la carpeta de estrategia
  subfolders: Record<string, string>;     // { "1. Anuncios (Audiovisual)": url, ... }
}
async function createDriveStructure(args: {
  url: string;
  secret: string;
  name: string;
  empresa: string;
  emails: string[];
  fecha: string;
  structure: Record<string, unknown>;
}): Promise<DriveResult | null> {
  if (!args.url) return null;
  const ctrl = new AbortController();
  // La creacion de toda la estructura + onboarding + sharing puede tardar ~30-40s.
  const timer = setTimeout(() => ctrl.abort(), 90000);
  try {
    const r = await fetch(args.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret: args.secret,
        name: args.name,
        empresa: args.empresa,
        emails: args.emails,
        email: args.emails[0] ?? "",
        fecha: args.fecha,
        structure: args.structure,
      }),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (data && data.ok && typeof data.folderUrl === "string") {
      return {
        folderUrl: data.folderUrl,
        docUrl: typeof data.docUrl === "string" ? data.docUrl : null,
        delDocUrl: typeof data.delDocUrl === "string" ? data.delDocUrl : null,
        strategyName: typeof data.strategyName === "string" ? data.strategyName : null,
        subfolders: (data.subfolders && typeof data.subfolders === "object") ? data.subfolders : {},
      };
    }
    console.error("crear-venta: apps script no ok", r.status, data);
    return null;
  } catch (e) {
    console.error("crear-venta: fallo el apps script de drive", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Llama al Apps Script (Web App) que da de alta el cliente en la planilla de finanzas:
// agrega una fila en "Base de datos", "Acuerdos" e "Ingresos" (action: "alta_cliente").
// Devuelve los nros de fila escritos, o null si falla/no esta configurado. Nunca lanza.
interface FinanzasResult {
  rows: { baseDatos: number; acuerdos: number; ingresos: number };
}
async function cargarEnFinanzas(args: {
  url: string;
  secret: string;
  payload: Record<string, unknown>;
}): Promise<FinanzasResult | null> {
  if (!args.url) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(args.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret: args.secret, action: "alta_cliente", ...args.payload }),
      redirect: "follow",
      signal: ctrl.signal,
    });
    const data = await r.json().catch(() => null);
    if (data && data.ok && data.rows) return { rows: data.rows as FinanzasResult["rows"] };
    console.error("crear-venta: finanzas sheet no ok", r.status, data);
    return null;
  } catch (e) {
    console.error("crear-venta: fallo el apps script de finanzas", e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// Postea el resumen al webhook de Slack. Nunca lanza (no debe romper la venta).
async function postSlack(webhook: string, text: string): Promise<void> {
  if (!webhook) return;
  try {
    const r = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, unfurl_links: false }),
    });
    if (!r.ok) console.error("crear-venta: slack respondio", r.status, await r.text());
  } catch (e) {
    console.error("crear-venta: fallo el post a slack", e);
  }
}

// Arma el mensaje de handoff (el que el closer copia para el cliente) a partir de
// la plantilla de la config, sustituyendo los links. Fallback minimo si no hay plantilla.
function buildHandoff(template: string, calendarLink: string, onboardingUrl: string | null): string {
  const tpl = template ||
    "Acá les dejamos el *onboarding* para completar.\n\n📅 Calendario para agendar:\n{CALENDAR_LINK}\n\n📝 Documento de onboarding:\n{ONBOARDING_LINK}";
  return tpl
    .replaceAll("{CALENDAR_LINK}", calendarLink || "")
    .replaceAll("{ONBOARDING_LINK}", onboardingUrl || "(se generará la carpeta del cliente)");
}

// Convierte "Matias Braszka" + "InCruises" en "matias-braszka-incruises":
// nombre con guiones, empresa con palabras pegadas, sin acentos ni invalidos, max 80.
function slugifyChannel(name: string, empresa: string): string {
  const strip = (s: string) =>
    s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const namePart = strip(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  const empPart = strip(empresa).replace(/[^a-z0-9]+/g, "");
  let s = empPart ? `${namePart}-${empPart}` : namePart;
  s = s.replace(/-+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/g, "");
  return s || "cliente";
}

async function slackApi(token: string, method: string, payload: Record<string, unknown>) {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  return await r.json();
}

// Crea el canal PRIVADO del cliente e invita a todo el equipo menos los excluidos.
// Devuelve { id, name } o null. Nunca lanza.
async function createSlackChannel(args: {
  token: string;
  baseName: string;
  excludeIds: string[];
  onlyUsers?: string[]; // si viene (modo prueba), invita SOLO a estos (no a todo el equipo)
}): Promise<{ id: string; name: string } | null> {
  if (!args.token || !args.baseName) return null;
  try {
    // Crear canal (si el nombre esta tomado, probar con sufijos -2..-6).
    let channel: { id: string; name: string } | null = null;
    for (let i = 1; i <= 6 && !channel; i++) {
      const tryName = i === 1 ? args.baseName : `${args.baseName}-${i}`.slice(0, 80);
      const res = await slackApi(args.token, "conversations.create", { name: tryName, is_private: true });
      if (res.ok) channel = { id: res.channel.id, name: res.channel.name };
      else if (res.error !== "name_taken") {
        console.error("crear-venta: slack conversations.create fallo", res.error);
        break;
      }
    }
    if (!channel) return null;

    // A quién invitar: en prueba SOLO onlyUsers; en real, todo el equipo menos excluidos.
    let ids: string[];
    if (args.onlyUsers && args.onlyUsers.length) {
      ids = args.onlyUsers;
    } else {
      const exclude = new Set(args.excludeIds || []);
      const list = await slackApi(args.token, "users.list", { limit: 500 });
      ids = (list.ok && Array.isArray(list.members))
        ? list.members
            .filter((m: Record<string, unknown>) =>
              !m.is_bot && !m.deleted && m.id !== "USLACKBOT" && !exclude.has(m.id as string))
            .map((m: Record<string, unknown>) => m.id as string)
        : [];
    }
    if (ids.length) {
      const inv = await slackApi(args.token, "conversations.invite", {
        channel: channel.id,
        users: ids.join(","),
      });
      if (!inv.ok && inv.error !== "already_in_channel") {
        console.error("crear-venta: slack conversations.invite", inv.error, inv.errors);
      }
    }
    return channel;
  } catch (e) {
    console.error("crear-venta: fallo creando canal de slack", e);
    return null;
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "invalid_json" });
  }

  // Config del formulario en app_settings(key='venta_form_config'): de ahi salen
  // el secreto (si no esta el env var) y el webhook de Slack (si no esta el env var).
  let cfg: Record<string, unknown> = {};
  try {
    const { data: s } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "venta_form_config")
      .maybeSingle();
    cfg = (s?.value as Record<string, unknown>) ?? {};
  } catch (_e) { /* ignore */ }

  // Auth por passphrase (la envia el formulario automaticamente).
  const expectedSecret = FORM_SECRET || str(cfg.secret);
  const slackWebhook = SLACK_WEBHOOK_ENV || str(cfg.slack_webhook);
  const appscriptUrl = str(cfg.appscript_url);
  const appscriptSecret = str(cfg.appscript_secret);
  const slackBotToken = str(cfg.slack_bot_token);
  const finanzasUrl = FINANZAS_SHEET_URL_ENV || str(cfg.finanzas_sheet_url);
  const finanzasSecret = FINANZAS_SHEET_SECRET_ENV || str(cfg.finanzas_sheet_secret);

  // Config editable del onboarding (mensajes, carpetas, links, excluidos) en app_settings('global').
  let globalSettings: Record<string, unknown> = {};
  try {
    const { data: g } = await supabase
      .from("app_settings")
      .select("value")
      .eq("key", "global")
      .maybeSingle();
    globalSettings = (g?.value as Record<string, unknown>) ?? {};
  } catch (_e) { /* ignore */ }
  const onboardingCfg = (globalSettings.onboarding_config ?? {}) as Record<string, unknown>;
  // Defaults editables desde admin para el alta en la planilla de finanzas.
  const finDefaults = (globalSettings.finanzas_defaults ?? {}) as Record<string, unknown>;

  if (!expectedSecret || str(body.passphrase) !== expectedSecret) {
    return json(401, { error: "unauthorized", message: "No autorizado." });
  }

  const name = str(body.name);
  if (!name) return json(400, { error: "missing_name", message: "El nombre del cliente es obligatorio." });

  // Modo prueba: crea todo igual pero deja las tareas SIN asignar, asi el trigger
  // notify_on_task_change no notifica a nadie. El nombre se prefija con [PRUEBA].
  const isTest = body.test === true;
  const displayName = isTest ? `[PRUEBA] ${name}` : name;

  const incoming = (body.commission_split ?? {}) as Record<string, unknown>;
  const commission_split: Record<string, number> = {};
  for (const k of COMMISSION_KEYS) commission_split[k] = num(incoming[k]) ?? 0;

  const { count: clientCount } = await supabase
    .from("clients")
    .select("id", { count: "exact", head: true });
  const color = CLIENT_COLORS[(clientCount ?? 0) % CLIENT_COLORS.length];

  const startDate = str(body.start_date) || today();
  const clientId = `c_${Date.now()}_${rnd(6)}`;
  // Código Korex corto (KX-XXXXX): la abogada lo pega en el contrato de DocuSign
  // para que el webhook vincule el sobre con este cliente.
  const korexCode = `KX-${rnd(5).toUpperCase()}`;

  // Calculos de la venta (autoritativos en el servidor):
  const installments = num(body.billing_installments) ?? 1;
  const billingAmount = num(body.billing_amount);
  const cashCollect = num(body.cash_collect);
  // Restante por cobrar = valor cerrado - cobrado (nunca negativo).
  const remaining = billingAmount != null ? Math.max(0, billingAmount - (cashCollect ?? 0)) : null;
  // Si es 1 sola cuota no hay proxima fecha de cobro.
  const nextCharge = installments > 1 ? (str(body.next_charge_date) || null) : null;
  const receiptUrl = str(body.payment_receipt_url) || null;

  const clientRow = {
    id: clientId,
    name: displayName,
    company: str(body.company),
    service: str(body.service),
    start_date: startDate,
    pm: "",
    color,
    status: "active",
    priority: 5,
    bottleneck: "",
    notes: str(body.notes),
    tier: "starter",
    conector: str(body.conector),
    closer: str(body.closer),
    contract_data: str(body.contract_data),
    contract_signer_email: str(body.signer_email) || null,
    korex_code: korexCode,
    niche: str(body.niche) || null,
    email: str(body.email) || null,
    country: str(body.country) || null,
    phone: str(body.phone),
    avatar_url: "",
    slack_channel: "",
    client_type: str(body.client_type) || null,
    billing_amount: billingAmount,
    billing_currency: str(body.billing_currency) || "USD",
    billing_cycle: "unico", // todas las ventas son pago único (en 1 o varias cuotas)
    billing_installments: installments,
    next_charge_date: nextCharge,
    payment_method: str(body.payment_method) || null,
    billing_status: "al_dia",
    cash_collect: cashCollect,
    remaining_to_collect: remaining,
    call_recording_url: str(body.call_recording_url) || null,
    payment_receipt_url: receiptUrl,
    commission_split,
    steps: buildLegacySteps(),
    pending_resources: buildPendingResources(),
    history: [{ text: "Cliente creado", date: startDate, color: "#5B7CF5" }],
  };

  const { error: cErr } = await supabase.from("clients").insert(clientRow);
  if (cErr) {
    console.error("crear-venta: error insert cliente", cErr);
    return json(500, { error: "client_insert_failed", message: cErr.message });
  }

  // Factura PENDIENTE (a emitir) por el valor de la venta — todavía no está hecha.
  // OJO: el comprobante de pago NO va acá (es otra cosa); queda en
  // clients.payment_receipt_url y se muestra aparte en el panel.
  let invoiceCreated = false;
  const invoiceAmount = billingAmount ?? cashCollect;
  if (invoiceAmount != null && invoiceAmount > 0) {
    const { error: iErr } = await supabase.from("invoices").insert({
      id: `inv_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
      client_id: clientId,
      number: "",
      issue_date: startDate,
      amount: invoiceAmount,
      currency: "USD",
      concept: isTest ? "PRUEBA - Venta cerrada" : "Venta cerrada",
      status: "pendiente",
      kind: "ingreso",
      payment_method: str(body.payment_method) || null,
    });
    if (iErr) console.error("crear-venta: error insert factura", iErr);
    else invoiceCreated = true;
  }

  // Sembrar tareas del roadmap (template real desde app_settings, igual que el panel).
  let taskList: TplTask[] = FALLBACK_TASKS;
  const tpl = (globalSettings.roadmap_template as { tasks?: TplTask[] } | undefined);
  if (tpl && Array.isArray(tpl.tasks) && tpl.tasks.length > 0) taskList = tpl.tasks;

  // En modo prueba las tareas van sin asignar para no disparar notificaciones.
  const tasks = buildTasks(clientId, taskList).map((t) => (isTest ? { ...t, assignee: "" } : t));
  const { error: tErr } = await supabase.from("tasks").insert(tasks);
  if (tErr) {
    console.error("crear-venta: error insert tareas", tErr);
    return json(207, {
      ok: true,
      client_id: clientId,
      tasks_created: 0,
      invoice_created: invoiceCreated,
      warning: "Cliente creado pero fallo la creacion de tareas: " + tErr.message,
    });
  }

  // Emails con acceso a la carpeta: el lead + los extras que cargó el closer.
  const accessEmailsRaw = Array.isArray(body.access_emails) ? (body.access_emails as unknown[]) : [];
  const accessEmails = Array.from(
    new Set([str(body.email), ...accessEmailsRaw.map((e) => str(e))].filter(Boolean)),
  );

  // Crear la estructura de carpetas en Google Drive + duplicar onboarding y
  // compartir con los emails (via Apps Script). Estructura/nombres vienen de la
  // config editable del panel (con fallback en el propio Apps Script). Si falla,
  // el cliente igual queda creado. En prueba el folder queda como [PRUEBA].
  let driveFolderUrl: string | null = null;
  let onboardingUrl: string | null = null;
  let delDocUrl: string | null = null;
  if (appscriptUrl) {
    const drive = await createDriveStructure({
      url: appscriptUrl,
      secret: appscriptSecret,
      name: displayName,
      empresa: str(body.niche),
      emails: accessEmails,
      fecha: toDDMMYYYY(startDate),
      structure: {
        subfolders: onboardingCfg.subfolders,
        nested: onboardingCfg.nested,
        strategy_folder: onboardingCfg.strategy_folder,
        doc_title: onboardingCfg.doc_title,
        del_doc_title: onboardingCfg.del_doc_title,
      },
    });
    if (drive) {
      driveFolderUrl = drive.folderUrl;
      onboardingUrl = drive.docUrl;
      delDocUrl = drive.delDocUrl;
      const { error: dErr } = await supabase
        .from("clients")
        .update({ drive_folder_url: driveFolderUrl })
        .eq("id", clientId);
      if (dErr) console.error("crear-venta: error guardando drive_folder_url", dErr);

      // Estrategia del cliente en el panel (pestaña Estrategias) con el nombre de la
      // carpeta de estrategia y los links de las carpetas principales del Drive, para
      // que el equipo acceda directo. El onboarding se suma como documento.
      const archivos: { label: string; url: string; category: string }[] = Object.entries(
        drive.subfolders,
      ).map(([label, url]) => ({ label, url, category: "folder" }));
      if (onboardingUrl) archivos.push({ label: "Onboarding", url: onboardingUrl, category: "doc" });
      if (drive.delDocUrl) archivos.push({ label: "DEL", url: drive.delDocUrl, category: "doc" });
      if (archivos.length) {
        const { error: sErr } = await supabase.from("strategies").insert({
          id: `strat_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
          client_id: clientId,
          name: drive.strategyName || "Estrategia #1 | [A DEFINIR]",
          status: "borrador",
          version: "v1",
          position: 0,
          start_date: startDate,
          archivos,
          folders: [],
          docs: [],
          drive_url: null,
          accesos: [],
        });
        if (sErr) console.error("crear-venta: error creando estrategia", sErr);
      }
    }
  }

  // Alta en la planilla de finanzas (Base de datos + Acuerdos + Ingresos) via Apps
  // Script. Escribe el MISMO nombre en las 3 hojas para que las formulas de Ingresos /
  // Seguimiento de Pagos resuelvan. No bloquea ni rompe la venta si falla o no esta
  // configurado. En modo prueba escribe con el nombre [PRUEBA] (asi se identifica y borra).
  let finanzasRows: FinanzasResult["rows"] | null = null;
  if (finanzasUrl) {
    const fin = await cargarEnFinanzas({
      url: finanzasUrl,
      secret: finanzasSecret,
      payload: {
        test: isTest,
        cliente: displayName,
        conector: str(body.conector),
        email: str(body.email),
        telefono: str(body.phone),
        company: str(body.company),
        clientType: str(body.client_type),
        // Datos del contrato para Base de datos (I/J/K/L): persona/empresa + dirección + fiscal.
        facturarA: str(body.signer_type).toLowerCase() === "empresa" ? "Empresa" : "personas",
        billingAddress: str(body.billing_address),
        fiscalId: str(body.fiscal_id),
        service: str(body.service),
        fecha: startDate,
        setter: str(body.setter),
        closer: str(body.closer),
        billingAmount,
        cashCollect,
        currency: str(body.billing_currency) || "USD",
        paymentMethod: str(body.payment_method),
        commissions: commission_split,
        // Defaults configurables desde admin (con fallback en el Apps Script).
        fxRate: num(finDefaults.eur_usd_rate),
        stripeFeePct: num(finDefaults.stripe_fee_pct),
        marketingPerson: str(finDefaults.marketing_person),
        crmMarketingPct: num(finDefaults.crm_marketing_pct),
        publicidadMarketingPct: num(finDefaults.publicidad_marketing_pct),
      },
    });
    if (fin) finanzasRows = fin.rows;
  }

  // Canal de Slack PRIVADO del cliente (#nombre-apellido-empresa) + invitar al
  // equipo (menos los excluidos de la config). Necesita slack_bot_token configurado.
  let slackChannelName: string | null = null;
  if (slackBotToken) {
    const excludeIds = Array.isArray(onboardingCfg.slack_exclude_ids)
      ? (onboardingCfg.slack_exclude_ids as unknown[]).map((x) => String(x))
      : [];
    // En modo prueba el canal solo suma a estos (por defecto Matias), no a todo el equipo.
    const testInviteIds = Array.isArray(onboardingCfg.slack_test_invite_ids) &&
      (onboardingCfg.slack_test_invite_ids as unknown[]).length
      ? (onboardingCfg.slack_test_invite_ids as unknown[]).map((x) => String(x))
      : ["U0AJHJ6C2G7"]; // Matias Braszka
    const ch = await createSlackChannel({
      token: slackBotToken,
      baseName: slugifyChannel(displayName, str(body.niche)),
      excludeIds,
      onlyUsers: isTest ? testInviteIds : [],
    });
    if (ch) {
      slackChannelName = ch.name;
      const { error: scErr } = await supabase
        .from("clients")
        .update({ slack_channel: ch.name, slack_channel_id: ch.id })
        .eq("id", clientId);
      if (scErr) console.error("crear-venta: error guardando slack_channel", scErr);
      try {
        const lines = [
          `:wave: *Canal de ${displayName}* creado. Acá coordinamos el onboarding y la entrega.`,
          "",
          `:file_folder: *Carpeta general del cliente:* ${driveFolderUrl ? `<${driveFolderUrl}|abrir carpeta>` : "—"}`,
          `:memo: *Onboarding del cliente:* ${onboardingUrl ? `<${onboardingUrl}|abrir documento>` : "—"}`,
          `:page_facing_up: *DEL (Documento de trabajo):* ${delDocUrl ? `<${delDocUrl}|abrir documento>` : "—"}`,
          "",
          `:lock: *Código Korex (para el contrato en DocuSign):* \`${korexCode}\``,
          `_Al armar el contrato, pegá este código en el asunto del sobre para vincularlo solo a este cliente._`,
        ];
        await slackApi(slackBotToken, "chat.postMessage", {
          channel: ch.id,
          text: lines.join("\n"),
          unfurl_links: false,
        });
      } catch (_e) { /* ignore */ }
    }
  }

  // Mensaje de handoff para el cliente (plantilla editable + links).
  const handoffMessage = buildHandoff(
    str(onboardingCfg.onboarding_handoff_msg),
    str(onboardingCfg.calendar_link),
    onboardingUrl,
  );

  // Resumen a Slack #onboarding-clientes con todas las preguntas-respuestas del
  // closer. No bloquea ni rompe la venta si Slack falla o no esta configurado.
  const slackText = buildSlackSummary({
    body,
    isTest,
    clientName: displayName,
    clientId,
    billingAmount,
    currency: str(body.billing_currency) || "USD",
    cashCollect,
    remaining,
    installments,
    nextCharge,
    commission: commission_split,
    receiptUrl,
    driveFolderUrl,
    onboardingUrl,
    slackChannel: slackChannelName,
  });
  await postSlack(slackWebhook, slackText);

  return json(200, {
    ok: true,
    client_id: clientId,
    tasks_created: tasks.length,
    invoice_created: invoiceCreated,
    test: isTest,
    folder_url: driveFolderUrl,
    onboarding_url: onboardingUrl,
    handoff_message: handoffMessage,
    slack_channel: slackChannelName,
    finanzas_rows: finanzasRows,
  });
});
