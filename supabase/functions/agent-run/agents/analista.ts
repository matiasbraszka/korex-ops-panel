// supabase/functions/agent-run/agents/analista.ts
// El ANALISTA DE MÉTRICAS: diagnostica un funnel de punta a punta cruzando las métricas
// (anuncios Meta, gasto/CPL, calidad de leads, Clarity, retención del VSL, ventas) con el
// CONTENIDO real (transcripts de anuncios, guión del VSL, copy publicado). North star del
// negocio: CPL CALIFICADO bajo + escalar campañas.
//
// Decisión de diseño: el contexto es un DOSSIER PRE-COMPUTADO, no tool-use de consulta.
//   - Respeta la regla anti-fuga (una sola llamada a la API, sin loops).
//   - Acotado a UN funnel los datos son chicos (~40-80k chars) y ESTABLES dentro de la
//     conversación → el 2º breakpoint de cache los lee a 0,1x del turno 2 en adelante.
//   - El gap-analysis ("qué métrica falta y cómo se consigue") lo detecta el CÓDIGO
//     (¿hay filas de Clarity para este funnel? ¿hay cuentas de Meta cargadas?), no el
//     modelo — la misma lección de la línea de Fuentes: lo que hay que detectar es
//     justamente cuando NO leyó.
//
// Los topes por dataset están puestos arriba del caso real más grande: el material entra
// ENTERO y el tope es solo la red contra un dato patológico. Si un dato se recorta, se
// anota EN el prompt (el agente avisa en vez de suponer).

import { str, clip, norm } from "../../_shared/agent-runtime.ts";
import type { Fuente } from "../../_shared/agent-runtime.ts";
import type { AgentCtx, AgentContextResult, AgentModule } from "./types.ts";

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function diasDesde(fecha: unknown): number {
  const t = new Date(str(fecha)).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 9999;
}
function fUsd(v: unknown): string { const n = num(v); return n ? `US$${n.toFixed(2)}` : "US$0"; }
function fPct(v: unknown): string { return `${num(v).toFixed(1)}%`; }

// Un builder devuelve su bloque de texto + su entrada de cobertura/fuentes.
type Bloque = { texto: string; fuente: Fuente; remedio?: string; meta?: Record<string, unknown> };

// ── 1) Anuncios de Meta (meta_ad_insights, último snapshot) ──────────────────
async function metaAds(ctx: AgentCtx): Promise<Bloque> {
  const { data } = await ctx.supabase.from("meta_ad_insights")
    .select("ad_name,campaign_name,adset_name,spend,impressions,clicks,ctr,cpm,cpl,leads,hook_rate,hold_rate,score,is_winner,effective_status,snapshot_date,time_window,retention,transcript")
    .eq("client_id", ctx.clientId).order("snapshot_date", { ascending: false }).limit(400);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "Meta Ads", estado: "falta", detalle: "sin datos" },
      remedio: "No hay filas en meta_ad_insights para este cliente. Revisar que clients.meta_ad_account_ids esté cargado y que meta-ads-sync (cron diario 10:40 UTC) lo incluya.",
    };
  }
  const ultimo = str(rows[0].snapshot_date);
  const snap = rows.filter((r) => str(r.snapshot_date) === ultimo)
    .sort((a, b) => num(b.spend) - num(a.spend));
  const dias = diasDesde(ultimo);

  const lineas = snap.slice(0, 15).map((r) => {
    const ret = ((r.retention as Record<string, unknown>)?.points || {}) as Record<string, unknown>;
    const retTxt = Object.keys(ret).length ? ` · retención p25 ${num(ret.p25)}% / p50 ${num(ret.p50)}% / p100 ${num(ret.p100)}%` : "";
    return [
      `- ${str(r.ad_name) || "(sin nombre)"}${r.is_winner ? " ⭐GANADOR" : ""} [${str(r.effective_status) || "?"}]`,
      `  campaña: ${str(r.campaign_name) || "—"} · conjunto: ${str(r.adset_name) || "—"}`,
      `  gasto ${fUsd(r.spend)} · CPL ${fUsd(r.cpl)} · ${num(r.leads)} leads · CTR ${fPct(r.ctr)} · CPM ${fUsd(r.cpm)} · hook ${fPct(r.hook_rate)} · hold ${fPct(r.hold_rate)}${retTxt}`,
    ].join("\n");
  });

  // El transcript de los 3 con más gasto: es lo que permite cruzar métrica ↔ contenido
  // ("el hook del anuncio promete X y el VSL abre con Y").
  const conTexto = snap.filter((r) => r.transcript).slice(0, 3).map((r) => {
    const t = typeof r.transcript === "string" ? r.transcript : JSON.stringify(r.transcript);
    return `— TRANSCRIPT de "${str(r.ad_name)}" (gasto ${fUsd(r.spend)}, CPL ${fUsd(r.cpl)}) —\n${clip(t, 1200)}`;
  });

  return {
    texto: [
      `— ANUNCIOS META (snapshot ${ultimo}, ventana ${str(snap[0]?.time_window) || "?"}, ${snap.length} anuncios, orden por gasto) —`,
      ...lineas,
      ...(conTexto.length ? ["", ...conTexto] : []),
    ].join("\n"),
    fuente: dias <= 2
      ? { rotulo: "Meta Ads", estado: "ok", detalle: `(${snap.length} anuncios, ${ultimo})` }
      : { rotulo: "Meta Ads", estado: "viejo", detalle: `snapshot de hace ${dias} días` },
    remedio: dias <= 2 ? undefined : `El snapshot de Meta es de hace ${dias} días. Remedio: correr meta-ads-sync (o revisar por qué el cron diario de 10:40 UTC no corrió).`,
    meta: { anuncios: snap.length, snapshot: ultimo, transcripts: conTexto.length },
  };
}

