// ─────────────────────────────────────────────────────────────────────────────
// destinoTarea — a dónde lleva una tarea del sistema de operaciones al tocarla.
//
// Regla de Matías:
//  · La tarea está enlazada a un funnel → el click lleva ADENTRO de ese funnel.
//  · Si habla de grabar (grabación, grabarse, filmar…) → directo a la sección
//    "Guiones para grabar" de ese funnel.
//  · Si se trata de SUBIR algo (sube, carga, envía, fotos, material…) → a la
//    parte de recursos/carpetas del funnel.
// El verbo de acción manda: "Sube las grabaciones" es subir (recursos), aunque
// mencione grabaciones. "Grabar los anuncios" es grabar (guiones).
// ─────────────────────────────────────────────────────────────────────────────

const RE_SUBIR = /\b(sub[ií]|sube|subir|subas|carg[aá]|cargar|env[ií]a|enviar|mand[aá]|mandar|adjunt)/i;
const RE_GRABAR = /(grab|film|rodar|guion|guión)/i;
const RE_MATERIAL = /(foto|imagen|im[aá]gen|logo|branding|testimonio|material|recurso)/i;

export function destinoTarea(t) {
  const txt = String(t?.titulo || '');
  const esSubir = RE_SUBIR.test(txt) || (!RE_GRABAR.test(txt) && RE_MATERIAL.test(txt));
  const esGrabar = !esSubir && RE_GRABAR.test(txt);

  if (t?.funnelId) {
    if (esGrabar) return { to: `/funnel/${t.funnelId}`, state: { focus: 'guiones' }, cta: 'Ver los guiones' };
    if (esSubir) return { to: `/funnel/${t.funnelId}`, state: { focus: 'recursos' }, cta: 'Subir material' };
    return { to: `/funnel/${t.funnelId}`, state: {}, cta: 'Abrir el funnel' };
  }
  // Sin funnel: si es de subir material, va a los recursos generales de su marca.
  if (esSubir) return { to: '/recursos', state: {}, cta: 'Subir material' };
  return null;
}
