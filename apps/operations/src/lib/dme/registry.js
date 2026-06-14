// Definicion CENTRAL del DME (panel de metricas por cliente).
// Un solo lugar para tocar si cambia/agrega una metrica: el resto del sistema
// (tabla, modal de carga, agregacion semanal/mensual, semaforo, Maestro) lee de aca.
//
//  - SECTIONS: bloques y metricas en el orden de la planilla canonica (Diario).
//  - metric: { key, label, section, type, kind, agg, help }
//      type: 'input'   -> se carga a mano y se guarda en dme_daily.metrics
//            'derived' -> se calcula en derive.js, NUNCA se guarda
//      kind: 'int'|'money'|'pct'|'cpl'|'roi'|'num'  (formato)
//      agg:  'sum'(default) | 'last'(snapshot: se toma el ultimo dia del periodo)
//      help: nota corta que se ve al pasar el mouse sobre la metrica (formula).
//  - DEFAULT_DME_CONFIG: semilla de umbrales del semaforo (pestana Config).

const SNAP_HELP = 'Foto del día: en semanal/mensual se toma el último día cargado del período (no se suma ni promedia).';

const GENERAL = {
  id: 'general', title: 'General — Negocio Korex', adminOnly: true,
  metrics: [
    { key: 'usuarios_activos_con_pub', label: 'Usuarios activos con publicidad', type: 'input',   kind: 'int', agg: 'last', help: SNAP_HELP },
    { key: 'usuarios_activos_sin_pub', label: 'Usuarios activos sin publicidad', type: 'input',   kind: 'int', agg: 'last', help: SNAP_HELP },
    { key: 'nuevos_usuarios',          label: 'Nuevos usuarios',                  type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'usuarios_total',           label: 'TOTAL de usuarios',                type: 'derived', kind: 'int', help: 'Usuarios activos con publicidad + sin publicidad.' },
    { key: 'pct_activos_con_pub',      label: '% de usuarios activos con publicidad', type: 'derived', kind: 'pct', help: 'Activos con publicidad ÷ TOTAL de usuarios.' },
    { key: 'pct_activos_sin_pub',      label: '% de usuarios activos sin publicidad', type: 'derived', kind: 'pct', help: 'Activos sin publicidad ÷ TOTAL de usuarios.' },
    { key: 'usuarios_baja',            label: 'Usuarios que se dieron de baja',   type: 'input',   kind: 'int', agg: 'sum', hidden: true },
    { key: 'pct_bajas',                label: '% de bajas',                       type: 'derived', kind: 'pct', hidden: true, help: 'Usuarios que se dieron de baja ÷ TOTAL de usuarios.' },
  ],
};

const FINANZAS = {
  id: 'finanzas', title: 'Finanzas', adminOnly: true,
  metrics: [
    { key: 'facturacion_setups',   label: 'Facturación SETUPS',            type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'comisiones_setups',    label: 'Comisiones SETUPS',             type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'cashcollect_setups',   label: 'CashCollect SETUPs',            type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'pct_comisiones_setups',label: '% en comisiones de SETUPS',     type: 'derived', kind: 'pct', help: 'Comisiones SETUPS ÷ Facturación SETUPS.' },
    { key: 'cargas_nuevas_pub',    label: 'Cargas en publicidad',          type: 'input',   kind: 'int', agg: 'sum', help: 'Cargas únicas: primera vez que ese usuario carga publicidad (cantidad).' },
    { key: 'recargas_pub',         label: 'Recargas en publicidad',        type: 'input',   kind: 'int', agg: 'sum', help: 'Volvieron a cargar publicidad ese día (cantidad).' },
    { key: 'cargas_totales_pub',   label: 'Cargas en publicidad totales',  type: 'derived', kind: 'int', help: 'Cargas en publicidad + Recargas en publicidad.' },
    { key: 'invertido_pub',        label: 'Invertido por los usuarios en publicidad', type: 'input', kind: 'money', agg: 'sum' },
    { key: 'comisiones_pub',       label: 'Comisiones publicidad',         type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'cashcollect_pub',      label: 'CashCollect Publicidad',        type: 'input',   kind: 'money', agg: 'sum' },
    { key: 'pct_comisiones_pub',   label: '% en comisiones de publicidad', type: 'derived', kind: 'pct', help: 'Comisiones publicidad ÷ Invertido por los usuarios en publicidad.' },
    { key: 'pct_renovaciones',     label: '% Renovaciones',                type: 'derived', kind: 'pct', help: 'Recargas en publicidad ÷ Usuarios activos con publicidad.' },
    { key: 'avg_inversion_usuario',label: 'AVG inversión en publicidad',   type: 'derived', kind: 'money', help: 'Invertido en publicidad ÷ Cargas en publicidad totales.' },
  ],
};

