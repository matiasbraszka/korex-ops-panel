// supabase/functions/finance-import/index.ts
// Importa el Sheet "MKA - Finanzas y Costos" a las tablas fin_* (espejo F1).
// Lee del web app read-only (finanzas-export) por HTTP, corre el MOTOR DE
// COMISIONES validado (réplica exacta del Sheet, con la regla correcta de
// afiliado: sin doble conteo) y escribe fin_incomes + fin_commission_entries.
// Es RE-EJECUTABLE: borra y reimporta (full refresh).
//
// Auth: body.secret === 'korex-finanzas-2026' (mismo del Sheet). verify_jwt off.
// Body: { secret, exportUrl, exportSecret }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (s: number, b: unknown) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

// ===================== MOTOR (réplica validada del Sheet) =====================
const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ""));
  return isFinite(n) ? n : 0;
};
const key = (s: unknown) => String(s == null ? "" : s).trim().toLowerCase();
const cieq = (a: unknown, b: unknown) => key(a) === key(b);
const isPubli = (t: unknown) => cieq(t, "PUBLICIDAD");
const round2 = (n: number) => Math.round(n * 100) / 100;
const toSerial = (d: unknown): number | null => {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
};
const truthy = (v: unknown) => v === true || /^(true|si|sí|x|1|✓|verdadero)$/i.test(String(v ?? "").trim());

// deno-lint-ignore no-explicit-any
function buildAcuerdos(derRows: any[], izqRows: any[]) {
  // der: el export arranca en col J → v[0]=J fecha,1K cliente,2L valor,3M conector,
  // 4N consultor,5O marketing,6P setupCon,7Q crmCon,8R crmCli,9S crmAfi,10T crmKorex,
  // 11U crmConsultor,12V crmMkt,13W publiKorex,14X publiConsultor,15Y publiMkt,16Z umbral,17AA publiConector
  const byClient = new Map<string, any>();
  const byClientConector = new Map<string, any>();
  for (const r of derRows) {
    const v = r.v || r;
    const cliente = v[1];
    if (cliente == null || String(cliente).trim() === "") continue;
    const obj = {
      cliente, valor: num(v[2]), conector: v[3], consultor: v[4], marketing: v[5],
      setupConector: v[6], crmConector: v[7], crmCliente: v[8], crmAfiliados: v[9],
      crmKorex: v[10], crmConsultor: v[11], crmMarketing: v[12],
      publiKorex: v[13], publiConsultor: v[14], publiMarketing: v[15],
      umbral: num(v[16]), publiConector: v[17],
    };
    if (!byClient.has(key(cliente))) byClient.set(key(cliente), obj);
    const kk = key(cliente) + "|" + key(v[3]);
    if (!byClientConector.has(kk)) byClientConector.set(kk, obj);
  }
  const startDate = new Map<string, number | null>();
  for (const r of izqRows) {
    const v = r.v || r;
    const fecha = v[0], nombre = v[1], categoria = v[2], cliente = v[3];
    if (!nombre || !cliente || !categoria) continue;
    const kk = key(nombre) + "|" + key(cliente) + "|" + key(categoria);
    if (!startDate.has(kk)) startDate.set(kk, toSerial(fecha));
  }
  return { byClient, byClientConector, startDate };
}

