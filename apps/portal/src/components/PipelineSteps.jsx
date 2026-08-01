// Barra segmentada del pipeline del embudo: un segmento por paso
// (Estrategia · Avatares · VSL · Anuncios · Landing). Verde = entregado,
// acento = en curso, gris = pendiente. Muestra "todo lo que entregamos".
import { IcoCheck } from './icons';

const colorDe = (estado, acento) =>
  estado === 'listo' ? 'var(--mk-green)'
    : estado === 'en_curso' ? acento
    : 'var(--mk-surface3, #E1E6EF)';

export function PipelineBar({ pasos, acento = 'var(--mk-blue-ops)' }) {
  const steps = Array.isArray(pasos) ? pasos : [];
  if (!steps.length) return null;
  const hechos = steps.filter((p) => p.estado === 'listo').length;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((p, i) => {
          const c = colorDe(p.estado, acento);
          return (
            <div key={i} style={{
              flex: 1, height: 8, borderRadius: 999, background: c,
              boxShadow: p.estado === 'en_curso' ? `0 0 0 2px color-mix(in srgb, ${acento} 30%, transparent)` : 'none',
            }} />
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((p, i) => {
          const activo = p.estado === 'listo' || p.estado === 'en_curso';
          return (
            <div key={i} style={{
              flex: 1, minWidth: 0, textAlign: 'center', fontSize: 8.5, lineHeight: 1.2,
              fontWeight: activo ? 800 : 600, letterSpacing: '0.01em', textTransform: 'uppercase',
              color: p.estado === 'listo' ? 'var(--mk-green)' : p.estado === 'en_curso' ? acento : 'var(--mk-text3)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>{p.label}</div>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: 'var(--mk-text3)', textAlign: 'center' }}>
        {hechos === steps.length
          ? <span style={{ color: 'var(--mk-green)', fontWeight: 700 }}>✓ Todo lo del embudo, entregado</span>
          : <>Entregamos <b style={{ color: 'var(--mk-text-soft)' }}>{hechos} de {steps.length}</b> pasos de tu embudo</>}
      </div>
    </div>
  );
}

export default PipelineBar;
