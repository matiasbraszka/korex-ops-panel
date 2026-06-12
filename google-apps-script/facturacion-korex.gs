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

// Columnas de Ingresos (1-indexed). cuenta = col G (cuenta receptora), quienPaga = col T.
const FAC_ING = { fecha: 2, eur: 3, usd: 4, cuenta: 7, tipo: 8, producto: 9, usuario: 13, facturado: 17, quienPaga: 20 };
// Columnas de Base de datos (1-indexed)
const FAC_BD = { nombre: 2, email: 7, direccion: 9, idFiscal: 10, facturarA: 11, empresa: 12 };

const FAC_MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const FAC_CONCEPTO_DEFAULT = 'ONBOARDING SISTEMA KOREX';

// Concepto de la factura según el Tipo (col H de Ingresos).
const FAC_CONCEPTOS = {
  'SETUP': 'Implementación de sistema de marketing y tecnología para la captación de potenciales clientes',
  'CRM': 'Acceso a software y servicio de marketing para la captación de potenciales clientes',
  'PUBLICIDAD': 'Servicio de marketing y carga de saldo publicitario'
};
function facConcepto(tipo) {
  var t = String(tipo || '').trim().toUpperCase();
  return FAC_CONCEPTOS[t] || FAC_CONCEPTO_DEFAULT;
}

// Datos fijos del emisor (de la hoja Facturas) y textos legales.
const FAC_EMISOR = { nombre: 'KOREX PROJECT LLC', ein: '33-3093287', ubicacion: '102 Gold Ave 443, Albuquerque' };
const FAC_FORMA_PAGO = 'Tarjeta de crédito / débito'; // fallback