// ── 2b) Gasto y CPL desde Meta (respaldo de fbcrm_spend_daily) ───────────────
// fbcrm_spend_daily es la serie DIARIA exacta, pero solo existe para los clientes que tienen
// el CRM de Facebook conectado (2 de 24 al 25/7/2026). El gasto igual está en meta_ad_insights,
// que llega solo todos los días por el token: cada snapshot es la ventana móvil de 7 días de esa
// fecha. No es lo mismo que la serie diaria —las ventanas se pisan entre sí, NO se suman— pero
// responde "cuánto gasté y a qué CPL" y cómo se movió. Un ✗ acá significaría "no hay dato",
// y sí lo hay.
async function spendDesdeMeta(ctx: AgentCtx): Promise<Bloque | null> {
  const { data } = await ctx.supabase.from("meta_ad_insights")
    .select("snapshot_date,spend,leads,impressions,clicks")
    .eq("client_id", ctx.clientId).order("snapshot_date", { ascending: false }).limit(600);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return null;

  const porFecha = new Map<string, { gasto: number; leads: number }>();
  for (const r of rows) {
    const d = str(r.snapshot_date);
    const acc = porFecha.get(d) || { gasto: 0, leads: 0 };
    acc.gasto += num(r.spend); acc.leads += num(r.leads);
    porFecha.set(d, acc);
  }
  const fechas = [...porFecha.entries()].sort(([a], [b]) => b.localeCompare(a));
  const [ultimaFecha, ultimo] = fechas[0];
  const dias = diasDesde(ultimaFecha);
  const cpl = (v: { gasto: number; leads: number }) => (v.leads ? fUsd(v.gasto / v.leads) : "—");
  const linea = ([d, v]: [string, { gasto: number; leads: number }]) =>
    `${d} · gasto ${fUsd(v.gasto)} · ${v.leads} leads · CPL ${cpl(v)}`;

  return {
    texto: [
      `— GASTO Y CPL (de Meta · ventana móvil de 7 días, NO es serie diaria: las líneas se pisan entre sí, no las sumes) —`,
      `ÚLTIMOS 7 DÍAS (al ${ultimaFecha}): gasto ${fUsd(ultimo.gasto)} · ${ultimo.leads} leads · CPL ${cpl(ultimo)}`,
      fechas.length > 1 ? `CÓMO SE MOVIÓ (cada línea son los 7 días previos a esa fecha):` : "",
      ...fechas.slice(0, 14).map(linea),
    ].filter(Boolean).join("\n"),
    fuente: { rotulo: "Gasto/CPL", estado: "parcial", detalle: `de Meta, 7d al ${ultimaFecha}${dias > 2 ? ` (hace ${dias} días)` : ""}` },
    remedio: "El gasto sale de Meta en ventana de 7 días porque este cliente no tiene el CRM de Facebook conectado (fbcrm_spend_daily). Para la serie DIARIA de 30 días: conectar su página en el CRM, o pedir que meta-ads-sync guarde el desglose por día (time_increment=1).",
    meta: { origen: "meta_ad_insights", snapshots: fechas.length, gasto_7d: Number(ultimo.gasto.toFixed(2)) },
  };
}

