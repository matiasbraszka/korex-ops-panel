/**
 * Korex — Alta automática de un cliente nuevo en la planilla "MKA - Finanzas y Costos".
 *
 * La llama la Edge Function `crear-venta` al completarse el formulario de venta.
 * En una sola llamada (action: "alta_cliente") escribe, SIN TOCAR las fórmulas:
 *   1. "Base de datos"            → datos del cliente (Tipo = "Cliente").
 *   2. "Acuerdos" bloque DERECHO  → nombre + % de comisiones (incluye Marketing por defecto).
 *   3. "Acuerdos" bloque IZQUIERDO (Personas implicadas) → Marketing por defecto (Jose Martin)
 *      y el Conector (si lo hay). Necesario para que la comisión de Marketing de Ingresos
 *      valide la fecha de inicio (FILTER por Nombre/Cliente/Categoria).
 *   4. "Ingresos"                 → la venta como SETUP por el CashCollect cobrado.
 *
 * El modelo está acoplado: en Ingresos M (Usuario) = nombre del cliente, y ese mismo
 * nombre debe existir en Base de datos (B/E) y en Acuerdos (K) para que los VLOOKUP y
 * SUMIFS de Ingresos / Seguimiento de Pagos resuelvan.
 *
 * IMPORTANTE — convivencia en el mismo proyecto:
 * Todos los identificadores globales llevan prefijo KXF_ / kxf para coexistir en el MISMO
 * proyecto Apps Script que el script de LECTURA de finanzas (que usa doGet) sin chocar.
 * El único global "normal" es doPost.
 *
 * Corre como la cuenta de Google que la despliega — esa cuenta DEBE tener acceso de
 * EDICIÓN al spreadsheet de finanzas.
 *
 * --- ACTUALIZAR (misma URL) ---
 * Implementar → Administrar implementaciones → ✏️ editar → Versión "Nueva versión" → Implementar.
 */

const KXF_SECRET         = 'korex-finanzas-2026';
const KXF_SPREADSHEET_ID = '1KoTVRO-03V3cvQBKF6d51EDlAbzdroIZ8sa4F5tZUIw'; // MKA - Finanzas y Costos

const KXF_SHEET_BASE_DATOS = 'Base de datos';
const KXF_SHEET_ACUERDOS   = 'Acuerdos';
const KXF_SHEET_INGRESOS   = 'Ingresos';

const KXF_DATE_FMT = 'dd/MM/yyyy';

// Defaults si la Edge Function no manda los valores (configurables desde admin del panel).
const KXF_DEF_FX_RATE        = 1.08;   // EUR -> USD
const KXF_DEF_STRIPE_FEE_PCT = 4.5;    // % que cobra Stripe
const KXF_DEF_MKT_PERSON     = 'Jose Martin';
const KXF_DEF_CRM_MKT_PCT    = 5;      // % CRM Marketing
const KXF_DEF_PUBLI_MKT_PCT  = 1;      // % Publicidad Marketing

