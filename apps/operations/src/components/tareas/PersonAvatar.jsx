// Avatar de una persona: muestra la FOTO real si el miembro tiene una cargada
// (team_members.avatar_url → member.avatar). Si no hay foto, o si la imagen falla
// al cargar, cae al círculo con iniciales y el color de la persona. `member` = el
// objeto de team_members ({ name, avatar, color, initials }); `name` = texto de
// respaldo cuando el nombre no se pudo resolver a un miembro. `ring` = color de un
// aro alrededor (se usa para marcar al revisor).
export default function PersonAvatar({ member, name, size = 24, ring, title }) {
  const display = member?.name || name || '';
  const label = (member?.initials || display.slice(0, 2) || '?').toUpperCase();
  const color = member?.color || '#9CA3AF';
  const photo = member?.avatar || null;
  return (
    <span
      title={title || display || undefined}
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%',
        background: color, color: '#fff', display: 'inline-flex', alignItems: 'center',
        justifyContent: 'center', fontSize: Math.round(size * 0.42), fontWeight: 600,
        overflow: 'hidden', flexShrink: 0, border: '1.5px solid #fff',
        boxShadow: ring ? `0 0 0 1.5px ${ring}` : 'none',
      }}
    >
      {label}
      {photo && (
        // La foto se superpone a las iniciales; si el enlace falla, se oculta y
        // vuelven a verse las iniciales (fallback sin estado).
        <img
          src={photo}
          alt=""
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
      )}
    </span>
  );
}