// ── 2) Gasto y CPL diario (fbcrm_spend_daily, 30 días) ───────────────────────
async function spend(ctx: AgentCtx, cuentas: string[]): Promise<Bloque> {
  if (!cuentas.length) {
    return (await spendDesdeMeta(ctx)) ?? {
      texto: "", fuente: { rotulo: "Gasto/CPL", estado: "falta", detalle: "sin cuentas Meta" },
      remedio: "El cliente no tiene meta_ad_account_ids cargadas en su ficha: sin eso no se puede atar el gasto diario. Cargarlas en el panel (ficha del cliente).",
    };
  }
  const desde = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const { data } = await ctx.supabase.from("fbcrm_spend_daily")
    .select("date,ad_account_id,spend_usd,spend_usd_taxed,impressions,clicks,leads_count,cpl_usd")
    .in("ad_account_id", cuentas).gte("date", desde).order("date", { ascending: true });
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    return (await spendDesdeMeta(ctx)) ?? {
      texto: "", fuente: { rotulo: "Gasto/CPL", estado: "falta", detalle: "sin gasto 30d" },
      remedio: "Sus cuentas de Meta no registran gasto en fbcrm_spend_daily en 30 días, y tampoco hay snapshots de meta_ad_insights: o la campaña está apagada, o ninguno de los dos syncs cubre esas cuentas.",
    };
  }
  // Suma por día (puede haber 2 cuentas).
  const porDia = new Map<string, { gasto: number; leads: number }>();
  for (const r of rows) {
    const d = str(r.date);
    const acc = porDia.get(d) || { gasto: 0, leads: 0 };
    acc.gasto += num(r.spend_usd); acc.leads += num(r.leads_count);
    porDia.set(d, acc);
  }
  const dias = [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b));
  const linea = ([d, v]: [string, { gasto: number; leads: number }]) =>
    `${d} · gasto ${fUsd(v.gasto)} · ${v.leads} leads · CPL ${v.leads ? fUsd(v.gasto / v.leads) : "—"}`;
  const tot = dias.reduce((a, [, v]) => ({ gasto: a.gasto + v.gasto, leads: a.leads + v.leads }), { gasto: 0, leads: 0 });
  // Tendencia: primera mitad vs segunda mitad de la ventana.
  const mitad = Math.floor(dias.length / 2);
  const cplDe = (arr: typeof dias) => {
    const t = arr.reduce((a, [, v]) => ({ g: a.g + v.gasto, l: a.l + v.leads }), { g: 0, l: 0 });
    return t.l ? t.g / t.l : 0;
  };
  const cpl1 = cplDe(dias.slice(0, mitad)), cpl2 = cplDe(dias.slice(mitad));
  const ultimoDia = dias[dias.length - 1][0];

  return {
    texto: [
      `— GASTO Y CPL DIARIO (30 días, cuentas ${cuentas.join(" + ")}) —`,
      `TOTAL 30d: gasto ${fUsd(tot.gasto)} · ${tot.leads} leads · CPL ${tot.leads ? fUsd(tot.gasto / tot.leads) : "—"}`,
      `TENDENCIA: CPL primera mitad ${cpl1 ? fUsd(cpl1) : "—"} → segunda mitad ${cpl2 ? fUsd(cpl2) : "—"}`,
      `Últimos 14 días:`,
      ...dias.slice(-14).map(linea),
    ].join("\n"),
    fuente: diasDesde(ultimoDia) <= 1
      ? { rotulo: "Gasto/CPL", estado: "ok", detalle: `(hasta ${ultimoDia})` }
      : { rotulo: "Gasto/CPL", estado: "viejo", detalle: `último día ${ultimoDia}` },
    meta: { dias: dias.length, gasto_30d: Number(tot.gasto.toFixed(2)) },
  };
}

// ── 3b) Leads desde Meta (respaldo de fbcrm_leads) ───────────────────────────
// CUÁNTOS leads y a qué costo siempre está en meta_ad_insights. Lo que NO está es QUÉ CONTESTARON
// —eso solo lo tiene el CRM de Facebook— así que este bloque cuenta y avisa qué le falta: la
// diferencia entre "no hay leads" (✗) y "hay leads pero no sé si son buenos" (⚠) cambia el
// diagnóstico entero.
async function leadsDesdeMeta(ctx: AgentCtx, motivo: string): Promise<Bloque | null> {
  const { data } = await ctx.supabase.from("meta_ad_insights")
    .select("snapshot_date,ad_name,campaign_name,spend,leads,cpl")
    .eq("client_id", ctx.clientId).order("snapshot_date", { ascending: false }).limit(400);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) return null;
  const ultimo = str(rows[0].snapshot_date);
  const snap = rows.filter((r) => str(r.snapshot_date) === ultimo);
  const tot = snap.reduce((a, r) => ({ gasto: a.gasto + num(r.spend), leads: a.leads + num(r.leads) }), { gasto: 0, leads: 0 });
  const conLeads = snap.filter((r) => num(r.leads) > 0).sort((a, b) => num(b.leads) - num(a.leads));

  return {
    texto: [
      `— LEADS (de Meta · últimos 7 días al ${ultimo}) —`,
      `TOTAL: ${tot.leads} leads · gasto ${fUsd(tot.gasto)} · CPL ${tot.leads ? fUsd(tot.gasto / tot.leads) : "—"}`,
      conLeads.length ? "De dónde vienen (anuncio · leads · CPL):" : "",
      ...conLeads.slice(0, 10).map((r) => `- ${str(r.ad_name) || "(sin nombre)"} · ${num(r.leads)} leads · CPL ${fUsd(r.cpl)} · campaña ${str(r.campaign_name) || "—"}`),
      "",
      "OJO: esto es CUÁNTOS leads y a qué costo. NO tengo lo que contestaron en el formulario, así que",
      "de la CALIDAD del lead no podés afirmar nada acá: si el diagnóstico la necesita, es CONJETURA.",
    ].filter(Boolean).join("\n"),
    fuente: { rotulo: "Leads", estado: "parcial", detalle: `${tot.leads} en 7d (de Meta, sin respuestas del formulario)` },
    remedio: `${motivo} Por eso hay cantidad y costo pero no las respuestas del formulario (lo único que dice si el lead es bueno). Remedio: conectar la página de Facebook de este cliente en el CRM (fbcrm_pages: active=true y su ad_account_id cargado) — el token ya está guardado y los crons de formularios y leads corren solos cada 30 y 10 minutos.`,
    meta: { origen: "meta_ad_insights", leads_7d: tot.leads },
  };
}

