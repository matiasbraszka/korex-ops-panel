// Definicion CENTRAL del DME (panel de metricas por cliente).
// Un solo lugar para tocar si cambia/agrega una metrica: el resto del sistema
// (tabla, modal de carga, agregacion semanal/mensual, semaforo, Maestro) lee de aca.
//
//  - SECTIONS: bloques y metricas en el orden de la planilla canonica (Diario).
//  - metric: { key, label, section, type, kind, agg, sheetLabel }
//      type: 'input'   -> se carga a mano y se guarda en dme_daily.metrics
//            'derived' -> se calcula en derive.js, NUNCA se guarda
//      kind: 'int'|'money'|'pct'|'cpl'|'roi'|'num'  (formato)
//      agg:  'sum'(default) | 'last'(snapshot/stock) | 'max' | 'min'  (agregacion en el tiempo)
//      sheetLabel: nombre exacto de la fila en el Sheet (para el importador por nombre)
//  - DEFAULT_DME_CONFIG: semilla de umbrales del semaforo (pestana Config de la planilla).

// ── Bloques que NO son embudos ───────────────────────────────────────────────
const GENERAL = {
  id: 'general', title: 'General — Negocio Korex',
  metrics: [
    { key: 'usuarios_activos_con_pub', label: 'Usuarios activos con publicidad', type: 'input',   kind: 'int', agg: 'last' },
    { key: 'usuarios_activos_sin_pub', label: 'Usuarios activos sin publicidad', type: 'input',   kind: 'int', agg: 'last' },
    { key: 'nuevos_usuarios',          label: 'Nuevos usuarios',                  type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'usuarios_total',           label: 'TOTAL de usuarios',                type: 'derived', kind: 'int' },
    { key: 'pct_activos_con_pub',      label: '% de usuarios activos con publicidad', type: 'derived', kind: 'pct' },
    { key: 'pct_activos_sin_pub',      label: '% de usuarios activos sin publicidad', type: 'derived', kind: 'pct' },
    { key: 'usuarios_baja',            label: 'Usuarios que se dieron de baja',   type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'pct_bajas',                label: '% de bajas',                       type: 'derived', kind: 'pct' },
  ],
};

const FINANZAS = {
  id: 'finanzas', title: 'Finanzas',
  metrics: [
    { key: 'facturacion_setups',   label: 'Facturación SETUPS',            type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'comisiones_setups',    label: 'Comisiones SETUPS',             type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'cashcollect_setups',   label: 'CashCollect SETUPs',            type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'pct_comisiones_setups',label: '% en comisiones de SETUPS',     type: 'derived', kind: 'pct' },
    { key: 'recargas_pub',         label: 'Recargas en publicidad',        type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'invertido_pub',        label: 'Invertido por los usuarios en publicidad', type: 'input', kind: 'money', agg: 'sum' },
    { key: 'comisiones_pub',       label: 'Comisiones publicidad',         type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'cashcollect_pub',      label: 'CashCollect Publicidad',        type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'pct_comisiones_pub',   label: '% en comisiones de publicidad', type: 'derived', kind: 'pct' },
    { key: 'pct_renovaciones',     label: '% Renovaciones',                type: 'input',   kind: 'pct', agg: 'last' },
    { key: 'avg_inversion_usuario',label: 'AVG inversión publicitaria por usuario', type: 'derived', kind: 'money' },
  ],
};

const SALDOS = {
  id: 'saldos', title: 'Saldos y Runway',
  metrics: [
    { key: 'saldo_final',                 label: 'Saldo disponible final del día',            type: 'input',   kind: 'money', agg: 'last' },
    { key: 'saldo_con_invertido',         label: 'Saldo disponible con lo invertido del día', type: 'input',   kind: 'money', agg: 'last' },
    { key: 'total_gastado_acumulado',     label: 'Total gastado acumulado',                   type: 'input',   kind: 'money', agg: 'last' },
    { key: 'pct_queda_saldo',             label: '% que me queda del saldo disponible',       type: 'derived', kind: 'pct' },
    { key: 'pct_queda_saldo_invertido',   label: '% que me queda del saldo con lo invertido hoy', type: 'derived', kind: 'pct' },
    { key: 'dias_proyectados',            label: 'Días proyectados con publicidad activa',    type: 'derived', kind: 'num' },
  ],
};

