// ─────────────────────────────────────────────────────────────────────────────
// La pregunta abierta: el componente que decide si el onboarding sirve o no.
//
// Tres decisiones deliberadas:
//
//  · EL SEMÁFORO NO CUENTA CARACTERES. Dice "te falta como medio minuto
//    hablando". Nadie sabe cuánto es 1.200 caracteres; todo el mundo sabe
//    cuánto es medio minuto.
//
//  · EL EJEMPLO TIENE LA LONGITUD OBJETIVO. Es la vara real: el cliente no
//    calibra contra un número, calibra contra lo que ve. Nunca va como
//    placeholder — se copia literal y contamina el documento del cerebro.
//
//  · ÁMBAR, NUNCA ROJO. Rojo es "está mal"; ámbar es "falta". La respuesta
//    corta no es un error del cliente, es una oportunidad de contar más.
//    (El ámbar del texto es #8A4B08, no el naranja de marca: #F97316 sobre
//    blanco da 3.0:1 y no se lee.)
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { IcoChevR, IcoCheck } from '../../components/icons';
import { TO, F, dsp, label } from '../tokens';
import { segundosDeVoz, textoDuracion } from '../progreso';
import GrabadorVoz from './GrabadorVoz';

function Semaforo({ len, minChars }) {
  if (!minChars) return null;
  const pct = Math.min(100, (len / minChars) * 100);
  const faltanSeg = segundosDeVoz(minChars - len);

  // barra = color pleno (es un gráfico) · texto = versión oscura (hay que leerlo)
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
      <div style={{ height: 7, borderRadius: 999, background: TO.fill, overflow: 'hidden' }}>
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

function Ejemplo({ texto, abierto, onToggle }) {
  if (!texto) return null;
  return (
    <div style={{ marginTop: 16 }}>
      <button type="button" onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 8, background: 'none',
        border: `1.5px solid ${TO.blueLine}`, borderRadius: 999,
        padding: '11px 16px', cursor: 'pointer', color: TO.blue,
        fontSize: 15.5, fontWeight: 700,
      }}>
        <IcoChevR size={16} stroke={TO.blue} sw={2.5}
          style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
        {abierto ? 'Ocultar el ejemplo' : 'Así de largo nos sirve'}
      </button>
      {abierto && (
        <div style={{
          marginTop: 12, padding: '16px 17px', borderRadius: 16,
          background: TO.blueWash, border: `1px solid ${TO.blueLine}`,
          animation: 'kxUp .25s ease',
        }}>
          <div style={{ ...label(TO.blue), marginBottom: 9 }}>Respuesta de ejemplo</div>
          <div style={{ fontSize: F.sub, lineHeight: 1.65, color: TO.body, whiteSpace: 'pre-wrap' }}>
            {texto}
          </div>
        </div>
      )}
    </div>
  );
}

export default function CampoAbierto({ q, valor, flag, onChange, onVoz, onAudioPendiente, clientHint, autoFocus }) {
  const [verEjemplo, setVerEjemplo] = useState(false);
  const [chipsUsados, setChipsUsados] = useState([]);
  const [enfocado, setEnfocado] = useState(false);
  const ref = useRef(null);

  const len = String(valor || '').trim().length;
  const chips = q.chips || [];

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
      <label htmlFor={q.qkey} style={{ ...dsp(F.q, '-0.025em'), display: 'block', lineHeight: 1.22 }}>
        {q.label}
      </label>
      {q.sublabel && (
        <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 9 }}>
          {q.sublabel}
        </div>
      )}
      {q.ayuda && (
        <div style={{
          fontSize: F.sub, lineHeight: 1.55, color: TO.body, marginTop: 12,
          padding: '13px 15px', background: TO.blueWash,
          borderLeft: `4px solid ${TO.blue}`, borderRadius: '4px 14px 14px 4px',
        }}>
          {q.ayuda}
        </div>
      )}

      {/* Chips guía: recordatorios de qué contar. NO insertan texto — si lo
          hicieran, el cliente completaría los huecos en vez de contar su historia. */}
      {chips.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ ...label(), marginBottom: 9 }}>Acordate de contar</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {chips.map((c) => {
              const usado = chipsUsados.includes(c);
              return (
                <button
                  key={c} type="button"
                  onClick={() => setChipsUsados((u) => (usado ? u.filter((x) => x !== c) : [...u, c]))}
                  style={{
                    fontSize: 14.5, fontWeight: 700, padding: '10px 14px', borderRadius: 999,
                    border: `1.5px solid ${usado ? TO.greenInk : TO.lineStrong}`,
                    background: usado ? TO.greenWash : '#fff',
                    color: usado ? TO.greenInk : TO.body,
                    textDecoration: usado ? 'line-through' : 'none',
                    cursor: 'pointer', transition: 'all .18s',
                  }}
                >{c}</button>
              );
            })}
          </div>
        </div>
      )}

      <textarea
        id={q.qkey} ref={ref} value={valor || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={enfocar}
        onBlur={() => setEnfocado(false)}
        autoFocus={autoFocus}
        placeholder={q.placeholder || 'Escribí acá, o tocá el micrófono y contalo hablando…'}
        style={{
          width: '100%', marginTop: 16, minHeight: 150, resize: 'none',
          // Borde de 2px y color visible: con el hairline de #E2E5EB del portal,
          // en un celular al sol, no se distingue dónde empieza el campo.
          border: `2px solid ${enfocado ? TO.blue : TO.lineStrong}`,
          borderRadius: 16, padding: '15px 16px',
          fontSize: F.input, lineHeight: 1.62, fontFamily: 'inherit', color: TO.body,
          outline: 'none', background: '#fff', transition: 'border-color .16s',
        }}
      />

      <Semaforo len={len} minChars={q.minChars} />

      {flag === 'audio_pendiente' && (
        <div style={{
          marginTop: 12, padding: '13px 15px', borderRadius: 14,
          background: TO.amberWash, border: `1px solid #F5D9AE`,
          fontSize: F.meta, lineHeight: 1.5, color: TO.amber, fontWeight: 600,
        }}>
          Nos quedamos con tu audio. Lo pasamos a texto nosotros — no hace falta que lo repitas.
        </div>
      )}

      <Ejemplo texto={q.ejemplo} abierto={verEjemplo} onToggle={() => setVerEjemplo((v) => !v)} />

      {q.voz !== false && (
        <div style={{ marginTop: 20 }}>
          <GrabadorVoz
            qkey={q.qkey}
            clientHint={clientHint}
            sugerencia={q.minChars >= 800
              ? 'Esta es de las importantes. Hablando te sale en menos de dos minutos.'
              : undefined}
            onTexto={(texto, meta) => onVoz(texto, meta)}
            onAudioPendiente={(path, meta) => onAudioPendiente(path, meta)}
          />
        </div>
      )}
    </div>
  );
}
