// Avatar de iniciales (círculo de color). Sin fotos por ahora: recibe
// { nombre, iniciales, color } del backend (_del_grab_responsable).
export default function Avatar({ resp, size = 26, showName = false }) {
  if (!resp) return null;
  const s = {
    width: size, height: size, borderRadius: 999, flexShrink: 0,
    background: resp.color || '#5B7CF5', color: '#fff',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: Math.round(size * 0.4), fontWeight: 800, letterSpacing: '.02em',
  };
  const circle = <span style={s} title={resp.nombre}>{resp.iniciales || '·'}</span>;
  if (!showName) return circle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {circle}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mk-text2)' }}>{resp.nombre}</span>
    </span>
  );
}
