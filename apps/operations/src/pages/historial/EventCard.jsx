import { useState } from 'react';
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

function CallBody({ llamada }) {
  const proximos = Array.isArray(llamada?.proximos_pasos) ? llamada.proximos_pasos : [];
  const problemas = Array.isArray(llamada?.problemas_detectados) ? llamada.problemas_detectados : [];
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
      {llamada?.resumen && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Resumen</div>
          <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{llamada.resumen}</div>
        </div>
      )}
      {llamada?.notas_clave && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Notas clave</div>
          <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{llamada.notas_clave}</div>
        </div>
      )}
      {proximos.length > 0 && (
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Próximos pasos</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 5 }}>
            {proximos.map((p, i) => {
              const accion = typeof p === 'string' ? p : (p.accion || p.texto || p.text || '');
              const responsable = typeof p === 'object' ? (p.responsable || '') : '';
              const plazo = typeof p === 'object' ? (p.plazo || '') : '';
              if (!accion) return null;
              return (
                <li key={i} style={{ fontSize: 12, color: T.text2, paddingLeft: 14, position: 'relative', lineHeight: 1.45 }}>
                  <span style={{ position: 'absolute', left: 0, color: T.blue }}>→</span>
                  <span>{accion}</span>
                  {(responsable || plazo) && (
                    <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>
                      {responsable && <span>· {responsable}</span>}
                      {plazo && <span> · {plazo}</span>}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {problemas.length > 0 && (
        <div>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>Problemas detectados</div>
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {problemas.map((p, i) => {
              const texto = typeof p === 'string' ? p : (p.text || p.texto || p.accion || '');
              if (!texto) return null;
              return (
                <li key={i} style={{ fontSize: 12, color: T.text2, paddingLeft: 14, position: 'relative', lineHeight: 1.5 }}>
                  <span style={{ position: 'absolute', left: 0, color: T.red }}>⚠</span>
                  {texto}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function TiempoInline({ value, onChange }) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value || 0);
  if (editing) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
        ·
        <input
          type="number" min={0} value={v}
          autoFocus
          onChange={e => setV(Number(e.target.value) || 0)}
          onBlur={() => { onChange(v); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { onChange(v); setEditing(false); } if (e.key === 'Escape') { setV(value || 0); setEditing(false); } }}
          style={{ width: 50, fontSize: 11, padding: '1px 4px', border: `1px solid ${T.blue}`, borderRadius: 4, outline: 'none' }}
        />
        min
      </span>
    );
  }
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setEditing(true); setV(value || 0); }}
      style={{ cursor: 'pointer', borderBottom: '1px dashed transparent', transition: 'border-color 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.borderBottomColor = T.text3; }}
      onMouseLeave={e => { e.currentTarget.style.borderBottomColor = 'transparent'; }}
      title="Click para editar tiempo"
    >
      · {value || 0}min
    </span>
  );
}

export function EventCard({ cliente, event, showFase = true, onClick, onDelete, onEdit, onUpdateTiempo }) {
  const vp = useViewport();
  const { tiposByKey, fasesById } = useHistorialConfig(cliente);
  const isBloqueo = event.tipo === 'bloqueo';
  const isLlamada = event.tipo === 'llamada' && event.__synthetic;
  const [expanded, setExpanded] = useState(false);
  const t = tiposByKey[event.tipo] || tiposByKey.entregable || { color: T.blue, bg: T.blueBg, label: event.tipo, dot: '•' };
  const fase = fasesById[event.fase];
  const links = Array.isArray(event.links) ? event.links : [];
  const canEditTiempo = !event.__synthetic && typeof onUpdateTiempo === 'function';

  return (
    <div
      onClick={isLlamada ? () => setExpanded(x => !x) : onClick}
      style={{
        background: '#fff',
        border: isBloqueo ? `1px solid ${T.red}` : `1px solid ${T.border}`,
        borderLeft: isBloqueo ? `4px solid ${T.red}` : `4px solid ${t.color}`,
        borderRadius: 10,
        padding: vp.mobile ? '12px 14px' : '13px 16px',
        position: 'relative',
        cursor: (onClick || isLlamada) ? 'pointer' : 'default',
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
        {isLlamada && (
          <span style={{ fontSize: 14, color: T.text3, transition: 'transform 0.15s', transform: expanded ? 'rotate(180deg)' : 'none', userSelect: 'none' }}>▾</span>
        )}
        {!isLlamada && onEdit && (
          <button
            onClick={e => { e.stopPropagation(); onEdit(event); }}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              width: 28, height: 28, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: T.text3, fontSize: 13, padding: 0,
              transition: 'all 0.12s',
            }}
            onMouseEnter={ev => { ev.currentTarget.style.background = T.blueBg; ev.currentTarget.style.color = T.blue; }}
            onMouseLeave={ev => { ev.currentTarget.style.background = 'transparent'; ev.currentTarget.style.color = T.text3; }}
            title="Editar evento"
            aria-label="Editar evento"
          >✎</button>
        )}
        {!isLlamada && onDelete && (
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
        paddingRight: (isBloqueo && event.bloqueo?.diasBloqueo > 0 ? 110 : 70),
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
        {!isLlamada && <AuthorChip autorUser={event.autorUser} autor={event.autor} />}
        {!isLlamada && event.responsable && (
          <span>· espera: <span style={{ color: event.responsable === 'Cliente' ? T.orange : T.text2, fontWeight: 600 }}>{event.responsable}</span></span>
        )}
        {isLlamada && event.hora && <span>{event.hora}</span>}
        {isLlamada
          ? (event.tiempo > 0 && <span>· {event.tiempo}min</span>)
          : canEditTiempo
            ? <TiempoInline value={event.tiempo} onChange={(v) => onUpdateTiempo(event.id, v)} />
            : (typeof event.tiempo === 'number' && event.tiempo > 0 && <span>· {event.tiempo}min</span>)
        }
      </div>
      {isLlamada && expanded && <CallBody llamada={event.__llamada} />}
    </div>
  );
}
