// Campos que NO son de respuesta larga: una línea, número, fecha, opciones,
// chips, confirmación. Sin semáforo y sin micrófono — pedirle a alguien que
// hable para decir "42" sería ridículo, y el ruido visual cansa a las 40
// preguntas.
//
// Todos comparten alto táctil de 56px y 17px de fuente: el onboarding lo
// completa tanto alguien de 25 desde el celular como alguien de 65 desde la
// computadora, y el segundo es el que decide el tamaño.
import { useState } from 'react';
import { IcoCheck } from '../../components/icons';
import { TO, F, dsp, label } from '../tokens';
import CampoAbierto from './CampoAbierto';
import CampoSubida from './CampoSubida';

const inputStyle = (enfocado) => ({
  width: '100%', height: 56, borderRadius: 14,
  border: `2px solid ${enfocado ? TO.blue : TO.lineStrong}`,
  padding: '0 16px', fontSize: F.input, fontFamily: 'inherit',
  color: TO.body, background: '#fff', outline: 'none', transition: 'border-color .16s',
});

function Etiqueta({ q, chico }) {
  return (
    <>
      <label htmlFor={q.qkey} style={chico
        ? { display: 'block', fontSize: F.qChica, fontWeight: 800, color: TO.ink, lineHeight: 1.3, letterSpacing: '-0.01em' }
        : { ...dsp(F.q, '-0.025em'), display: 'block', lineHeight: 1.22 }}>
        {q.label}
      </label>
      {q.sublabel && (
        <div style={{ fontSize: chico ? F.meta : F.sub, lineHeight: 1.5, color: TO.meta, marginTop: 7 }}>
          {q.sublabel}
        </div>
      )}
    </>
  );
}

function Ayuda({ texto }) {
  if (!texto) return null;
  return (
    <div style={{
      fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 12,
      padding: '13px 15px', background: TO.blueWash,
      borderLeft: `4px solid ${TO.blue}`, borderRadius: '4px 14px 14px 4px',
    }}>{texto}</div>
  );
}

