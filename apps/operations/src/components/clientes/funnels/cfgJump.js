// Salto directo Panorama → campo de la configuración del funnel.
// El Panorama guarda acá {client, funnel, campo} y navega al cliente; la cadena
// (FunnelsView → FunnelRow → DelEditor → FunnelConfigBlock) va leyendo este dato
// para abrir el funnel, la pestaña Configuración y resaltar el campo exacto.
// El último eslabón (FunnelConfigBlock) lo borra. Expira a los 60s por si la
// cadena se corta a mitad de camino (así no secuestra la próxima apertura del DEL).
const KEY = 'cfg_jump';

export const setCfgJump = (jump) => {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...jump, ts: Date.now() })); } catch { /* noop */ }
};

export const getCfgJump = () => {
  try {
    const j = JSON.parse(sessionStorage.getItem(KEY) || 'null');
    if (!j) return null;
    if (Date.now() - (j.ts || 0) > 60000) { sessionStorage.removeItem(KEY); return null; }
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
