// Metricas DERIVADAS del DME. Espejo de computeRates de Ventas: recibe un objeto
// de TOTALES (inputs ya agregados; ratios se recalculan sobre totales, nunca se
// promedian) y devuelve numeros crudos. El formateo (%, $) se hace al renderizar.
//
// `days` = cantidad de dias del periodo agregado (1 para una columna diaria). Se
// usa para el runway (saldo / gasto diario promedio).

// Division segura: NaN si el divisor es 0 -> fmt* lo muestran como "—".
const div = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : NaN);

// Derivados de un embudo (prefix 'embudo1' | 'embudo2').
function funnelDerived(p, n, totalGastadoBoth) {
  const g  = (s) => n(`${p}_${s}`);
  const gastado = g('total_gastado');
  return {
    [`${p}_pct_inversion`]:    div(gastado, totalGastadoBoth),
    [`${p}_cpl`]:              div(gastado, g('total_leads')),
    [`${p}_pct_curiosos`]:     div(g('leads_curiosos'), g('total_leads')),
    [`${p}_costo_curioso`]:    div(gastado, g('leads_curiosos')),
    [`${p}_pct_interesados`]:  div(g('leads_interesados'), g('total_leads')),
    [`${p}_costo_interesado`]: div(gastado, g('leads_interesados')),
    [`${p}_pct_calificados`]:  div(g('leads_calificados'), g('total_leads')),
    [`${p}_costo_calificado`]: div(gastado, g('leads_calificados')),
    [`${p}_pct_registro`]:     div(g('leads_registrados'), g('visitas_landing')),
    [`${p}_pct_vsl`]:          div(g('miran_vsl'), g('leads_registrados')),
    [`${p}_pct_quiz`]:         div(g('quiz_terminado'), g('quiz_iniciado')),
    [`${p}_pct_whatsapp`]:     div(g('whatsapp'), g('quiz_terminado')),
    [`${p}_pct_cierres`]:      div(g('cierres'), g('leads_registrados')),
    [`${p}_roi`]:              div(g('facturado') - gastado, gastado),
  };
}

export function computeDerived(t = {}, { days = 1 } = {}) {
  const n = (k) => Number(t[k] || 0);
  const has = (...ks) => ks.some((k) => t[k] != null); // hay algun dato cargado?

  const usuariosTotal = n('usuarios_activos_con_pub') + n('usuarios_activos_sin_pub');
  const gastadoBoth   = n('embudo1_total_gastado') + n('embudo2_total_gastado');
  const cargasTotal   = n('cargas_nuevas_pub') + n('recargas_pub');
  const cierresTotal  = n('embudo1_cierres') + n('embudo2_cierres');

  const out = {
    // Usuarios (TOTAL en blanco si no hay ningun dato de usuarios cargado)
    usuarios_total:      has('usuarios_activos_con_pub', 'usuarios_activos_sin_pub') ? usuariosTotal : NaN,
    pct_activos_con_pub: div(n('usuarios_activos_con_pub'), usuariosTotal),
    pct_activos_sin_pub: div(n('usuarios_activos_sin_pub'), usuariosTotal),
    pct_bajas:           div(n('usuarios_baja'), usuariosTotal),
    // Finanzas
    cargas_totales_pub:    has('cargas_nuevas_pub', 'recargas_pub') ? cargasTotal : NaN,
    pct_comisiones_setups: div(n('comisiones_setups'), n('facturacion_setups')),
    pct_comisiones_pub:    div(n('comisiones_pub'), n('invertido_pub')),
    pct_renovaciones:      div(n('recargas_pub'), n('usuarios_activos_con_pub')),
    avg_inversion_usuario: div(n('invertido_pub'), cargasTotal),
    // Saldos / runway
    pct_queda_saldo:           div(n('saldo_final'), n('saldo_final') + n('total_gastado_acumulado')),
    pct_queda_saldo_invertido: div(n('saldo_con_invertido'), n('saldo_con_invertido') + n('total_gastado_acumulado')),
    // Dias de pauta que aguanta = saldo final del dia / gasto diario promedio en Meta.
    dias_proyectados:          div(n('saldo_final') * days, n('total_gastado_acumulado')),
    // Leads
    leads_diferencia:    has('leads_obtenidos', 'leads_obtenidos_crm') ? n('leads_obtenidos') - n('leads_obtenidos_crm') : NaN,
    cpl:                 div(gastadoBoth, n('leads_obtenidos')),
    leads_por_networker: div(n('leads_obtenidos'), n('networkers_recibieron')),
    dispersion_cpl:      div(n('cpl_mas_alto') - n('cpl_mas_bajo'), n('cpl_mas_bajo')),
    // Networkers
    pct_recibiendo_prospectos: div(n('networkers_recibieron'), n('networkers_recibieron') + n('networkers_sin_leads')),
    // Cualitativo
    tasa_testimonios: div(n('nuevos_testimonios'), n('nuevos_usuarios')),
    pct_referidos:    div(n('nuevos_referidos'), n('nuevos_usuarios')),
  };

  Object.assign(out, funnelDerived('embudo1', n, gastadoBoth));
  Object.assign(out, funnelDerived('embudo2', n, gastadoBoth));
  // Total de cierres (Embudo 1 + 2) — usado por el Dashboard.
  out.cierres_total = has('embudo1_cierres', 'embudo2_cierres') ? cierresTotal : NaN;
  return out;
}
