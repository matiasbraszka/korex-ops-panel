// ─────────────────────────────────────────────────────────────────────────────
// La pregunta abierta: el componente que decide si el onboarding sirve o no.
//
// JERARQUÍA. Antes esta pantalla tenía seis cosas tocables (tres chips, el
// ejemplo, el micrófono, siguiente) y dos recuadros de color. Todo pesaba igual,
// así que nada pesaba. Ahora hay UN nivel por función:
//
//   1. LA PREGUNTA        título grande, es lo único grande de la pantalla
//   2. QUÉ CONTESTAR      subtítulo + una línea de "acordate de contar"
//   3. DONDE SE CONTESTA   el campo, con el micrófono como alternativa
//   4. CÓMO VA            una línea de estado, sin recuadro
//   5. SI NO SABÉS        un solo enlace de texto que abre la ayuda y el ejemplo
//
// Los chips dejaron de ser botones y pasaron a ser una línea de texto: eran tres
// blancos táctiles compitiendo con el campo para una función que es puramente
// informativa (acordarse de qué contar). La información queda; la interacción se
// va.
//
// La ayuda y el ejemplo salieron de la pantalla y viven en una hoja detrás de
// "¿Cómo respondo esto?". Dos recuadros de color permanentes debajo del
// enunciado obligaban al cliente a decidir qué leer primero.
//
// Tres decisiones que NO cambiaron:
//
//  · EL SEMÁFORO NO CUENTA CARACTERES. Dice "te falta como medio minuto
//    hablando". Nadie sabe cuánto es 1.200 caracteres; todo el mundo sabe
//    cuánto es medio minuto.
//
//  · EL EJEMPLO TIENE LA LONGITUD OBJETIVO. Es la vara real: el cliente no
//    calibra contra un número, calibra contra lo que ve. Nunca va como
//    placeholder — se copia literal y contamina el documento del cerebro.
//
//  · ÁMBAR, NUNCA ROJO. Rojo es "está mal"; ámbar es "falta".
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { IcoCheck, IcoInfo } from '../../components/icons';
import { TO, F, dsp, btn } from '../tokens';
import { segundosDeVoz, textoDuracion } from '../progreso';
import GrabadorVoz from './GrabadorVoz';
import Hoja, { BloqueHoja } from './Hoja';

/** Una línea de estado, sin recuadro: la barra es fina y el texto manda. */
function Semaforo({ len, minChars }) {
  if (!minChars) return null;
  const pct = Math.min(100, (len / minChars) * 100);
  const faltanSeg = segundosDeVoz(minChars - len);

  let barra = TO.lineStrong;
  let tinta = TO.meta;
  let texto = 'Contalo con calma. Lo mejor sale hablando.';
  let listo = false;
  if (len === 0) {
    // deja el default
  } else if (pct >= 160) {
    barra = 'var(--mk-green)'; tinta = TO.greenInk; listo = true;
    texto = 'Excelente. Esto nos sirve muchísimo.';
  } else if (pct >= 100) {
    barra = 'var(--mk-green)'; tinta = TO.greenInk; listo = true;
    texto = 'Perfecto, con esto trabajamos.';
  } else if (pct >= 45) {
    barra = 'var(--mk-orange)'; tinta = TO.amber;
    texto = 'Vas bien. Un poquito más y queda perfecto.';
  } else {
    barra = 'var(--mk-orange)'; tinta = TO.amber;
    texto = `Te falta como ${textoDuracion(faltanSeg)} hablando.`;
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ height: 6, borderRadius: 999, background: TO.fill, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999, background: barra,
          width: `${Math.min(100, pct)}%`, transition: 'width .3s ease, background .3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7, marginTop: 9,
        fontSize: F.meta, lineHeight: 1.45, color: tinta, fontWeight: 600,
      }}>
        {listo && (
          <span style={{
            display: 'inline-flex', width: 20, height: 20, borderRadius: '50%',
            background: TO.greenInk,
            alignItems: 'center', justifyContent: 'center', animation: 'kxPop .4s ease', flex: 'none',
          }}>
            <IcoCheck size={12} stroke="#fff" sw={3} />
          </span>
        )}
        <span>{texto}</span>
      </div>
    </div>
  );
}

