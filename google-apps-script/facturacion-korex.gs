/**
 * Korex — Facturación automática desde la planilla "MKA - Finanzas y Costos".
 *
 * Script CONTENEDOR (bound): pegar en Extensiones → Apps Script de ESA planilla.
 * Agrega un menú "📄 Korex Facturas → Enviar factura…" que abre un popup donde:
 *   1. Elegís el cliente (de las ventas NO facturadas de la hoja Ingresos).
 *   2. Elegís la venta concreta.
 *   3. Ves el preview (datos fiscales de Base de datos, Nº propuesto, mes/carpeta, monto).
 *   4. Das "Enviar": genera el PDF con el template de la hoja Facturas, lo guarda en la
 *      carpeta del mes en Drive, lo manda por email al cliente y marca "Facturado".
 *
 * Numeración: CONTINUA GLOBAL = (máximo Nº existente en todas las carpetas de mes) + 1.
 *   - Archivos: "<Nº sin ceros> <Cliente>.pdf"  (ej. "410 Aldazabal Clima Service.pdf")
 *   - En la factura (B11) el Nº va con ceros a 4 dígitos (ej. "0410").
 * Carpetas de mes: "<Mes en español> <Año>" (ej. "Junio 2026"); se crea si no existe.
 *
 * Corre como la cuenta Google que autoriza el script — debe poder editar la planilla,
 * la carpeta de numeración y enviar email (Gmail) como remitente de las facturas.
 */

const FAC_NUMERACION_FOLDER_ID = '1UVq5LhPr6s-6xnJ1PElXktSOKNI-pqPl'; // "Facturas | Ingresos | MK"
const FAC_SHEET_FACTURAS = 'Facturas';
const FAC_SHEET_INGRESOS = 'Ingresos';
const FAC_SHEET_BASE      = 'Base de datos';
const FAC_EXCLUIR_CARPETAS = ['Egresos']; // no entran en la numeración de salida

// Columnas de Ingresos (1-indexed)
const FAC_ING = { fecha: 2, eur: 3, usd: 4, tipo: 8, producto: 9, usuario: 13, facturado: 17 };
// Columnas de Base de datos (1-indexed)
const FAC_BD = { nombre: 2, email: 7, direccion: 9, idFiscal: 10, facturarA: 11, empresa: 12 };

const FAC_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const FAC_CONCEPTO_DEFAULT = 'ONBOARDING SISTEMA KOREX';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📄 Korex Facturas')
    .addItem('Enviar factura…', 'facAbrirDialogo')
    .addToUi();
}

function facAbrirDialogo() {
  var html = HtmlService.createHtmlOutputFromFile('facturacion-dialog')
    .setWidth(560).setHeight(620);
  SpreadsheetApp.getUi().showModalDialog(html, 'Enviar factura');
}

// ---------- Server API (llamado por el HTML con google.script.run) ----------

// Lista las ventas NO facturadas (para los dropdowns cliente → venta).
function facListarPendientes() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FAC_SHEET_INGRESOS);
  var last = sh.getLastRow();
  if (last < 3) return [];
  var rng = sh.getRange(3, 1, last - 2, FAC_ING.facturado).getValues();
  var out = [];
  for (var i = 0; i < rng.length; i++) {
    var r = rng[i];
    var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
    var fac = r[FAC_ING.facturado - 1];
    if (!usuario) continue;
    if (facEsFacturado(fac)) continue;
    var montoEur = Number(r[FAC_ING.eur - 1]) || 0;
    var montoUsd = Number(r[FAC_ING.usd - 1]) || 0;
    if (montoEur === 0 && montoUsd === 0) continue; // sin monto no se factura
    out.push({
      row: i + 3,
      usuario: usuario,
      fecha: facFechaStr(r[FAC_ING.fecha - 1]),
      producto: String(r[FAC_ING.producto - 1] || '').trim(),
      tipo: String(r[FAC_ING.tipo - 1] || '').trim(),
      montoEur: montoEur,
      montoUsd: montoUsd
    });
  }
  return out;
}

// Preview + validación para una fila concreta. No consume número.
function facPreview(row) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ing = ss.getSheetByName(FAC_SHEET_INGRESOS);
  var r = ing.getRange(row, 1, 1, FAC_ING.facturado).getValues()[0];
  var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
  if (!usuario) return { ok: false, error: 'La fila no tiene cliente (Usuario).' };
  if (facEsFacturado(r[FAC_ING.facturado - 1])) return { ok: false, error: 'Esta venta ya está facturada.' };

  var cli = facBuscarCliente(usuario);
  if (!cli) return { ok: false, error: 'No encontré "' + usuario + '" en Base de datos.' };

  var faltan = [];
  if (!cli.nombreFactura) faltan.push('Nombre/Empresa');
  if (!cli.idFiscal) faltan.push('Identificación fiscal');
  if (!cli.direccion) faltan.push('Dirección de facturación');
  if (!cli.email) faltan.push('E-mail');

  var montoEur = Number(r[FAC_ING.eur - 1]) || 0;
  var montoUsd = Number(r[FAC_ING.usd - 1]) || 0;
  var monto = montoEur || montoUsd;
  var concepto = String(r[FAC_ING.producto - 1] || '').trim() || FAC_CONCEPTO_DEFAULT;
  var hoy = new Date();
  var numero = facProximoNumero();

  return {
    ok: true,
    faltan: faltan,
    data: {
      row: row,
      cliente: usuario,
      nombreFactura: cli.nombreFactura,
      idFiscal: cli.idFiscal,
      direccion: cli.direccion,
      email: cli.email,
      concepto: concepto,
      monto: monto,
      moneda: montoEur ? 'EUR' : 'USD',
      numero: numero,
      numeroFmt: facPad4(numero),
      mesCarpeta: FAC_MESES[hoy.getMonth()] + ' ' + hoy.getFullYear(),
      fechaStr: facFechaStr(hoy)
    }
  };
}

