export default function TeamAvatar({ member, size = 18, className = '', style = {} }) {
  const s = size;
  const fontSize = s <= 16 ? '7px' : s <= 20 ? '8px' : '10px';

  if (member.avatar) {
    return (
      <img
        src={member.avatar}
        alt={member.name}
        title={member.name}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: s, height: s, ...style }}
      />
    );
  }

  return (
    <span
      className={`rounded-full flex items-center justify-center font-bold shrink-0 ${className}`}
      style={{ width: s, height: s, fontSize, background: member.color + '18', color: member.color, ...style }}
      title={member.name}
    >
      {member.initials}
    </span>
  );
}