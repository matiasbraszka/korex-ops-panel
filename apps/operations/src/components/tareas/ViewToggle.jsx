// Barra de pestañas de la sección Tareas (diseño Claude). Pills en contenedor
// gris; activa = fondo blanco + sombra + texto oscuro + ícono azul.

const ICONS = {
  rendimiento: <><path d="M3 3v18h18" /><rect x="7" y="11" width="3" height="6" rx="1" /><rect x="12" y="7" width="3" height="10" rx="1" /><rect x="17" y="13" width="3" height="4" rx="1" /></>,
  objetivos: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4" /></>,
  sprint: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16M15 4v16" /></>,
  calendario: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></>,
  todo: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
};

const LEGACY_VIEWS = [
  { id: 'roadmap', label: 'Roadmap', icon: 'objetivos' },
  { id: 'timeline', label: 'Timeline', icon: 'rendimiento' },
  { id: 'lista', label: 'Lista', icon: 'todo' },
  { id: 'mi-semana', label: 'To-Do List', icon: 'todo' },
];

export default function ViewToggle({ value, onChange, views = LEGACY_VIEWS }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, background: '#F0F2F5', borderRadius: 10, padding: 3, width: 'fit-content' }}>
      {views.map(v => {
        const active = value === v.id;
        return (
          <span
            key={v.id}
            onClick={() => onChange(v.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 600,
              color: active ? '#1A1D26' : '#6B7280',
              background: active ? '#FFFFFF' : 'transparent',
              boxShadow: active ? '0 1px 2px rgba(10,22,40,.06)' : 'none',
              borderRadius: 8, padding: '6px 13px', cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={active ? '#5B7CF5' : '#9CA3AF'} strokeWidth="1.85">
              {ICONS[v.icon || v.id]}
            </svg>
            {v.label}
          </span>
        );
      })}
    </div>
  );
}