// ── 3) Leads y su calidad (fbcrm_leads: las respuestas REALES del formulario) ─
async function leads(ctx: AgentCtx, clientName: string, cuentas: string[]): Promise<Bloque> {
  // El CRM guarda los leads bajo el nombre de la PÁGINA de Facebook, que casi nunca es igual al
  // nombre del cliente en el panel ("Antonio & Madelaine" vs "Antonio De la Cruz"). Buscar por
  // nombre da 0 leads con el CRM perfectamente conectado. El vínculo confiable es la cuenta de
  // anuncios; el nombre queda solo como último recurso.
  let crmName = clientName;
  if (cuentas.length) {
    const { data: pages } = await ctx.supabase.from("fbcrm_pages")
      .select("client_name,active").in("ad_account_id", cuentas).limit(5);
    const pg = (Array.isArray(pages) ? pages : []).find((p) => p.active) || (Array.isArray(pages) ? pages : [])[0];
    if (pg && str(pg.client_name)) crmName = str(pg.client_name);
  }

  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await ctx.supabase.from("fbcrm_leads")
    .select("created_time,full_name,answers,campaign_name,ad_name,form_name,platform,status,contacted,wa_outbound_at,wa_inbound_at")
    .ilike("client_name", `%${crmName}%`).gte("created_time", desde)
    .order("created_time", { ascending: false }).limit(300);
  const rows = Array.isArray(data) ? data : [];
  if (!rows.length) {
    const motivo = crmName === clientName
      ? `Este cliente no tiene ninguna página de Facebook conectada al CRM (ninguna fila de fbcrm_pages apunta a sus cuentas de anuncios).`
      : `La página "${crmName}" está mapeada a este cliente pero no trajo leads en 30 días.`;
    return (await leadsDesdeMeta(ctx, motivo)) ?? {
      texto: "", fuente: { rotulo: "Leads", estado: "falta", detalle: "sin leads 30d" },
      remedio: `${motivo} Y tampoco hay leads contados en meta_ad_insights: o de verdad no está entrando nadie, o las campañas no están optimizadas a lead.`,
    };
  }
  const contactados = rows.filter((r) => r.contacted).length;
  const conSalida = rows.filter((r) => r.wa_outbound_at).length;
  const conRespuesta = rows.filter((r) => r.wa_inbound_at).length;
  const pct = (n: number) => `${Math.round((n / rows.length) * 100)}%`;

  // La muestra de respuestas del formulario es la señal de CALIDAD: el modelo lee lo que
  // el lead contestó de verdad, no un promedio.
  const muestra = rows.slice(0, 12).map((r) => {
    const ans = r.answers ? clip(typeof r.answers === "string" ? r.answers : JSON.stringify(r.answers), 400) : "(sin respuestas)";
    return `- ${str(r.created_time).slice(0, 10)} · anuncio: ${str(r.ad_name) || "—"} · ${r.contacted ? "contactado" : "SIN contactar"}${r.wa_inbound_at ? " · respondió WA" : ""}\n  respuestas: ${ans}`;
  });

  return {
    texto: [
      `— LEADS (30 días: ${rows.length} leads) —`,
      `Contactados: ${contactados} (${pct(contactados)}) · con WhatsApp enviado: ${conSalida} (${pct(conSalida)}) · respondieron: ${conRespuesta} (${pct(conRespuesta)})`,
      `Muestra de los 12 más recientes (respuestas TEXTUALES del formulario — de acá sale la calificación):`,
      ...muestra,
    ].join("\n"),
    fuente: { rotulo: "Leads", estado: "ok", detalle: `(${rows.length} en 30d)` },
    meta: { leads_30d: rows.length, contactados },
  };
}

// ── 3c) Calidad del lead (DME: curiosos / interesados / calificados) ─────────
// El DME es lo ÚNICO que dice si el lead sirve cuando el CRM de Facebook no está conectado: el
// equipo carga a mano cuántos leads fueron curiosos, interesados y calificados.
// PERO el formulario tiene un solo cajón de embudo ("embudo1_") por cliente: si el cliente corre
// varios embudos, todo cae mezclado ahí. Atribuirle esos porcentajes a ESTE embudo sería un
// diagnóstico falso — y un número equivocado es peor que ninguno. Por eso la atribución la decide
// el CÓDIGO (cuántos embudos tiene el cliente y cuántos están en vivo) y el agente la obedece.
async function calidadDME(ctx: AgentCtx, page: Record<string, unknown>): Promise<Bloque | null> {
  const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const [{ data: dme }, { data: funnels }] = await Promise.all([
    ctx.supabase.from("dme_daily").select("date,metrics").eq("client_id", ctx.clientId)
      .gte("date", desde).order("date", { ascending: false }).limit(20),
    ctx.supabase.from("strategy_pages").select("id,is_live").eq("client_id", ctx.clientId),
  ]);
  const dias = Array.isArray(dme) ? dme : [];
  if (!dias.length) return null;

  const sum = (k: string) => dias.reduce((a, d) => a + num((d.metrics as Record<string, unknown>)?.[k]), 0);
  const leadsTot = sum("embudo1_total_leads") || sum("embudo1_leads_registrados");
  if (!leadsTot) return null;
  const curiosos = sum("embudo1_leads_curiosos");
  const interesados = sum("embudo1_leads_interesados");
  const calificados = sum("embudo1_leads_calificados");
  const pc = (n: number) => `${n} (${Math.round((n / leadsTot) * 100)}%)`;

  // Atribuible si el cliente tiene un solo embudo, o si tiene uno solo EN VIVO y es este.
  const todos = Array.isArray(funnels) ? funnels : [];
  const enVivo = todos.filter((f) => f.is_live);
  const esteEnVivo = !!page.is_live;
  const atribuible = todos.length <= 1 || (enVivo.length === 1 && esteEnVivo);

  const aviso = atribuible
    ? (todos.length > 1
      ? `ATRIBUCIÓN: el cliente tiene ${todos.length} embudos pero solo este está en vivo, así que el DME es de este embudo. Si le prenden otro, deja de valer.`
      : "")
    : `ATRIBUCIÓN — LEELO ANTES DE USAR ESTOS NÚMEROS: el DME tiene UN SOLO cajón de embudo por cliente ("embudo1") y este cliente tiene ${todos.length} embudos${enVivo.length ? ` (${enVivo.length} en vivo)` : ""}. Estos porcentajes son del CLIENTE ENTERO, no de este embudo. NO afirmes con esto que los leads de este embudo son buenos o malos: si lo usás, va rotulado CONJETURA y decís por qué.`;

  return {
    texto: [
      `— CALIDAD DEL LEAD (DME cargado por el equipo · últimos ${dias.length} días con carga) —`,
      `Leads: ${leadsTot} · curiosos ${pc(curiosos)} · interesados ${pc(interesados)} · calificados ${pc(calificados)}`,
      `Recorrido: ${sum("embudo1_visitas_landing")} visitas a la landing → ${sum("embudo1_quiz_iniciado")} empiezan el quiz → ${sum("embudo1_quiz_terminado")} lo terminan → ${leadsTot} leads → ${sum("embudo1_whatsapp")} pasan a WhatsApp → ${sum("embudo1_cierres")} cierres`,
      `Gasto cargado en el DME: ${fUsd(sum("embudo1_total_gastado"))}`,
      aviso,
    ].filter(Boolean).join("\n"),
    fuente: atribuible
      ? { rotulo: "Calidad del lead", estado: "ok", detalle: `DME, ${dias.length} días` }
      : { rotulo: "Calidad del lead", estado: "parcial", detalle: `DME del cliente entero (${todos.length} embudos), no de este embudo` },
    remedio: atribuible ? undefined : `El DME mezcla los ${todos.length} embudos de este cliente en un solo cajón ("embudo1_"), así que su % de curiosos/interesados/calificados NO sirve para diagnosticar ESTE embudo. Remedio de fondo: que el DME se cargue POR EMBUDO (un bloque de métricas por funnel, atado al id del funnel) en vez del cajón fijo. Mientras tanto, la calidad de este embudo solo la da el CRM de Facebook conectado.`,
    meta: { dias: dias.length, leads: leadsTot, atribuible, embudos: todos.length },
  };
}

