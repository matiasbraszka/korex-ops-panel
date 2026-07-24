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

// Resumen de la venta en HTML → se guarda como documento privado del cliente (del_client_extra_docs)
// y aparece en el grupo "DEL CLIENTE" de todos los DEL de ese cliente. Mismo contenido que el
// resumen de Slack, sin los links de Drive.
function buildSummaryHtml(args: {
  body: Record<string, unknown>;
  billingAmount: number | null;
  currency: string;
  cashCollect: number | null;
  remaining: number | null;
  installments: number;
  nextCharge: string | null;
  commission: Record<string, number>;
  receiptUrl: string | null;
}): string {
  const b = args.body;
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const row = (label: string, value: string) => `<p><strong>${label}:</strong> ${value && value.trim() ? esc(value) : "—"}</p>`;
  const H: string[] = [];
  H.push("<h2>👤 Cliente</h2>");
  H.push(row("Fecha", str(b.start_date)));
  H.push(row("Nombre", str(b.name)));
  H.push(row("Correo Lead", str(b.email)));
  H.push(row("Teléfono", str(b.phone)));
  H.push(row("País", str(b.country)));
  if (str(b.client_type)) H.push(row("Empresa o Líder", str(b.client_type)));
  if (str(b.niche)) H.push(row("Empresa MLM", str(b.niche)));
  H.push("<h2>💰 Venta</h2>");
  H.push(row("Valor del servicio cerrado", fmtMoney(args.billingAmount, args.currency)));
  H.push(row("CashCollect (cobrado)", fmtMoney(args.cashCollect, args.currency)));
  H.push(row("Restante por cobrar", fmtMoney(args.remaining, args.currency)));
  const pm = str(b.payment_method);
  H.push(row("Medio de pago", PAYMENT_LABELS[pm.toLowerCase()] ?? pm));
  H.push(row("Cuotas", String(args.installments)));
  if (args.installments > 1) H.push(row("Próximo cobro", args.nextCharge ?? "—"));
  H.push("<h2>📑 Contrato y soporte</h2>");
  H.push(row("Datos del contrato", str(b.contract_data)));
  const rec = str(b.call_recording_url);
  H.push(`<p><strong>Grabación de llamada:</strong> ${rec ? `<a href="${esc(rec)}">ver grabación</a>` : "—"}</p>`);
  H.push(`<p><strong>Comprobante de pago:</strong> ${args.receiptUrl ? `<a href="${esc(args.receiptUrl)}">ver comprobante</a>` : "—"}</p>`);
  const comLines = COMMISSION_KEYS.filter((k) => (args.commission[k] ?? 0) > 0).map((k) => `<li>${esc(COMMISSION_LABELS[k] ?? k)}: ${args.commission[k]}%</li>`);
  if (comLines.length) { H.push("<h2>📊 Reparto de comisiones</h2>"); H.push(`<ul>${comLines.join("")}</ul>`); }
  const notes = str(b.notes);
  if (notes) { H.push("<h2>📝 Notas internas</h2>"); H.push(`<p>${esc(notes).replace(/\n/g, "<br>")}</p>`); }
  return H.join("\n");
}

// Convierte una fecha YYYY-MM-DD a DD-MM-AAAA para el nombre de la carpeta.
function toDDMMYYYY(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(isoDate);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : isoDate;
}

