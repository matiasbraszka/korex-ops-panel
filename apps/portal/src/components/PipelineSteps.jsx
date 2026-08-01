// Barra del pipeline del embudo: un segmento por paso (Estrategia · Avatares ·
// VSL · Anuncios · Landing), pintado por RESPONSABILIDAD:
//   verde = entregado · rojo = tu parte (falta que el cliente entregue) ·
//   gris = lo estamos haciendo nosotros (Korex).
// Así se ve al toque qué frena el embudo y de quién es.

const colorDe = (quien) =>
  quien === 'hecho' ? 'var(--mk-green)'
    : quien === 'cliente' ? 'var(--mk-red)'
    : 'var(--mk-surface3, #D9DEE8)';

// Frase de "tu parte" según el paso, para la línea de estado.
const FRASE_ROJO = {
  anuncios: 'grabar tus anuncios',
  vsl: 'grabar tu VSL',
  landing: 'tus imágenes o branding',
};
const FRASE_KOREX = {
  estrategia: 'la estrategia', avatares: 'los avatares', vsl: 'tu VSL',
  anuncios: 'tus anuncios', landing: 'tu página',
};

export function PipelineBar({ pasos }) {
  const steps = Array.isArray(pasos) ? pasos : [];
  if (!steps.length) return null;
  const rojos = steps.filter((p) => p.quien === 'cliente');
  const enCurso = steps.find((p) => p.estado === 'en_curso');
  const todoHecho = steps.every((p) => p.quien === 'hecho');

  // Línea de estado: primero lo que frena el cliente (rojo), si no lo nuestro.
  let status, statusColor;
  if (rojos.length) {
    status = 'Te frena: ' + rojos.map((p) => FRASE_ROJO[p.key] || 'tu parte').join(' y ');
    statusColor = 'var(--mk-red)';
  } else if (todoHecho) {
    status = 'Todo tu embudo, entregado';
    statusColor = 'var(--mk-green)';
  } else {
    status = 'Estamos con ' + (FRASE_KOREX[enCurso?.key] || 'tu embudo');
    statusColor = 'var(--mk-text-soft)';
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((p, i) => (
          <div key={i} style={{
            flex: 1, height: 9, borderRadius: 999, background: colorDe(p.quien),
            boxShadow: p.estado === 'en_curso' && p.quien !== 'hecho'
              ? `0 0 0 2px color-mix(in srgb, ${colorDe(p.quien)} 32%, transparent)` : 'none',
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 4 }}>
        {steps.map((p, i) => (
          <div key={i} style={{
            flex: 1, minWidth: 0, textAlign: 'center', fontSize: 8.5, lineHeight: 1.2,
            fontWeight: p.quien === 'hecho' ? 800 : 600, letterSpacing: '0.01em', textTransform: 'uppercase',
            color: p.quien === 'hecho' ? 'var(--mk-green)' : p.quien === 'cliente' ? 'var(--mk-red)' : 'var(--mk-text3)',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{p.label}</div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: statusColor }}>
        <span style={{ width: 7, height: 7, borderRadius: 99, background: statusColor, flex: 'none' }} />
        {status}
      </div>
    </div>
  );
}

export default PipelineBar;

// ── Piezas del embudo divididas en sub-fases (VSL/Anuncios/Landing) ──────────
// Cada sub-fase se pinta por responsabilidad: verde=hecho · rojo=tu parte ·
// gris medio=lo hacemos nosotros · gris claro=pendiente. Estrategia y Avatares
// van como chips simples arriba. `compact` oculta los nombres de cada sub-fase.
const colorFase = (estado) =>
  estado === 'hecho' ? 'var(--mk-green)'
    : estado === 'cliente' ? 'var(--mk-red)'
    : estado === 'korex' ? '#9AA3B2'
    : 'var(--mk-surface3, #E4E8EF)';
const textoFase = (estado) =>
  estado === 'hecho' ? 'var(--mk-green)'
    : estado === 'cliente' ? 'var(--mk-red)'
    : estado === 'korex' ? 'var(--mk-text-soft)'
    : 'var(--mk-text3)';

export function EmbudoTracks({ data, compact = false }) {
  if (!data) return null;
  const simples = Array.isArray(data.simples) ? data.simples : [];
  const tracks = Array.isArray(data.tracks) ? data.tracks : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {simples.map((s, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 10.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.05em', color: s.estado === 'hecho' ? 'var(--mk-green)' : 'var(--mk-text3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: s.estado === 'hecho' ? 'var(--mk-green)' : '#9AA3B2' }} />
            {s.label}{s.estado === 'hecho' ? ' ✓' : ''}
          </span>
        ))}
      </div>
      {tracks.map((t, ti) => {
        const fases = Array.isArray(t.fases) ? t.fases : [];
        const actual = fases.find((f) => f.estado === 'cliente' || f.estado === 'korex');
        const done = fases.length > 0 && fases.every((f) => f.estado === 'hecho');
        const cap = done ? { txt: 'Entregado', c: 'var(--mk-green)' }
          : actual ? (actual.estado === 'cliente'
              ? { txt: `${actual.label} · te toca`, c: 'var(--mk-red)' }
              : { txt: `${actual.label} · lo hacemos`, c: 'var(--mk-text-soft)' })
          : null;
        return (
          <div key={ti} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--mk-text-soft)' }}>{t.label}</span>
              {cap && <span style={{ fontSize: 11, fontWeight: 700, color: cap.c }}>{cap.txt}</span>}
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {fases.map((f, i) => <div key={i} style={{ flex: 1, height: 8, borderRadius: 999, background: colorFase(f.estado) }} />)}
            </div>
            {!compact && (
              <div style={{ display: 'flex', gap: 3 }}>
                {fases.map((f, i) => (
                  <div key={i} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 8, lineHeight: 1.2, fontWeight: f.estado === 'pendiente' ? 600 : 800, textTransform: 'uppercase', color: textoFase(f.estado), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.label}</div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
