// supabase/functions/agent-run/agents/cuenta.ts
// SITUACIÓN DEL CLIENTE: el asesor de cuenta. Responde "¿en qué situación está este
// cliente?", "¿qué lo tiene trabado?", "¿qué tan conforme está?", "¿pagaría una mensualidad?"
// cruzando lo que hoy vive desparramado en ~20 tablas que nadie mira juntas.
//
// El dossier está pensado para que ALGUIEN QUE NO CONOCE AL CLIENTE pueda leer la respuesta
// y entender su situación completa. Por eso los números van con lujo de detalle (campaña por
// campaña, anuncio por anuncio) y no resumidos: resumir es trabajo del agente, no del builder,
// y un builder que resume de más le saca al agente la evidencia para fundamentar.
//
// NO se pisa con Descubrimiento: aquel razona sobre el MERCADO del cliente (líder,
// competencia, avatar) leyendo client_brain_docs; éste sobre la RELACIÓN con el cliente.
// Cero solapamiento de tablas. Cuando el cuello es de método, este agente DERIVA a aquel.
//
// Decisión de diseño: dossier pre-computado, sin tool-use (misma regla anti-fuga que el
// analista). Una sola llamada a la API, sin loops. El dossier es estable dentro de la
// conversación → 2º breakpoint de cache a 0,1x del turno 2 en adelante.
//
// Dos cosas las calcula el CÓDIGO y no el modelo, porque son las que más fácil se inventan:
//   1. La COBERTURA DE DATOS (qué falta y cómo se consigue). La cobertura entre clientes es
//      MUY despareja: 28 de 36 tienen briefing de WhatsApp, 8 tienen métricas de Meta, 10
//      tienen DME. Un agente confiado sobre un cliente del que no sabe nada hace daño.
//   2. La ATRIBUCIÓN DE LOS RETRASOS (culpa del cliente vs. culpa de Korex). Es la que se usa
//      para confrontar en una negociación, así que no puede depender de la lectura del modelo:
//      sale de banderas de la base (asignada_cliente, is_client_task, portal_pedidos).

import { str, clip } from "../../_shared/agent-runtime.ts";
import type { Fuente } from "../../_shared/agent-runtime.ts";
import type { AgentCtx, AgentContextResult, AgentModule } from "./types.ts";

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function diasDesde(f: unknown): number {
  const t = new Date(str(f)).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 9999;
}
// Días que faltan para una fecha. Negativo = ya pasó.
function diasHasta(f: unknown): number | null {
  const t = new Date(str(f)).getTime();
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86400000) : null;
}
function fecha(v: unknown): string { const s = str(v); return s ? s.slice(0, 10) : "—"; }
const HOY = new Date().toISOString().slice(0, 10);
function usd(v: unknown): string { return `US$${num(v).toFixed(2)}`; }
function pct(n: number, sobre: number): string { return sobre ? `${((n / sobre) * 100).toFixed(1)}%` : "—"; }
function entreFechas(a: unknown, b: unknown): number | null {
  const t1 = new Date(str(a)).getTime(), t2 = new Date(str(b)).getTime();
  return Number.isFinite(t1) && Number.isFinite(t2) ? Math.round((t2 - t1) / 86400000) : null;
}
// Los jsonb de llamadas vienen como array de strings o de objetos según el campo.
function lista(v: unknown, max = 8): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => {
    if (typeof x === "string") return x;
    const o = (x || {}) as Record<string, unknown>;
    const cab = [str(o.tipo), str(o.area)].filter(Boolean).join("/");
    const cuerpo = str(o.texto) || str(o.descripcion) || str(o.titulo) || JSON.stringify(o);
    return cab ? `[${cab}] ${cuerpo}` : cuerpo;
  }).filter(Boolean);
}

type Bloque = { texto: string; fuente: Fuente; remedio?: string; meta?: Record<string, unknown> };

// Las 5 fases globales del panel. ESPEJO de apps/operations/src/utils/constants.js (PHASES).
// Si allá se agrega o renombra una fase, hay que tocarlo acá: es la misma verdad en dos lados.
const PHASES: Record<string, string> = {
  "pre-onboarding": "Pre-Onboarding",
  "onboarding": "Onboarding",
  "primera-entrega": "Primera Entrega",
  "lanzamiento": "Lanzamiento",
  "auditoria": "Auditoría",
};

// ── 1) Ficha y fase del servicio ─────────────────────────────────────────────
async function ficha(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  if (!client) {
    return {
      texto: "", fuente: { rotulo: "Ficha", estado: "falta", detalle: "el cliente no existe" },
      remedio: "No se encontró la fila en `clients` para este id. Revisar que el cliente no haya sido borrado.",
    };
  }

  // ── La FASE: el panel no la guarda, la deriva. Replicamos su cálculo exacto ──
  // helpers.js:294 (currentTask) → primera tarea roadmap con status ≠ 'done', sobre la lista
  // tal como la carga AppContext.jsx (ORDENADA POR created_at DESC). Sí: la "fase actual" es
  // la de la tarea roadmap pendiente MÁS NUEVA. Es una rareza del panel, pero es lo que se ve
  // en pantalla y tenemos que decir lo mismo.
  const { data: roadmap } = await ctx.supabase.from("tasks")
    .select("title,status,phase,assignee,created_at")
    .eq("client_id", ctx.clientId).eq("is_roadmap_task", true)
    .order("created_at", { ascending: false }).limit(500);
  const rm = Array.isArray(roadmap) ? roadmap : [];
  const actual = rm.find((t) => str(t.status) !== "done") || null;
  const hechas = rm.filter((t) => str(t.status) === "done").length;

  const customPhases = Array.isArray(client.custom_phases) ? client.custom_phases as Record<string, unknown>[] : [];
  const overrides = (client.phase_name_overrides || {}) as Record<string, unknown>;
  const labelFase = (id: string): string => {
    if (!id) return "(la tarea no tiene fase asignada)";
    const ov = str(overrides[id]);
    if (ov && ov !== "__HIDDEN__") return ov;
    if (PHASES[id]) return PHASES[id];
    const c = customPhases.find((p) => str(p.id) === id);
    return c ? str(c.label) : `(id sin label: ${id})`;
  };

  const faseId = actual ? str(actual.phase) : "";
  const faseTxt = !rm.length
    ? "SIN TAREAS DE ROADMAP — el panel no puede calcular la fase de este cliente"
    : actual
      ? `${labelFase(faseId)}   [id: ${faseId || "—"}]`
      : "LANZADO (todas las tareas de roadmap están terminadas)";

  const prio: Record<string, string> = { "1": "SUPER PRIORITARIO", "2": "IMPORTANTE", "3": "NORMAL", "4": "POCO IMPORTANTE", "5": "NUEVO", "6": "DESCARTADO" };
  const cuello = str(client.bottleneck);

  return {
    texto: [
      "— FICHA Y FASE DEL SERVICIO —",
      `Cliente: ${str(client.name)}${str(client.company) ? ` · Empresa: ${str(client.company)}` : ""}${str(client.niche) ? ` · Nicho: ${str(client.niche)}` : ""}${str(client.team_name) ? ` · Equipo: ${str(client.team_name)}` : ""}`,
      `Servicio contratado: ${str(client.service) || "—"}${str(client.tier) ? ` · Tier: ${str(client.tier)}` : ""}${str(client.client_type) ? ` · Tipo: ${str(client.client_type)}` : ""}`,
      `Estado: ${str(client.status) || "—"} · Prioridad: ${prio[str(client.priority)] || str(client.priority) || "—"}${str(client.country) ? ` · País: ${str(client.country)}` : ""}`,
      `Quién lo lleva: PM ${str(client.pm) || "SIN ASIGNAR"} · Closer ${str(client.closer) || "—"} · Conector ${str(client.conector) || "—"}`,
      "",
      `FASE ACTUAL: ${faseTxt}`,
      actual ? `Tarea en curso: "${str(actual.title)}"${str(actual.assignee) ? ` — responsable: ${str(actual.assignee)}` : " — SIN RESPONSABLE"} (estado: ${str(actual.status)})` : "",
      rm.length ? `Avance del roadmap: ${hechas} de ${rm.length} tareas terminadas (${pct(hechas, rm.length)})` : "",
      "",
      cuello
        ? `CUELLO DE BOTELLA SEGÚN EL EQUIPO (escrito a mano en la ficha, es la lectura oficial):\n${cuello}`
        : "CUELLO DE BOTELLA: el campo está VACÍO — nadie escribió qué hace falta para avanzar.",
      str(client.notes) ? `\nNOTAS DE LA FICHA:\n${clip(str(client.notes), 2000)}` : "",
    ].filter(Boolean).join("\n"),
    fuente: cuello ? { rotulo: "Ficha", estado: "ok" } : { rotulo: "Ficha", estado: "parcial", detalle: "sin cuello de botella escrito" },
    remedio: cuello ? undefined : "El campo 'Pendiente para avanzar' de este cliente está vacío en la lista de Clientes. Es el dato más rico del panel: pedir que lo completen.",
    meta: { fase: faseId || null, roadmap: rm.length, hechas },
  };
}