// ── 4) Clarity (comportamiento en la página) ─────────────────────────────────
async function clarity(ctx: AgentCtx, page: Record<string, unknown>): Promise<Bloque> {
  const { data: cfs } = await ctx.supabase.from("clarity_funnels")
    .select("id,label,strategy_id,active,last_synced_at,range_30d,clicks_30d,vsl_cross,scroll_by_page")
    .eq("client_id", ctx.clientId);
  const rows = Array.isArray(cfs) ? cfs : [];
  const cf = rows.find((r) => str(r.strategy_id) === str(page.strategy_id)) || rows.find((r) => r.active) || rows[0];
  if (!cf) {
    const tieneScript = !!str(page.clarity_id);
    return {
      texto: "", fuente: { rotulo: "Clarity", estado: "falta", detalle: "no conectada" },
      remedio: tieneScript
        ? `El funnel tiene el script de Clarity instalado (id ${str(page.clarity_id)}) pero la integración de datos NO está conectada (falta la fila en clarity_funnels + su token en clarity_funnel_secrets). Conectarla en el panel para tener scroll, rage clicks y quick-backs.`
        : "El funnel no tiene Clarity instalado (strategy_pages.clarity_id vacío). Instalar el script en la página y conectar la integración: sin esto no sabemos DÓNDE se cae la gente dentro de la página.",
    };
  }
  const desde = new Date(Date.now() - 14 * 86400000).toISOString().slice(0, 10);
  const { data: cds } = await ctx.supabase.from("clarity_daily")
    .select("date,sessions,distinct_users,bot_sessions,pages_per_session,avg_scroll_depth,dead_click_pct,rage_click_pct,quick_back_pct,popular_pages")
    .eq("funnel_id", cf.id).gte("date", desde).order("date", { ascending: true });
  const dias = Array.isArray(cds) ? cds : [];
  const avg = (k: string) => dias.length ? dias.reduce((a, d) => a + num((d as Record<string, unknown>)[k]), 0) / dias.length : 0;
  const ultimo = dias.length ? str(dias[dias.length - 1].date) : "";
  const scrollPag = cf.scroll_by_page ? clip(JSON.stringify(cf.scroll_by_page), 1500) : "";
  const vslCross = cf.vsl_cross ? clip(JSON.stringify(cf.vsl_cross), 800) : "";

  return {
    texto: [
      `— CLARITY (funnel "${str(cf.label)}", últimos 14 días: ${dias.length} días con datos) —`,
      dias.length
        ? `PROMEDIOS: ${Math.round(avg("sessions"))} sesiones/día · scroll medio ${avg("avg_scroll_depth").toFixed(0)}% · rage clicks ${avg("rage_click_pct").toFixed(1)}% · dead clicks ${avg("dead_click_pct").toFixed(1)}% · quick-back ${avg("quick_back_pct").toFixed(1)}%`
        : "(la integración está conectada pero no hay días con datos en la ventana)",
      ...dias.slice(-7).map((d) => `${str(d.date)} · ${num(d.sessions)} ses · scroll ${num(d.avg_scroll_depth).toFixed(0)}% · rage ${num(d.rage_click_pct).toFixed(1)}% · quick-back ${num(d.quick_back_pct).toFixed(1)}%`),
      scrollPag ? `SCROLL POR PÁGINA (30d): ${scrollPag}` : "",
      vslCross ? `CRUCE VSL×PÁGINA (30d): ${vslCross}` : "",
    ].filter(Boolean).join("\n"),
    fuente: !dias.length
      ? { rotulo: "Clarity", estado: "vacio", detalle: "conectada pero sin días con datos" }
      : diasDesde(ultimo) <= 2
        ? { rotulo: "Clarity", estado: "ok", detalle: `(hasta ${ultimo})` }
        : { rotulo: "Clarity", estado: "viejo", detalle: `último día ${ultimo}` },
    remedio: !dias.length ? "Clarity está conectada pero sin datos en 14 días: revisar clarity-sync (cron 09:30 UTC) y que el sitio tenga tráfico." : undefined,
    meta: { clarity_funnel: str(cf.id), dias: dias.length },
  };
}

