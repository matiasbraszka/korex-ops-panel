// supabase/functions/agent-run/agents/cuenta.ts
// SITUACIÓN DEL CLIENTE: el asesor de cuenta. Responde "¿en qué situación está este
// cliente?", "¿qué lo tiene trabado?", "¿qué tan conforme está?", "¿pagaría una mensualidad?"
// cruzando lo que hoy vive desparramado en 15 tablas que nadie mira juntas.
//
// NO se pisa con Descubrimiento: aquel razona sobre el MERCADO del cliente (líder,
// competencia, avatar) leyendo client_brain_docs; éste razona sobre la RELACIÓN con el
// cliente (qué le hacemos, qué se trabó, qué paga, qué tan conforme está). Cero solapamiento
// de tablas. Cuando el cuello es de método, este agente DERIVA a Descubrimiento.
//
// Decisión de diseño: dossier pre-computado, sin tool-use (misma regla anti-fuga que el
// analista). Una sola llamada a la API, sin loops. El dossier es estable dentro de la
// conversación → 2º breakpoint de cache a 0,1x del turno 2 en adelante.
//
// La pieza más importante acá es la COBERTURA DE DATOS, porque la cobertura es DESPAREJA:
// 28 de 36 clientes tienen briefing de WhatsApp, 14 tuvieron llamada en 30 días, 13 tienen
// historial. Un agente que opine con confianza sobre un cliente del que no sabe nada es
// peor que no tenerlo. Por eso el gap-analysis lo calcula el CÓDIGO, no el modelo.

import { str, clip } from "../../_shared/agent-runtime.ts";
import type { Fuente } from "../../_shared/agent-runtime.ts";
import type { AgentCtx, AgentContextResult, AgentModule } from "./types.ts";

function num(v: unknown): number { const n = Number(v); return Number.isFinite(n) ? n : 0; }
function diasDesde(fecha: unknown): number {
  const t = new Date(str(fecha)).getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((Date.now() - t) / 86400000)) : 9999;
}
// Días que faltan para una fecha futura. Negativo = ya pasó (contrato vencido sin renovar).
function diasHasta(fecha: unknown): number | null {
  const t = new Date(str(fecha)).getTime();
  return Number.isFinite(t) ? Math.ceil((t - Date.now()) / 86400000) : null;
}
function fecha(v: unknown): string { const s = str(v); return s ? s.slice(0, 10) : "—"; }
// Los jsonb de llamadas vienen como array de strings o de objetos según el campo.
function lista(v: unknown, max = 6): string[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, max).map((x) => {
    if (typeof x === "string") return x;
    const o = (x || {}) as Record<string, unknown>;
    const cab = [str(o.tipo), str(o.area)].filter(Boolean).join("/");
    const cuerpo = str(o.texto) || str(o.descripcion) || str(o.titulo) || JSON.stringify(o);
    return cab ? `[${cab}] ${cuerpo}` : cuerpo;
  }).filter(Boolean);
}

// Un builder devuelve su bloque de texto + su entrada de cobertura/fuentes.
type Bloque = { texto: string; fuente: Fuente; remedio?: string; meta?: Record<string, unknown> };

// Las 5 fases globales del panel. ESPEJO de apps/operations/src/utils/constants.js (PHASES).
// Si allá se agrega/renombra una fase, hay que tocarlo acá: es la misma verdad en dos lados.
const PHASES: Record<string, string> = {
  "pre-onboarding": "Pre-Onboarding",
  "onboarding": "Onboarding",
  "primera-entrega": "Primera Entrega",
  "lanzamiento": "Lanzamiento",
  "auditoria": "Auditoría",
};

