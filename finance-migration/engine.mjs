// =============================================================================
// Motor de comisiones Korex — réplica DETERMINÍSTICA de las fórmulas del Sheet
// "MKA - Finanzas y Costos" (hoja Ingresos, columnas V, W, X, Y, Z, AA, AC, F).
// =============================================================================
// Diseñado para dar IDÉNTICO al Sheet (validado con golden test). NO "arregla"
// nada del Sheet a propósito: si el Sheet tiene una rareza (ej. doble descuento
// de afiliado), el motor la replica y la rareza se reporta aparte.
//
// Reglas (de las fórmulas reales):
//  - La BASE de todo reparto es E (neto post-fees), no C/D.
//  - V (tipo efectivo): SETUP→SETUP, PUBLICIDAD→PUBLICIDAD; cualquier otro (CRM,
//    "Comisiones", ...) se compara contra el umbral: acumulado SUMIFS(E del cliente,
//    no-publicidad, INCLUYE fila actual) vs Acuerdos Z. umbral < acumulado → CRM,
//    si no SETUP. Es ACUMULATIVO y depende del orden de filas.
//  - Comparaciones de texto = case-insensitive (como Sheets). Nombres se matchean
//    con trim()+lowercase (VLOOKUP/MATCH exactos son case-insensitive).
//  - Normalización de % por columna: W/X usan (>=1 ? /100 : tal cual); AC usa
//    (>1 ? /100 : tal cual); Y/Z/AA dividen /100 siempre.
//  - W/X/Z/AA usan el tipo EFECTIVO V; Y/AC usan el tipo ORIGINAL H.
//  - Z/AA solo pagan si fechaVenta(B) >= fecha de inicio del consultor/marketing
//    (bloque izquierdo de Acuerdos por nombre+cliente+categoría); si no hay → nunca.
//  - F (Korex real): Publicidad → (E - Σ(U:AB))*15/100 ; resto → E - Σ(U:AC).
// =============================================================================

// ---------- helpers ----------
export const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return isFinite(n) ? n : 0;
};
const key = (s) => String(s == null ? '' : s).trim().toLowerCase();
const cieq = (a, b) => key(a) === key(b);
const isPubli = (t) => cieq(t, 'PUBLICIDAD');
// fecha "yyyy-mm-dd" o Date → serial comparable (días). '' → null.
const toSerial = (d) => {
  if (!d) return null;
  if (d instanceof Date) return Math.floor(d.getTime() / 86400000);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  if (!m) return null;
  return Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 86400000);
};

// =============================================================================
// buildAcuerdos(derRows, izqRows)
//   derRows: filas del bloque derecho de Acuerdos (índices 0..17 = K..AB)
//   izqRows: filas del bloque izquierdo (índices 0..5 = B..G)
// Devuelve estructuras de búsqueda que el motor consume.
// =============================================================================
export function buildAcuerdos(derRows, izqRows) {
  // El export del bloque derecho ARRANCA en la col J (10). Índices del array v[]:
  //   0J fechaAcuerdo,1K cliente,2L valor,3M conector,4N consultor,5O marketing,
  //   6P setupConector%,7Q crmConector%,8R crmCliente%,9S crmAfiliados%,10T crmKorex%,
  //   11U crmConsultor%,12V crmMarketing%,13W publiKorex%,14X publiConsultor%,
  //   15Y publiMarketing%,16Z umbral,17AA publiConector%
  const byClient = new Map();        // lc(cliente) -> der row obj
  const byClientConector = new Map(); // lc(cliente)|lc(conector) -> der row obj
  for (const r of derRows) {
    const v = r.v || r;
    const cliente = v[1];
    if (cliente == null || String(cliente).trim() === '') continue;
    const obj = {
      cliente, valor: num(v[2]), conector: v[3], consultor: v[4], marketing: v[5],
      setupConector: v[6], crmConector: v[7], crmCliente: v[8], crmAfiliados: v[9],
      crmKorex: v[10], crmConsultor: v[11], crmMarketing: v[12],
      publiKorex: v[13], publiConsultor: v[14], publiMarketing: v[15],
      umbral: num(v[16]), publiConector: v[17],
    };
    if (!byClient.has(key(cliente))) byClient.set(key(cliente), obj); // VLOOKUP toma la 1ª
    const kk = key(cliente) + '|' + key(v[3]);
    if (!byClientConector.has(kk)) byClientConector.set(kk, obj);
  }
  // bloque izquierdo: fecha de inicio por (nombre|cliente|categoria)
  const startDate = new Map(); // lc(nombre)|lc(cliente)|lc(categoria) -> serial (la 1ª, como FILTER+INDEX)
  for (const r of izqRows) {
    const v = r.v || r;
    const fecha = v[0], nombre = v[1], categoria = v[2], cliente = v[3];
    if (!nombre || !cliente || !categoria) continue;
    const kk = key(nombre) + '|' + key(cliente) + '|' + key(categoria);
    if (!startDate.has(kk)) startDate.set(kk, toSerial(fecha));
  }
  return { byClient, byClientConector, startDate };
}