// ── 5) Retención del VSL (vsl_voomly; el video se matchea por NOMBRE) ────────
// No hay FK funnel→video: los archivos se llaman "Cliente_Avatar_VSL.mp4". Se matchea por
// tokens del nombre del cliente + del funnel/avatar, y el nombre elegido va al dossier y a
// la cobertura — si el match está mal, se VE, no se esconde.
async function vsl(ctx: AgentCtx, clientName: string, page: Record<string, unknown>): Promise<Bloque> {
  const tokens = norm(clientName).split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return { texto: "", fuente: { rotulo: "VSL", estado: "falta", detalle: "sin nombre de cliente" } };
  const { data } = await ctx.supabase.from("vsl_voomly")
    .select("voomly_id,name,kind,total_plays,uniq_plays,play_rate,engagement,retention,ranges,synced_at,transcript")
    .ilike("name", `%${tokens[0]}%`).limit(30);
  const rows = (Array.isArray(data) ? data : []).filter((r) => str(r.kind) !== "thank_you" || true);
  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "VSL", estado: "falta", detalle: "sin video en Voomly" },
      remedio: `Ningún video de Voomly matchea "${clientName}". O el VSL no está en Voomly, o el archivo no lleva el nombre del cliente. El export de Voomly además corre A MANO (voomly-export/pull.mjs): pedir que lo corran.`,
    };
  }
  // Puntúa por tokens del cliente + del funnel/avatar en el nombre del archivo.
  const funnelTokens = norm(`${str(page.name)}`).split(" ").filter((t) => t.length > 3);
  const score = (n: string) => {
    const h = norm(n);
    let s = 0;
    for (const t of tokens) if (h.includes(t)) s += 2;
    for (const t of funnelTokens) if (h.includes(t)) s += 3;
    if (/vsl/i.test(n)) s += 1;
    if (/thank/i.test(n)) s -= 2;
    return s;
  };
  const best = rows.sort((a, b) => score(str(b.name)) - score(str(a.name)))[0];
  const dias = diasDesde(best.synced_at);

  // La curva: viewers[] es un array por avance del video. Se normaliza contra su máximo y
  // se reportan las 3 caídas más grandes — el "dónde se van" que pide el diagnóstico.
  const viewers = (Array.isArray((best.retention as Record<string, unknown>)?.viewers)
    ? ((best.retention as Record<string, unknown>).viewers as number[]) : []).map(num);
  const maxV = Math.max(...viewers, 0);
  let curva = "";
  if (maxV > 0 && viewers.length > 4) {
    const pctArr = viewers.map((v) => (v / maxV) * 100);
    const paso = 100 / (pctArr.length - 1);
    const caidas = pctArr.slice(1).map((v, i) => ({ en: Math.round(i * paso), a: Math.round((i + 1) * paso), drop: pctArr[i] - v }))
      .sort((a, b) => b.drop - a.drop).slice(0, 3).filter((c) => c.drop > 0);
    const p = (x: number) => pctArr[Math.min(pctArr.length - 1, Math.round((x / 100) * (pctArr.length - 1)))].toFixed(0);
    curva = [
      `CURVA: p25 ${p(25)}% · p50 ${p(50)}% · p75 ${p(75)}% · p100 ${p(100)}% (audiencia restante, normalizada al pico)`,
      caidas.length ? `MAYORES CAÍDAS: ${caidas.map((c) => `entre el ${c.en}% y el ${c.a}% del video se van ${c.drop.toFixed(0)} pts`).join(" · ")}` : "",
    ].filter(Boolean).join("\n");
  }
  const t = best.transcript ? clip(typeof best.transcript === "string" ? best.transcript : JSON.stringify(best.transcript), 1500) : "";

  return {
    texto: [
      `— VSL EN VOOMLY (video matcheado por nombre: "${str(best.name)}" — si no es el de ESTE funnel, decilo) —`,
      `plays únicos ${num(best.uniq_plays)} · play rate ${fPct(best.play_rate)} · engagement ${fPct(best.engagement)}`,
      curva,
      t ? `TRANSCRIPT (inicio): ${t}` : "",
    ].filter(Boolean).join("\n"),
    fuente: dias <= 7
      ? { rotulo: "VSL", estado: "ok", detalle: `(export hace ${dias} d)` }
      : { rotulo: "VSL", estado: "viejo", detalle: `export de hace ${dias} días` },
    remedio: dias <= 7 ? undefined : `Las métricas de Voomly son de hace ${dias} días: el exportador corre A MANO (voomly-export/pull.mjs), pedir que lo corran antes de decidir sobre el VSL.`,
    meta: { video: str(best.name), export_dias: dias },
  };
}