const SALDOS = {
  id: 'saldos', title: 'Saldos y Runway',
  metrics: [
    { key: 'saldo_final',                 label: 'Saldo disponible final del día',            type: 'input',   kind: 'money', agg: 'last', help: SNAP_HELP },
    { key: 'saldo_con_invertido',         label: 'Saldo disponible con lo invertido del día', type: 'input',   kind: 'money', agg: 'last', help: SNAP_HELP },
    { key: 'total_gastado_acumulado',     label: 'Total Gasto en Meta Ads',                   type: 'input',   kind: 'money', agg: 'sum', help: 'Gasto en Meta Ads del día; en semanal/mensual se suma.' },
    { key: 'pct_queda_saldo',             label: '% que me queda del saldo disponible',       type: 'derived', kind: 'pct', help: 'Saldo disponible ÷ (saldo disponible + total gastado acumulado).' },
    { key: 'pct_queda_saldo_invertido',   label: '% que me queda del saldo con lo invertido hoy', type: 'derived', kind: 'pct', help: 'Saldo con lo invertido ÷ (saldo con lo invertido + total gastado acumulado).' },
    { key: 'dias_proyectados',            label: 'Días proyectados con publicidad activa',    type: 'derived', kind: 'num', help: 'Saldo con lo invertido ÷ inversión diaria promedio del período.' },
  ],
};

const LEADS = {
  id: 'leads', title: 'Leads — Visión agregada',
  metrics: [
    { key: 'leads_obtenidos',     label: 'Leads Obtenidos (Meta)',  type: 'input',   kind: 'int',   agg: 'sum' },
    { key: 'leads_obtenidos_crm', label: 'Leads Obtenidos (CRM)',   type: 'input',   kind: 'int',   agg: 'sum' },
    { key: 'leads_diferencia',    label: 'Leads Obtenidos (Diferencia)', type: 'derived', kind: 'int', help: 'Leads Obtenidos (Meta) − Leads Obtenidos (CRM).' },
    { key: 'cpl',                 label: 'Costo por lead (CPL)',    type: 'derived', kind: 'cpl', help: 'Inversión total de los embudos ÷ Leads obtenidos (Meta).' },
    { key: 'leads_por_networker', label: 'Leads promedio por networker', type: 'derived', kind: 'num', help: 'Leads obtenidos ÷ Networkers que recibieron leads.' },
    { key: 'cpl_mas_alto',        label: 'Costo por lead más alto', type: 'input',   kind: 'money', agg: 'last', help: SNAP_HELP },
    { key: 'cpl_mas_bajo',        label: 'Costo por lead más bajo', type: 'input',   kind: 'money', agg: 'last', help: SNAP_HELP },
    { key: 'dispersion_cpl',      label: 'Dispersión de CPL',       type: 'derived', kind: 'pct', help: '(CPL más alto − CPL más bajo) ÷ CPL más bajo.' },
  ],
};

const NETWORKERS = {
  id: 'networkers', title: 'Networkers — Avance del grupo',
  metrics: [
    { key: 'networkers_recibieron',     label: 'Networkers que recibieron leads',                type: 'input',   kind: 'int', agg: 'last', help: SNAP_HELP },
    { key: 'networkers_sin_leads',      label: 'Networkers sin leads (que deberían haber recibido)', type: 'input', kind: 'int', agg: 'last', help: SNAP_HELP },
    { key: 'pct_recibiendo_prospectos', label: '% que están recibiendo prospectos',              type: 'derived', kind: 'pct', help: 'Networkers que recibieron leads ÷ (recibieron + sin leads).' },
    { key: 'networkers_cerraron',       label: 'Networkers que cerraron',                        type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'networkers_primer_cierre',  label: 'Networkers con primer cierre',                   type: 'input',   kind: 'int', agg: 'sum' },
  ],
};

const CUALITATIVO = {
  id: 'cualitativo', title: 'Cualitativo — Señales tempranas',
  metrics: [
    { key: 'nuevos_testimonios',  label: 'Nuevos testimonios',          type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'nuevos_referidos',    label: 'Nuevos referidos',            type: 'input',   kind: 'int', agg: 'sum' },
    { key: 'tasa_testimonios',    label: 'Tasa de testimonios',         type: 'derived', kind: 'pct', help: 'Nuevos testimonios ÷ Nuevos usuarios.' },
    { key: 'pct_referidos',       label: '% de referidos',              type: 'derived', kind: 'pct', help: 'Nuevos referidos ÷ Nuevos usuarios.' },
    { key: 'problemas_tecnicos',  label: 'Problemas técnicos reportados', type: 'input', kind: 'int', agg: 'sum' },
    { key: 'quejas',              label: 'Quejas o feedback negativo',  type: 'input',   kind: 'int', agg: 'sum' },
  ],
};