function Opciones({ q, valor, onChange, multi }) {
  const sel = multi
    ? String(valor || '').split(',').map((s) => s.trim()).filter(Boolean)
    : [String(valor || '').trim()];

  const toggle = (v) => {
    if (!multi) return onChange(v);
    const next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    onChange(next.join(', '));
  };

  return (
    <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      {(q.opciones || []).map((o) => {
        const activa = sel.includes(o.value);
        return (
          <button
            key={o.value} type="button" onClick={() => toggle(o.value)}
            aria-pressed={activa}
            style={{
              display: 'flex', alignItems: 'center', gap: 13, textAlign: 'left',
              padding: '17px 16px', borderRadius: 16, cursor: 'pointer', minHeight: 60,
              // La opción elegida se distingue por TRES cosas a la vez (borde,
              // fondo y check), no solo por color: hay clientes que no
              // distinguen bien el azul del gris.
              border: `2px solid ${activa ? TO.blue : TO.lineStrong}`,
              background: activa ? TO.blueWash : '#fff',
              transition: 'all .16s',
            }}
          >
            <span style={{
              width: 26, height: 26, flex: 'none',
              borderRadius: multi ? 8 : '50%',
              border: `2px solid ${activa ? TO.blue : TO.lineStrong}`,
              background: activa ? TO.blue : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {activa && <IcoCheck size={15} stroke="#fff" sw={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: F.input, fontWeight: 700,
                color: activa ? TO.blue : TO.ink, lineHeight: 1.35,
              }}>{o.label}</span>
              {o.hint && (
                <span style={{ display: 'block', fontSize: F.meta, color: TO.meta, marginTop: 4, lineHeight: 1.45 }}>
                  {o.hint}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// Pantalla de confirmación del tramo 1: NO pregunta, muestra lo que el sistema
// ya sabe del cliente (viene de crear-venta) y le pide que lo valide. Son dos
// minutos que en el formulario viejo eran diez.
function Confirmar({ q, valor, onChange, prefill }) {
  const filas = [
    ['Nombre', prefill.nombre],
    ['Empresa', prefill.empresa],
    ['Email', prefill.email],
    ['Teléfono', prefill.telefono],
    ['País', prefill.pais],
    ['Datos del contrato', prefill.contrato],
  ].filter(([, v]) => v);

  const ok = String(valor || '') === 'ok';

  return (
    <div>
      <Etiqueta q={q} />
      <div style={{
        marginTop: 18, borderRadius: 18, background: '#fff',
        border: `1px solid ${TO.line}`, overflow: 'hidden',
      }}>
        {filas.map(([k, v], i) => (
          <div key={k} style={{
            padding: '15px 17px', borderTop: i ? `1px solid ${TO.line}` : 'none',
          }}>
            <div style={label()}>{k}</div>
            <div style={{ fontSize: F.input, fontWeight: 600, color: TO.ink, marginTop: 5, lineHeight: 1.45 }}>
              {v}
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <button type="button" onClick={() => onChange('ok')} aria-pressed={ok} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          height: 56, borderRadius: 999, cursor: 'pointer',
          border: `2px solid ${ok ? TO.greenInk : TO.lineStrong}`,
          background: ok ? TO.greenWash : '#fff',
          color: ok ? TO.greenInk : TO.ink, fontSize: F.input, fontWeight: 800,
        }}>
          <IcoCheck size={19} stroke={ok ? TO.greenInk : TO.body} sw={2.6} />
          Está todo bien
        </button>
        <div style={{ fontSize: F.meta, color: TO.meta, textAlign: 'center', lineHeight: 1.5 }}>
          ¿Hay algo mal? Escribinos por WhatsApp y lo corregimos — así no lo tenés
          que cargar de nuevo.
        </div>
      </div>
    </div>
  );
}

function CampoTexto({ q, valor, onChange, autoFocus, chico }) {
  const [enfocado, setEnfocado] = useState(false);

  const tipoHtml = {
    numero: 'number', fecha: 'date', url: 'url', email: 'email', telefono: 'tel', money: 'text',
  }[q.tipo] || 'text';

  // Las respuestas de una línea que pueden ser varias (competidores, alternativas
  // de dominio) usan textarea para que no haya que meter todo en un renglón.
  const multilinea = q.tipo === 'corta' && (q.ejemplo || '').includes('\n');
  const foco = { onFocus: () => setEnfocado(true), onBlur: () => setEnfocado(false) };

  return (
    <div>
      <Etiqueta q={q} chico={chico} />
      <Ayuda texto={q.ayuda} />
      {multilinea ? (
        <textarea
          id={q.qkey} value={valor || ''} onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus} placeholder={q.placeholder || q.ejemplo} rows={3} {...foco}
          style={{
            ...inputStyle(enfocado), height: 'auto', minHeight: 104,
            padding: '15px 16px', lineHeight: 1.55, resize: 'vertical', marginTop: 14,
          }}
        />
      ) : (
        <input
          id={q.qkey} type={tipoHtml} inputMode={q.tipo === 'numero' ? 'numeric' : undefined}
          value={valor || ''} onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus} placeholder={q.placeholder || q.ejemplo} {...foco}
          style={{ ...inputStyle(enfocado), marginTop: 14 }}
        />
      )}
      {q.ejemplo && !multilinea && q.tipo !== 'fecha' && (
        <div style={{ fontSize: F.meta, color: TO.meta, marginTop: 9, lineHeight: 1.45 }}>
          Por ejemplo: {q.ejemplo}
        </div>
      )}
    </div>
  );
}

export default function Campo({ q, valor, flag, onChange, onVoz, onAudioPendiente,
  clientHint, prefill, autoFocus, chico, bloqueante }) {
  if (q.tipo === 'abierta') {
    return (
      <CampoAbierto
        q={q} valor={valor} flag={flag} onChange={onChange} onVoz={onVoz}
        onAudioPendiente={onAudioPendiente} clientHint={clientHint} autoFocus={autoFocus}
      />
    );
  }

  if (q.tipo === 'subida') return <CampoSubida q={q} bloqueante={bloqueante} />;

  if (q.tipo === 'confirmar') {
    return <Confirmar q={q} valor={valor} onChange={onChange} prefill={prefill || {}} />;
  }

  if (q.tipo === 'opciones' || q.tipo === 'chips_multi') {
    return (
      <div>
        <Etiqueta q={q} chico={chico} />
        <Ayuda texto={q.ayuda} />
        <Opciones q={q} valor={valor} onChange={onChange} multi={q.tipo === 'chips_multi'} />
      </div>
    );
  }

  return (
    <CampoTexto q={q} valor={valor} onChange={onChange} autoFocus={autoFocus} chico={chico} />
  );
}
