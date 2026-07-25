// Campos que NO son de respuesta larga: una línea, número, fecha, opciones,
// chips, confirmación. Sin semáforo y sin micrófono — pedirle a alguien que
// hable para decir "42" sería ridículo, y el ruido visual cansa a las 40
// preguntas.
//
// Todos comparten alto táctil de 52px y 16px de fuente: el onboarding lo
// completa tanto alguien de 25 desde el celular como alguien de 65 desde la
// computadora.
import { T, display } from '../../components/theme';
import { IcoCheck } from '../../components/icons';
import CampoAbierto from './CampoAbierto';
import CampoSubida from './CampoSubida';

const inputStyle = {
  width: '100%', height: 52, borderRadius: 14, border: '1px solid var(--mk-border)',
  boxShadow: 'var(--shadow-sm)', padding: '0 16px', fontSize: 16, fontFamily: 'inherit',
  color: T.text, background: '#fff', outline: 'none',
};

function Etiqueta({ q, chico }) {
  return (
    <>
      <label htmlFor={q.qkey} style={chico
        ? { display: 'block', fontSize: 15.5, fontWeight: 700, color: T.ink, lineHeight: 1.35 }
        : { ...display(21, '-0.025em'), display: 'block', lineHeight: 1.25 }}>
        {q.label}
      </label>
      {q.sublabel && (
        <div style={{ fontSize: chico ? 14 : 15.5, lineHeight: 1.5, color: T.text2, marginTop: 6 }}>
          {q.sublabel}
        </div>
      )}
    </>
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
    <div style={{ display: 'grid', gap: 9, marginTop: 14 }}>
      {(q.opciones || []).map((o) => {
        const activa = sel.includes(o.value);
        return (
          <button
            key={o.value} type="button" onClick={() => toggle(o.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
              padding: '15px 16px', borderRadius: 15, cursor: 'pointer',
              border: `1.5px solid ${activa ? T.primary : T.border}`,
              background: activa ? T.primarySoft : '#fff',
              boxShadow: activa ? 'none' : 'var(--shadow-sm)',
              transition: 'all .16s',
            }}
          >
            <span style={{
              width: 22, height: 22, flex: 'none',
              borderRadius: multi ? 7 : '50%',
              border: `2px solid ${activa ? T.primary : T.borderLight || '#D0D5DD'}`,
              background: activa ? T.primary : '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {activa && <IcoCheck size={13} stroke="#fff" sw={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{
                display: 'block', fontSize: 16, fontWeight: 600,
                color: activa ? T.primaryInk : T.text, lineHeight: 1.35,
              }}>{o.label}</span>
              {o.hint && (
                <span style={{ display: 'block', fontSize: 13.5, color: T.text2, marginTop: 3 }}>
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
        marginTop: 16, borderRadius: 18, background: '#fff',
        boxShadow: 'var(--shadow-md)', overflow: 'hidden',
      }}>
        {filas.map(([k, v], i) => (
          <div key={k} style={{
            padding: '13px 16px', borderTop: i ? '1px solid #EEF0F4' : 'none',
          }}>
            <div style={{
              fontSize: 10.5, fontWeight: 800, letterSpacing: '0.11em',
              textTransform: 'uppercase', color: T.text3,
            }}>{k}</div>
            <div style={{ fontSize: 15.5, color: T.text, marginTop: 3, lineHeight: 1.45 }}>{v}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 9, marginTop: 14 }}>
        <button type="button" onClick={() => onChange('ok')} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
          height: 52, borderRadius: 999, cursor: 'pointer',
          border: `1.5px solid ${ok ? T.green : T.border}`,
          background: ok ? T.greenSoft : '#fff',
          color: ok ? T.green : T.text, fontSize: 15, fontWeight: 700,
        }}>
          <IcoCheck size={17} stroke={ok ? T.green : T.text2} />
          Está todo bien
        </button>
        <div style={{ fontSize: 14, color: T.text2, textAlign: 'center', lineHeight: 1.5 }}>
          ¿Hay algo mal? Escribinos por WhatsApp y lo corregimos — así no lo tenés
          que cargar de nuevo.
        </div>
      </div>
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

  if (q.tipo === 'subida') {
    return <CampoSubida q={q} bloqueante={bloqueante} />;
  }

  if (q.tipo === 'confirmar') {
    return <Confirmar q={q} valor={valor} onChange={onChange} prefill={prefill || {}} />;
  }

  if (q.tipo === 'opciones' || q.tipo === 'chips_multi') {
    return (
      <div>
        <Etiqueta q={q} chico={chico} />
        {q.ayuda && (
          <div style={{
            fontSize: 14.5, lineHeight: 1.5, color: T.textSoft, marginTop: 10,
            padding: '11px 13px', background: T.surface2, borderRadius: 12,
          }}>{q.ayuda}</div>
        )}
        <Opciones q={q} valor={valor} onChange={onChange} multi={q.tipo === 'chips_multi'} />
      </div>
    );
  }

  const tipoHtml = {
    numero: 'number', fecha: 'date', url: 'url', email: 'email', telefono: 'tel', money: 'text',
  }[q.tipo] || 'text';

  // Las respuestas de una línea que pueden ser varias (competidores, alternativas
  // de dominio) usan textarea para que no haya que meter todo en un renglón.
  const multilinea = q.tipo === 'corta' && (q.ejemplo || '').includes('\n');

  return (
    <div>
      <Etiqueta q={q} chico={chico} />
      {q.ayuda && (
        <div style={{
          fontSize: 14.5, lineHeight: 1.5, color: T.textSoft, marginTop: 10,
          padding: '11px 13px', background: T.surface2, borderRadius: 12,
        }}>{q.ayuda}</div>
      )}
      {multilinea ? (
        <textarea
          id={q.qkey} value={valor || ''} onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus} placeholder={q.placeholder || q.ejemplo}
          rows={3}
          style={{ ...inputStyle, height: 'auto', minHeight: 92, padding: '14px 16px', lineHeight: 1.55, resize: 'vertical' }}
        />
      ) : (
        <input
          id={q.qkey} type={tipoHtml} inputMode={q.tipo === 'numero' ? 'numeric' : undefined}
          value={valor || ''} onChange={(e) => onChange(e.target.value)}
          autoFocus={autoFocus} placeholder={q.placeholder || q.ejemplo}
          style={{ ...inputStyle, marginTop: 12 }}
        />
      )}
      {q.ejemplo && !multilinea && q.tipo !== 'fecha' && (
        <div style={{ fontSize: 13.5, color: T.text3, marginTop: 8, lineHeight: 1.45 }}>
          Por ejemplo: {q.ejemplo}
        </div>
      )}
    </div>
  );
}