// Forma de pago según la cuenta receptora (col G de Ingresos).
function facFormaPago(cuenta) {
  var s = String(cuenta || '').toLowerCase();
  if (s.indexOf('stripe') !== -1) return 'Tarjeta de crédito/débito vía Stripe';
  if (s.indexOf('mercury') !== -1) return 'Transferencia bancaria';
  if (s.indexOf('usdt') !== -1 || s.indexOf('safepal') !== -1) return 'Wallet USDT';
  return FAC_FORMA_PAGO;
}
const FAC_NOTA_IVA = 'Operation not subject to VAT according to Article 196 of EU VAT Directive / Operación no sujeta a IVA según el artículo 196 de la Directiva IVA UE.';

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
  var rng = sh.getRange(3, 1, last - 2, FAC_ING.quienPaga).getValues();
  var anioActual = new Date().getFullYear();
  var out = [];
  for (var i = 0; i < rng.length; i++) {
    var r = rng[i];
    var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
    var fac = r[FAC_ING.facturado - 1];
    if (!usuario) continue;
    if (facEsFacturado(fac)) continue;
    // Si el pago lo recibió el Cliente (col T = "Cliente"), no lo factura Korex.
    if (String(r[FAC_ING.quienPaga - 1] || '').trim().toLowerCase() === 'cliente') continue;
    // Solo ventas de este año (para no arrastrar el histórico).
    if (facAnio(r[FAC_ING.fecha - 1]) !== anioActual) continue;
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
  var r = ing.getRange(row, 1, 1, FAC_ING.quienPaga).getValues()[0];
  var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
  if (!usuario) return { ok: false, error: 'La fila no tiene cliente (Usuario).' };
  if (facEsFacturado(r[FAC_ING.facturado - 1])) return { ok: false, error: 'Esta venta ya está facturada.' };
  if (String(r[FAC_ING.quienPaga - 1] || '').trim().toLowerCase() === 'cliente') return { ok: false, error: 'Esta venta la cobró el cliente (col T = "Cliente"), no la factura Korex.' };

  var cli = facBuscarCliente(usuario);
  if (!cli) return { ok: false, error: 'No encontré "' + usuario + '" en Base de datos.' };

  var faltan = [];
  if (!cli.nombreFactura) faltan.push(cli.esEmpresa ? 'Nombre de la empresa (Base de datos col L)' : 'Nombre del cliente');
  if (!cli.idFiscal) faltan.push('ID fiscal o DNI');
  if (!cli.direccion) faltan.push('Dirección de facturación');
  if (!cli.email) faltan.push('E-mail');

  var montoUsd = Number(r[FAC_ING.usd - 1]) || 0;
  var montoEur = Number(r[FAC_ING.eur - 1]) || 0;
  var monto = montoUsd || montoEur;   // SIEMPRE en USD (col D)
  var concepto = facConcepto(r[FAC_ING.tipo - 1]);
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
      moneda: 'USD',
      formaPago: facFormaPago(r[FAC_ING.cuenta - 1]),
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
    var r = ing.getRange(row, 1, 1, FAC_ING.quienPaga).getValues()[0];
    var usuario = String(r[FAC_ING.usuario - 1] || '').trim();
    if (!usuario) return { ok: false, error: 'La fila no tiene cliente.' };
    if (facEsFacturado(r[FAC_ING.facturado - 1])) return { ok: false, error: 'Esta venta ya está facturada.' };
    if (String(r[FAC_ING.quienPaga - 1] || '').trim().toLowerCase() === 'cliente') return { ok: false, error: 'Esta venta la cobró el cliente (col T = "Cliente"), no la factura Korex.' };

    var cli = facBuscarCliente(usuario);
    if (!cli) return { ok: false, error: 'No encontré "' + usuario + '" en Base de datos.' };
    var faltan = [];
    if (!cli.nombreFactura) faltan.push(cli.esEmpresa ? 'Nombre de la empresa (Base de datos col L)' : 'Nombre del cliente');
    if (!cli.idFiscal) faltan.push('ID fiscal o DNI');
    if (!cli.direccion) faltan.push('Dirección de facturación');
    if (!cli.email) faltan.push('E-mail');
    if (faltan.length) return { ok: false, error: 'Faltan datos del cliente: ' + faltan.join(', ') + '. No se generó la factura.' };

    var montoUsd = Number(r[FAC_ING.usd - 1]) || 0;
    var montoEur = Number(r[FAC_ING.eur - 1]) || 0;
    var monto = montoUsd || montoEur;   // SIEMPRE en USD (col D)
    var concepto = facConcepto(r[FAC_ING.tipo - 1]);

    var numero = facProximoNumero();
    var hoy = new Date();
    var carpeta = facCarpetaMes(hoy);

    // 1) Generar el PDF de la factura (template HTML) — blob en memoria.
    var pdfBlob = facGenerarPdf({
      nombreFactura: cli.nombreFactura,
      idFiscal: cli.idFiscal,
      direccion: cli.direccion,
      numeroFmt: facPad4(numero),
      fecha: hoy,
      concepto: concepto,
      monto: monto,
      moneda: 'USD',
      formaPago: facFormaPago(r[FAC_ING.cuenta - 1])
    }).setName(numero + ' ' + cli.nombreFactura + '.pdf');

    // 2) Enviar por email PRIMERO (si falla, no se guarda el PDF ni se consume el número).
    var asunto = 'Factura N° ' + facPad4(numero) + ' — KOREX PROJECT LLC';
    var cuerpo = 'Hola' + (cli.nombreFactura ? ' ' + cli.nombreFactura : '') + ',\n\n' +
      'Adjuntamos la factura N° ' + facPad4(numero) + ' correspondiente a ' + concepto + '.\n\n' +
      'Cualquier consulta quedamos a disposición.\n\nSaludos,\nEquipo Korex';
    MailApp.sendEmail(cli.email, asunto, cuerpo, {
      attachments: [pdfBlob.copyBlob()],
      name: 'Korex'
    });

    // 3) Recién ahora guardar el PDF en la carpeta del mes.
    var file = carpeta.createFile(pdfBlob);

    // 4) Marcar Facturado (checkbox) + nota con Nº y link.
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
      var facturarA = String(vals[i][FAC_BD.facturarA - 1] || '').trim();
      var esEmpresa = facturarA.toLowerCase() === 'empresa';
      return {
        esEmpresa: esEmpresa,
        empresa: empresa,
        nombre: nombreCol,
        // "Facturado a": si es Empresa va el nombre de la empresa (col L); si es Persona, el Nombre.
        nombreFactura: esEmpresa ? empresa : nombreCol,
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

// Genera el PDF de la factura desde un template HTML (mejor diseño) — blob.
function facGenerarPdf(d) {
  var html = facHtmlFactura(d);
  return Utilities.newBlob(html, 'text/html', 'factura.html').getAs('application/pdf');
}

// Template HTML de la factura. Diseñado con bordes/tipografía/color de TEXTO (no fondos,
// porque el conversor HTML→PDF de Apps Script suele ignorar los background-color).
function facHtmlFactura(d) {
  var sym = d.moneda === 'USD' ? 'US$' : '€';
  var importe = sym + ' ' + facMiles(d.monto);
  var fechaStr = facFechaStr(d.fecha);
  var AZUL = '#1d4ed8', GRIS = '#6b7280', BORDE = '#d1d5db', OSCURO = '#111827';
  function esc(s){ return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  return '' +
  '<!DOCTYPE html><html><head><meta charset="utf-8"></head>' +
  '<body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:' + OSCURO + ';">' +
  '<div style="max-width:720px;margin:0 auto;padding:40px 44px;border-top:6px solid ' + AZUL + ';">' +

    // Encabezado
    '<table style="width:100%;border-collapse:collapse;margin-top:14px;"><tr>' +
      '<td style="vertical-align:top;">' +
        '<div style="font-size:28px;font-weight:800;letter-spacing:1px;color:' + AZUL + ';">KOREX</div>' +
        '<div style="font-size:11px;color:' + GRIS + ';margin-top:2px;">' + esc(FAC_EMISOR.nombre) + '</div>' +
      '</td>' +
      '<td style="vertical-align:top;text-align:right;">' +
        '<div style="font-size:24px;font-weight:700;letter-spacing:4px;color:' + OSCURO + ';">FACTURA</div>' +
        '<div style="margin-top:10px;font-size:13px;"><span style="color:' + GRIS + ';">N° </span><b style="color:' + AZUL + ';font-size:15px;">' + esc(d.numeroFmt) + '</b></div>' +
        '<div style="font-size:13px;margin-top:2px;"><span style="color:' + GRIS + ';">Fecha: </span><b>' + esc(fechaStr) + '</b></div>' +
      '</td>' +
    '</tr></table>' +

    '<div style="border-top:2px solid ' + BORDE + ';margin:22px 0;"></div>' +

    // Emisor / Facturado a
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px;line-height:1.6;"><tr>' +
      '<td style="vertical-align:top;width:50%;padding-right:18px;">' +
        '<div style="font-size:10.5px;font-weight:700;color:' + AZUL + ';letter-spacing:.5px;margin-bottom:5px;">EMITIDO POR</div>' +
        '<div><b>' + esc(FAC_EMISOR.nombre) + '</b></div>' +
        '<div style="color:' + GRIS + ';">EIN: ' + esc(FAC_EMISOR.ein) + '</div>' +
        '<div style="color:' + GRIS + ';">' + esc(FAC_EMISOR.ubicacion) + '</div>' +
      '</td>' +
      '<td style="vertical-align:top;width:50%;padding-left:18px;border-left:2px solid ' + BORDE + ';">' +
        '<div style="font-size:10.5px;font-weight:700;color:' + AZUL + ';letter-spacing:.5px;margin-bottom:5px;">FACTURADO A</div>' +
        '<div><b>' + esc(d.nombreFactura) + '</b></div>' +
        '<div style="color:' + GRIS + ';">ID fiscal o DNI: ' + esc(d.idFiscal) + '</div>' +
        '<div style="color:' + GRIS + ';">' + esc(d.direccion) + '</div>' +
      '</td>' +
    '</tr></table>' +

    // Tabla de ítems (encabezado por borde inferior azul + texto, sin relleno)
    '<table style="width:100%;border-collapse:collapse;margin-top:30px;font-size:13px;">' +
      '<tr>' +
        '<th style="text-align:left;padding:0 12px 8px;font-weight:700;color:' + AZUL + ';border-bottom:2px solid ' + AZUL + ';">CONCEPTO</th>' +
        '<th style="text-align:center;padding:0 12px 8px;font-weight:700;color:' + AZUL + ';border-bottom:2px solid ' + AZUL + ';width:90px;">UNIDADES</th>' +
        '<th style="text-align:right;padding:0 12px 8px;font-weight:700;color:' + AZUL + ';border-bottom:2px solid ' + AZUL + ';width:150px;">SUBTOTAL</th>' +
      '</tr>' +
      '<tr>' +
        '<td style="padding:12px;border-bottom:1px solid ' + BORDE + ';">' + esc(d.concepto) + '</td>' +
        '<td style="padding:12px;border-bottom:1px solid ' + BORDE + ';text-align:center;">1</td>' +
        '<td style="padding:12px;border-bottom:1px solid ' + BORDE + ';text-align:right;">' + esc(importe) + '</td>' +
      '</tr>' +
    '</table>' +

    // Total (alineado a la derecha)
    '<table style="width:100%;border-collapse:collapse;margin-top:6px;"><tr>' +
      '<td style="width:60%;"></td>' +
      '<td style="width:40%;">' +
        '<table style="width:100%;border-collapse:collapse;font-size:15px;">' +
          '<tr>' +
            '<td style="padding:10px 12px;color:' + GRIS + ';font-weight:700;">TOTAL</td>' +
            '<td style="padding:10px 12px;text-align:right;font-weight:800;font-size:17px;color:' + AZUL + ';">' + esc(importe) + '</td>' +
          '</tr>' +
        '</table>' +
      '</td>' +
    '</tr></table>' +

    // Forma de pago
    '<div style="margin-top:28px;font-size:12.5px;">' +
      '<span style="color:' + GRIS + ';">Forma de pago: </span><b>' + esc(d.formaPago || FAC_FORMA_PAGO) + '</b>' +
    '</div>' +

    // Nota legal
    '<div style="margin-top:44px;padding-top:14px;border-top:1px solid ' + BORDE + ';font-size:10px;color:' + GRIS + ';line-height:1.55;">' +
      esc(FAC_NOTA_IVA) +
    '</div>' +

  '</div></body></html>';
}

// Sin decimales (se truncan, no se redondean): 4775.9 -> "4.775"
function facMiles(n) {
  var x = String(Math.trunc(Number(n) || 0));
  return x.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function facPad4(n) { var s = String(n); while (s.length < 4) s = '0' + s; return s; }

function facNorm(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Devuelve un Date a partir de un valor de celda (Date o serial de Sheets) o null.
function facToDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 0) return new Date(Math.round((v - 25569) * 86400 * 1000));
  return null;
}

function facAnio(v) { var d = facToDate(v); return d ? d.getFullYear() : 0; }

function facFechaStr(v) {
  var d = facToDate(v);
  if (!d) return String(v || '');
  var dd = ('0' + d.getDate()).slice(-2), mm = ('0' + (d.getMonth() + 1)).slice(-2);
  return dd + '/' + mm + '/' + d.getFullYear();
}