// ── 1) Ficha: quién es, en qué fase está y qué lo frena ──────────────────────
async function ficha(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  if (!client) {
    return {
      texto: "", fuente: { rotulo: "Ficha", estado: "falta", detalle: "el cliente no existe" },
      remedio: "No se encontró la fila en `clients` para este id. Revisar que el cliente no haya sido borrado.",
    };
  }

  // ── La FASE: el panel no la guarda, la deriva. Replicamos su cálculo exacto ──
  // helpers.js:294 (currentTask) → primera tarea roadmap con status ≠ 'done', sobre la lista
  // tal como la carga AppContext.jsx:2182, es decir ORDENADA POR created_at DESC. Sí: la
  // "fase actual" es la de la tarea roadmap pendiente MÁS NUEVA, no la más vieja. Es una
  // rareza del panel, pero es lo que Matías ve en pantalla y tenemos que decir lo mismo.
  const { data: roadmap } = await ctx.supabase.from("tasks")
    .select("title,status,phase,assignee,created_at,blocked_since,due_date")
    .eq("client_id", ctx.clientId).eq("is_roadmap_task", true)
    .order("created_at", { ascending: false }).limit(500);
  const rmRows = Array.isArray(roadmap) ? roadmap : [];
  const actual = rmRows.find((t) => str(t.status) !== "done") || null;

  // El id de fase puede ser una de las 5 globales o un `custom_*` cuyo label sólo vive
  // dentro de clients.custom_phases. Imprimimos label Y id crudo: si el label no resuelve,
  // que se VEA en vez de esconderse detrás de un id opaco.
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
  const faseTxt = rmRows.length === 0
    ? "sin tareas de roadmap cargadas — el panel no puede calcular fase"
    : actual
      ? `${labelFase(faseId)}  [id: ${faseId || "—"}]  · tarea en curso: "${str(actual.title)}"${str(actual.assignee) ? ` (${str(actual.assignee)})` : ""}`
      : "Lanzado (todas las tareas de roadmap están done)";

  // Fases con fecha límite vencida (DashboardPage.jsx cuenta esto como "Fases vencidas").
  const deadlines = (client.phase_deadlines || {}) as Record<string, unknown>;
  const hoy = new Date().toISOString().slice(0, 10);
  const vencidas = Object.entries(deadlines)
    .filter(([, f]) => str(f) && str(f) < hoy)
    .map(([id, f]) => `${labelFase(id)} venció el ${str(f)}`);

  const antig = str(client.start_date) ? `${diasDesde(client.start_date)} días (desde ${fecha(client.start_date)})` : "sin fecha de alta";
  const prio: Record<string, string> = { "1": "SUPER PRIORITARIO", "2": "IMPORTANTE", "3": "NORMAL", "4": "POCO IMPORTANTE", "5": "NUEVO", "6": "DESCARTADO" };

  const cuello = str(client.bottleneck);

  return {
    texto: [
      "— FICHA —",
      `Cliente: ${str(client.name)}${str(client.company) ? ` · Empresa: ${str(client.company)}` : ""}${str(client.niche) ? ` · Nicho: ${str(client.niche)}` : ""}${str(client.team_name) ? ` · Equipo: ${str(client.team_name)}` : ""}`,
      `Servicio: ${str(client.service) || "—"}${str(client.tier) ? ` · Tier: ${str(client.tier)}` : ""}${str(client.client_type) ? ` · Tipo: ${str(client.client_type)}` : ""}`,
      `Estado: ${str(client.status) || "—"} · Prioridad: ${prio[str(client.priority)] || str(client.priority) || "—"} · Antigüedad: ${antig}`,
      `Quién lo lleva: PM ${str(client.pm) || "—"} · Closer ${str(client.closer) || "—"} · Conector ${str(client.conector) || "—"}`,
      "",
      `FASE ACTUAL: ${faseTxt}`,
      vencidas.length ? `FASES VENCIDAS: ${vencidas.join(" · ")}` : "",
      "",
      cuello
        ? `CUELLO DE BOTELLA (escrito a mano por el equipo, es la lectura oficial):\n${cuello}`
        : "CUELLO DE BOTELLA: vacío — nadie escribió qué hace falta para avanzar.",
      str(client.notes) ? `\nNOTAS DEL EQUIPO:\n${clip(str(client.notes), 2000)}` : "",
    ].filter(Boolean).join("\n"),
    fuente: cuello
      ? { rotulo: "Ficha", estado: "ok" }
      : { rotulo: "Ficha", estado: "parcial", detalle: "sin cuello de botella escrito" },
    remedio: cuello ? undefined : "El campo 'Pendiente para avanzar' de este cliente está vacío en la lista de Clientes. Es el dato más rico que tiene el panel: pedir que lo completen.",
    meta: { fase: faseId || null, roadmap_tasks: rmRows.length, fases_vencidas: vencidas.length },
  };
}

// ── 2) Satisfacción: los 4 canales de WhatsApp + su tendencia ────────────────
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

  // Tendencia por canal: calculada por CÓDIGO. "Bajó 12 puntos en 3 semanas" es un hallazgo;
  // dejar que el modelo compare a ojo una lista de números es pedirle que se equivoque.
  const hRows = Array.isArray(hist) ? hist : [];
  const porScope = new Map<string, { week: string; score: number }[]>();
  for (const r of hRows) {
    const s = str(r.scope) || "general";
    if (!porScope.has(s)) porScope.set(s, []);
    porScope.get(s)!.push({ week: fecha(r.week_start), score: num(r.score) });
  }
  const tendencias = [...porScope.entries()].map(([scope, serie]) => {
    const s = serie.slice(0, 8); // ya viene desc: [0] es la más reciente
    if (s.length < 2) return `${scope}: ${s[0]?.score ?? "—"} (una sola semana, sin tendencia)`;
    const delta = s[0].score - s[s.length - 1].score;
    const signo = delta > 0 ? `subió ${delta}` : delta < 0 ? `BAJÓ ${Math.abs(delta)}` : "estable";
    return `${scope}: ${signo} pts en ${s.length} semanas — ${s.map((x) => `${x.week}:${x.score}`).join(" → ")}`;
  });

  return {
    texto: [
      `— SATISFACCIÓN (inferida por IA de los mensajes de WhatsApp, NO es una encuesta al cliente · último análisis ${fecha(b.updated_at)}) —`,
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
    remedio: dias <= 8 ? undefined : `El análisis de WhatsApp de este cliente es de hace ${dias} días. Remedio: correr el análisis semanal de Soporte (wa-analisis-semanal).`,
    meta: { overall: b.sat_overall ?? null, semanas_historial: hRows.length, dias_analisis: dias },
  };
}