// =============================================================================
// computeRow(income, acuerdos, state) → { V, W, X, Y, Z, AA, AC, F, korexReal, ... }
//   income: { fecha(B), E, H, N(cliente), O(conector), P(afiliado) }
//   acuerdos: salida de buildAcuerdos
//   state: { cum: Map<cliente, number> } — acumulado para el umbral (mutado en orden)
// =============================================================================
export function computeRow(income, acuerdos, state) {
  const { fecha, E, H } = income;
  const cliente = income.N, conector = income.O, afiliado = income.P;
  const e = num(E);
  const cli = acuerdos.byClient.get(key(cliente)) || null;

  // ---- V: tipo efectivo (acumulativo) ----
  const publi = isPubli(H);
  if (!publi) {
    const prev = state.cum.get(key(cliente)) || 0;
    state.cum.set(key(cliente), prev + e); // SUMIFS incluye la fila actual
  }
  let V;
  if (H == null || String(H).trim() === '') V = '';
  else if (cieq(H, 'SETUP')) V = 'SETUP';
  else if (publi) V = 'PUBLICIDAD';
  else {
    const umbral = cli ? cli.umbral : 0;
    const acc = state.cum.get(key(cliente)) || 0;
    V = (umbral < acc) ? 'CRM' : 'SETUP';
  }
  const vEff = key(V); // 'setup'|'crm'|'publicidad'|''

  const normGE1 = (raw) => { const n = num(raw); return n >= 1 ? n / 100 : n; }; // W, X
  const normGT1 = (raw) => { const n = num(raw); return n > 1 ? n / 100 : n; };  // AC

  // ---- W: Cliente (usa V) ----
  let W = '';
  if (vEff === 'crm') {
    const pct = cli ? normGE1(cli.crmCliente) : 0;
    W = e * pct;
  }

  // ---- X: Conector (usa V; matchea cliente|conector) ----
  let X = '';
  {
    const row = acuerdos.byClientConector.get(key(cliente) + '|' + key(conector)) || null;
    const pSetup = row ? normGE1(row.setupConector) : 0;
    const pCrm = row ? normGE1(row.crmConector) : 0;
    const pPubli = row ? normGE1(row.publiConector) : 0;
    if (vEff === 'setup') X = e * pSetup;
    else if (vEff === 'crm') X = e * pCrm;
    else if (vEff === 'publicidad') X = (pPubli === 0) ? '' : e * pPubli;
    else X = '';
  }

  // ---- Y: Afiliado PAGADO (usa H original; /100). REGLA CORRECTA (Mati):
  //   solo se paga si hay un afiliado asignado (P no vacío). Si no, el % no se
  //   paga: queda reservado en AC. Así Y y AC son mutuamente excluyentes y el
  //   afiliado se descuenta UNA sola vez (sin el doble conteo del Sheet).
  const afiliadoPresente = !(afiliado == null || String(afiliado).trim() === '');
  let Y = '';
  if (cieq(H, 'CRM') && afiliadoPresente) {
    const pct = cli ? num(cli.crmAfiliados) / 100 : 0;
    Y = e * pct;
  }

  // ---- Z: Consultor (usa V; validez por fecha) ----
  let Z = '';
  {
    const nombreConsultor = cli ? cli.consultor : '';
    const fi = nombreConsultor
      ? acuerdos.startDate.get(key(nombreConsultor) + '|' + key(cliente) + '|' + 'consultor')
      : undefined;
    const fiSerial = (fi === undefined || fi === null) ? 99999999 : fi;
    const ventaSerial = toSerial(fecha);
    const esValido = ventaSerial != null && ventaSerial >= fiSerial;
    if (esValido) {
      if (vEff === 'crm') Z = e * (num(cli.crmConsultor) / 100);
      else if (vEff === 'publicidad') Z = e * (num(cli.publiConsultor) / 100);
      else Z = '';
    }
  }

  // ---- AA: Marketing (usa V; validez por fecha) ----
  let AA = '';
  {
    const nombreMkt = cli ? cli.marketing : '';
    const fi = nombreMkt
      ? acuerdos.startDate.get(key(nombreMkt) + '|' + key(cliente) + '|' + 'marketing')
      : undefined;
    const fiSerial = (fi === undefined || fi === null) ? 99999999 : fi;
    const ventaSerial = toSerial(fecha);
    const esValido = ventaSerial != null && ventaSerial >= fiSerial;
    if (esValido) {
      if (vEff === 'crm') AA = e * (num(cli.crmMarketing) / 100);
      else if (vEff === 'publicidad') AA = e * (num(cli.publiMarketing) / 100);
      else AA = '';
    }
  }

  // ---- AC: Comisiones sin repartir (usa H original; gate por P/afiliado) ----
  let AC = '';
  {
    const pBlank = (afiliado == null || String(afiliado).trim() === '');
    if (pBlank) {
      if (!cieq(H, 'CRM')) AC = 0;
      else AC = e * (cli ? normGT1(cli.crmAfiliados) : 0);
    } else {
      AC = '';
    }
  }

  // ---- F: Ingreso real Korex ----
  // Publicidad: (E - Σ(W..AA))*15/100  ; resto: E - Σ(W..AA, AC)
  const sumWtoAA = num(W) + num(X) + num(Y) + num(Z) + num(AA);
  let F;
  if (cieq(H, 'PUBLICIDAD')) F = ((e - sumWtoAA) * 15) / 100;
  else F = e - (sumWtoAA + num(AC));

  return { V, W, X, Y, Z, AA, AC, F, korexReal: F };
}

// =============================================================================
// runLedger(incomes[], acuerdos) → resultados en orden (mantiene el acumulado)
// =============================================================================
export function runLedger(incomes, acuerdos) {
  const state = { cum: new Map() };
  return incomes.map((inc) => computeRow(inc, acuerdos, state));
}