// deno-lint-ignore no-explicit-any
function computeRow(income: any, acuerdos: any, state: any) {
  const { fecha, E, H } = income;
  const cliente = income.N, conector = income.O, afiliado = income.P;
  const e = num(E);
  const cli = acuerdos.byClient.get(key(cliente)) || null;
  const publi = isPubli(H);
  if (!publi) state.cum.set(key(cliente), (state.cum.get(key(cliente)) || 0) + e);
  let V: string;
  if (H == null || String(H).trim() === "") V = "";
  else if (cieq(H, "SETUP")) V = "SETUP";
  else if (publi) V = "PUBLICIDAD";
  else {
    const umbral = cli ? cli.umbral : 0;
    const acc = state.cum.get(key(cliente)) || 0;
    V = (umbral < acc) ? "CRM" : "SETUP";
  }
  const vEff = key(V);
  const normGE1 = (raw: unknown) => { const n = num(raw); return n >= 1 ? n / 100 : n; };
  const normGT1 = (raw: unknown) => { const n = num(raw); return n > 1 ? n / 100 : n; };

  let W: number | "" = "";
  if (vEff === "crm") W = e * (cli ? normGE1(cli.crmCliente) : 0);

  let X: number | "" = "";
  {
    const row = acuerdos.byClientConector.get(key(cliente) + "|" + key(conector)) || null;
    const pSetup = row ? normGE1(row.setupConector) : 0;
    const pCrm = row ? normGE1(row.crmConector) : 0;
    const pPubli = row ? normGE1(row.publiConector) : 0;
    if (vEff === "setup") X = e * pSetup;
    else if (vEff === "crm") X = e * pCrm;
    else if (vEff === "publicidad") X = (pPubli === 0) ? "" : e * pPubli;
  }

  const afiliadoPresente = !(afiliado == null || String(afiliado).trim() === "");
  let Y: number | "" = "";
  if (cieq(H, "CRM") && afiliadoPresente) Y = e * (cli ? num(cli.crmAfiliados) / 100 : 0);

  let Z: number | "" = "";
  {
    const nombre = cli ? cli.consultor : "";
    const fi = nombre ? acuerdos.startDate.get(key(nombre) + "|" + key(cliente) + "|consultor") : undefined;
    const fiS = (fi === undefined || fi === null) ? 99999999 : fi;
    const vS = toSerial(fecha);
    if (vS != null && vS >= fiS) {
      if (vEff === "crm") Z = e * (num(cli.crmConsultor) / 100);
      else if (vEff === "publicidad") Z = e * (num(cli.publiConsultor) / 100);
    }
  }

  let AA: number | "" = "";
  {
    const nombre = cli ? cli.marketing : "";
    const fi = nombre ? acuerdos.startDate.get(key(nombre) + "|" + key(cliente) + "|marketing") : undefined;
    const fiS = (fi === undefined || fi === null) ? 99999999 : fi;
    const vS = toSerial(fecha);
    if (vS != null && vS >= fiS) {
      if (vEff === "crm") AA = e * (num(cli.crmMarketing) / 100);
      else if (vEff === "publicidad") AA = e * (num(cli.publiMarketing) / 100);
    }
  }

  let AC: number | "" = "";
  {
    const pBlank = !afiliadoPresente;
    if (pBlank) AC = cieq(H, "CRM") ? e * (cli ? normGT1(cli.crmAfiliados) : 0) : 0;
  }

  const sumWtoAA = num(W) + num(X) + num(Y) + num(Z) + num(AA);
  const F = cieq(H, "PUBLICIDAD") ? ((e - sumWtoAA) * 15) / 100 : e - (sumWtoAA + num(AC));
  return { V, W, X, Y, Z, AA, AC, F, afiliadoPresente };
}

// deno-lint-ignore no-explicit-any
function entriesFor(inc: any, c: any) {
  const e = num(inc.E);
  const out: { role_key: string; amount: number; notes: string | null }[] = [];
  const push = (role: string, amount: number, notes?: string) => {
    const a = round2(num(amount));
    if (Math.abs(a) > 0.005 || role === "korex") out.push({ role_key: role, amount: a, notes: notes || null });
  };
  push("cliente", num(c.W));
  push("conector", num(c.X));
  if (num(c.Y) > 0.005) push("afiliado", num(c.Y), "pagado");
  else if (num(c.AC) > 0.005) push("afiliado", num(c.AC), "reservado (sin afiliado, fondo cliente)");
  push("consultor", num(c.Z));
  push("marketing", num(c.AA));
  push("korex", num(c.F));
  if (cieq(inc.H, "PUBLICIDAD")) {
    const adBudget = e - (num(c.X) + num(c.Z) + num(c.AA)) - num(c.F);
    if (Math.abs(adBudget) > 0.005) out.push({ role_key: "cliente", amount: round2(adBudget), notes: "presupuesto publicidad" });
  }
  return out;
}

