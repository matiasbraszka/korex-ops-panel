// Campos que NO son de respuesta larga: una línea, número, fecha, opciones,
// chips, confirmación. Sin semáforo y sin micrófono — pedirle a alguien que
// hable para decir "42" sería ridículo, y el ruido visual cansa a las 40
// preguntas.
//
// Todos comparten alto táctil de 56px y 17px de fuente: el onboarding lo
// completa tanto alguien de 25 desde el celular como alguien de 65 desde la
// computadora, y el segundo es el que decide el tamaño.
import { useState } from 'react';
import { IcoCheck, IcoLapiz, IcoInfo } from '../../components/icons';
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

// Un párrafo con ícono, no un recuadro de color. Los recuadros permanentes
// debajo del enunciado compiten con la pregunta y obligan a decidir qué leer
// primero; acá la jerarquía es título → subtítulo → ayuda → campo.
function Ayuda({ texto }) {
  if (!texto) return null;
  return (
    <div style={{
      display: 'flex', gap: 8, marginTop: 12,
      fontSize: F.meta, lineHeight: 1.5, color: TO.meta,
    }}>
      <IcoInfo size={18} stroke={TO.meta} style={{ flex: 'none', marginTop: 1 }} />
      <div>{texto}</div>
    </div>
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

// ─────────────────────────────────────────────────────────────────────────────
// Pantalla de confirmación del tramo 1.
//
// NO pregunta: muestra lo que el sistema ya sabe del cliente (viene de
// crear-venta) y le pide que lo valide. Son dos minutos que en el formulario
// viejo eran diez.
//
// Y si algo está mal, LO CORRIGE ACÁ MISMO. Mandarlo a WhatsApp por un teléfono
// mal tipeado es pedirle que salga de la plataforma, espere una respuesta y
// vuelva — con suerte. Encima ese dato es el que usamos después para escribirle.
//
// Lo que se corrige NO se escribe directo sobre el cliente desde el navegador:
// se guarda como respuesta y el write-back aplica solo los campos seguros. El
// nombre y los datos del contrato quedan para que los mire el equipo — el
// nombre es la llave con la que la plataforma reconoce al cliente, y cambiarlo
// solo lo dejaría afuera de su propio portal.
// ─────────────────────────────────────────────────────────────────────────────
const CAMPOS_CONFIRMAR = [
  { k: 'nombre', label: 'Nombre', tipo: 'text' },
  { k: 'empresa', label: 'Empresa', tipo: 'text' },
  { k: 'email', label: 'Email', tipo: 'email' },
  { k: 'telefono', label: 'Teléfono', tipo: 'tel' },
  { k: 'pais', label: 'País', tipo: 'text' },
  { k: 'contrato', label: 'Datos del contrato', tipo: 'textarea' },
];

// Los que el equipo revisa a mano antes de aplicarlos.
const REVISA_EQUIPO = new Set(['nombre', 'contrato']);

const textoConfirmado = (datos, cambios) => CAMPOS_CONFIRMAR
  .filter((c) => String(datos[c.k] || '').trim())
  .map((c) => `${c.label}: ${String(datos[c.k]).trim()}`)
  .concat(cambios.length ? [`(El cliente corrigió: ${cambios.join(', ')})`] : [])
  .join('\n');

function Confirmar({ q, valor, valorJson, onChange, prefill }) {
  const [editando, setEditando] = useState(null);
  const [borrador, setBorrador] = useState('');

  const guardados = valorJson?.datos || {};
  const datos = CAMPOS_CONFIRMAR.reduce((acc, c) => {
    acc[c.k] = guardados[c.k] ?? prefill[c.k] ?? '';
    return acc;
  }, {});

  const cambiados = CAMPOS_CONFIRMAR
    .filter((c) => String(datos[c.k] || '').trim() !== String(prefill[c.k] || '').trim())
    .map((c) => c.k);

  const confirmado = String(valor || '').trim() !== '';

  const emitir = (proximos, confirmar) => {
    const cambios = CAMPOS_CONFIRMAR
      .filter((c) => String(proximos[c.k] || '').trim() !== String(prefill[c.k] || '').trim())
      .map((c) => c.label.toLowerCase());
    // Mientras no toque "Está todo bien" el value_text queda vacío, así que la
    // pregunta no cuenta como respondida: corregir un campo no es confirmar.
    onChange(
      confirmar || confirmado ? textoConfirmado(proximos, cambios) : '',
      { valorJson: { datos: proximos, cambios, confirmado: !!(confirmar || confirmado) }, inmediato: true },
    );
  };

  const abrir = (k) => { setBorrador(String(datos[k] || '')); setEditando(k); };
  const cerrar = () => { setEditando(null); setBorrador(''); };
  const aplicar = (k) => { emitir({ ...datos, [k]: borrador.trim() }); cerrar(); };
  const restaurar = (k) => { emitir({ ...datos, [k]: prefill[k] ?? '' }); cerrar(); };

  return (
    <div>
      <Etiqueta q={q} />
      <div style={{
        marginTop: 18, borderRadius: 18, background: '#fff',
        border: `1px solid ${TO.line}`, overflow: 'hidden',
      }}>
        {CAMPOS_CONFIRMAR.map((c, i) => {
          const enEdicion = editando === c.k;
          const corregido = cambiados.includes(c.k);
          const valorActual = String(datos[c.k] || '');
          if (!valorActual && !enEdicion && !corregido && !prefill[c.k]) return null;

          return (
            <div key={c.k} style={{
              padding: '15px 17px', borderTop: i ? `1px solid ${TO.line}` : 'none',
              background: enEdicion ? TO.blueWash : corregido ? TO.greenWash : 'transparent',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{ ...label(corregido ? TO.greenInk : TO.meta), flex: 1 }}>
                  {c.label}{corregido && ' · corregido'}
                </span>
                {!enEdicion && (
                  <button type="button" onClick={() => abrir(c.k)} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, flex: 'none',
                    background: 'none', border: `1.5px solid ${TO.lineStrong}`, borderRadius: 999,
                    padding: '7px 13px', cursor: 'pointer', color: TO.blue,
                    fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  }}>
                    <IcoLapiz size={15} stroke={TO.blue} sw={2.2} /> Corregir
                  </button>
                )}
              </div>

              {enEdicion ? (
                <div style={{ marginTop: 10 }}>
                  {c.tipo === 'textarea' ? (
                    <textarea
                      value={borrador} onChange={(e) => setBorrador(e.target.value)}
                      autoFocus rows={3}
                      style={{
                        ...inputStyle(true), height: 'auto', minHeight: 90,
                        padding: '13px 15px', lineHeight: 1.5, resize: 'vertical',
                      }}
                    />
                  ) : (
                    <input
                      type={c.tipo} value={borrador} onChange={(e) => setBorrador(e.target.value)}
                      autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') aplicar(c.k); if (e.key === 'Escape') cerrar(); }}
                      style={inputStyle(true)}
                    />
                  )}

                  {REVISA_EQUIPO.has(c.k) && (
                    <div style={{
                      fontSize: F.meta, lineHeight: 1.5, color: TO.amber, marginTop: 10,
                      padding: '11px 13px', background: TO.amberWash,
                      border: '1px solid #E0A96A', borderRadius: 12,
                    }}>
                      Esto lo revisa una persona del equipo antes de cambiarlo.
                      Escribilo igual y nosotros lo corregimos.
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 9, marginTop: 12, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => aplicar(c.k)} style={{
                      flex: 1, minWidth: 130, height: 48, borderRadius: 999, cursor: 'pointer',
                      border: 'none', background: TO.blueBtn, color: '#fff',
                      fontSize: 15, fontWeight: 800, fontFamily: 'inherit',
                    }}>Guardar</button>
                    <button type="button" onClick={cerrar} style={botonSecundario}>Cancelar</button>
                    {corregido && (
                      <button type="button" onClick={() => restaurar(c.k)} style={botonSecundario}>
                        Volver al original
                      </button>
                    )}
                  </div>
                </div>
              ) : (
                <div style={{
                  fontSize: F.input, fontWeight: 600, color: valorActual ? TO.ink : TO.meta,
                  marginTop: 5, lineHeight: 1.45, whiteSpace: 'pre-wrap',
                }}>
                  {valorActual || 'Sin cargar — tocá "Corregir" y completalo'}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
        <button
          type="button" onClick={() => emitir(datos, true)} aria-pressed={confirmado}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            height: 56, borderRadius: 999, cursor: 'pointer',
            border: `2px solid ${confirmado ? TO.greenInk : TO.lineStrong}`,
            background: confirmado ? TO.greenWash : '#fff',
            color: confirmado ? TO.greenInk : TO.ink, fontSize: F.input, fontWeight: 800,
          }}
        >
          <IcoCheck size={19} stroke={confirmado ? TO.greenInk : TO.body} sw={2.6} />
          {cambiados.length ? 'Listo, ahora está bien' : 'Está todo bien'}
        </button>
        <div style={{ fontSize: F.meta, color: TO.meta, textAlign: 'center', lineHeight: 1.5 }}>
          {cambiados.length
            ? `Guardamos tus correcciones en ${cambiados.length === 1 ? 'un dato' : `${cambiados.length} datos`}.`
            : 'Si algo cambió, tocá "Corregir" en ese dato.'}
        </div>
      </div>
    </div>
  );
}

const botonSecundario = {
  height: 48, borderRadius: 999, padding: '0 18px', cursor: 'pointer',
  border: `1.5px solid ${TO.lineStrong}`, background: '#fff', color: TO.body,
  fontSize: 15, fontWeight: 700, fontFamily: 'inherit', flex: 'none',
};

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

export default function Campo({ q, valor, valorJson, flag, onChange, onVoz, onAudioPendiente,
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
    return (
      <Confirmar
        q={q} valor={valor} valorJson={valorJson} onChange={onChange} prefill={prefill || {}}
      />
    );
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