// ── 2) Fechas clave: firma vs. LANZAMIENTO REAL ──────────────────────────────
// El caso que motiva este bloque: un cliente dice "llevo 5 meses con ustedes" cuando en
// realidad hace 3 semanas que tiene leads. La antigüedad del contrato y la antigüedad del
// SERVICIO EN FUNCIONAMIENTO son dos números distintos y hay que poder mostrarlos juntos.
// El lanzamiento real no está en ninguna columna: se infiere del primer rastro de actividad
// publicitaria. Se muestran TODAS las señales, no una elegida, para que la brecha se vea.
async function fechas(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  const [{ data: contratos }, { data: incomes }, { data: dme }, { data: meta }] = await Promise.all([
    ctx.supabase.from("contracts").select("title,status,signed_date,renewal_date,sent_at,completed_at")
      .eq("client_id", ctx.clientId).order("signed_date", { ascending: true }).limit(5),
    ctx.supabase.from("fin_incomes").select("income_date,effective_type,income_type,amount_usd")
      .eq("client_id", ctx.clientId).order("income_date", { ascending: true }).limit(400),
    ctx.supabase.from("dme_daily").select("date,metrics").eq("client_id", ctx.clientId)
      .order("date", { ascending: true }).limit(400),
    ctx.supabase.from("meta_ad_insights").select("snapshot_date,spend,leads")
      .eq("client_id", ctx.clientId).order("snapshot_date", { ascending: true }).limit(400),
  ]);

  const cRows = Array.isArray(contratos) ? contratos : [];
  const iRows = Array.isArray(incomes) ? incomes : [];
  const dRows = Array.isArray(dme) ? dme : [];
  const mRows = Array.isArray(meta) ? meta : [];

  const tipo = (r: Record<string, unknown>) => (str(r.effective_type) || str(r.income_type)).toUpperCase();
  const primerSetup = iRows.find((r) => tipo(r).includes("SETUP"))?.income_date;
  const primerPub = iRows.find((r) => tipo(r).includes("PUBLICIDAD"))?.income_date;
  const primerDmeLead = dRows.find((d) => num((d.metrics as Record<string, unknown>)?.embudo1_total_leads) > 0
    || num((d.metrics as Record<string, unknown>)?.embudo1_leads_registrados) > 0)?.date;
  const primerDmeGasto = dRows.find((d) => num((d.metrics as Record<string, unknown>)?.embudo1_total_gastado) > 0)?.date;
  const primerMetaGasto = mRows.find((r) => num(r.spend) > 0)?.snapshot_date;

  const firma = cRows.find((c) => str(c.signed_date))?.signed_date || client?.contract_signed_date || null;
  const alta = client?.start_date || null;

  // El arranque real: la señal más temprana de que la máquina estaba andando.
  const señales = [
    ["primer pago de PUBLICIDAD", primerPub],
    ["primer día con gasto en el DME", primerDmeGasto],
    ["primer día con leads en el DME", primerDmeLead],
    ["primer gasto visto en Meta", primerMetaGasto],
  ].filter(([, f]) => str(f)) as [string, unknown][];
  const arranque = señales.length
    ? señales.map(([, f]) => str(f)).sort()[0]
    : null;

  const brechaFirma = firma && arranque ? entreFechas(firma, arranque) : null;
  const brechaAlta = alta && arranque ? entreFechas(alta, arranque) : null;

  const lineasContrato = cRows.map((c) => {
    const d = diasHasta(c.renewal_date);
    const ren = str(c.renewal_date)
      ? ` · RENUEVA ${fecha(c.renewal_date)}${d === null ? "" : d >= 0 ? ` (faltan ${d} días)` : ` (VENCIÓ hace ${-d} días)`}`
      : " · sin fecha de renovación";
    return `  · ${str(c.title) || "(sin título)"} — estado "${str(c.status)}"${str(c.signed_date) ? ` · firmado ${fecha(c.signed_date)}` : " · SIN FIRMAR"}${ren}`;
  });

  return {
    texto: [
      "— FECHAS CLAVE: CONTRATO vs. SERVICIO REALMENTE FUNCIONANDO —",
      `Alta en el panel: ${fecha(alta)}${str(alta) ? ` (hace ${diasDesde(alta)} días)` : ""}`,
      `Contrato firmado: ${fecha(firma)}${str(firma) ? ` (hace ${diasDesde(firma)} días)` : ""}`,
      str(primerSetup) ? `Primer pago de SETUP: ${fecha(primerSetup)} (hace ${diasDesde(primerSetup)} días)` : "Primer pago de SETUP: no hay ninguno registrado",
      "",
      arranque
        ? [
          `ARRANQUE REAL DEL SERVICIO: ${fecha(arranque)} — hace ${diasDesde(arranque)} días.`,
          `Señales que lo respaldan: ${señales.map(([n, f]) => `${n} ${fecha(f)}`).join(" · ")}`,
          brechaFirma !== null ? `BRECHA FIRMA → ARRANQUE: ${brechaFirma} días entre que firmó y que la máquina empezó a andar.` : "",
          brechaAlta !== null && brechaAlta !== brechaFirma ? `BRECHA ALTA → ARRANQUE: ${brechaAlta} días.` : "",
        ].filter(Boolean).join("\n")
        : "ARRANQUE REAL DEL SERVICIO: NUNCA ARRANCÓ. No hay un solo pago de publicidad, ni un día con gasto o leads en el DME, ni gasto visto en Meta. Este cliente pagó/firmó pero su publicidad todavía no salió a la calle.",
      "",
      lineasContrato.length ? `CONTRATOS:\n${lineasContrato.join("\n")}` : "CONTRATOS: ninguno cargado.",
      "",
      "OJO al usar esto: la antigüedad del contrato y la del servicio funcionando son números",
      "distintos. Si el cliente dice 'llevo X meses con ustedes', el número que importa para",
      "juzgar resultados es el del ARRANQUE REAL, no el de la firma.",
    ].filter(Boolean).join("\n"),
    fuente: arranque
      ? { rotulo: "Fechas clave", estado: "ok", detalle: `arranque ${fecha(arranque)}` }
      : (cRows.length || str(alta))
        ? { rotulo: "Fechas clave", estado: "parcial", detalle: "sin rastro de arranque de publicidad" }
        : { rotulo: "Fechas clave", estado: "falta", detalle: "sin contrato ni fecha de alta" },
    remedio: arranque ? undefined : "No hay ninguna señal de que la publicidad de este cliente haya arrancado (ni pago de publicidad, ni DME, ni gasto en Meta). Si en realidad ya está publicando, falta cargar el DME o vincular su cuenta de Meta.",
    meta: { firma: fecha(firma), arranque: arranque ? fecha(arranque) : null, brecha_dias: brechaFirma },
  };
}