// ── 3) Llamadas: lo que el cliente DIJO, con sus problemas y objeciones ──────
async function llamadas(ctx: AgentCtx): Promise<Bloque> {
  const { data } = await ctx.supabase.from("llamadas")
    .select("titulo,fecha,categoria,duracion_min,resumen,problemas_detectados,objeciones,feedback,proximos_pasos,notas_clave,participantes")
    .eq("cliente_id", ctx.clientId).order("fecha", { ascending: false }).limit(5);
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "Llamadas", estado: "falta", detalle: "ninguna ligada a este cliente" },
      remedio: "No hay llamadas con cliente_id de este cliente. Puede que existan en el inbox de Fathom pero sin asignar: revisar la sección Llamadas y asignarle el cliente. NO se sabe qué dijo el cliente en persona.",
    };
  }

  const dias = diasDesde(rows[0].fecha);
  const bloque = (r: Record<string, unknown>) => {
    const prob = lista(r.problemas_detectados);
    const obj = lista(r.objeciones);
    const fb = lista(r.feedback);
    const pasos = lista(r.proximos_pasos);
    return [
      `— "${str(r.titulo) || "(sin título)"}" · ${fecha(r.fecha)} · ${str(r.categoria)}${num(r.duracion_min) ? ` · ${num(r.duracion_min)} min` : ""} · hace ${diasDesde(r.fecha)} días`,
      str(r.resumen) ? `RESUMEN: ${clip(str(r.resumen), 2500)}` : "",
      prob.length ? `PROBLEMAS DETECTADOS: ${prob.map((x) => `\n  · ${x}`).join("")}` : "",
      obj.length ? `OBJECIONES: ${obj.map((x) => `\n  · ${x}`).join("")}` : "",
      fb.length ? `FEEDBACK: ${fb.map((x) => `\n  · ${x}`).join("")}` : "",
      pasos.length ? `PRÓXIMOS PASOS ACORDADOS: ${pasos.map((x) => `\n  · ${x}`).join("")}` : "",
      str(r.notas_clave) ? `NOTAS: ${clip(str(r.notas_clave), 800)}` : "",
    ].filter(Boolean).join("\n");
  };

  return {
    texto: [
      `— LLAMADAS (últimas ${rows.length}, la más reciente hace ${dias} días · extraídas por IA del transcript de Fathom) —`,
      ...rows.map(bloque),
    ].join("\n\n"),
    fuente: dias <= 30
      ? { rotulo: "Llamadas", estado: "ok", detalle: `${rows.length}, última hace ${dias} días` }
      : { rotulo: "Llamadas", estado: "viejo", detalle: `la última es de hace ${dias} días` },
    remedio: dias <= 30 ? undefined : `Hace ${dias} días que no hay una llamada registrada con este cliente. O no se habló, o la llamada no quedó asignada al cliente en la sección Llamadas.`,
    meta: { llamadas: rows.length, dias_ultima: dias },
  };
}