const LEADS = {
  id: 'leads', title: 'Leads — Visión agregada',
  metrics: [
    { key: 'leads_obtenidos',     label: 'Leads obtenidos',         type: 'input',   kind: 'int',   agg: 'sum' },
    { key: 'cpl',                 label: 'Costo por lead (CPL)',    type: 'derived', kind: 'cpl' },
    { key: 'leads_por_networker', label: 'Leads promedio por networker', type: 'derived', kind: 'num' },
    { key: 'cpl_mas_alto',        label: 'Costo por lead más alto', type: 'input',   kind: 'money', agg: 'max' },
    { key: 'cpl_mas_bajo',        label: 'Costo por lead más bajo', type: 'input',   kind: 'money', agg: 'min' },
    { key: 'dispersion_cpl',      label: 'Dispersión de CPL',       type: 'derived', kind: 'pct' },
  ],
};

const NETWORKERS = {
  id: 'networkers', title: 'Networkers — Avance del grupo',
  metrics: [
    { key: 'networkers_recibieron',     label: 'Networkers que recibieron leads',                type: 'input',   kind: 'int', agg: 'last' },
    { key: 'networkers_sin_leads',      label: 'Networkers sin leads (que deberían haber recibido)', type: 'input', kind: 'int', agg: 'last' },
    { key: 'pct_recibiendo_prospectos', label: '% que están recibiendo prospectos',              type: 'derived', kind: 'pct' },
    { key: 'networkers_cerraron',       label: 'Networkers que cerraron',                        type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'networkers_primer_cierre',  label: 'Networkers con primer cierre',                   type: 'input',   kind: 'int', agg: 'sum' },
  ],
};

const CUALITATIVO = {
  id: 'cualitativo', title: 'Cualitativo — Señales tempranas',
  metrics: [
    { key: 'nuevos_testimonios',  label: 'Nuevos testimonios',          type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'nuevos_referidos',    label: 'Nuevos referidos',            type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'tasa_testimonios',    label: 'Tasa de testimonios',         type: 'derived', kind: 'pct' },
    { key: 'pct_referidos',       label: '% de referidos',              type: 'derived', kind: 'pct' },
    { key: 'problemas_tecnicos',  label: 'Problemas técnicos reportados', type: 'input', kind: 'int', agg: 'sum' },
    { key: 'quejas',              label: 'Quejas o feedback negativo',  type: 'input',   kind: 'int', agg: 'sum' },
  ],
};

// ── Embudos (mismo esquema para Embudo 1 y Embudo 2) ─────────────────────────
// Inputs en orden de la planilla; entre cada cantidad va su % y costo derivados.
const FUNNEL_INPUTS = [
  { suffix: 'total_gastado',     label: 'Total gastado',          kind: 'money', agg: 'sum' },
  { suffix: 'total_leads',       label: 'Total de leads',         kind: 'int',   agg: 'sum' },
  { suffix: 'leads_curiosos',    label: 'Leads curiosos',         kind: 'int',   agg: 'sum' },
  { suffix: 'leads_interesados', label: 'Leads interesados',      kind: 'int',   agg: 'sum' },
  { suffix: 'leads_calificados', label: 'Leads calificados',      kind: 'int',   agg: 'sum' },
  { suffix: 'visitas_landing',   label: 'Visitas en la landing',  kind: 'int',   agg: 'sum' },
  { suffix: 'leads_registrados', label: 'Leads registrados',      kind: 'int',   agg: 'sum' },
  { suffix: 'miran_vsl',         label: 'Miran el VSL completo',  kind: 'int',   agg: 'sum' },
  { suffix: 'quiz_iniciado',     label: 'Quiz iniciado',          kind: 'int',   agg: 'sum' },
  { suffix: 'quiz_terminado',    label: 'Quiz terminado',         kind: 'int',   agg: 'sum' },
  { suffix: 'whatsapp',          label: 'WhatsApp enviado',       kind: 'int',   agg: 'sum' },
  { suffix: 'cierres',           label: 'Cierres',                kind: 'int',   agg: 'sum' },
  { suffix: 'facturado',         label: 'Total facturado clientes', kind: 'money', agg: 'sum' },
];