// ── 3) Publicidad: el detalle fino, como el informe diario ───────────────────
// A 7 días sale de meta_ad_insights (la ventana que trae el sync). A 30 días NO EXISTE en
// Meta: los snapshots son ventanas móviles de 7 días que se PISAN entre sí, sumarlas daría
// un número inventado. El único 30 días real es el DME, que se carga a mano. Cuando no hay
// DME, el bloque lo dice en vez de fabricarlo.
async function publicidad(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: meta }, { data: dme }, { data: pages }] = await Promise.all([
    ctx.supabase.from("meta_ad_insights")
      .select("snapshot_date,campaign_name,adset_name,ad_name,effective_status,spend,impressions,reach,frequency,clicks,ctr,cpm,cpl,leads,hook_rate,hold_rate,engagement_rate,is_winner,issues,country,time_window")
      .eq("client_id", ctx.clientId).order("snapshot_date", { ascending: false }).limit(400),
    ctx.supabase.from("dme_daily").select("date,metrics").eq("client_id", ctx.clientId)
      .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
      .order("date", { ascending: false }).limit(40),
    ctx.supabase.from("strategy_pages").select("id,name,tipo,is_live,status").eq("client_id", ctx.clientId).limit(40),
  ]);

  const mAll = Array.isArray(meta) ? meta : [];
  const dRows = Array.isArray(dme) ? dme : [];
  const pgRows = Array.isArray(pages) ? pages : [];

  if (!mAll.length && !dRows.length) {
    return {
      texto: "", fuente: { rotulo: "Publicidad", estado: "falta", detalle: "sin métricas de Meta ni DME" },
      remedio: "Este cliente no tiene ni una fila de meta_ad_insights ni DME cargado. O todavía no lanzó publicidad, o su cuenta de Meta no está vinculada (clients.meta_ad_account_ids) y nadie carga el DME. NO SE PUEDE HABLAR DE RENDIMIENTO DE CAMPAÑAS.",
    };
  }

  const partes: string[] = [];

  // ── Meta, últimos 7 días, anuncio por anuncio ──
  let dias7 = 9999;
  if (mAll.length) {
    const ultimo = str(mAll[0].snapshot_date);
    dias7 = diasDesde(ultimo);
    const snap = mAll.filter((r) => str(r.snapshot_date) === ultimo);
    const ventana = str(snap[0]?.time_window) || "last_7d";

    const tot = snap.reduce((a, r) => ({
      spend: a.spend + num(r.spend), leads: a.leads + num(r.leads),
      impr: a.impr + num(r.impressions), clicks: a.clicks + num(r.clicks),
    }), { spend: 0, leads: 0, impr: 0, clicks: 0 });

    const activos = snap.filter((r) => str(r.effective_status) === "ACTIVE");
    const pausados = snap.filter((r) => str(r.effective_status) !== "ACTIVE");

    // Por campaña: es el nivel al que se decide plata.
    const porCamp = new Map<string, { spend: number; leads: number; ads: number; activos: number }>();
    for (const r of snap) {
      const k = str(r.campaign_name) || "(sin campaña)";
      const a = porCamp.get(k) || { spend: 0, leads: 0, ads: 0, activos: 0 };
      a.spend += num(r.spend); a.leads += num(r.leads); a.ads += 1;
      if (str(r.effective_status) === "ACTIVE") a.activos += 1;
      porCamp.set(k, a);
    }

    const filaAd = (r: Record<string, unknown>) => [
      `  · ${str(r.ad_name) || "(sin nombre)"}${r.is_winner ? " ⭐GANADOR" : ""}  [${str(r.effective_status) || "?"}]`,
      `      campaña: ${str(r.campaign_name) || "—"}  ·  conjunto: ${str(r.adset_name) || "—"}${str(r.country) ? `  ·  país: ${str(r.country)}` : ""}`,
      `      gasto ${usd(r.spend)} · ${num(r.leads)} leads · CPL ${num(r.leads) ? usd(num(r.spend) / num(r.leads)) : (num(r.cpl) ? usd(r.cpl) : "—")}`,
      `      ${num(r.impressions)} impresiones · ${num(r.clicks)} clics · CTR ${num(r.ctr).toFixed(2)}% · CPM ${usd(r.cpm)} · frecuencia ${num(r.frequency).toFixed(2)}`,
      `      hook ${num(r.hook_rate).toFixed(1)}% · hold ${num(r.hold_rate).toFixed(1)}% · engagement ${num(r.engagement_rate).toFixed(2)}%`,
      r.issues ? `      PROBLEMAS QUE REPORTA META: ${clip(JSON.stringify(r.issues), 300)}` : "",
    ].filter(Boolean).join("\n");

    partes.push([
      `— PUBLICIDAD · META, ÚLTIMOS 7 DÍAS (snapshot ${ultimo}, ventana ${ventana}${dias7 > 1 ? ` — OJO: es de hace ${dias7} días` : ""}) —`,
      `TOTAL 7d: gasto ${usd(tot.spend)} · ${tot.leads} leads · CPL ${tot.leads ? usd(tot.spend / tot.leads) : "—"} · ${tot.impr} impresiones · ${tot.clicks} clics · CTR ${tot.impr ? ((tot.clicks / tot.impr) * 100).toFixed(2) : "0.00"}%`,
      `Anuncios: ${snap.length} en total — ${activos.length} ACTIVOS, ${pausados.length} pausados.`,
      "",
      "POR CAMPAÑA (ordenado por gasto):",
      ...[...porCamp.entries()].sort((a, b) => b[1].spend - a[1].spend).map(([k, v]) =>
        `  · ${k} — gasto ${usd(v.spend)} · ${v.leads} leads · CPL ${v.leads ? usd(v.spend / v.leads) : "—"} · ${v.activos}/${v.ads} anuncios activos`),
      "",
      `ANUNCIO POR ANUNCIO (${snap.length}, ordenados por gasto):`,
      ...snap.sort((a, b) => num(b.spend) - num(a.spend)).map(filaAd),
    ].join("\n"));
  } else {
    partes.push("— PUBLICIDAD · META, ÚLTIMOS 7 DÍAS —\nNo hay datos de Meta para este cliente (su cuenta de anuncios no está vinculada o el sync no la cubre).");
  }

  // ── 30 días: sólo el DME suma bien ──
  if (dRows.length) {
    const s = (k: string) => dRows.reduce((a, d) => a + num((d.metrics as Record<string, unknown>)?.[k]), 0);
    const gasto1 = s("embudo1_total_gastado"), leads1 = s("embudo1_total_leads") || s("embudo1_leads_registrados");
    const gasto2 = s("embudo2_total_gastado"), leads2 = s("embudo2_total_leads") || s("embudo2_leads_registrados");
    partes.push([
      `— PUBLICIDAD · ÚLTIMOS 30 DÍAS (del DME, ${dRows.length} días cargados entre ${fecha(dRows[dRows.length - 1].date)} y ${fecha(dRows[0].date)}) —`,
      `EMBUDO 1: gasto ${usd(gasto1)} · ${leads1} leads · CPL ${leads1 ? usd(gasto1 / leads1) : "—"}`,
      gasto2 || leads2 ? `EMBUDO 2: gasto ${usd(gasto2)} · ${leads2} leads · CPL ${leads2 ? usd(gasto2 / leads2) : "—"}` : "",
      `Recorrido embudo 1: ${s("embudo1_visitas_landing")} visitas a la landing → ${s("embudo1_miran_vsl")} miran el VSL completo → ${s("embudo1_quiz_iniciado")} inician el quiz → ${s("embudo1_quiz_terminado")} lo terminan → ${leads1} leads → ${s("embudo1_whatsapp")} pasan a WhatsApp → ${s("embudo1_cierres")} cierres`,
      `Saldo: último día cargado deja ${usd(dRows[0] && (dRows[0].metrics as Record<string, unknown>)?.saldo_final)} disponible.`,
      "",
      "El DME lo carga el equipo a mano: si faltan días, los totales son de los días cargados, no del mes entero.",
    ].filter(Boolean).join("\n"));
  } else {
    partes.push([
      "— PUBLICIDAD · ÚLTIMOS 30 DÍAS —",
      "NO HAY DATO DE 30 DÍAS para este cliente. Meta sólo entrega ventanas móviles de 7 días que",
      "se pisan entre sí (sumarlas daría un número falso), y el DME —que es la única serie diaria",
      "que suma bien— no está cargado. Cualquier afirmación sobre el mes es LECTURA, no dato.",
    ].join("\n"));
  }

  // ── Qué funnels están publicando ──
  const enVivo = pgRows.filter((p) => p.is_live);
  partes.push([
    "— QUÉ FUNNELS ESTÁN PUBLICANDO —",
    pgRows.length
      ? pgRows.map((p) => `  · ${str(p.name)} [${str(p.tipo) || "sin tipo"}] — ${p.is_live ? "EN VIVO" : "no está en vivo"} · estado "${str(p.status) || "—"}"`).join("\n")
      : "  (no hay funnels cargados)",
    `Resumen: ${enVivo.length} de ${pgRows.length} funnels en vivo.`,
  ].join("\n"));

  const fresco = dias7 <= 2;
  return {
    texto: partes.join("\n\n"),
    fuente: !mAll.length
      ? { rotulo: "Publicidad", estado: "parcial", detalle: "sólo DME, sin Meta" }
      : fresco
        ? { rotulo: "Publicidad", estado: "ok", detalle: `Meta 7d al ${fecha(mAll[0].snapshot_date)}${dRows.length ? ` + DME ${dRows.length} días` : " · sin 30d"}` }
        : { rotulo: "Publicidad", estado: "viejo", detalle: `snapshot de Meta de hace ${dias7} días` },
    remedio: !mAll.length
      ? "No hay métricas de Meta: revisar que clients.meta_ad_account_ids esté cargado y que el sync diario (meta-ads-sync, 10:40 UTC) cubra esas cuentas."
      : !dRows.length
        ? "No hay DME cargado en 30 días: sin él no existe ninguna métrica mensual confiable para este cliente. Pedir que lo carguen."
        : (fresco ? undefined : `El snapshot de Meta es de hace ${dias7} días: correr meta-ads-sync antes de decidir sobre presupuesto.`),
    meta: { meta_ads: mAll.length, dme_dias: dRows.length, funnels: pgRows.length, en_vivo: enVivo.length },
  };
}