// Genera + guarda + envía. Devuelve {ok, numero, pdfUrl} o {ok:false, error}.
function facEnviar(row) {
  var lock = LockService.getScriptLock();
  try { lock.waitLock(30000); } catch (e) { return { ok: false, error: 'Otra factura se está procesando, probá de nuevo.' }; }
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ing = ss.getSheetByName(FAC_SHEET_INGRESOS);
    var r = ing.getRange(row, 1, 1, FAC_ING.facturado).getValues()[0];
    var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
    if (!usuario) return { ok: false, error: 'La fila no tiene cliente.' };
    if (facEsFacturado(r[FAC_ING.facturado - 1])) return { ok: false, error: 'Esta venta ya está facturada.' };

    var cli = facBuscarCliente(usuario);
    if (!cli) return { ok: false, error: 'No encontré "' + usuario + '" en Base de datos.' };
    var faltan = [];
    if (!cli.nombreFactura) faltan.push('Nombre/Empresa');
    if (!cli.idFiscal) faltan.push('Identificación fiscal');
    if (!cli.direccion) faltan.push('Dirección de facturación');
    if (!cli.email) faltan.push('E-mail');
    if (faltan.length) return { ok: false, error: 'Faltan datos del cliente: ' + faltan.join(', ') + '. No se generó la factura.' };

    var montoEur = Number(r[FAC_ING.eur - 1]) || 0;
    var montoUsd = Number(r[FAC_ING.usd - 1]) || 0;
    var monto = montoEur || montoUsd;
    var concepto = String(r[FAC_ING.producto - 1] || '').trim() || FAC_CONCEPTO_DEFAULT;

    var numero = facProximoNumero();
    var hoy = new Date();
    var carpeta = facCarpetaMes(hoy);

    // 1) Rellenar el template (hoja Facturas) y exportar a PDF.
    var pdfBlob = facGenerarPdf(ss, {
      nombreFactura: cli.nombreFactura,
      idFiscal: cli.idFiscal,
      direccion: cli.direccion,
      numeroFmt: facPad4(numero),
      fecha: hoy,
      concepto: concepto,
      monto: monto
    });
    var nombreArchivo = numero + ' ' + cli.nombreFactura + '.pdf';
    pdfBlob.setName(nombreArchivo);
    var file = carpeta.createFile(pdfBlob);

    // 2) Enviar por email con el PDF adjunto.
    var asunto = 'Factura N° ' + facPad4(numero) + ' — KOREX PROJECT LLC';
    var cuerpo = 'Hola' + (cli.nombreFactura ? ' ' + cli.nombreFactura : '') + ',\n\n' +
      'Adjuntamos la factura N° ' + facPad4(numero) + ' correspondiente a ' + concepto + '.\n\n' +
      'Cualquier consulta quedamos a disposición.\n\nSaludos,\nEquipo Korex';
    MailApp.sendEmail(cli.email, asunto, cuerpo, {
      attachments: [file.getAs('application/pdf')],
      name: 'Korex'
    });

    // 3) Marcar Facturado (checkbox) + nota con Nº y link.
    var celdaFac = ing.getRange(row, FAC_ING.facturado);
    celdaFac.setValue(true);
    celdaFac.setNote('Factura N° ' + facPad4(numero) + ' enviada el ' + facFechaStr(hoy) + '\n' + file.getUrl());

    return { ok: true, numero: numero, numeroFmt: facPad4(numero), pdfUrl: file.getUrl(), email: cli.email, carpeta: carpeta.getName() };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    try { lock.releaseLock(); } catch (e2) {}
  }
}

// Diagnóstico: corré esto desde el editor (Ejecutar) para verificar que lee bien la
// numeración SIN enviar nada. Mira el Log (Ver → Registro de ejecución).
function facDiagnostico() {
  var raiz = DriveApp.getFolderById(FAC_NUMERACION_FOLDER_ID);
  Logger.log('Carpeta raíz: ' + raiz.getName());
  var subs = raiz.getFolders();
  while (subs.hasNext()) {
    var f = subs.next();
    var excl = FAC_EXCLUIR_CARPETAS.indexOf(f.getName()) !== -1 ? '  (EXCLUIDA)' : '';
    var maxF = 0, cnt = 0, files = f.getFiles();
    while (files.hasNext()) { var m = /^\s*0*(\d+)/.exec(files.next().getName()); cnt++; if (m && parseInt(m[1],10) > maxF) maxF = parseInt(m[1],10); }
    Logger.log('  - ' + f.getName() + ': ' + cnt + ' archivos, máx Nº=' + maxF + excl);
  }
  Logger.log('>>> PRÓXIMO NÚMERO GLOBAL: ' + facProximoNumero() + ' (formateado: ' + facPad4(facProximoNumero()) + ')');
}

