// Config de categorías/pestañas del DEL (P9). El BASE es el default; el admin puede
// reemplazarlo desde Ajustes (app_settings.del_tab_template). DelEditor usa resolveDelTabs
// para derivar los mismos "arrays de kinds" que usaba antes, ahora configurables.

export const SEC_BASE = {
  estrategia:     { c: '#0891B2', bg: '#ECFEFF', label: 'Estrategia' },
  avatares:       { c: '#F97316', bg: '#FFF7ED', label: 'Avatares' },
  vsl:            { c: '#16A34A', bg: '#ECFDF5', label: 'VSL' },
  anuncios:       { c: '#5B7CF5', bg: '#EEF2FF', label: 'Anuncios' },
  pg_prelanding:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Pre-landing' },
  pg_landing:     { c: '#8B5CF6', bg: '#F5F3FF', label: 'Landing' },
  pg_formulario:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Formulario' },
  pg_thankyou:    { c: '#8B5CF6', bg: '#F5F3FF', label: 'Thank you' },
  pg_testimonios: { c: '#8B5CF6', bg: '#F5F3FF', label: 'Testimonios' },
  mensajes:       { c: '#0D9488', bg: '#F0FDFA', label: 'Mensajes' },
  pipeline_viejo: { c: '#9CA3AF', bg: '#F4F5F7', label: 'Estado (viejo)' },
  otros:          { c: '#9CA3AF', bg: '#F4F5F7', label: 'Otros' },
};

const KIND_ORDER_BASE = ['estrategia', 'avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios', 'mensajes', 'pipeline_viejo', 'otros'];
// Categorías que SIEMPRE existen en TODO DEL, aunque estén vacías (pedido de Matías).
const STANDARD_KINDS_BASE = ['avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios'];
// Categorías a las que se puede MOVER una sección.
const MOVE_KINDS_BASE = ['estrategia', 'avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios', 'mensajes', 'otros'];
// Categorías que VERSIONAN (V1/V2/V3). El avatar NO versiona; la estrategia sí.
const VERSIONABLE_KINDS_BASE = ['estrategia', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios'];

// Plantilla DEFAULT de categorías (P9): una categoría por cada kind → el menú se ve igual
// que antes. El admin puede reemplazarla para agregar categorías (ej. "Ventas") con sus
// pestañas (ej. "Playbook").
export const DEFAULT_DEL_CATEGORIES = KIND_ORDER_BASE
  .filter(k => k !== 'pipeline_viejo' && k !== 'otros')   // legacy: no se configuran
  .map(k => ({
    key: k, label: SEC_BASE[k].label, color: SEC_BASE[k].c,
    tabs: [{ kind: k, label: SEC_BASE[k].label, color: SEC_BASE[k].c, bg: SEC_BASE[k].bg,
             standard: STANDARD_KINDS_BASE.includes(k), versionable: VERSIONABLE_KINDS_BASE.includes(k) }],
  }));

// Resuelve categorías/pestañas del DEL desde la config del admin (con fallback al default).
export function resolveDelTabs(appSettings) {
  const cfg = appSettings?.del_tab_template;
  const categories = (Array.isArray(cfg) && cfg.length) ? cfg : DEFAULT_DEL_CATEGORIES;
  const SEC = { ...SEC_BASE };
  const order = [], standard = [], versionable = [], move = [], kindCat = {};
  for (const cat of categories) {
    const tabs = Array.isArray(cat.tabs) ? cat.tabs : [];
    tabs.forEach((tb, i) => {
      const kind = tb.kind;
      if (!kind) return;
      SEC[kind] = {
        c: tb.color || SEC_BASE[kind]?.c || '#9CA3AF',
        bg: tb.bg || SEC_BASE[kind]?.bg || '#F4F5F7',
        label: tb.label || SEC_BASE[kind]?.label || kind,
      };
      if (!order.includes(kind)) order.push(kind);
      if (tb.standard && !standard.includes(kind)) standard.push(kind);
      if (tb.versionable && !versionable.includes(kind)) versionable.push(kind);
      if (!move.includes(kind)) move.push(kind);
      kindCat[kind] = { key: cat.key, label: cat.label, color: cat.color || SEC[kind].c, first: i === 0, multi: tabs.length > 1 };
    });
  }
  // kinds del base que no estén en la config (legacy: pipeline_viejo, otros, mensajes…).
  for (const k of KIND_ORDER_BASE) if (!order.includes(k)) { order.push(k); if (!SEC[k]) SEC[k] = SEC_BASE[k]; }
  for (const k of MOVE_KINDS_BASE) if (!move.includes(k)) move.push(k);
  const secOf = (k) => SEC[k] || SEC.otros || SEC_BASE.otros;
  const kindRank = (k) => { const i = order.indexOf(k); return i === -1 ? 99 : i; };
  return { SEC, secOf, KIND_ORDER: order, kindRank, STANDARD_KINDS: standard, MOVE_KINDS: move, VERSIONABLE_KINDS: versionable, categories, kindCat };
}