// ── 4) Calidad del lead: curiosos / interesados / calificados ────────────────
// Es lo que dice si el servicio que damos SIRVE, más allá de si el CPL es bajo. Sale del DME,
// que tiene UN SOLO cajón de embudo por cliente: si el cliente corre varios, se avisa.
async function calidadLead(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: dme }, { data: pages }] = await Promise.all([
    ctx.supabase.from("dme_daily").select("date,metrics").eq("client_id", ctx.clientId)
      .gte("date", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10))
      .order("date", { ascending: false }).limit(40),
    ctx.supabase.from("strategy_pages").select("id,is_live").eq("client_id", ctx.clientId).limit(40),
  ]);
  const dRows = Array.isArray(dme) ? dme : [];
  const pgRows = Array.isArray(pages) ? pages : [];

  if (!dRows.length) {
    return {
      texto: "", fuente: { rotulo: "Calidad del lead", estado: "falta", detalle: "sin DME" },
      remedio: "Sin DME no se sabe si los leads son curiosos, interesados o calificados — o sea, no se puede decir si el servicio está sirviendo, sólo si es barato. Pedir que carguen el DME diario de este cliente.",
    };
  }

  const s = (k: string) => dRows.reduce((a, d) => a + num((d.metrics as Record<string, unknown>)?.[k]), 0);
  const total = s("embudo1_total_leads") || s("embudo1_leads_registrados");
  if (!total) {
    return {
      texto: "", fuente: { rotulo: "Calidad del lead", estado: "vacio", detalle: "DME cargado pero sin leads" },
      remedio: "El DME está cargado pero no registra ni un lead en 30 días: o la campaña no trae nadie, o el equipo no completó esas celdas.",
    };
  }

  const cur = s("embudo1_leads_curiosos"), inte = s("embudo1_leads_interesados"), cal = s("embudo1_leads_calificados");
  const gasto = s("embudo1_total_gastado");
  const costo = (n: number) => (n ? usd(gasto / n) : "—");

  const enVivo = pgRows.filter((p) => p.is_live);
  const atribuible = pgRows.length <= 1 || enVivo.length === 1;
  const aviso = atribuible ? "" :
    `ATRIBUCIÓN — LEER ANTES DE USAR ESTOS NÚMEROS: el DME tiene un solo cajón de embudo por cliente y éste tiene ${pgRows.length} embudos (${enVivo.length} en vivo). Estos porcentajes son del CLIENTE ENTERO, no de un embudo puntual.`;

  return {
    texto: [
      `— CALIDAD DEL LEAD (DME, ${dRows.length} días cargados en los últimos 30) —`,
      `Total de leads: ${total}  ·  gasto ${usd(gasto)}  ·  CPL ${usd(gasto / total)}`,
      "",
      `  Curiosos:    ${cur} (${pct(cur, total)})  ·  costo por curioso ${costo(cur)}`,
      `  Interesados: ${inte} (${pct(inte, total)})  ·  costo por interesado ${costo(inte)}`,
      `  CALIFICADOS: ${cal} (${pct(cal, total)})  ·  costo por lead calificado ${costo(cal)}`,
      "",
      `Cierres registrados: ${s("embudo1_cierres")}`,
      "",
      "Cómo se lee: el CPL a secas no dice nada. Un CPL de US$1 con 90% de curiosos es más caro",
      "que uno de US$5 con 40% de calificados. El número que manda es el COSTO POR LEAD CALIFICADO.",
      aviso,
    ].filter(Boolean).join("\n"),
    fuente: atribuible
      ? { rotulo: "Calidad del lead", estado: "ok", detalle: `${total} leads, ${dRows.length} días` }
      : { rotulo: "Calidad del lead", estado: "parcial", detalle: `mezcla ${pgRows.length} embudos` },
    remedio: atribuible ? undefined : `El DME mezcla los ${pgRows.length} embudos de este cliente en un solo cajón. Para diagnosticar un embudo puntual hace falta que el DME se cargue por embudo.`,
    meta: { total, curiosos: cur, interesados: inte, calificados: cal, atribuible },
  };
}

// ── 5) Retrasos y problemas, ATRIBUIDOS ──────────────────────────────────────
// El bloque que se usa para confrontar en una negociación. Por eso la atribución la hace el
// CÓDIGO con banderas de la base (asignada_cliente, is_client_task, portal_pedidos = cosas que
// el cliente debe entregar; el resto es nuestro) y no la lectura del modelo.
async function retrasos(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  const desde30 = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: tasks }, { data: pedidos }, { data: pend }, { data: blockers }, { data: llam }] = await Promise.all([
    ctx.supabase.from("tasks")
      .select("title,status,assignee,department,blocked_since,due_date,started_date,asignada_cliente,is_client_task,review_reason,notes")
      .eq("client_id", ctx.clientId).neq("status", "done").limit(100),
    ctx.supabase.from("portal_pedidos").select("tipo,titulo,estado,pedido_at,compromiso_at,bloqueante")
      .eq("client_id", ctx.clientId).neq("estado", "completado").order("pedido_at", { ascending: false }).limit(20),
    ctx.supabase.from("wa_pending_items").select("pregunta,urgencia,tipo,wa_timestamp")
      .eq("client_id", ctx.clientId).is("resolved_at", null).order("wa_timestamp", { ascending: false }).limit(20),
    ctx.supabase.from("team_blockers").select("description,needs,created_at")
      .eq("client_id", ctx.clientId).eq("resolved", false).order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("llamadas").select("titulo,fecha,problemas_detectados,proximos_pasos")
      .eq("cliente_id", ctx.clientId).gte("fecha", desde30).order("fecha", { ascending: false }).limit(6),
  ]);

  const tRows = Array.isArray(tasks) ? tasks : [];
  const peRows = Array.isArray(pedidos) ? pedidos : [];
  const pRows = Array.isArray(pend) ? pend : [];
  const bRows = Array.isArray(blockers) ? blockers : [];
  const lRows = Array.isArray(llam) ? llam : [];

  const esDelCliente = (t: Record<string, unknown>) => !!t.asignada_cliente || !!t.is_client_task;
  const vencida = (t: Record<string, unknown>) => str(t.due_date) && fecha(t.due_date) < HOY;
  const trabada = (t: Record<string, unknown>) => str(t.blocked_since) || str(t.status) === "blocked";

  const linea = (t: Record<string, unknown>) => {
    const bits = [
      str(t.blocked_since) ? `trabada hace ${diasDesde(t.blocked_since)} días (desde ${fecha(t.blocked_since)})` : "",
      vencida(t) ? `VENCIÓ el ${fecha(t.due_date)}, hace ${diasDesde(t.due_date)} días` : (str(t.due_date) ? `vence ${fecha(t.due_date)}` : ""),
      str(t.assignee) ? `responsable: ${str(t.assignee)}` : "sin responsable",
    ].filter(Boolean);
    return `  · [${str(t.status)}] ${str(t.title)} — ${bits.join(" · ")}${str(t.review_reason) ? ` · motivo de revisión: ${str(t.review_reason)}` : ""}`;
  };

  // ── Del lado del CLIENTE ──
  const tCliente = tRows.filter((t) => esDelCliente(t) && (vencida(t) || trabada(t) || str(t.status) !== "backlog"));
  const pedidosVencidos = peRows.filter((p) => str(p.compromiso_at) && fecha(p.compromiso_at) < HOY);
  const ladoCliente = [
    tCliente.length ? `Tareas que dependen de él (${tCliente.length}):\n${tCliente.map(linea).join("\n")}` : "",
    peRows.length
      ? `Pedidos que le hicimos y no entregó (${peRows.length}${pedidosVencidos.length ? `, ${pedidosVencidos.length} con la fecha comprometida VENCIDA` : ""}):\n${peRows.map((p) => {
        const c = str(p.compromiso_at) ? (fecha(p.compromiso_at) < HOY ? ` · SE COMPROMETIÓ para el ${fecha(p.compromiso_at)} y no cumplió (hace ${diasDesde(p.compromiso_at)} días)` : ` · se comprometió para ${fecha(p.compromiso_at)}`) : "";
        return `  · ${str(p.titulo)}${p.bloqueante ? " [BLOQUEANTE]" : ""} — pedido el ${fecha(p.pedido_at)} (hace ${diasDesde(p.pedido_at)} días), estado "${str(p.estado)}"${c}`;
      }).join("\n")}`
      : "",
  ].filter(Boolean);

  // ── Del lado de KOREX ──
  const tKorex = tRows.filter((t) => !esDelCliente(t) && (vencida(t) || trabada(t)));
  const deadlines = (client?.phase_deadlines || {}) as Record<string, unknown>;
  const customPhases = Array.isArray(client?.custom_phases) ? client!.custom_phases as Record<string, unknown>[] : [];
  const labelFase = (id: string) => PHASES[id] || str(customPhases.find((p) => str(p.id) === id)?.label) || id;
  const fasesVencidas = Object.entries(deadlines).filter(([, f]) => str(f) && str(f) < HOY)
    .map(([id, f]) => `  · "${labelFase(id)}" venció el ${str(f)} — hace ${diasDesde(f)} días`);

  const ladoKorex = [
    fasesVencidas.length ? `Fases del servicio con la fecha vencida (${fasesVencidas.length}):\n${fasesVencidas.join("\n")}` : "",
    tKorex.length ? `Tareas nuestras vencidas o trabadas (${tKorex.length}):\n${tKorex.map(linea).join("\n")}` : "",
    pRows.length
      ? `Preguntas del cliente que NO le respondimos (${pRows.length}):\n${pRows.map((p) => `  · [${str(p.urgencia)}] ${str(p.pregunta)} — preguntó el ${fecha(p.wa_timestamp)}, hace ${diasDesde(p.wa_timestamp)} días`).join("\n")}`
      : "",
    bRows.length
      ? `Bloqueos que reportó el equipo y siguen sin resolver (${bRows.length}):\n${bRows.map((b) => `  · ${str(b.description)}${str(b.needs) ? ` — necesita: ${str(b.needs)}` : ""} (hace ${diasDesde(b.created_at)} días)`).join("\n")}`
      : "",
  ].filter(Boolean);

  // ── Problemas hablados en llamadas de los últimos 30 días ──
  const problemas = lRows.flatMap((l) => {
    const ps = lista(l.problemas_detectados);
    return ps.length ? [`  De "${str(l.titulo)}" (${fecha(l.fecha)}):\n${ps.map((p) => `    · ${p}`).join("\n")}`] : [];
  });

  const nada = !ladoCliente.length && !ladoKorex.length && !problemas.length;
  return {
    texto: nada ? "" : [
      "— RETRASOS Y PROBLEMAS (últimos 30 días, la atribución la calcula el sistema) —",
      "",
      "### DEL LADO DEL CLIENTE (lo que él no entregó)",
      ladoCliente.length ? ladoCliente.join("\n\n") : "  Nada pendiente de su lado.",
      "",
      "### DEL LADO DE KOREX (lo que nosotros no cumplimos)",
      ladoKorex.length ? ladoKorex.join("\n\n") : "  Nada vencido de nuestro lado.",
      "",
      problemas.length ? `### PROBLEMAS HABLADOS EN LLAMADAS (últimos 30 días)\n${problemas.join("\n")}` : "",
      "",
      "Cómo se usa: esta separación es la que permite confrontar con datos en una negociación.",
      "Si el cliente reclama, hay que poder decir exactamente qué se atrasó de cada lado y cuántos días.",
    ].filter(Boolean).join("\n"),
    fuente: nada
      ? { rotulo: "Retrasos", estado: "vacio", detalle: "sin retrasos registrados" }
      : { rotulo: "Retrasos", estado: "ok", detalle: `${ladoCliente.length ? "cliente" : ""}${ladoCliente.length && ladoKorex.length ? " + " : ""}${ladoKorex.length ? "Korex" : ""}` },
    remedio: nada ? "No hay ni tareas vencidas, ni pedidos abiertos, ni preguntas sin responder. O va todo perfecto, o el trabajo de este cliente no se está cargando en el panel." : undefined,
    meta: { tareas_cliente: tCliente.length, pedidos_abiertos: peRows.length, tareas_korex: tKorex.length, sin_responder: pRows.length, fases_vencidas: fasesVencidas.length },
  };
}