// Filas del embudo en el orden visual de la planilla (cantidad -> % -> costo).
function funnelSection(prefix, title) {
  const k = (s) => `${prefix}_${s}`;
  const inp = Object.fromEntries(
    FUNNEL_INPUTS.map((f) => [f.suffix, { key: k(f.suffix), label: f.label, type: 'input', kind: f.kind, agg: f.agg }])
  );
  const der = (suffix, label, kind) => ({ key: k(suffix), label, type: 'derived', kind });
  const metrics = [
    inp.total_gastado,
    inp.total_leads,
    der('pct_inversion', '% de inversión asignado a este embudo', 'pct'),
    der('cpl', 'Costo por lead', 'cpl'),
    inp.leads_curiosos,
    der('pct_curiosos', '% leads curiosos', 'pct'),
    der('costo_curioso', 'Costo lead curioso', 'cpl'),
    inp.leads_interesados,
    der('pct_interesados', '% leads interesados', 'pct'),
    der('costo_interesado', 'Costo lead interesado', 'cpl'),
    inp.leads_calificados,
    der('pct_calificados', '% leads calificados', 'pct'),
    der('costo_calificado', 'Costo lead calificado', 'cpl'),
    inp.visitas_landing,
    inp.leads_registrados,
    der('pct_registro', '% de registro', 'pct'),
    inp.miran_vsl,
    der('pct_vsl', '% que mira el VSL completo', 'pct'),
    inp.quiz_iniciado,
    inp.quiz_terminado,
    der('pct_quiz', '% que termina quiz', 'pct'),
    inp.whatsapp,
    der('pct_whatsapp', '% de WhatsApp enviado', 'pct'),
    inp.cierres,
    der('pct_cierres', '% de cierres', 'pct'),
    inp.facturado,
    der('roi', 'ROI', 'roi'),
  ];
  return { id: prefix, title, metrics };
}

export const EMBUDO1 = funnelSection('embudo1', 'Embudo 1');
export const EMBUDO2 = funnelSection('embudo2', 'Embudo 2');

export const SECTIONS = [GENERAL, FINANZAS, SALDOS, LEADS, NETWORKERS, CUALITATIVO, EMBUDO1, EMBUDO2]
  .map((s) => ({ ...s, metrics: s.metrics.map((m) => ({ ...m, section: s.id })) }));

// Indices utiles.
export const ALL_METRICS  = SECTIONS.flatMap((s) => s.metrics);
export const METRIC_BY_KEY = Object.fromEntries(ALL_METRICS.map((m) => [m.key, m]));
export const INPUT_METRICS = ALL_METRICS.filter((m) => m.type === 'input');
export const INPUT_KEYS    = INPUT_METRICS.map((m) => m.key);
export const SNAPSHOT_KEYS = INPUT_METRICS.filter((m) => m.agg === 'last').map((m) => m.key);
export const MAX_KEYS      = INPUT_METRICS.filter((m) => m.agg === 'max').map((m) => m.key);
export const MIN_KEYS      = INPUT_METRICS.filter((m) => m.agg === 'min').map((m) => m.key);
export const EMPTY_ROW     = Object.fromEntries(INPUT_KEYS.map((k) => [k, 0]));

// Grupos para el formulario de carga (solo inputs), en el orden de las secciones.
export const INPUT_GROUPS = SECTIONS
  .map((s) => ({ title: s.title, fields: s.metrics.filter((m) => m.type === 'input') }))
  .filter((g) => g.fields.length > 0);

