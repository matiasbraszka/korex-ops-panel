// Avatar de una persona: la FOTO si la tiene cargada, y si no el círculo de
// iniciales con su color. Recibe { nombre, iniciales, color, foto } del backend
// (_del_grab_responsable para quién graba; portal_cliente_documento para el equipo
// que hizo una auditoría). Los responsables de grabación no traen foto: ahí sigue
// viéndose igual que siempre.
export default function Avatar({ resp, size = 26, showName = false }) {
  if (!resp) return null;
  const s = {
    position: 'relative', width: size, height: size, borderRadius: 999, flexShrink: 0,
    background: resp.color || '#5B7CF5', color: '#fff', overflow: 'hidden',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontSize: Math.round(size * 0.4), fontWeight: 800, letterSpacing: '.02em',
  };
  const circle = (
    <span style={s} title={resp.nombre}>
      {resp.iniciales || '·'}
      {resp.foto && (
        // La foto tapa las iniciales. Si el enlace falla se esconde sola y vuelven
        // a verse: un respaldo sin estado ni pantalla en blanco.
        <img
          src={resp.foto}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </span>
  );
  if (!showName) return circle;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
      {circle}
      <span style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--mk-text2)' }}>{resp.nombre}</span>
    </span>
  );
}