// ── 6) Entregas pendientes: lo que KOREX le debe ─────────────────────────────
async function entregas(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: tasks }, { data: llam }, { data: pipe }] = await Promise.all([
    ctx.supabase.from("tasks").select("title,status,assignee,department,due_date,definition_of_done,asignada_cliente,is_client_task")
      .eq("client_id", ctx.clientId).neq("status", "done").order("updated_at", { ascending: false }).limit(60),
    ctx.supabase.from("llamadas").select("titulo,fecha,proximos_pasos").eq("cliente_id", ctx.clientId)
      .order("fecha", { ascending: false }).limit(3),
    ctx.supabase.rpc("cerebro_pipeline_status", { p_client_id: ctx.clientId }),
  ]);
  const tRows = (Array.isArray(tasks) ? tasks : []).filter((t) => !t.asignada_cliente && !t.is_client_task);
  const lRows = Array.isArray(llam) ? llam : [];
  const pRows = Array.isArray(pipe) ? pipe as Record<string, unknown>[] : [];

  // Qué etapa traba cada funnel: es la entrega concreta que falta.
  const porFunnel = new Map<string, { nombre: string; etapas: Record<string, unknown>[] }>();
  for (const r of pRows) {
    const id = str(r.funnel_id);
    if (!porFunnel.has(id)) porFunnel.set(id, { nombre: str(r.funnel), etapas: [] });
    porFunnel.get(id)!.etapas.push(r);
  }
  const trabas = [...porFunnel.values()].map((f) => {
    const etapas = f.etapas.sort((a, b) => num(a.ord) - num(b.ord));
    const pend = etapas.find((e) => str(e.status) !== "listo");
    const listas = etapas.filter((e) => str(e.status) === "listo").length;
    return `  · "${f.nombre}" — ${listas}/${etapas.length} etapas listas. ${pend ? `TRABADO EN: ${str(pend.stage_label)}${str(pend.detail) && str(pend.detail) !== "OK" ? ` (${str(pend.detail)})` : ""}` : "TODAS LISTAS"}`;
  });

  const compromisos = lRows.flatMap((l) => {
    const ps = lista(l.proximos_pasos);
    return ps.length ? [`  De la llamada "${str(l.titulo)}" (${fecha(l.fecha)}, hace ${diasDesde(l.fecha)} días):\n${ps.map((p) => `    · ${p}`).join("\n")}`] : [];
  });

  const nada = !tRows.length && !trabas.length && !compromisos.length;
  return {
    texto: nada ? "" : [
      "— ENTREGAS PENDIENTES: LO QUE KOREX LE DEBE AL CLIENTE —",
      trabas.length ? `Por funnel (dónde está trabada la producción):\n${trabas.join("\n")}` : "",
      tRows.length
        ? `\nTareas nuestras abiertas (${tRows.length}):\n${tRows.slice(0, 30).map((t) => `  · [${str(t.status)}] ${str(t.title)}${str(t.assignee) ? ` — ${str(t.assignee)}` : " — SIN RESPONSABLE"}${str(t.department) ? ` (${str(t.department)})` : ""}${str(t.due_date) ? ` · vence ${fecha(t.due_date)}${fecha(t.due_date) < HOY ? " ⚠VENCIDA" : ""}` : ""}`).join("\n")}${tRows.length > 30 ? `\n  (se listan 30 de ${tRows.length})` : ""}`
        : "",
      compromisos.length ? `\nCOMPROMISOS QUE ASUMIMOS EN LAS ÚLTIMAS LLAMADAS (revisá cuáles siguen sin cumplirse):\n${compromisos.join("\n")}` : "",
    ].filter(Boolean).join("\n"),
    fuente: nada
      ? { rotulo: "Entregas", estado: "vacio", detalle: "sin entregas pendientes" }
      : { rotulo: "Entregas", estado: "ok", detalle: `${tRows.length} tareas · ${porFunnel.size} funnels` },
    meta: { tareas: tRows.length, funnels: porFunnel.size },
  };
}