// ── Semilla del semaforo (pestana Config de la planilla canonica) ────────────
// direction: 'mayor' (mas es mejor) | 'menor' (menos es mejor). umbrales como
// ratio para %/roi (0.80 = 80%) y numero crudo para no-%. Solo las metricas con
// `activo:true` se pintan; agregar una metrica nueva + su fila aca la suma al panel.
const t = (bloque, direction, verde, amarillo, critico, notas, activo = true) =>
  ({ bloque, direction, verde, amarillo, critico, notas, activo });

export const DEFAULT_DME_CONFIG = {
  pct_activos_con_pub:       t('General', 'mayor', 0.80, 0.60, 0.40, 'Salud de la cartera con pauta', false),
  pct_bajas:                 t('General', 'menor', 0.03, 0.06, 0.10, 'Cuánto se está yendo del sistema'),
  pct_comisiones_setups:     t('Finanzas', 'menor', 0.40, 0.60, 0.75, 'Costo de la venta inicial'),
  pct_comisiones_pub:        t('Finanzas', 'menor', 0.10, 0.20, 0.30, 'Costo de la venta recurrente'),
  pct_renovaciones:          t('Finanzas', 'mayor', 0.80, 0.60, 0.40, 'Satisfacción real con el producto'),
  dias_proyectados:          t('Saldos', 'mayor', 15, 7, 3, 'Cuánto aguanta el saldo'),
  dispersion_cpl:            t('Leads', 'menor', 0.40, 0.80, 1.50, 'Qué tan desigual es el reparto'),
  pct_recibiendo_prospectos: t('Networkers', 'mayor', 0.90, 0.70, 0.50, 'Salud del reparto'),
  tasa_testimonios:          t('Cualitativo', 'mayor', 0.30, 0.10, 0.05, 'Captura de prueba social'),
  pct_referidos:             t('Cualitativo', 'mayor', 0.20, 0.10, 0.05, 'Boca a boca y satisfacción'),
  embudo1_pct_interesados:   t('Embudo 1', 'mayor', 0.20, 0.10, 0.05, 'KPI garantía Korex'),
  embudo1_pct_calificados:   t('Embudo 1', 'mayor', 0.15, 0.10, 0.05, 'KPI garantía Korex'),
  embudo1_pct_registro:      t('Embudo 1', 'mayor', 0.20, 0.20, 0.10, 'Conversión de landing'),
  embudo1_pct_vsl:           t('Embudo 1', 'mayor', 0.40, 0.20, 0.10, 'Engagement del VSL'),
  embudo1_pct_quiz:          t('Embudo 1', 'mayor', 0.70, 0.50, 0.30, 'Calidad del quiz'),
  embudo1_pct_cierres:       t('Embudo 1', 'mayor', 0.05, 0.02, 0.01, 'Tasa de cierre del embudo'),
  embudo1_roi:               t('Embudo 1', 'mayor', 2.00, 1.00, 0.00, 'Rentabilidad del embudo'),
  embudo2_pct_interesados:   t('Embudo 2', 'mayor', 0.20, 0.10, 0.05, 'KPI garantía Korex'),
  embudo2_pct_calificados:   t('Embudo 2', 'mayor', 0.15, 0.10, 0.05, 'KPI garantía Korex'),
  embudo2_pct_registro:      t('Embudo 2', 'mayor', 0.08, 0.03, 0.01, 'Conversión de landing'),
  embudo2_pct_vsl:           t('Embudo 2', 'mayor', 0.40, 0.20, 0.10, 'Engagement del VSL'),
  embudo2_pct_quiz:          t('Embudo 2', 'mayor', 0.70, 0.50, 0.30, 'Calidad del quiz'),
  embudo2_pct_cierres:       t('Embudo 2', 'mayor', 0.05, 0.02, 0.01, 'Tasa de cierre del embudo'),
  embudo2_roi:               t('Embudo 2', 'mayor', 2.00, 1.00, 0.00, 'Rentabilidad del embudo'),
};

// Bloques disponibles para el editor de Config (orden de aparicion).
export const CONFIG_BLOQUES = ['General', 'Finanzas', 'Saldos', 'Leads', 'Networkers', 'Cualitativo', 'Embudo 1', 'Embudo 2'];