// Columnas con FÓRMULA en Ingresos: jamás se escriben (se autocalculan).
const KXF_FORMULA_COLS = [1, 6, 14, 15, 16, 20, 22, 23, 24, 25, 26, 27, 29]; // A,F,N,O,P,T,V,W,X,Y,Z,AA,AC

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000); // serializa para que dos altas no peleen por la misma fila
  } catch (err) {
    return kxfJson({ ok: false, error: 'busy' });
  }
  try {
    var b = JSON.parse(e.postData.contents);
    if (b.secret !== KXF_SECRET) return kxfJson({ ok: false, error: 'unauthorized' });
    if (String(b.action || '') !== 'alta_cliente') return kxfJson({ ok: false, error: 'unknown_action' });

    var cliente = String(b.cliente || '').trim();
    if (!cliente) return kxfJson({ ok: false, error: 'missing_cliente' });

    var ss = SpreadsheetApp.openById(KXF_SPREADSHEET_ID);
    var fecha = kxfParseFecha(b.fecha); // Date o ''

    var rowBase     = kxfAltaBaseDatos(ss, b, cliente, fecha);
    var rowAcuerdos = kxfAltaAcuerdos(ss, b, cliente, fecha);
    var rowsPersonas = kxfAltaPersonasImplicadas(ss, b, cliente, fecha);
    var rowIngresos = kxfAltaIngresos(ss, b, cliente, fecha);

    return kxfJson({
      ok: true,
      rows: { baseDatos: rowBase, acuerdos: rowAcuerdos, personas: rowsPersonas, ingresos: rowIngresos },
    });
  } catch (err) {
    return kxfJson({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// --- Base de datos: 1 fila, Tipo = "Cliente". No toca O/P (array QUERY). ---
function kxfAltaBaseDatos(ss, b, cliente, fecha) {
  var sh = ss.getSheetByName(KXF_SHEET_BASE_DATOS);
  var row = kxfLastRowInCol(sh, 2) + 1; // por col B (Nombre)
  if (row < 2) row = 2;
  kxfSetCells(sh, row, {
    2: cliente,                        // B Nombre
    3: 'Cliente',                      // C Tipo
    5: cliente,                        // E Cliente
    6: kxfStr(b.conector),             // F Conector
    7: kxfStr(b.email),                // G E-mail
    8: kxfStr(b.telefono),             // H Telefono
    9: kxfStr(b.billingAddress),       // I Dirección de facturación (del contrato)
    10: kxfStr(b.fiscalId),            // J Identificador fiscal / DNI (del contrato)
    11: kxfStr(b.facturarA),           // K Facturar a: "Empresa" / "personas"
    12: kxfStr(b.company)              // L Empresa (nombre, solo si se factura a empresa)
  });
  kxfSetDate(sh, row, 1, fecha);       // A Fecha de Ingreso (dd/MM/yyyy)
  return row;
}

// --- Acuerdos: bloque DERECHO (J..AA). Nombre directo como VALOR en K.
//     Marketing por defecto (nombre + % CRM/Publicidad), configurable. ---
function kxfAltaAcuerdos(ss, b, cliente, fecha) {
  var sh = ss.getSheetByName(KXF_SHEET_ACUERDOS);
  var row = Math.max(kxfLastRowInCol(sh, 10), kxfLastRowInCol(sh, 11)) + 1; // col J (10) / K (11)
  if (row < 4) row = 4; // los datos del bloque arrancan en la fila 4
  var c = b.commissions || {};
  var mktPerson = kxfStr(b.marketingPerson) || KXF_DEF_MKT_PERSON;
  var crmMktPct = kxfNumOrNull(b.crmMarketingPct); if (crmMktPct === null) crmMktPct = KXF_DEF_CRM_MKT_PCT;
  var publiMktPct = kxfNumOrNull(b.publicidadMarketingPct); if (publiMktPct === null) publiMktPct = KXF_DEF_PUBLI_MKT_PCT;

  kxfSetCells(sh, row, {
    11: cliente,                          // K Cliente (valor, no fórmula)
    12: kxfNumOrBlank(b.billingAmount),   // L Valor del servicio
    13: kxfStr(b.conector),               // M Conector
    15: mktPerson,                        // O Marketing (Jose Martin por defecto)
    16: kxfNumOrBlank(c.setup_conector),  // P SETUP Conector %
    17: kxfNumOrBlank(c.crm_conector),    // Q CRM Conector %
    18: kxfNumOrBlank(c.crm_cliente),     // R CRM Cliente %
    19: kxfNumOrBlank(c.crm_afiliados),   // S CRM Afiliados %
    22: crmMktPct,                        // V CRM Marketing % (default 5)
    25: publiMktPct,                      // Y Publicidad Marketing % (default 1)
    27: kxfNumOrBlank(c.publicidad_conector) // AA Publicidad Conector %
  });
  kxfSetDate(sh, row, 10, fecha);         // J Fecha acuerdo
  // N Consultor, T/U/W/X/Z y AB/AC quedan vacías.
  return row;
}

// --- Acuerdos: bloque IZQUIERDO "Personas implicadas" (B..H).
//     Siempre el Marketing por defecto; el Conector solo si el cliente tiene. ---
function kxfAltaPersonasImplicadas(ss, b, cliente, fecha) {
  var sh = ss.getSheetByName(KXF_SHEET_ACUERDOS);
  var written = [];
  var mktPerson = kxfStr(b.marketingPerson) || KXF_DEF_MKT_PERSON;
  var conector = kxfStr(b.conector);

  // Marketing por defecto (Jose Martin | Marketing | <cliente>).
  if (mktPerson) {
    var r1 = Math.max(kxfLastRowInCol(sh, 3), 3) + 1; // por col C (Nombre)
    kxfSetCells(sh, r1, { 3: mktPerson, 4: 'Marketing', 5: cliente }); // C Nombre, D Categoria, E Cliente
    kxfSetDate(sh, r1, 2, fecha);                                       // B Fecha de comienzo
    written.push(r1);
  }
  // Conector (si lo hay): <conector> | Conector | <cliente>.
  if (conector) {
    var r2 = Math.max(kxfLastRowInCol(sh, 3), 3) + 1;
    kxfSetCells(sh, r2, { 3: conector, 4: 'Conector', 5: cliente });
    kxfSetDate(sh, r2, 2, fecha);
    written.push(r2);
  }
  return written;
}

// --- Ingresos: SETUP por el CashCollect. EUR y USD SIEMPRE llenos. E = neto USD
//     (menos 4,5% de Stripe si pagó por Stripe). F nunca se toca (es fórmula). ---
function kxfAltaIngresos(ss, b, cliente, fecha) {
  var sh = ss.getSheetByName(KXF_SHEET_INGRESOS);
  var row = Math.max(kxfLastRowInCol(sh, 2), kxfLastRowInCol(sh, 13)) + 1; // col B (Fecha) / col M (Usuario)
  if (row < 3) row = 3;

  // Defensa: si la fila destino no tiene las fórmulas arrastradas, copiarlas de la anterior.
  if (!sh.getRange(row, 6).getFormula()) { // F = Ingreso real
    kxfExtenderFormulas(sh, row);
  }

  var billing = kxfNumOrNull(b.billingAmount);
  var cash    = kxfNumOrNull(b.cashCollect);
  var monto   = (cash != null ? cash : billing); // CashCollect cobrado
  var estado  = (billing == null || (cash != null && cash >= billing)) ? 'Depositado' : 'Parcial';

  // Tasa y fee configurables (con fallback).
  var fxRate = kxfNumOrNull(b.fxRate); if (fxRate === null || fxRate <= 0) fxRate = KXF_DEF_FX_RATE;
  var feePct = kxfNumOrNull(b.stripeFeePct); if (feePct === null) feePct = KXF_DEF_STRIPE_FEE_PCT;
  var cur = String(b.currency || 'USD').toUpperCase();
  var isStripe = String(b.paymentMethod || '').toLowerCase() === 'stripe';

  // EUR y USD SIEMPRE: convierte según la moneda de la venta.
  var montoEUR = null, montoUSD = null;
  if (monto != null) {
    if (cur === 'EUR') { montoEUR = monto; montoUSD = monto * fxRate; }
    else               { montoUSD = monto; montoEUR = monto / fxRate; }
  }
  // E = neto en USD (Stripe descuenta su fee; otro medio = USD total).
  var montoNeto = montoUSD;
  if (montoUSD != null && isStripe) montoNeto = montoUSD * (1 - feePct / 100);

  var cells = {
    3: kxfRound2(montoEUR),            // C Monto EUR
    4: kxfRound2(montoUSD),            // D MontoUSD
    5: kxfRound2(montoNeto),           // E Monto luego de fees (USD) — F se autocalcula, no se toca
    7: kxfMetodoPagoG(b.paymentMethod),// G Método de pago (mapeado desde el form)
    8: 'SETUP',                        // H Tipo
    // I (col 9): se deja vacía a propósito.
    10: estado,                        // J Estado (Depositado/Parcial)
    11: kxfStr(b.setter),              // K Setter
    12: kxfStr(b.closer),              // L Closer
    13: cliente                        // M Usuario (= nombre del cliente)
    // Q a V (17-22): NO se tocan (las maneja finanzas / tienen fórmula).
  };
  kxfSetCellsExcept(sh, row, cells, KXF_FORMULA_COLS);
  kxfSetDate(sh, row, 2, fecha);       // B Fecha (dd/MM/yyyy)
  return row;
}

// ---------- helpers ----------

// Mapea el método de pago del formulario al texto exacto de la columna G de Ingresos.
// Stripe -> "Stripe (Tarjeta) - Empresa", Transferencia -> "Mercury (Transferencia) - Empresa",
// USDT -> "USDT - Empresa". Cualquier otro queda vacío.
function kxfMetodoPagoG(pm) {
  switch (String(pm || '').toLowerCase()) {
    case 'stripe':        return 'Stripe (Tarjeta) - Empresa';
    case 'transferencia': return 'Mercury (Transferencia) - Empresa';
    case 'usdt':          return 'USDT - Empresa';
    default:              return '';
  }
}

// Última fila con contenido en una columna (1-indexed). 0 si vacía.
function kxfLastRowInCol(sh, colIndex) {
  var n = sh.getLastRow();
  if (n < 1) return 0;
  var vals = sh.getRange(1, colIndex, n, 1).getValues();
  for (var i = vals.length - 1; i >= 0; i--) {
    var v = vals[i][0];
    if (v !== '' && v !== null) return i + 1;
  }
  return 0;
}

// Copia las fórmulas de la fila (row-1) a `row` SOLO para columnas de fórmula de Ingresos.
function kxfExtenderFormulas(sh, row) {
  if (row <= 3) return;
  for (var k = 0; k < KXF_FORMULA_COLS.length; k++) {
    var col = KXF_FORMULA_COLS[k];
    var src = sh.getRange(row - 1, col);
    if (src.getFormula()) {
      src.copyTo(sh.getRange(row, col), SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
  }
}

// Escribe {colIndex: value} en una fila (omite vacíos).
function kxfSetCells(sh, row, map) {
  for (var col in map) {
    if (!map.hasOwnProperty(col)) continue;
    var v = map[col];
    if (v === '' || v === null || v === undefined) continue;
    sh.getRange(row, parseInt(col, 10)).setValue(v);
  }
}

// Igual pero NUNCA escribe en columnas vetadas (fórmulas).
function kxfSetCellsExcept(sh, row, map, forbiddenCols) {
  var forbidden = {};
  for (var i = 0; i < forbiddenCols.length; i++) forbidden[forbiddenCols[i]] = true;
  for (var col in map) {
    if (!map.hasOwnProperty(col)) continue;
    var ci = parseInt(col, 10);
    if (forbidden[ci]) continue;
    var v = map[col];
    if (v === '' || v === null || v === undefined) continue;
    sh.getRange(row, ci).setValue(v);
  }
}

// Escribe una fecha (Date) con formato dd/MM/yyyy. Si no es fecha válida, no hace nada.
function kxfSetDate(sh, row, col, dateVal) {
  if (!(dateVal instanceof Date)) return;
  var cell = sh.getRange(row, col);
  cell.setValue(dateVal);
  cell.setNumberFormat(KXF_DATE_FMT);
}

// "YYYY-MM-DD" → Date (mediodía local para evitar corrimientos de zona). '' si inválida.
function kxfParseFecha(s) {
  var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
  if (!m) return '';
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), 12, 0, 0);
}

function kxfStr(v) { return v === null || v === undefined ? '' : String(v).trim(); }

function kxfNumOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

// Número para celda, o '' si no es número.
function kxfNumOrBlank(v) {
  var n = kxfNumOrNull(v);
  return n === null ? '' : n;
}

// Redondea a 2 decimales (o '' si null).
function kxfRound2(v) {
  if (v === null || v === undefined) return '';
  return Math.round(v * 100) / 100;
}

function kxfJson(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