// ── 7) Cobros: qué pagó, qué debe, qué venció ────────────────────────────────
// clients.billing_* NO es confiable (billing_amount cargado en 11 de 37, billing_status dice
// 'al_dia' en los 37 porque nadie lo toca). La verdad de los pagos está en fin_incomes.
// Tampoco se usan fin_cuadre_cliente / fin_cliente_debe_korex: cruzan por NOMBRE, no por id.
async function cobros(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  const [{ data: incomes }, { data: terms }, { data: planes }, { data: runway }, { data: refunds }] = await Promise.all([
    // SIN tope chico: los totales de este bloque deciden si a alguien se le reclama plata.
    // Con .limit(60) un cliente con 188 pagos daba "setup cobrado US$0 → DEBE US$12.000"
    // cuando en realidad tenía US$14.260 cobrados: los pagos de setup son los más VIEJOS y
    // quedaban fuera de la ventana. Se traen todos y se agrega en memoria.
    ctx.supabase.from("fin_incomes")
      .select("income_date,effective_type,income_type,amount_usd,amount_eur,net_usd,payment_method,status,facturado")
      .eq("client_id", ctx.clientId).order("income_date", { ascending: false }).limit(2000),
    ctx.supabase.from("fin_client_terms").select("service_value,umbral_base,agreement_date,payment_method,csm_name,notes")
      .eq("client_id", ctx.clientId).maybeSingle(),
    ctx.supabase.from("fin_payment_plans").select("total_amount,currency,status,start_date,notes")
      .eq("client_id", ctx.clientId).limit(5),
    ctx.supabase.from("ads_runway_alerts").select("last_tier,last_runway,updated_at").eq("client_id", ctx.clientId).maybeSingle(),
    ctx.supabase.from("fin_refunds").select("*").eq("client_id", ctx.clientId).limit(5),
  ]);

  const iRows = Array.isArray(incomes) ? incomes : [];
  const plRows = Array.isArray(planes) ? planes : [];
  const rfRows = Array.isArray(refunds) ? refunds : [];

  if (!iRows.length && !terms) {
    return {
      texto: "", fuente: { rotulo: "Cobros", estado: "falta", detalle: "sin pagos ni términos" },
      remedio: "No hay ni un pago con client_id ni términos en fin_client_terms. Puede que los pagos estén cargados sin cliente asignado: revisar en Finanzas. NO SE PUEDE JUZGAR SU HÁBITO DE PAGO NI QUÉ DEBE.",
    };
  }

  const tipo = (r: Record<string, unknown>) => (str(r.effective_type) || str(r.income_type)).toUpperCase();
  const sumaDe = (t: string) => iRows.filter((r) => tipo(r).includes(t)).reduce((a, r) => a + num(r.amount_usd), 0);
  const setupPagado = sumaDe("SETUP");
  const pubPagado = sumaDe("PUBLICIDAD");
  const crmPagado = sumaDe("CRM");

  // Ritmo mes a mes: es lo que sostiene cualquier juicio sobre capacidad de pago.
  const porMes = new Map<string, { total: number; n: number; tipos: Set<string> }>();
  for (const r of iRows) {
    const m = fecha(r.income_date).slice(0, 7);
    const a = porMes.get(m) || { total: 0, n: 0, tipos: new Set<string>() };
    a.total += num(r.amount_usd); a.n += 1; a.tipos.add(tipo(r) || "?");
    porMes.set(m, a);
  }
  const meses = [...porMes.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 12);
  const diasUltimo = iRows.length ? diasDesde(iRows[0].income_date) : 9999;

  // Deuda de setup: lo acordado contra lo efectivamente cobrado.
  const acordado = num(terms?.service_value);
  const debeSetup = acordado ? acordado - setupPagado : 0;

  return {
    texto: [
      "— COBROS: QUÉ PAGÓ, QUÉ DEBE, QUÉ VENCIÓ —",
      terms
        ? `ACORDADO: valor del servicio ${acordado ? usd(acordado) : "—"} · umbral base ${num(terms.umbral_base) ? usd(terms.umbral_base) : "—"} · acordado el ${fecha(terms.agreement_date)} · método ${str(terms.payment_method) || "—"}${str(terms.csm_name) ? ` · CSM ${str(terms.csm_name)}` : ""}`
        : "ACORDADO: no hay términos cargados en fin_client_terms para este cliente.",
      str(terms?.notes) ? `  Notas del acuerdo: ${clip(str(terms?.notes), 600)}` : "",
      "",
      `COBRADO HASTA HOY (${iRows.length} pagos): SETUP ${usd(setupPagado)} · PUBLICIDAD ${usd(pubPagado)} · CRM ${usd(crmPagado)} · TOTAL ${usd(setupPagado + pubPagado + crmPagado)}`,
      acordado
        ? (debeSetup > 1
          ? `SALDO DE SETUP: DEBE ${usd(debeSetup)} (acordado ${usd(acordado)}, cobrado ${usd(setupPagado)}). Antes de reclamarlo, confirmalo en Finanzas: puede haber pagos cargados sin cliente asignado.`
          : debeSetup < -1
            ? `SALDO DE SETUP: saldado y COBRADO DE MÁS — acordado ${usd(acordado)} pero cobrado ${usd(setupPagado)} (${usd(-debeSetup)} por encima). Suele significar que el acuerdo se amplió y fin_client_terms quedó desactualizado, o que hay pagos de otro concepto clasificados como SETUP. NO se le reclama nada de setup a este cliente.`
            : `SALDO DE SETUP: saldado (acordado ${usd(acordado)}, cobrado ${usd(setupPagado)}).`)
        : "SALDO DE SETUP: no se puede calcular, falta el valor acordado en fin_client_terms.",
      num(client?.remaining_to_collect) ? `FALTA COBRAR según la ficha: ${usd(client?.remaining_to_collect)}${num(client?.cash_collect) ? ` (ya cobrado ${usd(client?.cash_collect)})` : ""}` : "",
      "",
      `ÚLTIMO PAGO: ${iRows.length ? `${fecha(iRows[0].income_date)} — hace ${diasUltimo} días — ${tipo(iRows[0])} ${usd(iRows[0].amount_usd)}` : "ninguno"}`,
      diasUltimo > 45 && diasUltimo < 9999 ? `⚠ Hace ${diasUltimo} días que no entra un pago de este cliente.` : "",
      "",
      `RITMO DE PAGO MES A MES (últimos ${meses.length} meses con movimiento):`,
      ...meses.map(([m, v]) => `  · ${m}: ${usd(v.total)} en ${v.n} pago(s) — ${[...v.tipos].join(", ")}`),
      "",
      `ÚLTIMOS 10 PAGOS:`,
      ...iRows.slice(0, 10).map((r) => `  · ${fecha(r.income_date)} · ${tipo(r)} · ${usd(r.amount_usd)} · ${str(r.payment_method) || "—"} · estado "${str(r.status) || "—"}"${r.facturado ? " · facturado" : " · SIN FACTURAR"}`),
      plRows.length ? `\nPLANES DE PAGO: ${plRows.map((p) => `${usd(p.total_amount)} ${str(p.currency)} — estado "${str(p.status)}" desde ${fecha(p.start_date)}`).join(" · ")}` : "",
      rfRows.length ? `\n⚠ REINTEGROS REGISTRADOS: ${rfRows.length}. ${clip(JSON.stringify(rfRows), 600)}` : "",
      runway ? `\nSALDO DE PUBLICIDAD: tier "${str(runway.last_tier)}" · quedan ~${num(runway.last_runway)} días de saldo (medido ${fecha(runway.updated_at)})${num(runway.last_runway) < 5 ? " ⚠ CRÍTICO" : ""}` : "",
      num(client?.billing_amount)
        ? `\nOJO — la ficha declara una facturación de ${num(client?.billing_amount)} ${str(client?.billing_currency) || ""} ${str(client?.billing_cycle) || ""}, pero ese campo está cargado en menos de un tercio de los clientes y su estado de pago nunca se actualiza. Si contradice a los pagos de arriba, GANAN LOS PAGOS.`
        : "",
    ].filter(Boolean).join("\n"),
    fuente: iRows.length
      ? (diasUltimo <= 60
        ? { rotulo: "Cobros", estado: "ok", detalle: `${iRows.length} pagos, último hace ${diasUltimo} días` }
        : { rotulo: "Cobros", estado: "viejo", detalle: `último pago hace ${diasUltimo} días` })
      : { rotulo: "Cobros", estado: "parcial", detalle: "hay términos pero ningún pago con client_id" },
    remedio: iRows.length
      ? (diasUltimo <= 60 ? undefined : `Hace ${diasUltimo} días que no entra un pago. Verificar si dejó de pagar o si los pagos están cargados sin client_id en Finanzas.`)
      : "Hay términos acordados pero ningún pago cruzado por client_id. Revisar en Finanzas que los ingresos de este cliente tengan el cliente asignado.",
    meta: { pagos: iRows.length, dias_ultimo: diasUltimo, setup_pagado: setupPagado, debe_setup: debeSetup > 1 ? debeSetup : 0 },
  };
}

