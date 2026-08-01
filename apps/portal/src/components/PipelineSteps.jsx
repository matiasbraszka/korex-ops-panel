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
