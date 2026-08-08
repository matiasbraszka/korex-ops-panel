// Salto directo Panorama → campo de la configuración del funnel.
// El Panorama guarda acá {client, funnel, campo} y navega al cliente; la cadena
// (FunnelsView → FunnelRow → DelEditor → FunnelConfigBlock) va leyendo este dato
// para abrir el funnel, la pestaña Configuración y resaltar el campo exacto.
// El último eslabón (FunnelConfigBlock) lo borra. Expira por si la cadena se corta
// a mitad de camino (así no secuestra la próxima apertura del DEL).
//
// Eran 60s y quedaba corto: con un cliente pesado, entre que carga la ficha, monta
// los funnels y abre el DEL, el salto vencía en el camino y no pasaba nada. Cinco
// minutos siguen siendo poco para "secuestrar" una apertura hecha a mano, y alcanzan
// de sobra para la carga más lenta.
const KEY = 'cfg_jump';
const VENCE_MS = 5 * 60_000;

export const setCfgJump = (jump) => {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...jump, ts: Date.now() })); } catch { /* noop */ }
};

export const getCfgJump = () => {
  try {
    const j = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!j) return null;
    if (Date.now() - (j.ts || 0) > VENCE_MS) { sessionStorage.removeItem(KEY); return null; }
    return j;
  } catch { return null; }
};

export const clearCfgJump = () => {
  try { sessionStorage.removeItem(KEY); } catch { /* noop */ }
};

// ── Volver al paso anterior ────────────────────────────────────────────────
// El salto es de una sola vía: una vez adentro del DEL no había forma de volver
// al Panorama sin rehacer la navegación a mano. Esto se guarda aparte y SIN
// vencimiento: el de arriba expira a los 60s porque su trabajo dura un instante,
// pero el "volver" tiene que seguir vivo mientras el usuario mira lo que fue a ver.
const RET = 'panorama_return';

export const setPanoramaReturn = (clientId) => {
  try { sessionStorage.setItem(RET, JSON.stringify({ client: clientId })); } catch { /* noop */ }
};

export const getPanoramaReturn = () => {
  try { return JSON.parse(sessionStorage.getItem(RET) || 'null'); } catch { return null; }
};

export const clearPanoramaReturn = () => {
  try { sessionStorage.removeItem(RET); } catch { /* noop */ }
};
