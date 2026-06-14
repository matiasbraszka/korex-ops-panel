// Semaforo del DME. Lee la config de umbrales (pestana Config) y devuelve el tono
// de una celda. La config vive en app_settings.value.dme_config; si no hay, cae a
// DEFAULT_DME_CONFIG. Cambiar un umbral aca-> cambia el color para TODOS los clientes.
import { DEFAULT_DME_CONFIG } from './registry.js';

const GREEN      = { bg: 'var(--color-green-bg)',  fg: '#16A34A', level: 'verde' };
const YELLOW     = { bg: 'var(--color-yellow-bg)', fg: '#CA8A04', level: 'amarillo' };
const RED        = { bg: 'var(--color-red-bg)',    fg: 'var(--color-red)', level: 'rojo' };
const RED_STRONG = { bg: '#FEE2E2',                fg: '#B91C1C', level: 'critico' };

// Config efectiva: la guardada o, si falta una metrica, su default.
export function resolveDmeConfig(appSettings) {
  const saved = appSettings?.dme_config;
  if (!saved) return DEFAULT_DME_CONFIG;
  return { ...DEFAULT_DME_CONFIG, ...saved };
}

// tono de una celda segun su metrica + valor. null = sin color (neutra).
export function metricTone(metricKey, value, config) {
  const cfg = config?.[metricKey];
  if (!cfg || cfg.activo === false) return null;
  const v = Number(value);
  if (!Number.isFinite(v)) return null;
  const { direction, verde, amarillo, critico } = cfg;
  if (direction === 'menor') {
    if (v <= verde) return GREEN;
    if (v <= amarillo) return YELLOW;
    if (v <= critico) return RED;
    return RED_STRONG;
  }
  // 'mayor' es mejor (default)
  if (v >= verde) return GREEN;
  if (v >= amarillo) return YELLOW;
  if (v >= critico) return RED;
  return RED_STRONG;
}

export const TONES = { GREEN, YELLOW, RED, RED_STRONG };