// ── 4) Trabajo: qué se le está haciendo AHORA y qué está trabado ─────────────
async function trabajo(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: tasks }, { data: blockers }, { data: pend }, { data: pedidos }] = await Promise.all([
    ctx.supabase.from("tasks")
      .select("title,status,phase,assignee,owner_id,department,blocked_since,due_date,started_date,notes,review_reason,asignada_cliente")
      .eq("client_id", ctx.clientId).neq("status", "done").order("updated_at", { ascending: false }).limit(60),
    ctx.supabase.from("team_blockers").select("description,needs,created_at,user_id")
      .eq("client_id", ctx.clientId).eq("resolved", false).order("created_at", { ascending: false }).limit(10),
    ctx.supabase.from("wa_pending_items").select("pregunta,urgencia,tipo,wa_timestamp,last_msg_preview")
      .eq("client_id", ctx.clientId).is("resolved_at", null).order("wa_timestamp", { ascending: false }).limit(15),
    ctx.supabase.from("portal_pedidos").select("tipo,titulo,descripcion,estado,pedido_at,compromiso_at,bloqueante")
      .eq("client_id", ctx.clientId).neq("estado", "completado").order("pedido_at", { ascending: false }).limit(15),
  ]);

  const tRows = Array.isArray(tasks) ? tasks : [];
  const bRows = Array.isArray(blockers) ? blockers : [];
  const pRows = Array.isArray(pend) ? pend : [];
  const peRows = Array.isArray(pedidos) ? pedidos : [];

  // Lo que está EN CURSO vs. lo que está esperando. El corte importa: "en curso" responde
  // "qué le estamos haciendo ahora"; "trabado" responde "qué lo frena".
  const enCurso = tRows.filter((t) => ["in-progress", "en-revision"].includes(str(t.status)));
  const trabadas = tRows.filter((t) => str(t.status) === "blocked" || str(t.blocked_since));
  const enCliente = tRows.filter((t) => t.asignada_cliente);
  const resto = tRows.filter((t) => !enCurso.includes(t) && !trabadas.includes(t));

  const linea = (t: Record<string, unknown>) => {
    const bs = str(t.blocked_since) ? ` · TRABADA desde ${fecha(t.blocked_since)} (${diasDesde(t.blocked_since)} días)` : "";
    const dd = str(t.due_date) ? ` · vence ${fecha(t.due_date)}${fecha(t.due_date) < new Date().toISOString().slice(0, 10) ? " ⚠VENCIDA" : ""}` : "";
    const rr = str(t.review_reason) ? ` · motivo de revisión: ${str(t.review_reason)}` : "";
    return `  · [${str(t.status)}] ${str(t.title)}${str(t.assignee) ? ` — ${str(t.assignee)}` : ""}${str(t.department) ? ` (${str(t.department)})` : ""}${bs}${dd}${rr}`;
  };

  const partes = [
    `— TRABAJO ABIERTO (${tRows.length} tareas sin terminar) —`,
    enCurso.length ? `EN CURSO AHORA (${enCurso.length}):\n${enCurso.map(linea).join("\n")}` : "EN CURSO AHORA: ninguna tarea en progreso ni en revisión.",
    trabadas.length ? `\nTRABADAS (${trabadas.length}):\n${trabadas.map(linea).join("\n")}` : "",
    enCliente.length ? `\nESPERANDO AL CLIENTE (${enCliente.length}):\n${enCliente.map(linea).join("\n")}` : "",
    resto.length ? `\nEN COLA (${resto.length}${resto.length > 20 ? ", se listan las 20 más recientes" : ""}):\n${resto.slice(0, 20).map(linea).join("\n")}` : "",
  ];

  if (bRows.length) {
    partes.push(`\nBLOQUEOS REPORTADOS POR EL EQUIPO (${bRows.length}, sin resolver):\n${bRows.map((b) =>
      `  · ${str(b.description)}${str(b.needs) ? ` — necesita: ${str(b.needs)}` : ""} (desde ${fecha(b.created_at)}, ${diasDesde(b.created_at)} días)`).join("\n")}`);
  }
  if (pRows.length) {
    const altas = pRows.filter((p) => str(p.urgencia) === "alta").length;
    partes.push(`\nPREGUNTAS DEL CLIENTE SIN RESPONDER EN WHATSAPP (${pRows.length}${altas ? `, ${altas} de urgencia ALTA` : ""}):\n${pRows.map((p) =>
      `  · [${str(p.urgencia)}/${str(p.tipo)}] ${str(p.pregunta)} (${fecha(p.wa_timestamp)}, hace ${diasDesde(p.wa_timestamp)} días)`).join("\n")}`);
  }
  if (peRows.length) {
    partes.push(`\nPEDIDOS ABIERTOS EN SU PORTAL (${peRows.length}):\n${peRows.map((p) =>
      `  · [${str(p.estado)}${p.bloqueante ? "/BLOQUEANTE" : ""}] ${str(p.titulo)}${str(p.descripcion) ? ` — ${clip(str(p.descripcion), 200)}` : ""} (pedido ${fecha(p.pedido_at)}${str(p.compromiso_at) ? `, se comprometió para ${fecha(p.compromiso_at)}` : ""})`).join("\n")}`);
  }

  const nada = !tRows.length && !bRows.length && !pRows.length && !peRows.length;
  return {
    texto: nada ? "" : partes.filter(Boolean).join("\n"),
    fuente: nada
      ? { rotulo: "Trabajo", estado: "falta", detalle: "sin tareas ni pendientes abiertos" }
      : { rotulo: "Trabajo", estado: "ok", detalle: `${tRows.length} tareas · ${bRows.length} bloqueos · ${pRows.length} pendientes de WhatsApp` },
    remedio: nada ? "Este cliente no tiene ninguna tarea abierta ni pendiente registrado. O está realmente parado, o su trabajo no se está cargando en el panel." : undefined,
    meta: { tareas_abiertas: tRows.length, en_curso: enCurso.length, trabadas: trabadas.length, bloqueos: bRows.length, wa_pendientes: pRows.length, pedidos: peRows.length },
  };
}