// ── 6) El contenido publicado (para cruzar métrica ↔ contenido) ──────────────
function contenido(page: Record<string, unknown>, avatarId: string): Bloque {
  const pagesCopy = (page.pages_copy && typeof page.pages_copy === "object" && !Array.isArray(page.pages_copy))
    ? page.pages_copy as Record<string, Record<string, unknown>> : {};
  const PAGINAS: Array<[string, string, number]> = [
    ["prelanding", "PRE-LANDING", 2500], ["landing", "LANDING VSL", 1200],
    ["formulario", "FORMULARIO", 800], ["thankyou", "THANK YOU PAGE", 400],
  ];
  const secciones = PAGINAS.map(([k, rot, tope]) => {
    const txt = str(pagesCopy[k]?.text as string);
    return txt ? `— ${rot} (copy publicado) —\n${clip(txt, tope)}` : "";
  }).filter(Boolean);

  const vslScript = str(page.vsl_script);
  const avatars = Array.isArray(page.avatars) ? (page.avatars as Record<string, unknown>[]) : [];
  const avatar = avatars.find((a) => str(a.id) === avatarId) || avatars[0] || null;

  const partes = [
    avatar ? `— AVATAR DEL FUNNEL —\n${str(avatar.name)} · ${clip(str(avatar.spec_text), 1200) || "(sin descripción)"}` : "",
    vslScript ? `— GUIÓN DEL VSL (lo que el video DICE; cruzalo con dónde se cae la retención) —\n${clip(vslScript, 6000)}` : "",
    ...secciones,
  ].filter(Boolean);

  if (!partes.length) {
    return {
      texto: "", fuente: { rotulo: "Contenido", estado: "falta", detalle: "sin copy ni guión" },
      remedio: "El funnel no tiene guión de VSL ni copy de páginas cargado en el panel: sin el contenido solo se puede diagnosticar por números, no POR QUÉ pasa.",
    };
  }
  return {
    texto: `— CONTENIDO PUBLICADO DEL FUNNEL —\n${partes.join("\n\n")}`,
    fuente: {
      rotulo: "Contenido",
      estado: vslScript && secciones.length ? "ok" : "parcial",
      detalle: vslScript && secciones.length ? undefined : `hay ${[vslScript ? "guión" : "", secciones.length ? "páginas" : ""].filter(Boolean).join(" y ") || "solo avatar"}`,
    },
  };
}

// ── 7) Ventas / cierre (para el "me llegan leads pero no cierro") ────────────
async function ventas(ctx: AgentCtx): Promise<Bloque> {
  const desde = new Date(Date.now() - 30 * 86400000).toISOString();
  const [{ data: dme }, { data: sl }] = await Promise.all([
    ctx.supabase.from("dme_daily").select("date,metrics,note").eq("client_id", ctx.clientId)
      .order("date", { ascending: false }).limit(14),
    ctx.supabase.from("sales_leads").select("created_at,closed_at,actual_value,actual_currency,origin")
      .eq("client_id", ctx.clientId).gte("created_at", desde).limit(200),
  ]);
  const dmeRows = Array.isArray(dme) ? dme : [];
  const slRows = Array.isArray(sl) ? sl : [];
  const cerrados = slRows.filter((r) => r.closed_at);
  const partes = [
    dmeRows.length
      ? `DME DIARIO (lo que carga el equipo; últimos ${dmeRows.length} días):\n${dmeRows.slice(0, 10).map((d) => `${str(d.date)} · ${clip(JSON.stringify(d.metrics ?? {}), 250)}${str(d.note) ? ` · nota: ${clip(str(d.note), 120)}` : ""}`).join("\n")}`
      : "",
    slRows.length
      ? `PIPELINE DE VENTAS (30d): ${slRows.length} oportunidades · ${cerrados.length} cerradas · valor cerrado ${fUsd(cerrados.reduce((a, r) => a + num(r.actual_value), 0))}`
      : "",
  ].filter(Boolean);
  if (!partes.length) {
    return {
      texto: "", fuente: { rotulo: "Ventas", estado: "falta", detalle: "sin DME ni pipeline" },
      remedio: "No hay DME diario ni oportunidades en el pipeline para este cliente: el cierre solo lo conocemos por lo que diga el cliente. Pedirle números concretos (agendas, shows, cierres) o cargar el DME.",
    };
  }
  const dmeUltimo = dmeRows.length ? str(dmeRows[0].date) : "";
  return {
    texto: `— VENTAS / CIERRE —\n${partes.join("\n")}`,
    fuente: dmeRows.length && diasDesde(dmeUltimo) > 3
      ? { rotulo: "Ventas", estado: "viejo", detalle: `DME hasta ${dmeUltimo}` }
      : { rotulo: "Ventas", estado: "ok" },
    meta: { dme_dias: dmeRows.length, oportunidades_30d: slRows.length },
  };
}