// ── 8) Satisfacción: los 4 canales de WhatsApp + tendencia ───────────────────
async function satisfaccion(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: brief }, { data: hist }] = await Promise.all([
    ctx.supabase.from("wa_briefings").select("*").eq("client_id", ctx.clientId).maybeSingle(),
    ctx.supabase.from("wa_satisfaction_history").select("scope,week_start,score,label,notas")
      .eq("client_id", ctx.clientId).order("week_start", { ascending: false }).limit(40),
  ]);

  if (!brief) {
    return {
      texto: "", fuente: { rotulo: "Satisfacción", estado: "falta", detalle: "sin briefing de WhatsApp" },
      remedio: "Este cliente no tiene fila en wa_briefings: su grupo de WhatsApp no está vinculado o nunca se analizó. Revisar en Soporte que la conversación esté asociada al cliente. SIN ESTO NO SE PUEDE OPINAR SOBRE SU SATISFACCIÓN.",
    };
  }

  const b = brief as Record<string, unknown>;
  const dias = diasDesde(b.updated_at);
  const canal = (score: unknown, label: unknown, nombre: string, resumen: unknown): string => {
    if (score === null || score === undefined) return `${nombre}: sin dato`;
    const r = str(resumen);
    return `${nombre}: ${num(score)}/100${str(label) ? ` (${str(label)})` : ""}${r ? `\n   ${clip(r, 900)}` : ""}`;
  };

  const hRows = Array.isArray(hist) ? hist : [];
  const porScope = new Map<string, { week: string; score: number }[]>();
  for (const r of hRows) {
    const s = str(r.scope) || "general";
    if (!porScope.has(s)) porScope.set(s, []);
    porScope.get(s)!.push({ week: fecha(r.week_start), score: num(r.score) });
  }
  const tendencias = [...porScope.entries()].map(([scope, serie]) => {
    const s = serie.slice(0, 8);
    if (s.length < 2) return `${scope}: ${s[0]?.score ?? "—"} (una sola semana, sin tendencia)`;
    const delta = s[0].score - s[s.length - 1].score;
    const signo = delta > 0 ? `subió ${delta}` : delta < 0 ? `BAJÓ ${Math.abs(delta)}` : "estable";
    return `${scope}: ${signo} pts en ${s.length} semanas — ${s.map((x) => `${x.week}:${x.score}`).join(" → ")}`;
  });

  return {
    texto: [
      `— SATISFACCIÓN (inferida por IA de los mensajes de WhatsApp, NO es una encuesta · último análisis ${fecha(b.updated_at)}) —`,
      `GENERAL: ${b.sat_overall === null || b.sat_overall === undefined ? "sin dato" : `${num(b.sat_overall)}/100`}   (umbrales del panel: ≥75 verde · ≥50 amarillo · <50 rojo)`,
      "",
      canal(b.sat_cliente_grupo, b.sat_cliente_grupo_label, "Grupo con el cliente", b.resumen_cliente_grupo),
      canal(b.sat_privado_cliente, b.sat_privado_cliente_label, "Privado con el cliente", b.resumen_privado_cliente),
      canal(b.sat_usuarios, b.sat_usuarios_label, "Grupo de sus usuarios", b.resumen_usuarios),
      canal(b.sat_privado_usuarios, b.sat_privado_usuarios_label, "Privado con sus usuarios", b.resumen_privado_usuarios),
      "",
      tendencias.length ? `TENDENCIA (calculada por el sistema):\n${tendencias.map((t) => `- ${t}`).join("\n")}` : "TENDENCIA: sin serie histórica todavía.",
      "",
      str(b.estado) ? `ESTADO SEGÚN EL ANÁLISIS DE WHATSAPP:\n${clip(str(b.estado), 3000)}` : "",
      str(b.riesgos) ? `\nRIESGOS DETECTADOS:\n${clip(str(b.riesgos), 2000)}` : "",
    ].filter(Boolean).join("\n"),
    fuente: dias <= 8
      ? { rotulo: "Satisfacción", estado: "ok", detalle: `análisis del ${fecha(b.updated_at)}` }
      : { rotulo: "Satisfacción", estado: "viejo", detalle: `análisis de hace ${dias} días` },
    remedio: dias <= 8 ? undefined : `El análisis de WhatsApp es de hace ${dias} días. Remedio: correr el análisis semanal de Soporte.`,
    meta: { overall: b.sat_overall ?? null, semanas: hRows.length },
  };
}

// ── 9) Llamadas: lo que el cliente DIJO, con objeciones ──────────────────────
async function llamadas(ctx: AgentCtx): Promise<Bloque> {
  const { data } = await ctx.supabase.from("llamadas")
    .select("titulo,fecha,categoria,duracion_min,resumen,problemas_detectados,objeciones,feedback,proximos_pasos,notas_clave,participantes")
    .eq("cliente_id", ctx.clientId).order("fecha", { ascending: false }).limit(6);
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "Llamadas", estado: "falta", detalle: "ninguna ligada a este cliente" },
      remedio: "No hay llamadas con cliente_id de este cliente. Puede que existan en el inbox de Fathom sin asignar: revisar la sección Llamadas y asignarle el cliente. NO SE SABE QUÉ DIJO EL CLIENTE EN PERSONA, ni qué objeciones puso, ni qué se le prometió.",
    };
  }

  const dias = diasDesde(rows[0].fecha);
  const bloque = (r: Record<string, unknown>) => {
    const prob = lista(r.problemas_detectados), obj = lista(r.objeciones);
    const fb = lista(r.feedback), pasos = lista(r.proximos_pasos);
    return [
      `— "${str(r.titulo) || "(sin título)"}" · ${fecha(r.fecha)} · ${str(r.categoria)}${num(r.duracion_min) ? ` · ${num(r.duracion_min)} min` : ""} · hace ${diasDesde(r.fecha)} días`,
      Array.isArray(r.participantes) && r.participantes.length ? `PARTICIPANTES: ${(r.participantes as unknown[]).map(str).join(", ")}` : "",
      str(r.resumen) ? `RESUMEN: ${clip(str(r.resumen), 2500)}` : "",
      prob.length ? `PROBLEMAS DETECTADOS:${prob.map((x) => `\n  · ${x}`).join("")}` : "",
      obj.length ? `OBJECIONES QUE PUSO:${obj.map((x) => `\n  · ${x}`).join("")}` : "",
      fb.length ? `FEEDBACK:${fb.map((x) => `\n  · ${x}`).join("")}` : "",
      pasos.length ? `PRÓXIMOS PASOS ACORDADOS:${pasos.map((x) => `\n  · ${x}`).join("")}` : "",
      str(r.notas_clave) ? `NOTAS: ${clip(str(r.notas_clave), 800)}` : "",
    ].filter(Boolean).join("\n");
  };

  return {
    texto: [`— LLAMADAS (últimas ${rows.length}, la más reciente hace ${dias} días · extraídas por IA del transcript de Fathom) —`, ...rows.map(bloque)].join("\n\n"),
    fuente: dias <= 30
      ? { rotulo: "Llamadas", estado: "ok", detalle: `${rows.length}, última hace ${dias} días` }
      : { rotulo: "Llamadas", estado: "viejo", detalle: `la última es de hace ${dias} días` },
    remedio: dias <= 30 ? undefined : `Hace ${dias} días que no hay una llamada registrada con este cliente. O no se habló, o la llamada no quedó asignada al cliente.`,
    meta: { llamadas: rows.length, dias_ultima: dias },
  };
}

// ── 10) Timeline ─────────────────────────────────────────────────────────────
async function timeline(ctx: AgentCtx): Promise<Bloque> {
  const { data } = await ctx.supabase.from("historial_eventos")
    .select("fecha,tipo,titulo,descripcion,estado,responsable")
    .eq("cliente_id", ctx.clientId).eq("dismissed", false)
    .order("fecha", { ascending: false }).limit(20);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "Historial", estado: "falta", detalle: "sin eventos" },
      remedio: "Este cliente no tiene eventos en el historial (sólo 13 de 37 clientes lo usan). No es grave: la línea de tiempo se reconstruye con las llamadas y los pagos.",
    };
  }
  return {
    texto: [`— HISTORIAL (últimos ${rows.length} eventos) —`,
      ...rows.map((r) => `  · ${fecha(r.fecha)} [${str(r.tipo)}] ${str(r.titulo)}${str(r.estado) ? ` (${str(r.estado)})` : ""}${str(r.responsable) ? ` — ${str(r.responsable)}` : ""}${str(r.descripcion) ? `\n      ${clip(str(r.descripcion), 400)}` : ""}`)].join("\n"),
    fuente: { rotulo: "Historial", estado: "ok", detalle: `${rows.length} eventos` },
    meta: { eventos: rows.length },
  };
}

