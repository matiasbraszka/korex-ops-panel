/**
 * Korex — Exportador READ-ONLY del Sheet "MKA - Finanzas y Costos".
 * =================================================================
 * Web App INDEPENDIENTE y de SOLO LECTURA, usada para migrar las finanzas a Supabase
 * (Fase 1: leer fórmulas y datos del Sheet sin tocar nada). NO escribe en la planilla.
 * No interfiere con el alta de ventas ni con el portal "Korex Finance App" (son otros
 * proyectos / otra URL).
 *
 * --- DESPLIEGUE (una sola vez) ---
 *  1. https://script.google.com  → Nuevo proyecto  → pegar este archivo (borrar el código de ejemplo).
 *  2. Guardar.  Implementar → Nueva implementación → Tipo: "Aplicación web".
 *  3. Ejecutar como:  "Yo"  (la cuenta que VE la planilla de finanzas — la de metodokorex).
 *     Quién tiene acceso:  "Cualquier persona".
 *  4. Implementar → Autorizar acceso (aceptar el permiso de leer hojas de cálculo).
 *  5. Copiar la "URL de la aplicación web" (termina en /exec) y pasármela.
 *
 * Endpoints (GET):
 *   ?action=sheets&secret=korex-finanzas-2026
 *       → lista de hojas con filas/columnas.
 *   ?action=inspect&secret=korex-finanzas-2026
 *       → headers + FÓRMULAS de Ingresos/Acuerdos/Base de datos (la "spec" del motor).
 *   ?action=export&sheet=ingresos&secret=korex-finanzas-2026[&offset=0&limit=2000]
 *       → filas de Ingresos (valores reales: números/fechas) A..AD.
 *   ?action=export&sheet=acuerdos&secret=korex-finanzas-2026
 *       → bloque derecho (J..AA) + izquierdo (B..H) de Acuerdos.
 *   ?action=export&sheet=base&secret=korex-finanzas-2026
 *       → Base de datos (A..P).
 */

const FX_SECRET = 'korex-finanzas-2026';
const FX_SSID   = '1KoTVRO-03V3cvQBKF6d51EDlAbzdroIZ8sa4F5tZUIw'; // MKA - Finanzas y Costos

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    if (String(p.secret || '') !== FX_SECRET) return fxJson({ ok: false, error: 'unauthorized' });
    var action = String(p.action || '');
    if (action === 'sheets')   return fxJson(fxSheets());
    if (action === 'inspect')  return fxJson(fxInspect());
    if (action === 'export')   return fxJson(fxExport(String(p.sheet || ''), p));
    if (action === 'formulas') return fxJson(fxFormulas(p));
    return fxJson({ ok: false, error: 'unknown_action', hint: 'use action=sheets|inspect|export|formulas' });
  } catch (err) {
    return fxJson({ ok: false, error: String(err) });
  }
}

// Lista de hojas con dimensiones (para orientarse).
function fxSheets() {
  var ss = SpreadsheetApp.openById(FX_SSID);
  return {
    ok: true,
    sheets: ss.getSheets().map(function (s) {
      return { name: s.getName(), rows: s.getLastRow(), cols: s.getLastColumn() };
    })
  };
}

// Headers + fórmulas de la primera fila de datos (la lógica que hay que replicar).
function fxInspect() {
  var ss = SpreadsheetApp.openById(FX_SSID);
  function block(name, lastCol, dataRow, nSamples) {
    var sh = ss.getSheetByName(name);
    if (!sh) return { error: 'sheet_not_found' };
    var lc = lastCol || sh.getLastColumn();
    var out = {
      lastRow: sh.getLastRow(),
      lastColumn: sh.getLastColumn(),
      header1: sh.getRange(1, 1, 1, lc).getDisplayValues()[0],
      header2: sh.getRange(2, 1, 1, lc).getDisplayValues()[0],
      header3: sh.getRange(3, 1, 1, lc).getDisplayValues()[0],
      formulasFirstDataRow: sh.getRange(dataRow, 1, 1, lc).getFormulas()[0],
      samples: []
    };
    // algunas filas de muestra con valores visibles (para ver SETUP/CRM/Publicidad reales)
    var n = nSamples || 0;
    var maxRow = sh.getLastRow();
    for (var i = 0; i < n && (dataRow + i) <= maxRow; i++) {
      out.samples.push({
        row: dataRow + i,
        values: sh.getRange(dataRow + i, 1, 1, lc).getDisplayValues()[0],
        formulas: sh.getRange(dataRow + i, 1, 1, lc).getFormulas()[0]
      });
    }
    return out;
  }
  return {
    ok: true,
    ingresos:  block('Ingresos',      30, 3, 12),
    acuerdos:  block('Acuerdos',      30, 4, 6),
    baseDatos: block('Base de datos', 16, 2, 3)
  };
}

