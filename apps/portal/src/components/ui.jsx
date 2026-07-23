import { useCallback, useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

// Hook chico para cargar datos async con estados loading/error/reload.
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const run = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ loading: false, data, error: null });
    } catch (error) {
      setState({ loading: false, data: null, error });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { run(); }, [run]);
  return { ...state, reload: run, setData: (data) => setState((s) => ({ ...s, data })) };
}

export function Spinner({ size = 22, color = '#5B7CF5' }) {
  return <Loader2 size={size} color={color} className="mk-spin" />;
}

export function Loading({ label = 'Cargando…' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '48px 20px', color: '#9CA3AF' }}>
      <Spinner />
      <span style={{ fontSize: 14 }}>{label}</span>
    </div>
  );
}

// Contenedor de scroll de cada pantalla (padding + espacio para la nav inferior).
export function Screen({ children, style }) {
  return <div style={{ padding: '20px 18px 8px', ...style }}>{children}</div>;
}

export function Card({ children, onClick, style }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#FFFFFF', border: '1px solid #E2E5EB', borderRadius: 16,
        boxShadow: '0 1px 2px rgba(10,22,40,.04)', cursor: onClick ? 'pointer' : 'default',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Progress({ value = 0, color = '#22C55E', height = 10 }) {
  return (
    <div style={{ height, borderRadius: 999, background: '#F0F2F5', overflow: 'hidden' }}>
      <div style={{ height: '100%', borderRadius: 999, background: color, width: `${Math.max(0, Math.min(100, value))}%`, transition: 'width .3s ease' }} />
    </div>
  );
}

export function Badge({ children, bg = '#EEF2FF', color = '#2E69E0' }) {
  return (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', padding: '3px 9px', borderRadius: 999, background: bg, color }}>
      {children}
    </span>
  );
}

export function SectionLabel({ children, color = '#9CA3AF' }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color, margin: '0 2px 12px' }}>
      {children}
    </div>
  );
}

export function DemoBanner() {
  return (
    <div style={{ margin: '0 0 16px', padding: '9px 14px', borderRadius: 12, background: '#FEFCE8', border: '1px solid #FDE68A', color: '#92400E', fontSize: 12.5, fontWeight: 600, textAlign: 'center' }}>
      Modo demo · datos de ejemplo (backend/RPCs aún no conectadas)
    </div>
  );
}