export default function CampoAbierto({ q, valor, flag, onChange, onVoz, onAudioPendiente, clientHint, autoFocus }) {
  const [verAyuda, setVerAyuda] = useState(false);
  const [enfocado, setEnfocado] = useState(false);
  const ref = useRef(null);

  const len = String(valor || '').trim().length;
  const chips = q.chips || [];
  const hayAyuda = !!(q.ayuda || q.ejemplo);

  // El teclado del celular tapa el campo si no lo centramos al enfocar.
  const enfocar = () => {
    setEnfocado(true);
    setTimeout(() => ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 250);
  };

  // Crece con el contenido hasta 45vh; más que eso y se pierde el contexto.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, Math.round(window.innerHeight * 0.45))}px`;
  }, [valor]);

  return (
    <div>
      {/* 1 · LA PREGUNTA ─ lo único grande de la pantalla */}
      <label htmlFor={q.qkey} style={{ ...dsp(F.q, '-0.025em'), display: 'block', lineHeight: 1.22 }}>
        {q.label}
      </label>

      {/* 2 · QUÉ CONTESTAR ─ un párrafo y una línea. Sin recuadros. */}
      {q.sublabel && (
        <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 10 }}>
          {q.sublabel}
        </div>
      )}

      {chips.length > 0 && (
        <div style={{
          display: 'flex', gap: 8, marginTop: 12,
          fontSize: F.meta, lineHeight: 1.5, color: TO.meta,
        }}>
          <IcoInfo size={18} stroke={TO.meta} style={{ flex: 'none', marginTop: 1 }} />
          <div>
            <span style={{ fontWeight: 700, color: TO.body }}>Acordate de contar: </span>
            {chips.join(' · ')}
          </div>
        </div>
      )}

      {/* 3 · DÓNDE SE CONTESTA */}
      <textarea
        id={q.qkey} ref={ref} value={valor || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={enfocar}
        onBlur={() => setEnfocado(false)}
        autoFocus={autoFocus}
        placeholder={q.placeholder || 'Escribí acá, o tocá el micrófono y contalo hablando…'}
        style={{
          width: '100%', marginTop: 18, minHeight: 150, resize: 'none',
          // Borde de 2px y color visible: con el hairline de #E2E5EB del portal,
          // en un celular al sol, no se distingue dónde empieza el campo.
          border: `2px solid ${enfocado ? TO.blue : TO.lineStrong}`,
          borderRadius: 16, padding: '15px 16px',
          fontSize: F.input, lineHeight: 1.62, fontFamily: 'inherit', color: TO.body,
          outline: 'none', background: '#fff', transition: 'border-color .16s',
        }}
      />

      {/* 4 · CÓMO VA */}
      <Semaforo len={len} minChars={q.minChars} />

      {flag === 'audio_pendiente' && (
        <div style={{
          marginTop: 10, fontSize: F.meta, lineHeight: 1.5, color: TO.amber, fontWeight: 600,
        }}>
          Nos quedamos con tu audio. Lo pasamos a texto nosotros — no hace falta que lo repitas.
        </div>
      )}

      {/* El micrófono queda a lo ancho porque es el mecanismo que resuelve el
          problema real (respuestas de tres líneas), pero va DELINEADO y no
          relleno: el botón relleno de la pantalla es "Siguiente". Dos botones
          azules macizos discutiendo cuál es el principal es justo lo que hacía
          que ninguno lo pareciera. */}
      {q.voz !== false && (
        <div style={{ marginTop: 20 }}>
          <GrabadorVoz
            qkey={q.qkey}
            clientHint={clientHint}
            variante="delineado"
            onTexto={(texto, meta) => onVoz(texto, meta)}
            onAudioPendiente={(path, meta) => onAudioPendiente(path, meta)}
          />
        </div>
      )}

      {/* 5 · SI NO SABÉS ─ un solo enlace, no dos cajas */}
      {hayAyuda && (
        <button type="button" onClick={() => setVerAyuda(true)} style={{
          display: 'block', width: '100%', marginTop: 16, background: 'none', border: 'none',
          padding: '10px 0', cursor: 'pointer', fontFamily: 'inherit',
          fontSize: F.meta, fontWeight: 700, color: TO.blue,
          textDecoration: 'underline', textUnderlineOffset: 4,
        }}>
          ¿Cómo respondo esto?
        </button>
      )}

      {verAyuda && (
        <Hoja
          titulo="¿Cómo respondo esto?"
          onCerrar={() => setVerAyuda(false)}
          pie={(
            <button type="button" onClick={() => setVerAyuda(false)} style={btn(TO.ink, 52)}>
              ENTENDIDO
            </button>
          )}
        >
          {q.ayuda && (
            <BloqueHoja titulo="Por qué te preguntamos esto" primero>{q.ayuda}</BloqueHoja>
          )}
          {chips.length > 0 && (
            <BloqueHoja titulo="Acordate de contar" primero={!q.ayuda}>
              {chips.map((c) => `· ${c}`).join('\n')}
            </BloqueHoja>
          )}
          {q.ejemplo && (
            <BloqueHoja titulo="Así de largo nos sirve" primero={!q.ayuda && !chips.length}>
              {q.ejemplo}
            </BloqueHoja>
          )}
        </Hoja>
      )}
    </div>
  );
}