// Exporta valores reales (números/fechas en ISO) de una hoja.
function fxExport(sheet, p) {
  var ss = SpreadsheetApp.openById(FX_SSID);
  if (sheet === 'ingresos') {
    var sh = ss.getSheetByName('Ingresos');
    var startRow = 3;
    var offset = parseInt(p.offset || '0', 10) || 0;
    var limit  = parseInt(p.limit || '5000', 10) || 5000;
    var lastRow = sh.getLastRow();
    var first = startRow + offset;
    if (first > lastRow) return { ok: true, sheet: sheet, header: fxHeader(sh, 30), rows: [], total: lastRow - startRow + 1, offset: offset };
    var count = Math.min(limit, lastRow - first + 1);
    var vals = sh.getRange(first, 1, count, 30).getValues();
    return {
      ok: true, sheet: sheet, header: fxHeader(sh, 30),
      firstRow: first, count: count, total: lastRow - startRow + 1, offset: offset,
      rows: vals.map(function (r, i) { return { row: first + i, v: r.map(fxCell) }; })
    };
  }
  if (sheet === 'acuerdos') {
    var sh2 = ss.getSheetByName('Acuerdos');
    var lr = sh2.getLastRow();
    return {
      ok: true, sheet: sheet,
      derecho: {  // bloque de % por cliente (J..AA = col 10..27)
        startCol: 10, header2: sh2.getRange(2, 10, 1, 18).getDisplayValues()[0],
        header3: sh2.getRange(3, 10, 1, 18).getDisplayValues()[0],
        rows: sh2.getRange(4, 10, Math.max(lr - 3, 0), 18).getValues().map(function (r, i) { return { row: 4 + i, v: r.map(fxCell) }; })
      },
      izquierdo: { // personas implicadas (B..H = col 2..7)
        startCol: 2, header2: sh2.getRange(2, 2, 1, 6).getDisplayValues()[0],
        header3: sh2.getRange(3, 2, 1, 6).getDisplayValues()[0],
        rows: sh2.getRange(4, 2, Math.max(lr - 3, 0), 6).getValues().map(function (r, i) { return { row: 4 + i, v: r.map(fxCell) }; })
      }
    };
  }
  if (sheet === 'base') {
    var sh3 = ss.getSheetByName('Base de datos');
    var lr3 = sh3.getLastRow();
    return {
      ok: true, sheet: sheet, header: fxHeader(sh3, 16),
      rows: sh3.getRange(2, 1, Math.max(lr3 - 1, 0), 16).getValues().map(function (r, i) { return { row: 2 + i, v: r.map(fxCell) }; })
    };
  }
  return { ok: false, error: 'unknown_sheet', hint: 'sheet=ingresos|acuerdos|base' };
}

// Fórmulas FILA POR FILA de las columnas de cálculo de Ingresos (para detectar
// que distintas filas tienen versiones distintas de la misma fórmula).
// ?action=formulas&secret=...  → todas las filas de datos (A3..lastRow).
function fxFormulas(p) {
  var ss = SpreadsheetApp.openById(FX_SSID);
  var sh = ss.getSheetByName('Ingresos');
  var startRow = 3;
  var lastRow = sh.getLastRow();
  var n = lastRow - startRow + 1;
  if (n <= 0) return { ok: true, rows: [] };
  // columnas de cálculo (1-indexed): A,F,N,O,P,T,V,W,X,Y,Z,AA,AC
  var cols = { A: 1, F: 6, N: 14, O: 15, P: 16, T: 20, V: 22, W: 23, X: 24, Y: 25, Z: 26, AA: 27, AC: 29 };
  var all = sh.getRange(startRow, 1, n, 29).getFormulas(); // A..AC
  var out = [];
  for (var i = 0; i < all.length; i++) {
    var f = {};
    var any = false;
    for (var k in cols) {
      var val = all[i][cols[k] - 1] || '';
      f[k] = val;
      if (val) any = true;
    }
    if (any) out.push({ row: startRow + i, f: f });
  }
  return { ok: true, count: out.length, rows: out };
}

function fxHeader(sh, n) { return sh.getRange(2, 1, 1, n).getDisplayValues()[0]; }

// Serializa una celda: Date → ISO yyyy-mm-dd; resto tal cual.
function fxCell(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return v;
}

function fxJson(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