// ── El módulo ────────────────────────────────────────────────────────────────
const cuenta: AgentModule = {
  key: "cuenta",
  nivel: "cliente",

  // Contrato de salida con el panel (no editable desde el Cerebro).
  // La estructura es la que pidió el equipo: pensada para que alguien que NO conoce al cliente
  // pueda leerla y entender su situación completa, con números concretos y no adjetivos.
  formato: [
    "- Para un REPASO del cliente (el pedido típico), esta estructura es OBLIGATORIA y en este orden. Las secciones marcadas (condicional) se OMITEN enteras si no aplican — no se ponen vacías:",
    "",
    "  `## 1. Fase del servicio` — dónde está, de un vistazo. Arrancá con una línea `> **FASE:** <nombre> · <🟢 en marcha | 🟡 demorado | 🔴 trabado>` y abajo 2-3 líneas: qué se le está haciendo ahora, quién lo lleva, avance del roadmap.",
    "  `## 2. Fechas clave` — tabla `Hito | Fecha | Hace cuánto`: alta, firma del contrato, primer pago de setup, ARRANQUE REAL del servicio, renovación. Si hay brecha entre la firma y el arranque real, **decila en negrita**: es el dato que evita discutir sobre percepciones (\"dice que lleva 5 meses\" vs. \"hace 3 semanas que tiene leads\").",
    "  `## 3. Retrasos y problemas` — DOS subtítulos `### Del lado del cliente` y `### Del lado de Korex`, cada uno con lista y **días de atraso concretos**. Esta sección se usa para confrontar con datos: sin fechas y sin días no sirve. Si un lado está limpio, decilo en una línea.",
    "  `## 4. Promesa vs. resultados` — qué se contrató, qué se entregó, qué falta. Tabla `Prometido | Estado | Evidencia`. Si no está registrado qué se prometió al firmar, decilo explícitamente en vez de suponerlo.",
    "  `## 5. Métricas por funnel` (condicional: omitir si nunca lanzó publicidad) — el detalle fino, como el informe diario. Tabla a 7 días y, si hay DME, a 30 días: gasto, leads, CPL, CTR, CPM, hook, hold. Después una tabla `Campaña | Gasto | Leads | CPL | Anuncios activos`, y la **calidad del lead** (% curiosos / interesados / calificados y el costo por lead calificado). Cerrá diciendo qué funnels están publicando y cuáles no.",
    "  `## 6. Cobros` — tabla `Concepto | Acordado | Cobrado | Debe | Vencimiento`. Sumá el ritmo de pago mes a mes y el saldo de publicidad si está en riesgo.",
    "  `## 7. Próximo paso comercial` — qué se le puede pedir AHORA y por qué ahora: renovar, subir pauta, sumar gente, pasar a partner, agendar un Zoom. Concreto, con el monto o la acción exacta.",
    "  `## 8. Objeciones probables y cómo rebatirlas` — tabla `Objeción | Por qué la va a poner | Cómo la rebato`. Las objeciones salen de lo que YA dijo en llamadas cuando existan; si no, de su situación real. Si no cumplimos algo, decí qué ofrecer para compensar antes de pedir.",
    "  `## 9. Entregas pendientes` — lo que Korex le debe, con responsable y días de atraso.",
    "",
    "- Para una pregunta puntual: prosa directa, con el dato citado y su fecha. La estructura completa es para el repaso.",
    "- Para \"¿pagaría una mensualidad?\": `## Qué recibió` · `## Qué resultados tiene` · `## Cómo paga hoy` · `## A favor` · `## En contra` · `## Veredicto` — y el veredicto SIEMPRE cierra con nivel de confianza (alto/medio/bajo) y qué lo subiría.",
    "- **Los números van completos, no redondeados a una impresión.** \"CPL US$1,53 con 2.293 leads en 7 días\" sirve; \"buen CPL\" no. Quien lee puede no conocer al cliente: cada afirmación tiene que venir con su número y su fecha.",
    "- Cada afirmación arranca con `DATO:` (está en el dossier, con su fecha) o `LECTURA:` (interpretación tuya). En las tablas, la columna de lectura/estado es la única que opina.",
    "- La COBERTURA DE DATOS manda: lo marcado ✗ no existe y cualquier afirmación que lo necesite es LECTURA, o directamente no se hace.",
  ].join("\n"),

  async buildContext(ctx: AgentCtx): Promise<AgentContextResult> {
    const { data: client } = await ctx.supabase.from("clients")
      .select("name,company,niche,team_name,service,tier,client_type,status,priority,country,start_date,pm,closer,conector,bottleneck,notes,custom_phases,phase_name_overrides,phase_deadlines,contract_signed_date,billing_amount,billing_currency,billing_cycle,cash_collect,remaining_to_collect")
      .eq("id", ctx.clientId).maybeSingle();
    const cli = (client || null) as Record<string, unknown> | null;

    const datasets = Array.isArray(ctx.manifest.datasets)
      ? (ctx.manifest.datasets as string[])
      : ["ficha", "fechas", "publicidad", "calidad", "retrasos", "entregas", "cobros", "satisfaccion", "llamadas", "timeline"];
    const on = (k: string) => datasets.includes(k);

    const [bFicha, bFechas, bPub, bCal, bRet, bEnt, bCob, bSat, bLlam, bTime] = await Promise.all([
      on("ficha") ? ficha(ctx, cli) : null,
      on("fechas") ? fechas(ctx, cli) : null,
      on("publicidad") ? publicidad(ctx) : null,
      on("calidad") ? calidadLead(ctx) : null,
      on("retrasos") ? retrasos(ctx, cli) : null,
      on("entregas") ? entregas(ctx) : null,
      on("cobros") ? cobros(ctx, cli) : null,
      on("satisfaccion") ? satisfaccion(ctx) : null,
      on("llamadas") ? llamadas(ctx) : null,
      on("timeline") ? timeline(ctx) : null,
    ]);

    const bloques = [bFicha, bFechas, bPub, bCal, bRet, bEnt, bCob, bSat, bLlam, bTime].filter(Boolean) as Bloque[];

    const cobertura = [
      "===== COBERTURA DE DATOS (calculada por el sistema — es la autoridad, no la discutas) =====",
      ...bloques.map((b) => {
        const f = b.fuente;
        const marca = f.estado === "ok" ? "✓" : f.estado === "falta" ? "✗" : "⚠";
        const linea = `${marca} ${f.rotulo}${f.detalle ? ` — ${f.detalle}` : ""}`;
        return b.remedio ? `${linea}\n   REMEDIO: ${b.remedio}` : linea;
      }),
      "",
      "Reglas que salen de esto:",
      "- Lo marcado ✗ NO existe. Cualquier afirmación que lo necesite es LECTURA y lo decís, o directamente no la hacés.",
      "- Lo marcado ⚠ está viejo o incompleto: citá la fecha cada vez que lo uses.",
      "- Si te preguntan por algo que está en ✗, decí que no lo sabés y pasá el REMEDIO tal cual figura acá. No lo aproximes con lo que sí tenés.",
      "- Una sección del formato cuyo dato esté entero en ✗ se OMITE (ej.: sin publicidad lanzada no va la sección de métricas), y el hecho de que falte se menciona en la fase del servicio.",
    ].join("\n");

    const dossier = bloques.map((b) => b.texto).filter(Boolean).join("\n\n");

    const estable = [
      "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
      `Cliente: ${str(cli?.name) || ctx.clientId}${str(cli?.company) ? ` · Empresa: ${str(cli?.company)}` : ""}`,
      `Hoy es ${HOY}. Todas las antigüedades y los días de atraso del dossier están calculados contra esta fecha.`,
      "",
      "Quien lee tu respuesta puede NO conocer a este cliente. Escribí para que se entienda su",
      "situación completa sin haber hablado nunca con él: números con su unidad y su fecha,",
      "nombres propios de campañas y funnels, y días concretos de atraso en vez de adjetivos.",
      "",
      "Sobre la satisfacción, antes de que la uses: los puntajes salen de un análisis de IA de los",
      "mensajes de WhatsApp, NO de una encuesta. Nadie le preguntó nada al cliente. Sirven para",
      "priorizar y detectar deterioro; no se reportan como su opinión declarada.",
      "",
      cobertura,
      "",
      "===== DOSSIER DEL CLIENTE =====",
      dossier || "(ningún dataset devolvió datos — mirá la cobertura de arriba)",
    ].join("\n");

    return {
      estable,
      recuperado: "",
      fuentes: bloques.map((b) => b.fuente),
      meta: Object.fromEntries(bloques.map((b) => [b.fuente.rotulo, { estado: b.fuente.estado, ...(b.meta || {}) }])),
    };
  },
};

export default cuenta;