// ── El módulo ────────────────────────────────────────────────────────────────
const analista: AgentModule = {
  key: "analista",
  nivel: "funnel",

  // Contrato de salida (contrato con el equipo, no editable en el panel).
  formato: [
    "- Para un DIAGNÓSTICO (el pedido típico), esta estructura es OBLIGATORIA y en este orden:",
    "  `## Resumen del diagnóstico` — el veredicto en 3-5 líneas. Qué está fallando y dónde.",
    "  `## Salud por etapa` — tabla `Etapa | Métricas clave | vs. benchmark | Estado` con 🟢🟡🔴 por fila. Etapas: Anuncios → Página → VSL → Formulario/Leads → Cierre.",
    "  `## Evidencia` — los números que sostienen el veredicto, CITADOS del dossier con su fecha. Nada de números inventados: si un número no está arriba, no existe.",
    "  `## Hipótesis rankeadas` — numeradas, la más probable primero. Cada una dice QUÉ DATO la confirma o la refuta. Si depende de un dato marcado ✗/⚠ en la cobertura, va rotulada `CONJETURA:`.",
    "  `## Métricas faltantes` — tabla `Métrica | Para qué serviría | Cómo conseguirla` (el CÓMO sale de la cobertura de datos: es concreto, no 'habría que medir').",
    "  `## Acciones recomendadas` — lista `1.` ordenada por impacto/esfuerzo. Acciones concretas sobre ESTE funnel, no consejos genéricos.",
    "- Para una pregunta puntual: prosa directa + el número citado con fecha. La estructura completa es para diagnósticos, no para inflar.",
    "- Los umbrales/benchmarks contra los que comparás salen de tu capacitación (guía de benchmarks). Si un benchmark no está ahí, decí que no hay benchmark cargado — no lo inventes.",
    "- Nunca presentes una CONJETURA como hallazgo. La cobertura de datos manda: está calculada por el sistema.",
  ].join("\n"),

  async buildContext(ctx: AgentCtx): Promise<AgentContextResult> {
    const [{ data: client }, { data: page }, { data: strat }] = await Promise.all([
      ctx.supabase.from("clients").select("name,niche,company,service,meta_ad_account_ids,meta_metrics").eq("id", ctx.clientId).maybeSingle(),
      ctx.supabase.from("strategy_pages").select("name,tipo,strategy_id,avatars,vsl_script,pages_copy,prod_url,official_domain,clarity_id,is_live").eq("id", ctx.funnelId).maybeSingle(),
      ctx.strategyId ? ctx.supabase.from("strategies").select("name").eq("id", ctx.strategyId).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const pg = (page || {}) as Record<string, unknown>;
    const clientName = str(client?.name);
    const cuentas = Array.isArray(client?.meta_ad_account_ids) ? (client!.meta_ad_account_ids as string[]).map(str).filter(Boolean) : [];

    // Qué datasets corren: lo dice el manifest. Sin manifest corren todos.
    const datasets = Array.isArray(ctx.manifest.datasets) ? (ctx.manifest.datasets as string[]) : ["meta_ads", "spend", "leads", "clarity", "vsl", "contenido", "ventas"];
    const activo = (k: string) => datasets.includes(k);

    const [bMeta, bSpend, bLeads, bCalidad, bClarity, bVsl, bVentas] = await Promise.all([
      activo("meta_ads") ? metaAds(ctx) : null,
      activo("spend") ? spend(ctx, cuentas) : null,
      activo("leads") ? leads(ctx, clientName, cuentas) : null,
      activo("leads") ? calidadDME(ctx, pg) : null,
      activo("clarity") ? clarity(ctx, pg) : null,
      activo("vsl") ? vsl(ctx, clientName, pg) : null,
      activo("ventas") ? ventas(ctx) : null,
    ]);
    const bContenido = activo("contenido") ? contenido(pg, ctx.avatarId) : null;

    const bloques = [bMeta, bSpend, bLeads, bCalidad, bClarity, bVsl, bContenido, bVentas].filter(Boolean) as Bloque[];

    // ── COBERTURA DE DATOS: calculada por código. Es el corazón del gap-analysis. ──
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
      "- Lo marcado ✗ NO existe: cualquier afirmación que lo necesite es CONJETURA y lo decís.",
      "- Lo marcado ⚠ está viejo o incompleto: citá la fecha al usarlo.",
      "- La sección 'Métricas faltantes' de tu diagnóstico se construye con los ✗/⚠ de acá arriba y sus remedios — concretos, tal cual figuran.",
    ].join("\n");

    const dossier = bloques.map((b) => b.texto).filter(Boolean).join("\n\n");

    const estable = [
      "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
      `Cliente: ${clientName}${str(client?.company) ? ` · Empresa: ${str(client?.company)}` : ""}${str(client?.niche) ? ` · Nicho: ${str(client?.niche)}` : ""}`,
      `Funnel: ${str(pg.name) || "—"} (tipo: ${str(pg.tipo) || "—"}${pg.is_live ? " · EN VIVO" : " · no está en vivo"})${str(strat?.name) ? ` · Estrategia: ${str(strat?.name)}` : ""}`,
      "",
      cobertura,
      "",
      "===== DOSSIER DE MÉTRICAS DEL FUNNEL =====",
      dossier || "(ningún dataset devolvió datos — mirá la cobertura de arriba)",
    ].join("\n");

    return {
      estable,
      recuperado: "",  // el dossier es estable en la conversación: no hay retrieval por turno en v1
      fuentes: bloques.map((b) => b.fuente),
      meta: Object.fromEntries(bloques.map((b) => [b.fuente.rotulo, { estado: b.fuente.estado, ...(b.meta || {}) }])),
    };
  },
};

export default analista;