// ── 5) Finanzas: qué paga, con qué regularidad, y qué debe ───────────────────
// Ojo: clients.billing_* NO es confiable (billing_amount cargado en 11 de 37, billing_status
// dice 'al_dia' en los 37 porque nadie lo toca). La verdad de los pagos está en fin_incomes.
// Tampoco usamos las vistas fin_cuadre_cliente / fin_cliente_debe_korex: cruzan por NOMBRE
// de cliente, no por client_id, y un join por string acá metería plata del cliente equivocado.
async function finanzas(ctx: AgentCtx, client: Record<string, unknown> | null): Promise<Bloque> {
  const [{ data: incomes }, { data: terms }, { data: contratos }, { data: runway }] = await Promise.all([
    ctx.supabase.from("fin_incomes")
      .select("income_date,effective_type,income_type,amount_usd,amount_eur,net_usd,payment_method,status")
      .eq("client_id", ctx.clientId).order("income_date", { ascending: false }).limit(24),
    ctx.supabase.from("fin_client_terms").select("service_value,umbral_base,agreement_date,payment_method,csm_name,notes")
      .eq("client_id", ctx.clientId).maybeSingle(),
    ctx.supabase.from("contracts").select("title,status,signed_date,renewal_date")
      .eq("client_id", ctx.clientId).order("signed_date", { ascending: false }).limit(5),
    ctx.supabase.from("ads_runway_alerts").select("last_tier,last_runway,last_alerted_at,updated_at")
      .eq("client_id", ctx.clientId).maybeSingle(),
  ]);

  const iRows = Array.isArray(incomes) ? incomes : [];
  const cRows = Array.isArray(contratos) ? contratos : [];

  if (!iRows.length && !terms && !cRows.length) {
    return {
      texto: "", fuente: { rotulo: "Finanzas", estado: "falta", detalle: "sin pagos, términos ni contrato" },
      remedio: "No hay ni un pago con client_id, ni términos en fin_client_terms, ni contrato para este cliente. Puede que los pagos estén cargados sin cliente asignado: revisar en Finanzas. SIN ESTO NO SE PUEDE JUZGAR SU CAPACIDAD NI SU HÁBITO DE PAGO.",
    };
  }

  // Ritmo de pago: por mes y por tipo. Es lo que sostiene cualquier juicio sobre "¿pagaría
  // una mensualidad?" — la recurrencia REAL vale más que lo que diga clients.billing_cycle.
  const porMes = new Map<string, { total: number; n: number; tipos: Set<string> }>();
  for (const r of iRows) {
    const m = fecha(r.income_date).slice(0, 7);
    const acc = porMes.get(m) || { total: 0, n: 0, tipos: new Set<string>() };
    acc.total += num(r.amount_usd); acc.n += 1;
    acc.tipos.add(str(r.effective_type) || str(r.income_type) || "?");
    porMes.set(m, acc);
  }
  const meses = [...porMes.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 8);
  const diasUltimoPago = iRows.length ? diasDesde(iRows[0].income_date) : 9999;

  const partes = [
    "— FINANZAS —",
    terms
      ? `TÉRMINOS ACORDADOS: valor del servicio ${num(terms.service_value) ? `US$${num(terms.service_value)}` : "—"} · umbral base ${num(terms.umbral_base) ? `US$${num(terms.umbral_base)}` : "—"} · acordado ${fecha(terms.agreement_date)} · método ${str(terms.payment_method) || "—"}${str(terms.csm_name) ? ` · CSM ${str(terms.csm_name)}` : ""}${str(terms.notes) ? `\n  Notas: ${clip(str(terms.notes), 500)}` : ""}`
      : "TÉRMINOS ACORDADOS: no hay fila en fin_client_terms para este cliente.",
    "",
    iRows.length
      ? `PAGOS POR MES (últimos ${meses.length} meses con movimiento · el más reciente hace ${diasUltimoPago} días):\n${meses.map(([m, v]) => `  · ${m}: US$${v.total.toFixed(0)} en ${v.n} pago(s) — ${[...v.tipos].join(", ")}`).join("\n")}`
      : "PAGOS: ninguno registrado con este client_id.",
    iRows.length
      ? `\nÚLTIMOS PAGOS:\n${iRows.slice(0, 8).map((r) => `  · ${fecha(r.income_date)} · ${str(r.effective_type) || str(r.income_type)} · US$${num(r.amount_usd)} · ${str(r.payment_method) || "—"} · ${str(r.status) || "—"}`).join("\n")}`
      : "",
    "",
    cRows.length
      ? `CONTRATOS:\n${cRows.map((c) => {
        const d = diasHasta(c.renewal_date);
        const ren = str(c.renewal_date)
          ? ` · RENUEVA ${fecha(c.renewal_date)}${d === null ? "" : d >= 0 ? ` (en ${d} días)` : ` (VENCIÓ hace ${-d} días)`}`
          : "";
        return `  · ${str(c.title) || "(sin título)"} — ${str(c.status)}${str(c.signed_date) ? ` · firmado ${fecha(c.signed_date)}` : ""}${ren}`;
      }).join("\n")}`
      : "CONTRATOS: ninguno cargado.",
    runway
      ? `\nSALDO DE PUBLICIDAD: ${str(runway.last_tier) || "—"} · quedan ~${num(runway.last_runway)} días de saldo (medido ${fecha(runway.updated_at)})`
      : "",
    client && (num(client.cash_collect) || num(client.remaining_to_collect))
      ? `\nCOBRANZA: cobrado US$${num(client.cash_collect)} · falta cobrar US$${num(client.remaining_to_collect)}`
      : "",
    client && num(client.billing_amount)
      ? `\nFACTURACIÓN DECLARADA EN LA FICHA: ${num(client.billing_amount)} ${str(client.billing_currency) || ""} ${str(client.billing_cycle) || ""} — OJO: este campo está cargado en menos de un tercio de los clientes y billing_status nunca se actualiza. Si contradice a los pagos de arriba, ganan los pagos.`
      : "",
  ];

  return {
    texto: partes.filter(Boolean).join("\n"),
    fuente: iRows.length
      ? (diasUltimoPago <= 60
        ? { rotulo: "Finanzas", estado: "ok", detalle: `${iRows.length} pagos, el último hace ${diasUltimoPago} días` }
        : { rotulo: "Finanzas", estado: "viejo", detalle: `el último pago es de hace ${diasUltimoPago} días` })
      : { rotulo: "Finanzas", estado: "parcial", detalle: "hay términos/contrato pero ningún pago con client_id" },
    remedio: iRows.length
      ? (diasUltimoPago <= 60 ? undefined : `Hace ${diasUltimoPago} días que no entra un pago de este cliente. Verificar si dejó de pagar o si los pagos están cargados sin client_id en Finanzas.`)
      : "Hay contrato o términos pero ningún pago cruzado por client_id. Revisar en Finanzas que los ingresos de este cliente tengan el cliente asignado.",
    meta: { pagos: iRows.length, dias_ultimo_pago: diasUltimoPago, meses_con_pago: meses.length, tiene_terminos: !!terms },
  };
}

