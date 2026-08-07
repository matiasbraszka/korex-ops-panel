// ─────────────────────────────────────────────────────────────────────────────
// Los tipos de campo del onboarding, calcados del HTML.
//
// La jerarquía de una pregunta, de arriba abajo y sin excepciones:
//
//   1. CABECERA        separador con título, solo cuando agrupa varias
//   2. LA PREGUNTA     Montserrat 800, lo único grande de la pantalla
//   3. QUÉ CONTESTAR   sublabel + los chips de "acordate de contar"
//   4. EL EJEMPLO      plegado, cerrado por defecto — es la vara del largo
//   5. EL CAMPO        con el micrófono adentro cuando hay largo que alcanzar
//   6. CÓMO VA         el medidor: una barra fina y una línea de texto
//
// El ejemplo va PLEGADO y nunca como placeholder: puesto como placeholder se
// copia literal y contamina el documento del que sale el VSL.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { T, FUENTE, kicker, input, textarea } from '../tokens';
import { medidor } from '../progreso';
import GrabadorVoz from './GrabadorVoz';
import CampoArchivos from './CampoArchivos';
import { urlEmbed } from '../videoEmbed';

// ── Piezas compartidas ───────────────────────────────────────────────────────

function Cabecera({ q }) {
  if (!q.cabecera) return null;
  return (
    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 22, marginBottom: 16 }}>
      <div style={{
        fontFamily: FUENTE.display, fontSize: 19, fontWeight: 800,
        letterSpacing: '-.02em', marginBottom: 5,
      }}>{q.cabecera}</div>
      {q.cabeceraSub && (
        <div style={{ fontSize: 13, color: T.muted, lineHeight: 1.5 }}>{q.cabeceraSub}</div>
      )}
    </div>
  );
}

function Etiqueta({ q, numero }) {
  if (!q.label) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
        {numero ? (
          <span style={{
            flex: '0 0 auto', minWidth: 28, height: 28, borderRadius: 9,
            background: T.azulWash, color: T.azulTinta, display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', fontFamily: FUENTE.display,
            fontSize: 14, fontWeight: 800, padding: '0 7px',
          }}>{numero}</span>
        ) : null}
        <label htmlFor={q.qkey} style={{
          flex: 1, fontFamily: FUENTE.display, fontSize: 'clamp(18px,3.6vw,22px)',
          fontWeight: 800, letterSpacing: '-.024em', lineHeight: 1.24, color: '#0A0A0A',
        }}>{q.label}</label>
        {!q.requerida && (
          <span style={{ ...kicker(T.faint, 10), letterSpacing: '.07em', flex: '0 0 auto' }}>
            Opcional
          </span>
        )}
      </div>
      {q.sublabel && (
        <div style={{
          fontSize: 13, color: T.muted, marginTop: 7, lineHeight: 1.5,
          paddingLeft: numero ? 37 : 0,
        }}>{q.sublabel}</div>
      )}
    </div>
  );
}

/** Los "acordate de contar": recordatorios, no botones. */
function Chips({ chips }) {
  if (!chips?.length) return null;
  return (
    <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {chips.map((c) => (
        <span key={c} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          background: T.azulWash2, border: `1px solid ${T.azulLinea}`, borderRadius: 999,
          padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: T.azulTinta,
        }}>
          <span style={{ width: 5, height: 5, flex: '0 0 5px', borderRadius: '50%', background: T.azul }} />
          <span>{c}</span>
        </span>
      ))}
    </div>
  );
}