// ---------- helpers ----------

function facEsFacturado(v) {
  if (v === true) return true;
  var s = String(v || '').trim().toUpperCase();
  return s === 'SI' || s === 'SÍ' || s === 'TRUE' || s === 'X';
}

// Busca el cliente en Base de datos por Nombre (col B). Devuelve los datos de factura.
function facBuscarCliente(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(FAC_SHEET_BASE);
  var last = sh.getLastRow();
  if (last < 2) return null;
  var vals = sh.getRange(2, 1, last - 1, FAC_BD.empresa).getValues();
  var objetivo = facNorm(nombre);
  for (var i = 0; i < vals.length; i++) {
    if (facNorm(vals[i][FAC_BD.nombre - 1]) === objetivo) {
      var empresa = String(vals[i][FAC_BD.empresa - 1] || '').trim();
      var nombreCol = String(vals[i][FAC_BD.nombre - 1] || '').trim();
      return {
        nombreFactura: empresa || nombreCol, // "Facturado a" (B8)
        idFiscal: String(vals[i][FAC_BD.idFiscal - 1] || '').trim(),
        direccion: String(vals[i][FAC_BD.direccion - 1] || '').trim(),
        email: String(vals[i][FAC_BD.email - 1] || '').trim()
      };
    }
  }
  return null;
}

// Próximo número global = (máx Nº en todas las carpetas de mes, excepto Egresos) + 1.
function facProximoNumero() {
  var raiz = DriveApp.getFolderById(FAC_NUMERACION_FOLDER_ID);
  var max = 0;
  var subs = raiz.getFolders();
  while (subs.hasNext()) {
    var f = subs.next();
    if (FAC_EXCLUIR_CARPETAS.indexOf(f.getName()) !== -1) continue;
    var files = f.getFiles();
    while (files.hasNext()) {
      var name = files.next().getName();
      var m = /^\s*0*(\d+)/.exec(name); // número al inicio, con o sin ceros
      if (m) { var n = parseInt(m[1], 10); if (n > max) max = n; }
    }
  }
  // también la raíz por si hubiera archivos sueltos
  var rootFiles = raiz.getFiles();
  while (rootFiles.hasNext()) {
    var nm = rootFiles.next().getName();
    var mm = /^\s*0*(\d+)/.exec(nm);
    if (mm) { var nn = parseInt(mm[1], 10); if (nn > max) max = nn; }
  }
  return max + 1;
}

// Carpeta del mes "<Mes> <Año>"; la crea si no existe.
function facCarpetaMes(date) {
  var nombre = FAC_MESES[date.getMonth()] + ' ' + date.getFullYear();
  var raiz = DriveApp.getFolderById(FAC_NUMERACION_FOLDER_ID);
  var it = raiz.getFoldersByName(nombre);
  if (it.hasNext()) return it.next();
  return raiz.createFolder(nombre);
}

// Rellena la hoja Facturas y exporta el rango A1:C18 a PDF.
function facGenerarPdf(ss, d) {
  var sh = ss.getSheetByName(FAC_SHEET_FACTURAS);
  sh.getRange('B8').setValue(d.nombreFactura);
  sh.getRange('B9').setValue(d.idFiscal);
  sh.getRange('B10').setValue(d.direccion);
  sh.getRange('B11').setValue(d.numeroFmt);
  sh.getRange('B12').setValue(d.fecha); sh.getRange('B12').setNumberFormat('dd/MM/yyyy');
  sh.getRange('A14').setValue(d.concepto);
  sh.getRange('B14').setValue(1);
  sh.getRange('C14').setValue(d.monto);
  SpreadsheetApp.flush();

  var gid = sh.getSheetId();
  var url = 'https://docs.google.com/spreadsheets/d/' + ss.getId() + '/export?' + [
    'format=pdf', 'gid=' + gid, 'range=A1:C18',
    'portrait=true', 'fitw=true', 'gridlines=false', 'printtitle=false',
    'sheetnames=false', 'pagenumbers=false', 'top_margin=0.5', 'bottom_margin=0.5',
    'left_margin=0.5', 'right_margin=0.5'
  ].join('&');
  var resp = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } });
  return resp.getBlob().setName('factura.pdf');
}

function facPad4(n) { var s = String(n); while (s.length < 4) s = '0' + s; return s; }

function facNorm(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function facFechaStr(v) {
  var d = (v instanceof Date) ? v : null;
  if (!d && typeof v === 'number' && v > 0) { d = new Date(Math.round((v - 25569) * 86400 * 1000)); }
  if (!d) return String(v || '');
  var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '/' + mm + '/' + d.getFullYear();
}
