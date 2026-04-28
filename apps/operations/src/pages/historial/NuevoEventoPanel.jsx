import { useState } from 'react';
import { T, KOREX_FASES, EVENT_TYPES } from './tokens.js';
import { useViewport } from './useViewport.js';

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 6 }}>{children}</div>;
}
function Input({ value, onChange, placeholder, compact }) {
  return (
    <input value={value || ''} onChange={e => onChange && onChange(e.target.value)} placeholder={placeholder}
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

export function NuevoEventoPanel({ open, onClose, onSave, clienteNombre, faseActualCliente = 1 }) {
  const vp = useViewport();
  const [tipo, setTipo] = useState('entregable');
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const [fase, setFase] = useState(faseActualCliente);
  const [tiempo, setTiempo] = useState(15);
  const [responsable, setResponsable] = useState('Korex');
  const [incluirResumen, setIncluirResumen] = useState(true);
  const [bloqueoCategoria, setBloqueoCategoria] = useState('Cliente');
  const [bloqueoEsperando, setBloqueoEsperando] = useState('');
  const [bloqueoDias, setBloqueoDias] = useState(0);
  const [autor, setAutor] = useState('');

  const reset = () => {
    setTipo('entregable'); setTitulo(''); setDescripcion('');
    setFase(faseActualCliente); setTiempo(15); setResponsable('Korex');
    setIncluirResumen(true); setBloqueoCategoria('Cliente');
    setBloqueoEsperando(''); setBloqueoDias(0); setAutor('');
  };

  const handleSave = () => {
    if (!titulo.trim()) return;
    const evento = {
      tipo, titulo: titulo.trim(), descripcion: descripcion.trim(),
      fase: Number(fase), tiempo: Number(tiempo) || 0, responsable,
      autor: autor.trim() || 'Equipo Korex',
      fecha: today(), hora: horaAhora(),
      estado: tipo === 'bloqueo' ? 'en-curso' : 'completado',
      adjuntos: 0,
      incluirResumen,
    };
    if (tipo === 'bloqueo') {
      evento.bloqueo = {
        categoria: bloqueoCategoria,
        esperando: bloqueoEsperando.trim() || (bloqueoCategoria === 'Cliente' ? clienteNombre : '—'),
        diasBloqueo: Number(bloqueoDias) || 0,
      };
    }
    onSave && onSave(evento);
    reset();
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
              Cargar evento
            </div>
            <div style={{
              fontSize: vp.mobile ? 16 : 18, fontWeight: 700, color: T.text,
              marginTop: 2, letterSpacing: '-0.01em',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              Nuevo evento{clienteNombre ? ` · ${vp.mobile ? clienteNombre.split(' ')[0] : clienteNombre}` : ''}
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
          <Label>Tipo</Label>
          <div style={{ display: 'grid', gridTemplateColumns: vp.mobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(120px, 1fr))', gap: 6, marginBottom: 18 }}>
            {Object.entries(EVENT_TYPES).map(([k, v]) => {
              const active = tipo === k;
              return (
                <button key={k} onClick={() => setTipo(k)} style={{
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
              <Select value={fase} onChange={v => setFase(+v)}>
                {KOREX_FASES.map(f => <option key={f.n} value={f.n}>{f.n}. {f.label}</option>)}
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

          <Label>Autor (quién registra)</Label>
          <Input value={autor} onChange={setAutor} placeholder="Tu nombre o equipo" />

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
          }}>Guardar evento</button>
        </div>
      </div>
    </>
  );
}
