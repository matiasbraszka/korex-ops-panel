// Definicion central del scorecard diario de closers.
// Un solo lugar para tocar si cambia un campo o una formula:
//  - INPUT_GROUPS: campos que se cargan a mano (agrupados para el formulario).
//  - computeRates: tasas derivadas del embudo (NO se guardan, se calculan).
//  - funnelStages: etapas para el grafico de embudo.
import { fmtMoney, fmtInt, fmtPct } from '../components/dashboard/format.js';

// Division segura: NaN si el divisor es 0 -> los fmt* lo muestran como "—".
const div = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : NaN);

// Campos que el closer carga cada dia, agrupados como aparecen en el formulario.
export const INPUT_GROUPS = [
  {
    title: 'Prospección',
    fields: [
      { key: 'seguimientos',          label: 'Seguimientos',                      kind: 'int' },
      { key: 'contactos_contactados', label: 'Contactos contactados',             kind: 'int' },
      { key: 'calendlys_enviados',    label: 'Calendlys / propuestas de llamada', kind: 'int' },
      { key: 'llamadas_agendadas',    label: 'Llamadas agendadas (LA)',           kind: 'int' },
    ],
  },
  {
    title: 'Llamadas del día',
    fields: [
      { key: 'llamadas_tuve',          label: 'Llamadas que tuve',          kind: 'int' },
      { key: 'llamadas_calificadas',   label: 'Con prospectos calificados', kind: 'int' },
      { key: 'llamadas_no_asistieron', label: 'No asistieron',              kind: 'int' },
      { key: 'ofertas',                label: 'Ofertas presentadas',        kind: 'int' },
    ],
  },
  {
    title: 'Cierre',
    fields: [
      { key: 'depositos',        label: 'Depósitos (cantidad)', kind: 'int' },
      { key: 'ventas',           label: 'Ventas cerradas',      kind: 'int' },
      { key: 'facturacion',      label: 'Facturación (USD)',    kind: 'money' },
      { key: 'new_upfront_cash', label: 'CashCollect (USD)',    kind: 'money' },
    ],
  },
];

// Lista plana de todas las keys de input.
export const INPUT_FIELDS = INPUT_GROUPS.flatMap((g) => g.fields);
export const INPUT_KEYS = INPUT_FIELDS.map((f) => f.key);

// Fila vacia (todos los inputs en 0) para inicializar formularios y agregados.
export const EMPTY_ROW = Object.fromEntries(INPUT_KEYS.map((k) => [k, 0]));

// Suma varias filas diarias en un unico objeto de totales.
export function sumRows(rows = []) {
  return rows.reduce((acc, r) => {
    INPUT_KEYS.forEach((k) => { acc[k] += Number(r[k] || 0); });
    return acc;
  }, { ...EMPTY_ROW });
}

// Tasas derivadas a partir de un objeto de totales (o una fila individual).
// Devuelve numeros crudos; el formateo (%/$) se hace al renderizar.
export function computeRates(t = EMPTY_ROW) {
  const n = (k) => Number(t[k] || 0);
  return {
    // % Agendamiento = de los contactados, cuantos agendaron llamada.
    pct_agendamiento: div(n('llamadas_agendadas'), n('contactos_contactados')),
    // % Show up = de las agendadas, cuantas se concretaron (llamadas que tuve).
    pct_show_up:      div(n('llamadas_tuve'), n('llamadas_agendadas')),
    pct_no_show:      div(n('llamadas_no_asistieron'), n('llamadas_agendadas')),
    // El embudo de calidad arranca en "llamadas que tuve".
    pct_calificacion: div(n('llamadas_calificadas'), n('llamadas_tuve')),
    pct_oferta:       div(n('ofertas'), n('llamadas_calificadas')),
    pct_cierre:       div(n('ventas'), n('ofertas')),
    // Ticket promedio facturado y cash promedio por venta.
    ticket:           div(n('facturacion'), n('ventas')),
    cash_por_venta:   div(n('new_upfront_cash'), n('ventas')),
  };
}

// Etapas del embudo (por cantidad) para StepFunnel.
export function funnelStages(t = EMPTY_ROW) {
  const n = (k) => Number(t[k] || 0);
  return [
    { name: 'Contactos',         color: '#9CA3AF', cnt: n('contactos_contactados') },
    { name: 'Agendadas',         color: '#5B7CF5', cnt: n('llamadas_agendadas') },
    { name: 'Llamadas que tuve', color: '#6366F1', cnt: n('llamadas_tuve') },
    { name: 'Calificadas',       color: '#EAB308', cnt: n('llamadas_calificadas') },
    { name: 'Ofertas',           color: '#F97316', cnt: n('ofertas') },
    { name: 'Ventas',            color: '#22C55E', cnt: n('ventas') },
  ];
}

export { fmtMoney, fmtInt, fmtPct };
