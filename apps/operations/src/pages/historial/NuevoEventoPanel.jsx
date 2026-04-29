import { useEffect, useState } from 'react';
import { T } from './tokens.js';
import { useViewport } from './useViewport.js';
import { useHistorialConfig } from './useHistorialConfig.js';

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>;
}
function Input({ value, onChange, placeholder, compact, type = 'text' }) {
  return (
    <input type={type} value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: '100%', background: '#fff', border: `1px solid ${T.border}`,
        borderRadius: 8, padding: compact ? '8px 10px' : '10px 12px',
        fontSize: 13, fontFamily: 'inherit', color: T.text, outline: 'none',
        marginBottom: compact ? 8 : 16, transition: 'border 0.12s',
      }}
      onFocus={e => e.target.style.borderColor = T.blue}
      onBlur={e => e.target.style.borderColor = T.border}
    />
  );
}
function Select({ value, onChange, children, compact }) {
  return (
    <select value={value} onChange={e => onChange && onChange(e.target.value)} style={{
      width: '100%', background: '#fff', border: `1px solid ${T.border}`,
      borderRadius: 8, padding: compact ? '8px 10px' : '10px 12px',
      fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none',
      cursor: 'pointer',
    }}>{children}</select>
  );
}

const today = () => new Date().toISOString().slice(0, 10);
const horaAhora = () => {
  const d = new Date();
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

export function NuevoEventoPanel({ open, onClose, onSave, clienteNombre, faseActualClienteId, currentUser, eventoExistente }) {
  const vp = useViewport();
  const { fases, tipos } = useHistorialConfig();
  const isEdit = !!eventoExistente;

  const [tipo, setTipo] = useState(tipos[0]?.key || 'entregable');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fase, setFase] = useState(faseActualClienteId || fases[0]?.id || '');
  const [tiempo, setTiempo] = useState(15);
  const [responsable, setResponsable] = useState('Korex');
  const [incluirResumen, setIncluirResumen] = useState(true);
  const [bloqueoCategoria, setBloqueoCategoria] = useState('Cliente');
  const [bloqueoEsperando, setBloqueoEsperando] = useState('');
  const [bloqueoDias, setBloqueoDias] = useState(0);
  const [links, setLinks] = useState([]); // [{ url, title }]
  const [linkDraft, setLinkDraft] = useState('');

  // Cuando cambia el evento a editar (o se abre para crear), pre-cargar / resetear.
  useEffect(() => {
    if (!open) return;
    if (eventoExistente) {
      setTipo(eventoExistente.tipo || tipos[0]?.key || 'entregable');
      setTitulo(eventoExistente.titulo || '');
      setDescripcion(eventoExistente.descripcion || '');
      setFase(eventoExistente.fase || faseActualClienteId || fases[0]?.id || '');
      setTiempo(Number(eventoExistente.tiempo) || 0);
      setResponsable(eventoExistente.responsable || 'Korex');
      setIncluirResumen(eventoExistente.incluirResumen !== false);
      setBloqueoCategoria(eventoExistente.bloqueo?.categoria || 'Cliente');
      setBloqueoEsperando(eventoExistente.bloqueo?.esperando || '');
      setBloqueoDias(eventoExistente.bloqueo?.diasBloqueo || 0);
      setLinks(Array.isArray(eventoExistente.links) ? eventoExistente.links : []);
      setLinkDraft('');
    } else {
      setTipo(tipos[0]?.key || 'entregable'); setTitulo(''); setDescripcion('');
      setFase(faseActualClienteId || fases[0]?.id || ''); setTiempo(15); setResponsable('Korex');
      setIncluirResumen(true); setBloqueoCategoria('Cliente');
      setBloqueoEsperando(''); setBloqueoDias(0);
      setLinks([]); setLinkDraft('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, eventoExistente?.id]);

  const addLink = () => {
    const url = linkDraft.trim();
    if (!url) return;
    const normalized = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    setLinks(prev => [...prev, { url: normalized }]);
    setLinkDraft('');
  };
  const removeLink = (i) => setLinks(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = () => {
    if (!titulo.trim()) return;
    const baseEvento = {
      tipo, titulo: titulo.trim(), descripcion: descripcion.trim(),
      fase, tiempo: Number(tiempo) || 0, responsable,
      estado: tipo === 'bloqueo' ? 'en-curso' : 'completado',
      links,
      incluirResumen,
    };
    let evento;
    if (isEdit) {
      // En modo edición: conserva id, fecha/hora original y autor original.
      evento = {
        ...baseEvento,
        id: eventoExistente.id,
        fecha: eventoExistente.fecha,
        hora: eventoExistente.hora,
        autor: eventoExistente.autor,
        autorUser: eventoExistente.autorUser,
      };
    } else {
      // En modo creación: setea autor desde currentUser y fecha/hora actual.
      evento = {
        ...baseEvento,
        autor: currentUser?.name || '',
        autorUser: currentUser ? {
          id: currentUser.id,
          name: currentUser.name,
          avatar_url: currentUser.avatar || '',
          color: currentUser.color || '#5B7CF5',
          initials: currentUser.initials || '',
        } : null,
        fecha: today(),
        hora: horaAhora(),
      };
    }
    if (tipo === 'bloqueo') {
      evento.bloqueo = {
        categoria: bloqueoCategoria,
        esperando: bloqueoEsperando.trim() || (bloqueoCategoria === 'Cliente' ? clienteNombre : '—'),
        diasBloqueo: Number(bloqueoDias) || 0,
      };
    }
    onSave && onSave(evento);
    onClose && onClose();
  };

  return (
    <>
      <div onClick={onClose} style={{
        position: 'fixed', inset: 0, background: 'rgba(15,18,28,0.4)',
        zIndex: 50, opacity: open ? 1 : 0, pointerEvents: open ? 'auto' : 'none',
        transition: 'opacity 0.2s', backdropFilter: open ? 'blur(2px)' : 'none',
      }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0,
        width: vp.mobile ? '100vw' : 'min(460px, 95vw)',
        background: '#fff', borderLeft: `1px solid ${T.border}`,
        boxShadow: '-12px 0 32px rgba(0,0,0,0.12)',
        zIndex: 51, transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.28s cubic-bezier(.4,0,.2,1)',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: vp.mobile ? '14px 16px' : '18px 22px', borderBottom: `1px solid ${T.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12,
        }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', color: T.text3, textTransform: 'uppercase' }}>
              {isEdit ? 'Editar evento' : 'Cargar evento'}
            </div>
            <div style={{
              fontSize: vp.mobile ? 16 : 18, fontWeight: 700, color: T.text,
              marginTop: 2, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {isEdit ? 'Editar evento' : 'Nuevo evento'}{clienteNombre ? ` · ${vp.mobile ? clienteNombre.split(' ')[0] : clienteNombre}` : ''}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: T.surface2, border: 'none', cursor: 'pointer',
            color: T.text2, fontSize: 16, padding: 0, width: 36, height: 36,
            borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }} aria-label="Cerrar">✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: vp.mobile ? '16px' : '20px 22px' }}>
          {/* Mostrar quién creó / está creando el evento */}
          {(() => {
            const display = isEdit
              ? (eventoExistente?.autorUser || (eventoExistente?.autor ? { name: eventoExistente.autor } : null))
              : (currentUser ? { ...currentUser, avatar_url: currentUser.avatar } : null);
            if (!display) return null;
            const initials = display.initials
              || (display.name?.split(' ').map(s => s[0]).join('').slice(0, 2).toUpperCase() || '?');
            return (
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 10px', background: T.bg, border: `1px solid ${T.border}`,
                borderRadius: 8, marginBottom: 16,
              }}>
                {display.avatar_url ? (
                  <img src={display.avatar_url} alt={display.name || ''}
                    style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
                ) : (
                  <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: (display.color || '#5B7CF5') + '20',
                    color: display.color || '#5B7CF5',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 9, fontWeight: 700,
                  }}>{initials}</span>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontSize: 11, color: T.text3 }}>{isEdit ? 'Creado por' : 'Lo registra'}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display.name}</div>
                  {isEdit && eventoExistente?.fecha && (
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{eventoExistente.fecha}{eventoExistente.hora ? ` · ${eventoExistente.hora}` : ''}</div>
                  )}
                </div>
              </div>
            );
          })()}

          <Label>Tipo</Label>
          <div style={{ display: 'grid', gridTemplateColumns: vp.mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 18 }}>
            {tipos.map(v => {
              const active = tipo === v.key;
              return (
                <button key={v.key} onClick={() => setTipo(v.key)} style={{
                  background: active ? v.bg : '#fff',
                  border: `1px solid ${active ? v.color : T.border}`,
                  borderRadius: 10, padding: '10px 8px',
                  fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
                  color: active ? v.color : T.text2,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  minHeight: 44, transition: 'all 0.12s',
                }}>
                  <span>{v.dot}</span> {v.label}
                </button>
              );
            })}
          </div>

          <Label>Título corto</Label>
          <Input value={titulo} onChange={setTitulo} placeholder="Ej: Mockup landing v2 entregado" />

          <Label>Descripción · 1-3 líneas</Label>
          <textarea value={descripcion} onChange={e => setDescripcion(e.target.value)} rows={3}
            placeholder="Qué cambió, dónde, qué sigue..."
            style={{
              width: '100%', background: '#fff', border: `1px solid ${T.border}`,
              borderRadius: 8, padding: '10px 12px', fontSize: 13, fontFamily: 'inherit',
              color: T.text, outline: 'none', marginBottom: 16, resize: 'vertical',
              transition: 'border 0.12s',
            }}
            onFocus={e => e.target.style.borderColor = T.blue}
            onBlur={e => e.target.style.borderColor = T.border}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
            <div>
              <Label>Fase</Label>
              <Select value={fase} onChange={setFase}>
                {fases.map(f => <option key={f.id} value={f.id}>{f.n}. {f.label}</option>)}
              </Select>
            </div>
            <div>
              <Label>Espera a</Label>
              <Select value={responsable} onChange={setResponsable}>
                <option>Korex</option>
                <option>Cliente</option>
                <option>Externo</option>
              </Select>
            </div>
          </div>

          <Label>Tiempo invertido (min)</Label>
          <div style={{ display: 'grid', gridTemplateColumns: vp.mobile ? 'repeat(3, 1fr)' : 'repeat(6, 1fr)', gap: 6, marginBottom: 16 }}>
            {[5, 15, 30, 60, 120, 240].map(m => (
              <button key={m} onClick={() => setTiempo(m)} style={{
                background: tiempo === m ? T.blueBg : '#fff',
                border: `1px solid ${tiempo === m ? T.blue : T.border}`,
                color: tiempo === m ? T.blue : T.text2,
                borderRadius: 8, padding: '10px 0', fontSize: 12, fontWeight: 600,
                cursor: 'pointer', fontFamily: 'inherit', minHeight: 40,
              }}>{m}m</button>
            ))}
          </div>

          <Label>Links / adjuntos</Label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={linkDraft}
              onChange={e => setLinkDraft(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink(); } }}
              placeholder="Pegá un link (Loom, Figma, Drive, Notion…)"
              style={{
                flex: 1, background: '#fff', border: `1px solid ${T.border}`,
                borderRadius: 8, padding: '9px 11px', fontSize: 13, fontFamily: 'inherit',
                color: T.text, outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = T.blue}
              onBlur={e => e.target.style.borderColor = T.border}
            />
            <button onClick={addLink} disabled={!linkDraft.trim()} style={{
              background: linkDraft.trim() ? T.blue : T.borderLight, border: 'none', color: '#fff',
              borderRadius: 8, padding: '0 14px', fontSize: 12, fontWeight: 700,
              cursor: linkDraft.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minWidth: 64,
            }}>Agregar</button>
          </div>
          {links.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, marginBottom: 16 }}>
              {links.map((l, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: T.blueBg, color: T.blue,
                  border: `1px solid ${T.blue}25`, borderRadius: 8,
                  padding: '6px 10px', fontSize: 11, fontWeight: 600,
                }}>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>🔗 {l.url}</span>
                  <button onClick={() => removeLink(i)} style={{
                    background: 'transparent', border: 'none', cursor: 'pointer',
                    color: T.blue, fontSize: 14, padding: 0, lineHeight: 1, opacity: 0.6,
                  }} aria-label="Quitar link">✕</button>
                </div>
              ))}
            </div>
          )}
          {links.length === 0 && <div style={{ marginBottom: 16 }} />}

          {tipo === 'bloqueo' && (
            <div style={{
              background: T.redBg, border: `1px solid ${T.red}40`,
              borderLeft: `3px solid ${T.red}`,
              borderRadius: 10, padding: '14px', marginBottom: 16,
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.red, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>
                ⚠ Detalles del bloqueo
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <Select compact value={bloqueoCategoria} onChange={setBloqueoCategoria}>
                  <option>Cliente</option>
                  <option>Korex</option>
                  <option>Externo</option>
                </Select>
                <Input compact value={bloqueoDias} onChange={setBloqueoDias} placeholder="Días bloqueado" />
              </div>
              <Input compact value={bloqueoEsperando} onChange={setBloqueoEsperando} placeholder="Esperando a quién (nombre)" />
            </div>
          )}

          <label style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '12px 14px', background: T.bg,
            border: `1px solid ${T.border}`, borderRadius: 10,
            cursor: 'pointer',
          }}>
            <input type="checkbox" checked={incluirResumen} onChange={e => setIncluirResumen(e.target.checked)} style={{ accentColor: T.blue, width: 16, height: 16 }} />
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>Incluir en resumen semanal</div>
              <div style={{ fontSize: 11, color: T.text3 }}>Aparecerá en el email del cliente</div>
            </div>
          </label>
        </div>

        <div style={{
          padding: vp.mobile ? '12px 16px' : '14px 22px', borderTop: `1px solid ${T.border}`,
          display: 'flex', gap: 8, background: T.bg,
        }}>
          <button onClick={onClose} style={{
            flex: 1, background: '#fff', border: `1px solid ${T.border}`,
            color: T.text2, borderRadius: 10, padding: '12px',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', minHeight: 44,
          }}>Cancelar</button>
          <button onClick={handleSave} disabled={!titulo.trim()} style={{
            flex: 2, background: titulo.trim() ? T.blue : T.borderLight, border: 'none', color: '#fff',
            borderRadius: 10, padding: '12px',
            fontSize: 13, fontWeight: 700, cursor: titulo.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit',
            boxShadow: titulo.trim() ? '0 2px 6px rgba(91,124,245,0.3)' : 'none', minHeight: 44,
          }}>{isEdit ? 'Guardar cambios' : 'Guardar evento'}</button>
        </div>
      </div>
    </>
  );
}
