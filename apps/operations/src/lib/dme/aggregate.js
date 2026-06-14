// Agregacion del DME en el tiempo (Diario -> Semanal -> Mensual) y armado de
// columnas para la tabla. Reglas (igual que la planilla):
//   - inputs 'sum'  -> se suman
//   - inputs 'last' -> ultimo dia cargado del periodo (snapshots: saldos, usuarios
//                      activos con/sin pub, CPL mas alto/mas bajo, % renovaciones)
//   - derivados -> se recalculan sobre los totales (NUNCA se promedian)
//   - si una metrica NO tiene ningun dato en el periodo -> queda `undefined`
//     (celda en blanco), NO 0.
import { INPUT_KEYS, SNAPSHOT_KEYS } from './registry.js';
import { computeDerived } from './derive.js';

const pad = (n) => String(n).padStart(2, '0');
const MONTH_ABBR = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];

// 'YYYY-MM-DD' -> Date local (sin corrimiento de zona horaria).
function parseISO(iso) { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); }
function toISO(date) { return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`; }

export function daysInMonth(year, month) { return new Date(year, month, 0).getDate(); }
export function monthBounds(year, month) {
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
}
export function yearBounds(year) { return { from: `${year}-01-01`, to: `${year}-12-31` }; }

// Lunes de la semana de una fecha (semana lun-dom).
function mondayOf(date) {
  const off = (date.getDay() + 6) % 7;
  const m = new Date(date);
  m.setDate(date.getDate() - off);
  return m;
}

// Agrega un conjunto de filas diarias { date, metrics } a un objeto de totales +
// derivados. `rows` son las filas de UN periodo (un dia, una semana, un mes...).
// Las metricas sin ningun dato quedan `undefined` (celda en blanco), no 0.
const SNAP = new Set(SNAPSHOT_KEYS);
export function aggregateRows(rows = []) {
  const totals = {};
  const sorted = [...rows].filter(Boolean).sort((a, b) => (a.date < b.date ? -1 : 1));
  const has = (m, k) => m && m[k] != null && m[k] !== '';

  for (const k of INPUT_KEYS) {
    if (SNAP.has(k)) {
      // ultimo dia cargado del periodo (no se suma ni promedia)
      const last = [...sorted].reverse().find((r) => has(r.metrics, k));
      totals[k] = last ? Number(last.metrics[k]) : undefined;
    } else {
      // suma; si ningun dia tiene dato -> undefined (blanco)
      let s = 0, any = false;
      for (const r of sorted) if (has(r.metrics, k)) { s += Number(r.metrics[k]); any = true; }
      totals[k] = any ? s : undefined;
    }
  }
  const days = sorted.length || 1;
  const derived = computeDerived(totals, { days });
  return { totals, derived, days };
}

// Bolsa plana { metricKey: value } combinando inputs + derivados, para la tabla.
export function flattenBag(rows = []) {
  const { totals, derived } = aggregateRows(rows);
  return { ...totals, ...derived };
}

// ── Columnas por vista ───────────────────────────────────────────────────────
// Cada columna: { key, label, title, rows } -> la tabla calcula su bag con flattenBag.

// Diario: una columna por dia del mes.
export function columnsByDay(rows, year, month) {
  const byDate = {};
  for (const r of rows) (byDate[r.date] ||= []).push(r);
  const n = daysInMonth(year, month);
  const cols = [];
  for (let d = 1; d <= n; d++) {
    const iso = `${year}-${pad(month)}-${pad(d)}`;
    cols.push({ key: iso, label: pad(d), title: iso, rows: byDate[iso] || [] });
  }
  return cols;
}

// Semanal: una columna por semana (lun-dom) que toca el mes.
export function columnsByWeek(rows, year, month) {
  const n = daysInMonth(year, month);
  const order = [];
  const byWeek = {};
  for (let d = 1; d <= n; d++) {
    const date = new Date(year, month - 1, d);
    const wk = toISO(mondayOf(date));
    if (!byWeek[wk]) { byWeek[wk] = []; order.push(wk); }
  }
  const rowsByDate = {};
  for (const r of rows) (rowsByDate[r.date] ||= []).push(r);
  return order.map((wkStart) => {
    const start = parseISO(wkStart);
    const end = new Date(start); end.setDate(start.getDate() + 6);
    const wkRows = [];
    for (const r of rows) { const dt = parseISO(r.date); if (dt >= start && dt <= end) wkRows.push(r); }
    const label = `${pad(start.getDate())} ${MONTH_ABBR[start.getMonth()]}`;
    return { key: wkStart, label, title: `Semana ${toISO(start)} a ${toISO(end)}`, rows: wkRows };
  });
}

// Mensual: 12 columnas (ene..dic) del ano.
export function columnsByMonth(rows, year) {
  const byMonth = {};
  for (const r of rows) { const mo = Number(r.date.slice(5, 7)); (byMonth[mo] ||= []).push(r); }
  const cols = [];
  for (let mo = 1; mo <= 12; mo++) {
    cols.push({ key: `${year}-${pad(mo)}`, label: MONTH_ABBR[mo - 1], title: `${MONTH_ABBR[mo - 1]} ${year}`, rows: byMonth[mo] || [] });
  }
  return cols;
}