// Suma meses a una fecha YYYY-MM-DD respetando fin de mes. Para el cronograma de cuotas.
function addMonthsIso(iso: string, months: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  let y = Number(m[1]);
  let mo = Number(m[2]) - 1 + months;
  const d = Number(m[3]);
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12;
  const last = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
  const day = Math.min(d, last);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${y}-${pad(mo + 1)}-${pad(day)}`;
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

// Carga el ingreso de la venta en el ÁREA DE FINANZAS del panel (tablas fin_*).
// Reemplaza al Google Sheet (que ya no se usa). Escribe el flujo completo:
// 1) Ingresos (fin_incomes), 2) Base de datos (fin_directory), 3) Acuerdos
// (fin_client_terms + fin_commission_rules), y recalcula las comisiones. Nunca lanza.
// Devuelve el id del ingreso creado (o null si fallo / no aplica).
async function cargarIngresoFinanzas(args: {
  clientId: string;
  clientName: string;
  conector: string;
  closer: string;
  startDate: string;
  billingAmount: number | null;
  cashCollect: number | null;
  currency: string;
  paymentMethod: string;
  fxRate: number | null;
  stripeFeePct: number | null;
  // Datos del contrato/cliente para Base de datos + Acuerdos.
  signerType: string;        // 'persona' | 'empresa'
  billingAddress: string;
  fiscalId: string;
  email: string;
  phone: string;
  empresa: string;           // empresa/MLM del cliente
  commission: Record<string, number>; // % que cargó el closer
  marketingPerson: string;
  crmMarketingPct: number | null;
  publiMarketingPct: number | null;
}): Promise<string | null> {
  try {
    const monto = args.cashCollect != null ? args.cashCollect : args.billingAmount;
    if (monto == null) return null;
    const cur = (args.currency || "USD").toUpperCase();
    let fx = args.fxRate; if (fx == null || fx <= 0) fx = 1.08; // EUR->USD
    const fee = args.stripeFeePct != null ? args.stripeFeePct : 4.5; // % Stripe
    const isStripe = args.paymentMethod.toLowerCase() === "stripe";
    let amountEur: number | null, amountUsd: number | null;
    if (cur === "EUR") { amountEur = monto; amountUsd = monto * fx; }
    else { amountUsd = monto; amountEur = monto / fx; }
    // Neto = base de comisiones. Stripe descuenta su fee; otros medios (USDT, etc.) = total.
    let netUsd = amountUsd;
    if (amountUsd != null && isStripe) netUsd = amountUsd * (1 - fee / 100);
    const estado = (args.billingAmount == null || (args.cashCollect != null && args.cashCollect >= args.billingAmount))
      ? "Depositado" : "Parcial";
    const r2 = (v: number | null) => v == null ? null : Math.round(v * 100) / 100;

    // ── 1) INGRESOS (fin_incomes) ──
    // sheet_row = max+1 (lo usa el motor para el umbral acumulado por cliente).
    const { data: maxRows } = await supabase
      .from("fin_incomes").select("sheet_row").order("sheet_row", { ascending: false, nullsFirst: false }).limit(1);
    const nextRow = ((maxRows && maxRows[0]?.sheet_row) || 0) + 1;
    const { data: incRow, error } = await supabase.from("fin_incomes").insert({
      sheet_row: nextRow,
      income_date: args.startDate,
      month_date: args.startDate.slice(0, 7) + "-01",
      client_id: args.clientId,
      client_name_sheet: args.clientName,
      payer_name: args.clientName,
      conector_name_sheet: args.conector || null,
      collected_by: "Korex",
      income_type: "SETUP",
      amount_eur: r2(amountEur),
      amount_usd: r2(amountUsd),
      net_usd: r2(netUsd),
      payment_method: args.paymentMethod || null,
      currency: cur,
      status: estado,
      closer: args.closer || null,
      raw: { source: "onboarding", client_id: args.clientId },
    }).select("id").single();
    if (error) { console.error("crear-venta: error insert fin_incomes", error); return null; }
    const incomeId: string | null = incRow?.id ?? null;

    // ── 2) BASE DE DATOS (fin_directory) ── solo si no existe ya por nombre.
    try {
      const { data: dir } = await supabase.from("fin_directory").select("id").ilike("nombre", args.clientName).limit(1);
      if (!dir || !dir.length) {
        const { data: dmax } = await supabase.from("fin_directory").select("sheet_row").order("sheet_row", { ascending: false, nullsFirst: false }).limit(1);
        await supabase.from("fin_directory").insert({
          nombre: args.clientName,
          tipo: "Cliente",
          cliente: args.clientName,
          conector: args.conector || null,
          email: args.email || null,
          telefono: args.phone || null,
          empresa: args.empresa || null,
          facturar_a: args.signerType.toLowerCase() === "empresa" ? "Empresa" : "personas",
          id_fiscal: args.fiscalId || null,
          dir_facturacion: args.billingAddress || null,
          ingreso_date: args.startDate,
          sheet_row: ((dmax && dmax[0]?.sheet_row) || 0) + 1,
        });
      }
    } catch (e) { console.error("crear-venta: error fin_directory", e); }

    // ── 3) ACUERDOS — config del cliente (fin_client_terms) ── uno por cliente.
    try {
      const { data: term } = await supabase.from("fin_client_terms").select("id").eq("client_id", args.clientId).limit(1);
      if (!term || !term.length) {
        await supabase.from("fin_client_terms").insert({
          client_id: args.clientId,
          sheet_client_name: args.clientName,
          service_value: args.billingAmount,
          conector_name: args.conector || null,
          conector_start_date: args.conector ? args.startDate : null,
          marketing_name: args.marketingPerson || null,
          marketing_start_date: args.marketingPerson ? args.startDate : null,
          agreement_date: args.startDate,
        });
      }
    } catch (e) { console.error("crear-venta: error fin_client_terms", e); }

    // ── 4) ACUERDOS — % por tipo×rol (fin_commission_rules) ── pct = fracción (20% -> 0.20). 0 se omite.
    try {
      const cs = args.commission || {};
      const crmMkt = (args.crmMarketingPct != null ? args.crmMarketingPct : 5) / 100;
      const publiMkt = (args.publiMarketingPct != null ? args.publiMarketingPct : 1) / 100;
      const rules = [
        { income_type: "SETUP", role_key: "conector", pct: (cs.setup_conector || 0) / 100 },
        { income_type: "CRM", role_key: "conector", pct: (cs.crm_conector || 0) / 100 },
        { income_type: "CRM", role_key: "cliente", pct: (cs.crm_cliente || 0) / 100 },
        { income_type: "CRM", role_key: "afiliado", pct: (cs.crm_afiliados || 0) / 100 },
        { income_type: "CRM", role_key: "marketing", pct: crmMkt },
        { income_type: "PUBLICIDAD", role_key: "conector", pct: (cs.publicidad_conector || 0) / 100 },
        { income_type: "PUBLICIDAD", role_key: "marketing", pct: publiMkt },
      ].filter((rule) => rule.pct > 0).map((rule) => ({ ...rule, client_id: args.clientId, sheet_client_name: args.clientName }));
      if (rules.length) {
        await supabase.from("fin_commission_rules").delete().eq("client_id", args.clientId);
        await supabase.from("fin_commission_rules").insert(rules);
      }
    } catch (e) { console.error("crear-venta: error fin_commission_rules", e); }

    // ── 5) Recalcular comisiones (réplica del motor en SQL). No bloquea si falla. ──
    const { error: rErr } = await supabase.rpc("fin_recompute");
    if (rErr) console.error("crear-venta: fin_recompute error", rErr);
    return incomeId;
  } catch (e) {
    console.error("crear-venta: fallo cargando ingreso en finanzas", e);
    return null;
  }
}

// Crea el PLAN DE PAGOS en cuotas (Seguimiento de pagos) cuando la venta es a cuotas.
// La 1ra cuota = lo cobrado al cierre (cashCollect), ya pagada y linkeada al ingreso.
// El resto se agenda mensual desde next_charge_date. Evita duplicar si ya hay plan.
async function crearPlanPagos(args: {
  clientId: string;
  clientName: string;
  currency: string;
  total: number;
  cashCollect: number | null;
  installments: number;
  startDate: string;
  nextCharge: string | null;
  paymentMethod: string;
  incomeId: string | null;
}): Promise<void> {
  try {
    const { data: ex } = await supabase.from("fin_payment_plans").select("id").eq("client_id", args.clientId).limit(1);
    if (ex && ex.length) return; // ya tiene plan
    const r2 = (v: number) => Math.round(v * 100) / 100;
    const { data: plan, error: pErr } = await supabase.from("fin_payment_plans").insert({
      client_id: args.clientId,
      client_name: args.clientName,
      person_name: args.clientName,
      currency: (args.currency || "USD").toUpperCase(),
      total_amount: r2(args.total),
      payment_method: args.paymentMethod || null,
      status: "activo",
      start_date: args.startDate,
      source: "onboarding",
    }).select("id").single();
    if (pErr || !plan) { console.error("crear-venta: error fin_payment_plans", pErr); return; }
    const planId = plan.id;
    const N = Math.max(1, Math.round(args.installments));
    const paid0 = args.cashCollect != null ? args.cashCollect : 0;
    const cuotas: Record<string, unknown>[] = [];
    if (paid0 > 0) {
      cuotas.push({ plan_id: planId, n: 1, due_date: args.startDate, amount: r2(paid0), status: "pagada", paid_date: args.startDate, income_id: args.incomeId });
      const k = Math.max(1, N - 1);
      const rest = Math.max(0, args.total - paid0);
      const per = r2(rest / k);
      let due = args.nextCharge || addMonthsIso(args.startDate, 1);
      for (let i = 0; i < k; i++) {
        cuotas.push({ plan_id: planId, n: i + 2, due_date: due, amount: per, status: "pendiente" });
        due = addMonthsIso(due, 1);
      }
    } else {
      const per = r2(args.total / N);
      let due = args.nextCharge || args.startDate;
      for (let i = 0; i < N; i++) {
        cuotas.push({ plan_id: planId, n: i + 1, due_date: due, amount: per, status: "pendiente" });
        due = addMonthsIso(due, 1);
      }
    }
    const { error: cErr } = await supabase.from("fin_payment_cuotas").insert(cuotas);
    if (cErr) console.error("crear-venta: error fin_payment_cuotas", cErr);
  } catch (e) {
    console.error("crear-venta: fallo creando plan de pagos", e);
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
  // Alta NATIVA: estrategia + un funnel inicial con su DEL nativo, para que el equipo arranque
  // directo en el panel (sin depender del Drive). crear-venta corre con service-role, así que
  // inserta strategies/strategy_pages y la fila del DEL directo en client_brain_docs (ver abajo).
  const strategyId = `strat_${Math.floor(Date.now() / 1000)}_${rnd(6)}`;
  const { error: sErr } = await supabase.from("strategies").insert({
    id: strategyId,
    client_id: clientId,
    name: "Estrategia #1",
    status: "borrador",
    version: "v1",
    position: 0,
    start_date: startDate,
  });
  if (sErr) {
    console.error("crear-venta: error creando estrategia", sErr);
  } else {
    // DEL nativo por INSERT DIRECTO: del_doc_create exige is_team_member() y crear-venta corre
    // con service-role (sin auth.uid()), así que insertamos nosotros la fila del DEL (misma forma
    // que del_doc_create: doc_kind='del', scope='funnel', text vacío).
    let delDocId: string | null = `del_${Math.floor(Date.now() / 1000)}${rnd(10)}`;
    const { error: ddErr } = await supabase.from("client_brain_docs").insert({
      id: delDocId,
      client_id: clientId,
      node_id: `native_${delDocId}`,
      doc_kind: "del",
      title: "Funnel inicial — DEL",
      text: "",
      char_count: 0,
      strategy_id: strategyId,
      scope: "funnel",
      synced_at: new Date().toISOString(),
    });
    if (ddErr) { console.error("crear-venta: error creando DEL nativo", ddErr); delDocId = null; }
    const { error: pErr } = await supabase.from("strategy_pages").insert({
      id: `spg_${Math.floor(Date.now() / 1000)}_${rnd(6)}`,
      strategy_id: strategyId,
      client_id: clientId,
      name: "Funnel inicial",
      status: "borrador",
      del_doc_id: delDocId,
    });
    if (pErr) console.error("crear-venta: error creando funnel", pErr);
  }

  // Estructura de carpetas en Google Drive + onboarding duplicado + compartir con los emails
  // (via Apps Script). Es ADITIVO al alta nativa: si Drive responde, guardamos su carpeta en el
  // cliente y colgamos los links de las carpetas/onboarding en la estrategia nativa (acceso del
  // equipo). Si falla o no está configurado, el cliente igual queda creado y usable (nativo).
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
      // Colgar los links del Drive en la estrategia nativa ya creada (no crea otra).
      const archivos: { label: string; url: string; category: string }[] = Object.entries(
        drive.subfolders,
      ).map(([label, url]) => ({ label, url, category: "folder" }));
      if (onboardingUrl) archivos.push({ label: "Onboarding", url: onboardingUrl, category: "doc" });
      if (drive.delDocUrl) archivos.push({ label: "DEL (Drive)", url: drive.delDocUrl, category: "doc" });
      if (archivos.length) {
        const { error: supErr } = await supabase
          .from("strategies")
          .update({ name: drive.strategyName || "Estrategia #1", archivos })
          .eq("id", strategyId);
        if (supErr) console.error("crear-venta: error colgando archivos del Drive en la estrategia", supErr);
      }
    }
  }

  // Alta del ingreso en el ÁREA DE FINANZAS del panel (tablas fin_*): flujo completo
  // (Ingresos + Base de datos + Acuerdos). Reemplaza al Google Sheet (ya no se usa).
  // En modo prueba NO se carga (para no ensuciar las finanzas reales). Solo si la
  // venta tiene monto. No bloquea ni rompe la venta.
  let incomeId: string | null = null;
  if (!isTest && (billingAmount != null || cashCollect != null)) {
    incomeId = await cargarIngresoFinanzas({
      clientId,
      clientName: displayName,
      conector: str(body.conector),
      closer: str(body.closer),
      startDate,
      billingAmount,
      cashCollect,
      currency: str(body.billing_currency) || "USD",
      paymentMethod: str(body.payment_method),
      fxRate: num(finDefaults.eur_usd_rate),
      stripeFeePct: num(finDefaults.stripe_fee_pct),
      signerType: str(body.signer_type),
      billingAddress: str(body.billing_address),
      fiscalId: str(body.fiscal_id),
      email: str(body.email),
      phone: str(body.phone),
      empresa: str(body.company) || str(body.niche),
      commission: commission_split,
      marketingPerson: str(finDefaults.marketing_person) || "Jose Martin",
      crmMarketingPct: num(finDefaults.crm_marketing_pct),
      publiMarketingPct: num(finDefaults.publicidad_marketing_pct),
    });
  }

  // Plan de pagos en cuotas (Seguimiento de pagos) — solo ventas reales a cuotas.
  // La 1ra cuota queda pagada y linkeada al ingreso; el resto se agenda mensual.
  if (!isTest && installments > 1 && billingAmount != null) {
    await crearPlanPagos({
      clientId,
      clientName: displayName,
      currency: str(body.billing_currency) || "USD",
      total: billingAmount,
      cashCollect,
      installments,
      startDate,
      nextCharge,
      paymentMethod: str(body.payment_method),
      incomeId,
    });
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

  // Documento privado "Resumen de la venta": queda en del_client_extra_docs (por cliente), así
  // aparece en el grupo "DEL CLIENTE" de TODOS los DEL de ESTE cliente. system=true → no se borra
  // por error desde el panel.
  try {
    const resumenHtml = buildSummaryHtml({
      body,
      billingAmount,
      currency: str(body.billing_currency) || "USD",
      cashCollect,
      remaining,
      installments,
      nextCharge,
      commission: commission_split,
      receiptUrl,
    });
    const { error: rErr } = await supabase.from("del_client_extra_docs").insert({
      client_id: clientId,
      title: "Resumen de la venta",
      html: resumenHtml,
      created_by: "sistema",
      system: true,
    });
    if (rErr) console.error("crear-venta: error creando doc resumen de venta", rErr);
  } catch (e) {
    console.error("crear-venta: buildSummaryHtml", e);
  }

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
    finanzas_recorded: !!incomeId,
  });
});
