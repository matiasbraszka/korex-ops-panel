// ─────────────────────────────────────────────────────────────────────────────
// destinoTarea — a dónde lleva una tarea del sistema de operaciones al tocarla
// (portal v2). Regla de Matías:
//  · Tarea de GRABAR → al documento de guiones de ese embudo (Ads o VSL).
//  · Tarea de SUBIR algo → a Material.
// El verbo de acción manda: "Sube las grabaciones" es subir; "Grabar los
// anuncios" es grabar.
// ─────────────────────────────────────────────────────────────────────────────

const RE_SUBIR = /\b(sub[ií]|sube|subir|subas|carg[aá]|cargar|env[ií]a|enviar|mand[aá]|mandar|adjunt)/i;
const RE_GRABAR = /(grab|film|rodar|guion|guión)/i;
const RE_MATERIAL = /(foto|imagen|im[aá]gen|logo|branding|testimonio|material|recurso)/i;
const RE_VSL = /\bvsl\b/i;

export function destinoTarea(t) {
  const txt = String(t?.titulo || '');
  const esSubir = RE_SUBIR.test(txt) || (!RE_GRABAR.test(txt) && RE_MATERIAL.test(txt));
  const esGrabar = !esSubir && RE_GRABAR.test(txt);

  // Grabar → SIEMPRE a la pantalla de selección de guiones (el cliente elige
  // ahí cuál abrir; nada de tirarlo adentro de un documento de una).
  if (esGrabar) {
    return { to: '/guiones', state: {}, cta: 'Ver mis guiones' };
  }
  if (esSubir) return { to: '/material', state: {}, cta: 'Subir material' };
  if (t?.funnelId) return { to: '/embudos', state: {}, cta: 'Ver el embudo' };
  return null;
}