// ── 6) Entregables: en qué anda cada funnel (el semáforo real del panel) ─────
async function entregables(ctx: AgentCtx): Promise<Bloque> {
  const [{ data: pipe }, { data: pages }] = await Promise.all([
    ctx.supabase.rpc("cerebro_pipeline_status", { p_client_id: ctx.clientId }),
    ctx.supabase.from("strategy_pages").select("id,name,tipo,status,is_live,prod_url,official_domain")
      .eq("client_id", ctx.clientId).order("position", { ascending: true }).limit(40),
  ]);

  const pRows = Array.isArray(pipe) ? pipe as Record<string, unknown>[] : [];
  const pgRows = Array.isArray(pages) ? pages : [];

  if (!pRows.length && !pgRows.length) {
    return {
      texto: "", fuente: { rotulo: "Entregables", estado: "falta", detalle: "sin funnels" },
      remedio: "Este cliente no tiene ningún funnel cargado en strategy_pages. Si ya se le está construyendo algo, no está reflejado en el panel.",
    };
  }

  // Agrupamos el semáforo por funnel y marcamos la PRIMERA etapa pendiente: eso es
  // literalmente "en qué está trabado este funnel".
  const porFunnel = new Map<string, { nombre: string; estrategia: string; etapas: Record<string, unknown>[] }>();
  for (const r of pRows) {
    const id = str(r.funnel_id);
    if (!porFunnel.has(id)) porFunnel.set(id, { nombre: str(r.funnel), estrategia: str(r.strategy), etapas: [] });
    porFunnel.get(id)!.etapas.push(r);
  }

  const bloquesFunnel = [...porFunnel.entries()].map(([id, f]) => {
    const etapas = f.etapas.sort((a, b) => num(a.ord) - num(b.ord));
    const pendiente = etapas.find((e) => str(e.status) !== "listo");
    const pg = pgRows.find((p) => str(p.id) === id);
    const cab = `— FUNNEL "${f.nombre}"${f.estrategia ? ` (estrategia: ${f.estrategia})` : ""}${pg ? ` · tipo ${str(pg.tipo) || "—"} · ${pg.is_live ? "EN VIVO" : "no está en vivo"} · estado ${str(pg.status) || "—"}` : ""}`;
    const detalle = etapas.map((e) => `    ${str(e.status) === "listo" ? "✓" : "○"} ${str(e.stage_label)}${str(e.substate) ? ` [${str(e.substate)}]` : ""}${str(e.detail) && str(e.detail) !== "OK" ? ` — ${str(e.detail)}` : ""}`).join("\n");
    return `${cab}\n  ${pendiente ? `TRABADO EN: ${str(pendiente.stage_label)} — ${str(pendiente.detail) || "pendiente"}` : "TODAS LAS ETAPAS LISTAS"}\n${detalle}`;
  });

  // Funnels que existen pero que el semáforo no cubre (p. ej. borradores sin estrategia).
  const sinPipe = pgRows.filter((p) => !porFunnel.has(str(p.id)));

  const vivos = pgRows.filter((p) => p.is_live).length;
  return {
    texto: [
      `— ENTREGABLES: ${pgRows.length} funnel(es), ${vivos} en vivo —`,
      ...bloquesFunnel,
      sinPipe.length ? `\nFunnels sin semáforo calculado (${sinPipe.length}): ${sinPipe.map((p) => `${str(p.name)} [${str(p.status) || "—"}]`).join(" · ")}` : "",
    ].filter(Boolean).join("\n\n"),
    fuente: pRows.length
      ? { rotulo: "Entregables", estado: "ok", detalle: `${pgRows.length} funnels, ${vivos} en vivo` }
      : { rotulo: "Entregables", estado: "parcial", detalle: `${pgRows.length} funnels, sin semáforo` },
    remedio: pRows.length ? undefined : "Los funnels existen pero cerebro_pipeline_status no devolvió etapas: probablemente les falta la estrategia asociada.",
    meta: { funnels: pgRows.length, en_vivo: vivos, etapas: pRows.length },
  };
}