/** El ejemplo: la vara con la que el cliente calibra cuánto escribir. */
function Ejemplo({ q }) {
  const [abierto, setAbierto] = useState(false);
  if (!q.ejemplo || !q.largo) return null;
  return (
    <div style={{
      marginBottom: 14, border: `1px solid ${T.line}`, borderRadius: 14,
      background: '#fff', overflow: 'hidden',
    }}>
      <button type="button" onClick={() => setAbierto((v) => !v)} style={{
        width: '100%', background: 'none', border: 'none', padding: '14px 16px',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
      }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.azul}
             strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" style={{ flex: '0 0 16px' }}>
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
        <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: T.soft }}>
          {abierto ? 'Ocultar el ejemplo' : 'Ver un ejemplo bien contestado'}
        </span>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.faint}
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
             style={{ transition: 'transform .2s', transform: abierto ? 'rotate(180deg)' : 'none' }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {abierto && (
        <div style={{ padding: '0 16px 16px 16px' }}>
          <div style={{
            background: T.bg, borderLeft: `3px solid ${T.azul}`, borderRadius: '0 10px 10px 0',
            padding: '14px 15px', fontSize: 13.5, lineHeight: 1.65, color: T.soft,
            whiteSpace: 'pre-line',
          }}>{q.ejemplo}</div>
          <div style={{ fontSize: 11.5, color: T.faint, marginTop: 9, lineHeight: 1.5 }}>
            Este es el nivel de detalle que nos sirve. No copies el ejemplo: cuenta tu caso así.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tipos ────────────────────────────────────────────────────────────────────

/** Tarjeta informativa: no se responde, explica algo antes de decidir. */
function Info({ q }) {
  return (
    <div style={{ borderRadius: 16, background: T.dark, padding: '20px 22px' }}>
      <div style={{ ...kicker(T.azulClaro, 10.5), marginBottom: 8 }}>{q.infoKicker}</div>
      <div style={{
        fontFamily: FUENTE.display, fontSize: 17, fontWeight: 700, color: '#fff',
        letterSpacing: '-.02em', lineHeight: 1.3, marginBottom: 10,
      }}>{q.infoTitulo}</div>
      <div style={{ fontSize: 13, lineHeight: 1.6, color: T.faint }}>{q.infoCuerpo}</div>
      {q.video && (
        <div style={{ marginTop: 14, borderRadius: 12, overflow: 'hidden', aspectRatio: '16/9' }}>
          <iframe src={urlEmbed(q.video)} title={q.infoTitulo} allowFullScreen
                  style={{ width: '100%', height: '100%', border: 0, display: 'block' }} />
        </div>
      )}
    </div>
  );
}

/** Respuesta larga: textarea con el micrófono adentro y el medidor debajo. */
function Abierta({ q, valor, onChange, onVoz, onAudioPendiente, clientHint }) {
  const ref = useRef(null);
  const len = String(valor || '').trim().length;
  const m = q.largo ? medidor(len, q.largo) : null;
  const hayTexto = len > 0;

  // Crece con el contenido, hasta media pantalla. Más allá de eso el campo se
  // come la pregunta y el cliente pierde de vista qué le preguntamos.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    const tope = Math.round(window.innerHeight * 0.45);
    el.style.height = `${Math.min(el.scrollHeight, tope)}px`;
  }, [valor]);

  return (
    <div>
      <div style={{ position: 'relative' }}>
        <textarea
          id={q.qkey} ref={ref} value={valor || ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder || 'Escribe aquí tu respuesta…'}
          onFocus={(e) => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' })}
          style={{
            ...textarea,
            minHeight: q.minAltura || 120,
            paddingBottom: q.largo ? 62 : 15,
          }}
        />
        {/* El micrófono aparece cuando hay un largo que alcanzar: es el mecanismo
            que resuelve las respuestas de tres líneas, no un adorno. */}
        {q.largo > 0 && q.voz !== false && (
          <GrabadorVoz
            qkey={q.qkey} clientHint={clientHint}
            etiqueta={hayTexto ? 'Seguir hablando' : 'Contéstalo hablando'}
            pista={`unos ${Math.round(q.largo / 14)} s`}
            onTexto={onVoz} onAudioPendiente={onAudioPendiente}
          />
        )}
      </div>
      {m && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
          <div style={{ flex: 1, height: 5, borderRadius: 999, background: T.fill, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, width: m.w, background: m.color,
              transition: 'width .3s ease, background .3s',
            }} />
          </div>
          <div style={{ fontSize: 11.5, fontWeight: 700, color: m.color }}>{m.texto}</div>
        </div>
      )}
    </div>
  );
}

function Corta({ q, valor, onChange, autoFocus }) {
  return (
    <input
      id={q.qkey} value={valor || ''} onChange={(e) => onChange(e.target.value)}
      placeholder={q.placeholder} type="text" inputMode={q.inputMode || 'text'}
      autoFocus={autoFocus} style={input}
    />
  );
}

/**
 * Una sola opción.
 *
 * Guarda la ETIQUETA legible en el texto y el VALOR en el json. El texto es lo
 * que termina en el documento del DEL —"R: Oportunidad de negocio 100%" se lee,
 * "R: op100" no— y el valor es contra lo que se resuelven las condiciones.
 */
function Opcion({ q, valor, valorJson, onChange }) {
  const actual = valorJson?.valor ?? null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      {(q.opciones || []).map((o) => {
        const sel = actual != null ? actual === o.value : valor === o.label;
        return (
          <button
            key={o.value} type="button"
            onClick={() => onChange(o.label, { valorJson: { valor: o.value }, inmediato: true })}
            style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', borderRadius: 14,
              padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 13,
              transition: 'border-color .15s, background .15s',
              border: `1.5px solid ${sel ? T.azul : T.line}`,
              background: sel ? T.azulWash2 : '#fff',
            }}>
            <div style={{
              width: 21, height: 21, flex: '0 0 21px', borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `2px solid ${sel ? T.azul : T.lineFuerte}`,
              background: sel ? T.azul : '#fff',
            }}>
              {sel && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff"
                     strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700, letterSpacing: '-.01em', color: T.ink }}>
                {o.label}
              </div>
              {o.hint && (
                <div style={{ fontSize: 12.5, color: T.muted, marginTop: 3, lineHeight: 1.45 }}>
                  {o.hint}
                </div>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}

/** Varias opciones en pastillas. `maxOpciones` limita cuántas se pueden marcar. */
function Chispas({ q, valor, valorJson, onChange }) {
  const sel = Array.isArray(valorJson?.valores) ? valorJson.valores : [];
  // Una opción con value 'otros' abre un campo libre: las listas cerradas obligan a
  // encajar en una casilla que a veces no es la de esa persona, y eso se le nota al copy.
  const otro = String(valorJson?.otro || '');
  const eligioOtros = sel.includes('otros');

  // El texto de la respuesta es lo que después leen el equipo y los agentes: se arma
  // con las etiquetas elegidas y, si marcó "Otros", con lo que escribió en su lugar.
  const armar = (valores, textoOtro) => (q.opciones || [])
    .filter((o) => valores.includes(o.value))
    .map((o) => (o.value === 'otros' ? String(textoOtro || '').trim() : o.label))
    .filter(Boolean)
    .join(', ');

  const alternar = (v) => {
    let next = sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v];
    // Con tope 1 se comporta como un selector: elegir otra reemplaza.
    if (q.maxOpciones && next.length > q.maxOpciones) next = [v];
    const textoOtro = next.includes('otros') ? otro : '';
    onChange(armar(next, textoOtro), { valorJson: { valores: next, otro: textoOtro }, inmediato: true });
  };
  const escribirOtro = (txt) => {
    onChange(armar(sel, txt), { valorJson: { valores: sel, otro: txt } });
  };

  return (
    <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
      {(q.opciones || []).map((o) => {
        const activa = sel.includes(o.value);
        return (
          <button key={o.value} type="button" onClick={() => alternar(o.value)} style={{
            cursor: 'pointer', borderRadius: 999, padding: '12px 17px', fontSize: 13.5,
            fontWeight: 600, transition: 'all .15s', display: 'flex', alignItems: 'center', gap: 8,
            border: `1.5px solid ${activa ? T.azul : T.line}`,
            background: activa ? T.azul : '#fff',
            color: activa ? '#fff' : T.soft,
          }}>
            {activa && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            )}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
    {eligioOtros && (
      <input
        value={otro}
        onChange={(e) => escribirOtro(e.target.value)}
        placeholder="¿Cuál? Escribilo con tus palabras"
        style={{
          marginTop: 10, width: '100%', boxSizing: 'border-box',
          padding: '13px 15px', fontSize: 14.5, borderRadius: 13,
          border: `1.5px solid ${T.line}`, outline: 'none', color: T.ink, background: '#fff',
        }}
      />
    )}
    </div>
  );
}

/** Presupuesto: el número grande y, debajo, cuánto es por día. */
function Presupuesto({ q, valor, onChange }) {
  const n = parseInt(String(valor || '').replace(/[^0-9]/g, ''), 10);
  const diario = n > 0 ? `${Math.round(n / 30)} USD/día` : '';
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <input
          id={q.qkey} value={valor || ''} inputMode="numeric" placeholder="1500"
          onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
          style={{ ...input, flex: 1, fontSize: 20, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}
        />
        <span style={{ fontSize: 13, fontWeight: 700, color: T.faint }}>USD / mes</span>
      </div>
      {diario && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, background: T.dark,
          borderRadius: 14, padding: '15px 17px', marginTop: 11,
          animation: 'mkpop .25s ease both',
        }}>
          <div style={{
            fontFamily: FUENTE.display, fontSize: 24, fontWeight: 800,
            color: T.azulMarca, letterSpacing: '-.03em',
          }}>{diario}</div>
          <div style={{ flex: 1, fontSize: 12.5, lineHeight: 1.5, color: T.faint }}>
            Saldo diario recomendado. Con esto ya no adivinás cuánto invertir cada día.
          </div>
        </div>
      )}
    </div>
  );
}

// ── Despachador ──────────────────────────────────────────────────────────────

export default function Campo({
  q, valor, valorJson, onChange, onVoz, onAudioPendiente,
  clientHint, bloqueante, autoFocus, numero, extras,
}) {
  if (q.tipo === 'info') {
    return <><Cabecera q={q} /><Info q={q} /></>;
  }

  if (q.tipo === 'archivos' || q.tipo === 'subida') {
    return (
      <>
        <Cabecera q={q} />
        <Etiqueta q={q} numero={numero} />
        <CampoArchivos q={q} bloqueante={bloqueante} />
      </>
    );
  }

  // Agenda y resumen los arma la pantalla, porque necesitan el estado entero
  // del onboarding y no solo el de su campo.
  if (extras?.[q.tipo]) {
    return (
      <>
        <Cabecera q={q} />
        <Etiqueta q={q} numero={numero} />
        {extras[q.tipo](q)}
      </>
    );
  }

  const cuerpo = (() => {
    switch (q.tipo) {
      case 'abierta':
        return (
          <>
            <Abierta
              q={q} valor={valor} onChange={onChange} onVoz={onVoz}
              onAudioPendiente={onAudioPendiente} clientHint={clientHint}
            />
            {/* Una pregunta de texto puede además pedir archivos: alcanza con darle
                una carpeta (bucket_key) desde el constructor. Es lo que hace falta en
                los casos de éxito, donde la captura del antes/después dice más que
                cualquier descripción. Van a la misma carpeta del panel de siempre. */}
            {q.bucket && (
              <div style={{ marginTop: 12 }}>
                <CampoArchivos q={q} bloqueante={bloqueante} compacto />
                {q.archivoHint && (
                  <div style={{ fontSize: 12, color: T.faint, lineHeight: 1.5, marginTop: 7 }}>
                    {q.archivoHint}
                  </div>
                )}
              </div>
            )}
          </>
        );
      case 'opciones':
      case 'si_no':
        return <Opcion q={q} valor={valor} valorJson={valorJson} onChange={onChange} />;
      case 'chips_multi':
        return <Chispas q={q} valor={valor} valorJson={valorJson} onChange={onChange} />;
      case 'presupuesto':
        return <Presupuesto q={q} valor={valor} onChange={onChange} />;
      default:
        return <Corta q={q} valor={valor} onChange={onChange} autoFocus={autoFocus} />;
    }
  })();

  return (
    <>
      <Cabecera q={q} />
      <Etiqueta q={q} numero={numero} />
      <Chips chips={q.chips} />
      <Ejemplo q={q} />
      {cuerpo}
    </>
  );
}

export { Cabecera, Etiqueta, Chips, Ejemplo };