// ===================== handler =====================
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json(400, { error: "invalid_json" }); }
  if (String(body.secret ?? "") !== "korex-finanzas-2026") return json(401, { error: "unauthorized" });

  const exportUrl = String(body.exportUrl ?? "");
  const exportSecret = String(body.exportSecret ?? "korex-finanzas-2026");
  if (!exportUrl) return json(400, { error: "missing_exportUrl" });

  try {
    // 1) leer Sheet
    const fetchJson = async (qs: string) => {
      const r = await fetch(`${exportUrl}?secret=${encodeURIComponent(exportSecret)}&${qs}`);
      return await r.json();
    };
    const ing = await fetchJson("action=export&sheet=ingresos&limit=5000");
    const ac = await fetchJson("action=export&sheet=acuerdos");
    if (!ing?.rows || !ac?.derecho) return json(502, { error: "export_failed", ing: !!ing?.rows, ac: !!ac?.derecho });

    const acuerdos = buildAcuerdos(ac.derecho.rows, ac.izquierdo.rows);

    // 2) filas activas + motor (en orden, acumulado por cliente)
    const I = { A: 0, B: 1, C: 2, D: 3, E: 4, F: 5, G: 6, H: 7, J: 9, K: 10, L: 11, M: 12, N: 13, O: 14, P: 15, Q: 16, R: 17, S: 18, U: 20, V: 21 };
    const active = ing.rows.filter((r: { v: unknown[] }) => {
      const v = r.v;
      return (v[I.H] && String(v[I.H]).trim()) || num(v[I.E]) || (v[I.N] && String(v[I.N]).trim());
    });
    const state = { cum: new Map<string, number>() };

    // 3) mapa clientes panel
    const { data: clientsData } = await supabase.from("clients").select("id,name");
    const clientMap = new Map<string, string>();
    (clientsData || []).forEach((c: { id: string; name: string }) => clientMap.set(key(c.name), c.id));

    // 4) full refresh
    await supabase.from("fin_incomes").delete().not("id", "is", null);

    // 5) construir filas
    // deno-lint-ignore no-explicit-any
    const incomeRows: any[] = [];
    // deno-lint-ignore no-explicit-any
    const entryRows: any[] = [];
    for (const r of active) {
      const v = r.v;
      const inc = { row: r.row, fecha: v[I.B], E: v[I.E], H: v[I.H], N: v[I.N], O: v[I.O], P: v[I.P] };
      const c = computeRow(inc, acuerdos, state);
      const id = crypto.randomUUID();
      incomeRows.push({
        id, sheet_row: r.row,
        income_date: v[I.B] || null, month_date: v[I.A] || null,
        client_id: clientMap.get(key(v[I.N])) || null,
        payer_name: v[I.M] || null, client_name_sheet: v[I.N] || null, conector_name_sheet: v[I.O] || null,
        income_type: v[I.H] || null, effective_type: c.V || null,
        amount_eur: num(v[I.C]) || null, amount_usd: num(v[I.D]) || null, net_usd: num(v[I.E]) || null,
        korex_real: round2(num(c.F)),
        payment_method: v[I.G] || null, status: v[I.J] || null, setter: v[I.K] || null, closer: v[I.L] || null,
        facturado: truthy(v[I.Q]), organizado_finanzas: truthy(v[I.R]), llego_mercury: truthy(v[I.S]), cargado_software: truthy(v[I.U]),
        raw: { sheetF: num(v[I.F]), sheetV: v[I.V] },
      });
      for (const e of entriesFor(inc, c)) entryRows.push({ income_id: id, role_key: e.role_key, amount: e.amount, source: "engine", status: "accrued", notes: e.notes });
    }

    // 6) insertar en lotes
    const insertBatched = async (table: string, rows: unknown[], size = 500) => {
      for (let i = 0; i < rows.length; i += size) {
        const { error } = await supabase.from(table).insert(rows.slice(i, i + size));
        if (error) throw new Error(`${table}: ${error.message}`);
      }
    };
    await insertBatched("fin_incomes", incomeRows);
    await insertBatched("fin_commission_entries", entryRows);

    return json(200, {
      ok: true,
      incomes: incomeRows.length,
      entries: entryRows.length,
      matched_clients: incomeRows.filter((r) => r.client_id).length,
      unmatched_clients: Array.from(new Set(incomeRows.filter((r) => !r.client_id).map((r) => r.client_name_sheet))).slice(0, 50),
    });
  } catch (e) {
    console.error("finance-import error", e);
    return json(500, { error: String(e) });
  }
});