// ── Embudos (mismo esquema para Embudo 1 y Embudo 2) ─────────────────────────
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
  { suffix: 'facturado',         label: 'Total facturado clientes', kind: 'money', agg: 'sum', hidden: true },
];

// Help de los derivados del embudo (formula por sufijo).
const FUNNEL_DERIVED_HELP = {
  pct_inversion:    '% de la inversión total de ambos embudos asignada a este embudo.',
  cpl:              'Total gastado del embudo ÷ Total de leads del embudo.',
  pct_curiosos:     'Leads curiosos ÷ Total de leads.',
  costo_curioso:    'Total gastado ÷ Leads curiosos.',
  pct_interesados:  'Leads interesados ÷ Total de leads.',
  costo_interesado: 'Total gastado ÷ Leads interesados.',
  pct_calificados:  'Leads calificados ÷ Total de leads.',
  costo_calificado: 'Total gastado ÷ Leads calificados.',
  pct_registro:     'Leads registrados ÷ Visitas en la landing.',
  pct_vsl:          'Miran el VSL completo ÷ Leads registrados.',
  pct_quiz:           'Quiz terminado ÷ Quiz iniciado.',
  pct_whatsapp:       'WhatsApp enviado ÷ Quiz terminado. Mide el éxito de la thank you page.',
  pct_whatsapp_leads: 'WhatsApp enviado ÷ Total de leads del embudo. Mide la salud general del embudo.',
  pct_cierres:      'Cierres ÷ Leads registrados.',
  roi:              '(Total facturado − Total gastado) ÷ Total gastado.',
};

function funnelSection(prefix, title) {
  const k = (s) => `${prefix}_${s}`;
  const inp = Object.fromEntries(
    FUNNEL_INPUTS.map((f) => [f.suffix, { key: k(f.suffix), label: f.label, type: 'input', kind: f.kind, agg: f.agg, hidden: f.hidden }])
  );
  const der = (suffix, label, kind, hidden) => ({ key: k(suffix), label, type: 'derived', kind, hidden, help: FUNNEL_DERIVED_HELP[suffix] });
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
    der('pct_whatsapp', '% WhatsApp enviado (sobre quiz)', 'pct'),
    der('pct_whatsapp_leads', '% WhatsApp enviado (sobre leads)', 'pct'),
    inp.cierres,
    der('pct_cierres', '% de cierres', 'pct'),
    inp.facturado,
    der('roi', 'ROI', 'roi', true),
  ];
  return { id: prefix, title, metrics };
}

export const EMBUDO1 = funnelSection('embudo1', 'Embudo 1');
export const EMBUDO2 = funnelSection('embudo2', 'Embudo 2');

export const SECTIONS = [GENERAL, FINANZAS, SALDOS, LEADS, NETWORKERS, CUALITATIVO, EMBUDO1, EMBUDO2]
  .map((s) => ({ ...s, metrics: s.metrics.map((m) => ({ ...m, section: s.id })) }));

export const ALL_METRICS   = SECTIONS.flatMap((s) => s.metrics);
export const METRIC_BY_KEY = Object.fromEntries(ALL_METRICS.map((m) => [m.key, m]));
export const INPUT_METRICS = ALL_METRICS.filter((m) => m.type === 'input');
export const INPUT_KEYS    = INPUT_METRICS.map((m) => m.key);
export const SNAPSHOT_KEYS = INPUT_METRICS.filter((m) => m.agg === 'last').map((m) => m.key);
export const EMPTY_ROW     = Object.fromEntries(INPUT_KEYS.map((k) => [k, 0]));

export const INPUT_GROUPS = SECTIONS
  .map((s) => ({ title: s.title, adminOnly: !!s.adminOnly, fields: s.metrics.filter((m) => m.type === 'input' && !m.hidden) }))
  .filter((g) => g.fields.length > 0);

// metricas que solo ven los admins (bloques General y Finanzas).
export const ADMIN_ONLY_KEYS = new Set(
  SECTIONS.filter((s) => s.adminOnly).flatMap((s) => s.metrics.map((m) => m.key))
);

// ── Semilla del semaforo (pestana Config de la planilla canonica) ────────────
const t = (bloque, direction, verde, amarillo, critico, notas, activo = true) =>
  ({ bloque, direction, verde, amarillo, critico, notas, activo });