// ── 7) Timeline: qué pasó, en orden ──────────────────────────────────────────
async function timeline(ctx: AgentCtx): Promise<Bloque> {
  const { data } = await ctx.supabase.from("historial_eventos")
    .select("fecha,tipo,titulo,descripcion,estado,responsable,autor")
    .eq("cliente_id", ctx.clientId).eq("dismissed", false)
    .order("fecha", { ascending: false }).limit(15);
  const rows = Array.isArray(data) ? data : [];

  if (!rows.length) {
    return {
      texto: "", fuente: { rotulo: "Historial", estado: "falta", detalle: "sin eventos cargados" },
      remedio: "Este cliente no tiene eventos en el historial (sólo 13 de 37 clientes lo usan). No es un problema grave: la línea de tiempo se puede reconstruir con las llamadas y las tareas.",
    };
  }

  return {
    texto: [
      `— HISTORIAL (últimos ${rows.length} eventos) —`,
      ...rows.map((r) => `  · ${fecha(r.fecha)} [${str(r.tipo)}] ${str(r.titulo)}${str(r.estado) ? ` (${str(r.estado)})` : ""}${str(r.responsable) ? ` — ${str(r.responsable)}` : ""}${str(r.descripcion) ? `\n      ${clip(str(r.descripcion), 400)}` : ""}`),
    ].join("\n"),
    fuente: { rotulo: "Historial", estado: "ok", detalle: `${rows.length} eventos` },
    meta: { eventos: rows.length },
  };
}

