// agents.js — mapa compartido de los agentes de marketing y su corpus en marketing_ad_library.
// Cada agente guarda su material dentro de la MISMA tabla, distinguido por la columna `part`:
//   - `ficha`     = las fichas/ejemplos que el agente lee como referencia (lo que ve la "Bitácora" y "Ejemplos")
//   - `section`   = el método troceado por secciones, buscable
//   - `blueprintId` = el documento del método fijo (blueprint) que el agente sigue al pie
// Lo usan ContextStatus (Estado del agente), BlueprintEditor y WinnerCandidates (Bitácora) para no
// quedar clavados en Anuncios.

export const MARKETING_AGENTS = [
  { key: 'anuncios', label: 'Anuncios', blueprintId: 'mal_blueprint',     ficha: 'example',   section: 'blueprint_section' },
  { key: 'vsl',      label: 'VSL',      blueprintId: 'mal_vsl_blueprint', ficha: 'vsl_ficha', section: 'vsl_section' },
  { key: 'landing',  label: 'Landing',  blueprintId: 'mal_cf_blueprint',  ficha: 'cf_ficha',  section: 'cf_section' },
];

// El blueprint también existe para Descubrimiento, aunque no tiene "ganadores".
export const BLUEPRINT_AGENTS = [
  ...MARKETING_AGENTS,
  { key: 'descubrimiento', label: 'Descubrimiento', blueprintId: 'mal_desc_blueprint', ficha: 'desc_ficha', section: null },
];

export const agentByKey = (key) => MARKETING_AGENTS.find((a) => a.key === key) || MARKETING_AGENTS[0];