export const DEFAULT_DME_CONFIG = {
  pct_activos_con_pub:       t('General', 'mayor', 0.70, 0.50, 0.0, 'Abajo de 50% rojo, 50-70% amarillo, 70%+ verde'),
  pct_bajas:                 t('General', 'menor', 0.03, 0.06, 0.10, 'Cuánto se está yendo del sistema'),
  pct_comisiones_setups:     t('Finanzas', 'menor', 0.40, 0.60, 0.75, 'Costo de la venta inicial'),
  pct_comisiones_pub:        t('Finanzas', 'menor', 0.10, 0.20, 0.30, 'Costo de la venta recurrente'),
  pct_renovaciones:          t('Finanzas', 'mayor', 0.80, 0.60, 0.40, 'Satisfacción real con el producto'),
  dias_proyectados:          t('Saldos', 'mayor', 15, 7, 3, 'Cuánto aguanta el saldo'),
  dispersion_cpl:            t('Leads', 'menor', 0.40, 0.80, 1.50, 'Qué tan desigual es el reparto'),
  leads_diferencia:          t('Leads', 'menor', 0, 0, 0, 'Debe ser 0 (Meta = CRM); si es mayor a 0, rojo'),
  pct_recibiendo_prospectos: t('Networkers', 'mayor', 0.90, 0.70, 0.50, 'Salud del reparto'),
  tasa_testimonios:          t('Cualitativo', 'mayor', 0.30, 0.10, 0.05, 'Captura de prueba social'),
  pct_referidos:             t('Cualitativo', 'mayor', 0.20, 0.10, 0.05, 'Boca a boca y satisfacción'),
  embudo1_pct_interesados:   t('Embudo 1', 'mayor', 0.20, 0.10, 0.05, 'KPI garantía Korex'),
  embudo1_pct_calificados:   t('Embudo 1', 'mayor', 0.15, 0.10, 0.05, 'KPI garantía Korex'),
  embudo1_pct_registro:      t('Embudo 1', 'mayor', 0.20, 0.20, 0.10, 'Conversión de landing'),
  embudo1_pct_vsl:           t('Embudo 1', 'mayor', 0.40, 0.20, 0.10, 'Engagement del VSL'),
  embudo1_pct_quiz:           t('Embudo 1', 'mayor', 0.70, 0.50, 0.30, 'Calidad del quiz'),
  embudo1_pct_whatsapp:       t('Embudo 1', 'mayor', 0.70, 0.50, 0.30, '% WhatsApp sobre quiz terminado (éxito de la thank you page)'),
  embudo1_pct_whatsapp_leads: t('Embudo 1', 'mayor', 0.20, 0.10, 0.05, '% WhatsApp sobre leads (salud general del embudo)'),
  embudo1_pct_cierres:       t('Embudo 1', 'mayor', 0.05, 0.02, 0.01, 'Tasa de cierre del embudo'),
  embudo1_roi:               t('Embudo 1', 'mayor', 2.00, 1.00, 0.00, 'Rentabilidad del embudo'),
  embudo2_pct_interesados:   t('Embudo 2', 'mayor', 0.20, 0.10, 0.05, 'KPI garantía Korex'),
  embudo2_pct_calificados:   t('Embudo 2', 'mayor', 0.15, 0.10, 0.05, 'KPI garantía Korex'),
  embudo2_pct_registro:      t('Embudo 2', 'mayor', 0.08, 0.03, 0.01, 'Conversión de landing'),
  embudo2_pct_vsl:           t('Embudo 2', 'mayor', 0.40, 0.20, 0.10, 'Engagement del VSL'),
  embudo2_pct_quiz:           t('Embudo 2', 'mayor', 0.70, 0.50, 0.30, 'Calidad del quiz'),
  embudo2_pct_whatsapp:       t('Embudo 2', 'mayor', 0.70, 0.50, 0.30, '% WhatsApp sobre quiz terminado (éxito de la thank you page)'),
  embudo2_pct_whatsapp_leads: t('Embudo 2', 'mayor', 0.20, 0.10, 0.05, '% WhatsApp sobre leads (salud general del embudo)'),
  embudo2_pct_cierres:       t('Embudo 2', 'mayor', 0.05, 0.02, 0.01, 'Tasa de cierre del embudo'),
  embudo2_roi:               t('Embudo 2', 'mayor', 2.00, 1.00, 0.00, 'Rentabilidad del embudo'),
};

export const CONFIG_BLOQUES = ['General', 'Finanzas', 'Saldos', 'Leads', 'Networkers', 'Cualitativo', 'Embudo 1', 'Embudo 2'];