// ── El módulo ────────────────────────────────────────────────────────────────
const cuenta: AgentModule = {
  key: "cuenta",
  nivel: "cliente",

  // Contrato de salida con el panel (no editable desde el Cerebro).
  formato: [
    "- Para un REPASO del cliente (el pedido típico: \"¿cómo viene X?\"), esta estructura es OBLIGATORIA y en este orden:",
    "  `## Dónde está` — 3-5 líneas: en qué fase está, qué se le está haciendo ahora y desde hace cuánto.",
    "  `## El cuello` — el bloqueo real, quién lo tiene que destrabar y hace cuántos días que está así. Uno solo, el que importa.",
    "  `## Termómetro` — tabla `Señal | Valor | Fecha | Lectura` con 🟢🟡🔴 por fila. Señales: satisfacción (y su tendencia), última llamada, tareas trabadas, pagos, saldo de ads.",
    "  `## Riesgos` — rankeados, el más probable primero. Cada uno con qué dato lo confirmaría o lo descartaría.",
    "  `## Qué haría yo` — lista `1.` ordenada por impacto. Acciones concretas sobre ESTE cliente, con quién las hace.",
    "- Para una pregunta puntual: prosa directa, con el dato citado y su fecha. La estructura completa es para el repaso, no para inflar.",
    "- Para \"¿pagaría una mensualidad?\" (o cualquier pregunta de disposición a pagar) la estructura es otra y también es obligatoria: `## Qué recibió` · `## Qué resultados tiene` · `## Cómo paga hoy` · `## A favor` · `## En contra` · `## Veredicto` — y el veredicto SIEMPRE cierra con su nivel de confianza (alto/medio/bajo) y qué lo subiría.",
    "- Cada afirmación arranca con `DATO:` (está en el dossier, y va con su fecha) o con `LECTURA:` (es interpretación tuya). Al principio de renglón el panel las pinta como etiqueta. Nunca las mezcles en el mismo renglón. En las tablas, la columna Lectura es la única que puede opinar.",
    "- La COBERTURA DE DATOS manda: está calculada por el sistema. Lo marcado ✗ no existe y cualquier afirmación que lo necesite es LECTURA, no DATO.",
  ].join("\n"),

  async buildContext(ctx: AgentCtx): Promise<AgentContextResult> {
    const { data: client } = await ctx.supabase.from("clients")
      .select("name,company,niche,team_name,service,tier,client_type,status,priority,start_date,pm,closer,conector,bottleneck,notes,custom_phases,phase_name_overrides,phase_deadlines,billing_amount,billing_currency,billing_cycle,cash_collect,remaining_to_collect")
      .eq("id", ctx.clientId).maybeSingle();
    const cli = (client || null) as Record<string, unknown> | null;

    // Qué builders corren: lo dice el manifest. Sin manifest corren todos.
    const datasets = Array.isArray(ctx.manifest.datasets)
      ? (ctx.manifest.datasets as string[])
      : ["ficha", "satisfaccion", "llamadas", "trabajo", "finanzas", "entregables", "timeline"];
    const activo = (k: string) => datasets.includes(k);

    const [bFicha, bSat, bLlam, bTrab, bFin, bEnt, bTime] = await Promise.all([
      activo("ficha") ? ficha(ctx, cli) : null,
      activo("satisfaccion") ? satisfaccion(ctx) : null,
      activo("llamadas") ? llamadas(ctx) : null,
      activo("trabajo") ? trabajo(ctx) : null,
      activo("finanzas") ? finanzas(ctx, cli) : null,
      activo("entregables") ? entregables(ctx) : null,
      activo("timeline") ? timeline(ctx) : null,
    ]);

    const bloques = [bFicha, bSat, bLlam, bTrab, bFin, bEnt, bTime].filter(Boolean) as Bloque[];

    // ── COBERTURA DE DATOS: calculada por código. Acá es lo más importante del módulo,
    // porque la cobertura entre clientes es muy despareja y un agente confiado sobre un
    // cliente del que no sabe nada hace más daño que no tenerlo.
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
      "- Si te preguntan por algo que está en ✗, la respuesta correcta es decir que no lo sabés y pasar el REMEDIO tal cual figura acá. No lo aproximes con lo que sí tenés.",
    ].join("\n");

    const dossier = bloques.map((b) => b.texto).filter(Boolean).join("\n\n");

    const estable = [
      "===== CONTEXTO DE ESTA CONVERSACIÓN (usalo, no lo pidas) =====",
      `Cliente: ${str(cli?.name) || ctx.clientId}${str(cli?.company) ? ` · Empresa: ${str(cli?.company)}` : ""}`,
      `Hoy es ${new Date().toISOString().slice(0, 10)}. Todas las antigüedades del dossier están calculadas contra esta fecha.`,
      "",
      "Sobre la satisfacción, antes de que la uses: los puntajes salen de un análisis de IA de los",
      "mensajes de WhatsApp, NO de una encuesta al cliente. Nadie le preguntó nada. Sirven para",
      "priorizar y para detectar deterioro; no son una nota que el cliente dio y no se reportan",
      "como tal.",
      "",
      cobertura,
      "",
      "===== DOSSIER DEL CLIENTE =====",
      dossier || "(ningún dataset devolvió datos — mirá la cobertura de arriba)",
    ].join("\n");

    return {
      estable,
      recuperado: "", // el dossier es estable en la conversación: no hay retrieval por turno
      fuentes: bloques.map((b) => b.fuente),
      meta: Object.fromEntries(bloques.map((b) => [b.fuente.rotulo, { estado: b.fuente.estado, ...(b.meta || {}) }])),
    };
  },
};

export default cuenta;
