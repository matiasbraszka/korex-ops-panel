// Hook que expone la configuración del Historial.
// Las FASES son las mismas que las del Roadmap (app_settings.roadmap_template.phases) — un solo set de verdad.
// Los TIPOS de evento siguen viviendo en app_settings.historial_event_types (configurables aparte).
import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_EVENT_TYPES } from './tokens.js';

const FALLBACK_ROADMAP_PHASES = [
  { id: 'pre-onboarding',  label: 'Pre-Onboarding',  color: '#8B5CF6', order: 0 },
  { id: 'onboarding',      label: 'Onboarding',      color: '#5B7CF5', order: 1 },
  { id: 'primera-entrega', label: 'Primera Entrega', color: '#EAB308', order: 2 },
  { id: 'lanzamiento',     label: 'Lanzamiento',     color: '#22C55E', order: 3 },
  { id: 'auditoria',       label: 'Auditoría',       color: '#06B6D4', order: 4 },
];

function shortFromLabel(label = '') {
  // Toma las 1-2 primeras palabras significativas, máx 8 chars
  const words = label.split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  if (words[0].length <= 8) return words[0];
  return words[0].slice(0, 8);
}

export function useHistorialConfig(cliente) {
  const { appSettings } = useApp();

  return useMemo(() => {
    const roadmapPhases = Array.isArray(appSettings?.roadmap_template?.phases) && appSettings.roadmap_template.phases.length
      ? appSettings.roadmap_template.phases
      : FALLBACK_ROADMAP_PHASES;

    // Aplicar phaseNameOverrides del cliente (renombre de fases default)
    const overrides = cliente?.phaseNameOverrides || {};
    const defaults = roadmapPhases.map(p => ({
      ...p,
      label: overrides[p.id] || p.label,
    }));

    // Append fases custom del cliente al final (las que el user agregó para este cliente)
    const customPhases = Array.isArray(cliente?.customPhases) ? cliente.customPhases : [];
    const customResolved = customPhases.map((p, i) => ({
      id: p.id,
      label: p.label,
      color: p.color || '#5B7CF5',
      // siempre van después de las default
      order: 1000 + (p.order ?? i),
    }));

    const merged = [...defaults, ...customResolved];

    const fases = merged
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p, i) => ({
        id: p.id,
        n: i + 1,
        short: shortFromLabel(p.label || p.id),
        label: p.label || p.id,
        color: p.color || '#5B7CF5',
      }));

    const fasesById = Object.fromEntries(fases.map(f => [f.id, f]));
    const fasesByN  = Object.fromEntries(fases.map(f => [f.n, f]));
    const total = fases.length;

    const tiposRaw = Array.isArray(appSettings?.historial_event_types) && appSettings.historial_event_types.length
      ? appSettings.historial_event_types
      : DEFAULT_EVENT_TYPES;
    const tipos = tiposRaw.map(t => ({
      key: t.key, label: t.label || t.key,
      color: t.color || '#5B7CF5', bg: t.bg || '#EEF2FF', dot: t.dot || '•',
    }));
    const tiposByKey = Object.fromEntries(tipos.map(t => [t.key, t]));

    return { fases, fasesById, fasesByN, total, tipos, tiposByKey };
  }, [appSettings?.roadmap_template, appSettings?.historial_event_types, cliente?.customPhases, cliente?.phaseNameOverrides]);
}

// Devuelve el id de la fase del Roadmap correspondiente al cliente.
// Si el cliente ya tiene un id de fase (cliente.phase = 'primera-entrega'), lo usa directo.
// Si tiene un número, lo mapea por orden.
// Si no tiene nada, devuelve la primera fase.
export function getClienteFaseId(cliente, fases) {
  if (!fases?.length) return null;
  const valid = new Set(fases.map(f => f.id));
  if (typeof cliente?.phase === 'string' && valid.has(cliente.phase)) return cliente.phase;
  if (typeof cliente?.fase === 'string' && valid.has(cliente.fase)) return cliente.fase;
  if (typeof cliente?.faseNum === 'number') {
    const f = fases.find(p => p.n === cliente.faseNum);
    if (f) return f.id;
  }
  return fases[0].id;
}
