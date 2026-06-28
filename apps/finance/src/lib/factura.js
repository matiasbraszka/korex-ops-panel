// Facturación Korex — portado 1:1 del Apps Script de la planilla "MKA - Finanzas y Costos".
// Mismo emisor, conceptos por tipo, forma de pago por cuenta, plantilla HTML y numeración.
// La diferencia: acá el PDF se genera imprimiendo el HTML (Guardar como PDF) y la factura
// queda registrada en la tabla `invoices` (numeración continua global).

export const FAC_EMISOR = { nombre: 'KOREX PROJECT LLC', ein: '33-3093287', ubicacion: '102 Gold Ave 443, Albuquerque' };
export const FAC_NOTA_IVA = 'Operation not subject to VAT according to Article 196 of EU VAT Directive / Operación no sujeta a IVA según el artículo 196 de la Directiva IVA UE.';
const FAC_FORMA_PAGO_DEFAULT = 'Tarjeta de crédito / débito';
const FAC_CONCEPTO_DEFAULT = 'ONBOARDING SISTEMA KOREX';

// Concepto según el Tipo del ingreso (SETUP / CRM / PUBLICIDAD).
const FAC_CONCEPTOS = {
  SETUP: 'Implementación de sistema de marketing y tecnología para la captación de potenciales clientes',
  CRM: 'Acceso a software y servicio de marketing para la captación de potenciales clientes',
  PUBLICIDAD: 'Servicio de marketing y carga de saldo publicitario',
};
export function facConcepto(tipo) {
  const t = String(tipo || '').trim().toUpperCase();
  return FAC_CONCEPTOS[t] || FAC_CONCEPTO_DEFAULT;
}

// Forma de pago según la cuenta/método receptor.
export function facFormaPago(cuenta) {
  const s = String(cuenta || '').toLowerCase();
  if (s.includes('stripe')) return 'Tarjeta de crédito/débito vía Stripe';
  if (s.includes('mercury')) return 'Transferencia bancaria';
  if (s.includes('usdt') || s.includes('safepal')) return 'Wallet USDT';
  return FAC_FORMA_PAGO_DEFAULT;
}

// Nº con padding a 4 dígitos (0247).
export const facPad4 = (n) => String(n == null ? '' : n).replace(/[^\d]/g, '').padStart(4, '0');

// Sin decimales (se truncan, no se redondean): 4775.9 -> "4.775".
export function facMiles(n) {
  const x = String(Math.trunc(Number(n) || 0));
  return x.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function facFechaStr(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (isNaN(dt.getTime())) return String(d || '');
  const dd = ('0' + dt.getDate()).slice(-2);
  const mm = ('0' + (dt.getMonth() + 1)).slice(-2);
  return `${dd}/${mm}/${dt.getFullYear()}`;
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Plantilla HTML idéntica a la del Apps Script (bordes/tipografía/color; sin fondos).
// d = { nombreFactura, idFiscal, direccion, numeroFmt, fecha(Date|str), concepto, monto, moneda('USD'|'EUR'), formaPago }
export function facHtmlFactura(d) {
  const sym = d.moneda === 'EUR' ? '€' : 'US$';
  const importe = sym + ' ' + facMiles(d.monto);
  const fechaStr = facFechaStr(d.fecha);
  const AZUL = '#1d4ed8', GRIS = '#6b7280', BORDE = '#d1d5db', OSCURO = '#111827';

  return '' +
  '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Factura ' + esc(d.numeroFmt) + '</title>' +
  '<style>@page{margin:0}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head>' +
  '<body style="margin:0;font-family:Arial,Helvetica,sans-serif;color:' + OSCURO + ';">' +
  '<div style="max-width:720px;margin:0 auto;padding:40px 44px;border-top:6px solid ' + AZUL + ';">' +

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

    '<div style="margin-top:28px;font-size:12.5px;">' +
      '<span style="color:' + GRIS + ';">Forma de pago: </span><b>' + esc(d.formaPago || FAC_FORMA_PAGO_DEFAULT) + '</b>' +
    '</div>' +

    '<div style="margin-top:44px;padding-top:14px;border-top:1px solid ' + BORDE + ';font-size:10px;color:' + GRIS + ';line-height:1.55;">' +
      esc(FAC_NOTA_IVA) +
    '</div>' +

  '</div></body></html>';
}

// Abre el HTML en una ventana nueva y dispara el diálogo de impresión (Guardar como PDF).
export function facImprimir(html) {
  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return false;
  w.document.open();
  w.document.write(html);
  w.document.close();
  // Esperar al render antes de imprimir.
  const go = () => { try { w.focus(); w.print(); } catch { /* noop */ } };
  if (w.document.readyState === 'complete') setTimeout(go, 300);
  else w.onload = () => setTimeout(go, 300);
  return true;
}
