import { T } from './tokens.js';
import { useViewport } from './useViewport.js';
import { useHistorialConfig } from './useHistorialConfig.js';

export function EventTypePill({ tipo }) {
  const { tiposByKey } = useHistorialConfig();
  const t = tiposByKey[tipo];
  if (!t) return null;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 999,
      background: t.bg, color: t.color,
      fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap',
      letterSpacing: '0.05em', textTransform: 'uppercase',
      border: `1px solid ${t.color}25`,
    }}>
      <span style={{ fontSize: 9, lineHeight: 1 }}>{t.dot}</span>
      {t.label}
    </span>
  );
}

function AuthorChip({ autorUser, autor }) {
  // Avatar pequeñito + nombre. Si no hay autorUser estructurado, fallback a texto.
  if (autorUser && (autorUser.name || autorUser.avatar_url)) {
    const initials = autorUser.initials
      || (autorUser.name?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?');
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {autorUser.avatar_url ? (
          <img src={autorUser.avatar_url} alt={autorUser.name || ''}
            style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <span style={{
            width: 18, height: 18, borderRadius: '50%',
            background: (autorUser.color || '#5B7CF5') + '20',
            color: autorUser.color || '#5B7CF5',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 8, fontWeight: 700, letterSpacing: '0.03em',
          }}>{initials}</span>
        )}
        <b style={{ color: T.text2, fontWeight: 600 }}>{autorUser.name}</b>
      </span>
    );
  }
  if (autor) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        <span style={{ display: 'inline-block', width: 5, height: 5, borderRadius: '50%', background: T.text3 }} />
        <b style={{ color: T.text2, fontWeight: 600 }}>{autor}</b>
      </span>
    );
  }
  return null;
}

export function EventCard({ event, showFase = true, onClick, onDelete }) {
  const vp = useViewport();
  const { tiposByKey, fasesById } = useHistorialConfig();
  const isBloqueo = event.tipo === 'bloqueo';
  const t = tiposByKey[event.tipo] || tiposByKey.entregable || { color: T.blue, bg: T.blueBg, label: event.tipo, dot: '•' };
  const fase = fasesById[event.fase];
  const links = Array.isArray(event.links) ? event.links : [];

  return (
    <div onClick={onClick} style={{
      background: '#fff',
      border: isBloqueo ? `1px solid ${T.red}` : `1px solid ${T.border}`,
      borderLeft: isBloqueo ? `4px solid ${T.red}` : `4px solid ${t.color}`,
      borderRadius: 10,
      padding: vp.mobile ? '12px 14px' : '13px 16px',
      position: 'relative',
      cursor: onClick ? 'pointer' : 'default',
      transition: 'all 0.12s',
      boxShadow: '0 1px 2px rgba(10,22,40,.03)',
    }}
    onMouseEnter={e => { if (!vp.mobile) { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 12px rgba(10,22,40,.06)'; } }}
    onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 2px rgba(10,22,40,.03)'; }}
    >
      <div style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
        {isBloqueo && event.bloqueo?.diasBloqueo > 0 && (
          <div style={{
            background: T.red, color: '#fff',
            padding: '3px 10px', borderRadius: 999,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.05em',
          }}>{event.bloqueo.diasBloqueo}d</div>
        )}
        {onDelete && (
          <button
            onClick={e => { e.stopPropagation(); onDelete(event); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.text3, fontSize: 14, padding: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={ev => { ev.currentTarget.style.background = T.redBg; ev.currentTarget.style.color = T.red; }}
            onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.text3; }}
            title="Eliminar evento"
            aria-label="Eliminar evento"
          >🗑</button>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <EventTypePill tipo={event.tipo} />
        {showFase && fase && (
          <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>
            FASE {fase.n}{!vp.mobile && ` · ${fase.short.toUpperCase()}`}
          </span>
        )}
        <span style={{ fontSize: 10, color: T.text3 }}>·</span>
        <span style={{ fontSize: 10, color: T.text3 }}>{event.fecha}{!vp.mobile && event.hora ? ` · ${event.hora}` : ''}</span>
      </div>
      <div style={{
        fontSize: vp.mobile ? 13 : 14, fontWeight: 600, color: T.text,
        marginBottom: 6,
        paddingRight: (isBloqueo && event.bloqueo?.diasBloqueo > 0 ? 80 : 36),
        letterSpacing: '-0.005em',
        lineHeight: 1.35,
      }}>{event.titulo}</div>
      {event.descripcion && (
        <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5, marginBottom: 10 }}>
          {event.descripcion}
        </div>
      )}
      {links.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {links.map((l, i) => (
            <a key={i} href={l.url} target="_blank" rel="noreferrer"
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 11, color: T.blue, textDecoration: 'none',
                background: T.blueBg, padding: '4px 9px', borderRadius: 999,
                border: `1px solid ${T.blue}25`, fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: 4,
                maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
              🔗 {l.title || l.url.replace(/^https?:\/\//, '').split('/')[0]}
            </a>
          ))}
        </div>
      )}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: T.text3,
        flexWrap: 'wrap',
      }}>
        <AuthorChip autorUser={event.autorUser} autor={event.autor} />
        {event.responsable && (
          <span>· espera: <span style={{ color: event.responsable === 'Cliente' ? T.orange : T.text2, fontWeight: 600 }}>{event.responsable}</span></span>
        )}
        {typeof event.tiempo === 'number' && event.tiempo > 0 && <span>· {event.tiempo}min</span>}
      </div>
    </div>
  );
}
