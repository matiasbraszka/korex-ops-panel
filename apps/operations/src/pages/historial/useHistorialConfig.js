// Hook que expone la configuración del Historial (fases + tipos de evento)
// leída desde app_settings (vía AppContext). Cae a defaults defensivos si la
// migración aún no se corrió.
import { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DEFAULT_FASES, DEFAULT_EVENT_TYPES } from './tokens.js';

export function useHistorialConfig() {
  const { appSettings } = useApp();

  return useMemo(() => {
    const fasesRaw = Array.isArray(appSettings?.historial_fases) && appSettings.historial_fases.length
      ? appSettings.historial_fases
      : DEFAULT_FASES;
    const tiposRaw = Array.isArray(appSettings?.historial_event_types) && appSettings.historial_event_types.length
      ? appSettings.historial_event_types
      : DEFAULT_EVENT_TYPES;

    // Ordeno fases por número, garantizo campos mínimos.
    const fases = [...fasesRaw]
      .map((f, i) => ({ n: Number(f.n) || (i + 1), short: f.short || '', label: f.label || '', color: f.color || '#5B7CF5' }))
      .sort((a, b) => a.n - b.n);

    const tipos = tiposRaw.map(t => ({
      key: t.key, label: t.label || t.key,
      color: t.color || '#5B7CF5', bg: t.bg || '#EEF2FF', dot: t.dot || '•',
    }));
    const tiposByKey = Object.fromEntries(tipos.map(t => [t.key, t]));

    const total = fases.length;
    const fasesByN = Object.fromEntries(fases.map(f => [f.n, f]));

    return { fases, fasesByN, total, tipos, tiposByKey };
  }, [appSettings?.historial_fases, appSettings?.historial_event_types]);
}

// Mapea la fase legacy del cliente (string como 'pre-onboarding', etc.) al
// número 1..N del Historial. Convención mantenida desde la implementación
// frontend inicial.
export function mapFaseLegacyToNum(faseLegacy, total = 11) {
  const map = {
    'pre-onboarding': 1,
    'onboarding': 2,
    'primera-entrega': 5,
    'lanzamiento': 8,
    'auditoria': 10,
    'escalado': 11,
  };
  if (typeof faseLegacy === 'number') return Math.max(1, Math.min(total, faseLegacy));
  return map[faseLegacy] || 1;
}
