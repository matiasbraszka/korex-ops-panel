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
//  · NARANJA, NUNCA ROJO. Rojo es "está mal"; naranja es "falta". La respuesta
//    corta no es un error del cliente, es una oportunidad de contar más.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react';
import { T, display, microLabel } from '../../components/theme';
import { IcoChevR, IcoCheck } from '../../components/icons';
import { segundosDeVoz, textoDuracion } from '../progreso';
import GrabadorVoz from './GrabadorVoz';

function Semaforo({ len, minChars }) {
  if (!minChars) return null;
  const pct = Math.min(100, (len / minChars) * 100);
  const faltanSeg = segundosDeVoz(minChars - len);

  let color = T.surface3; let texto = 'Contalo con calma. Lo mejor sale hablando.'; let listo = false;
  if (len === 0) {
    // deja el default
  } else if (pct >= 160) {
    color = T.green; texto = 'Excelente. Esto nos sirve muchísimo.'; listo = true;
  } else if (pct >= 100) {
    color = T.green; texto = 'Perfecto, con esto trabajamos.'; listo = true;
  } else if (pct >= 45) {
    color = T.orange; texto = 'Vas bien. Un poquito más y queda perfecto.';
  } else {
    color = T.orange; texto = `Te falta como ${textoDuracion(faltanSeg)} hablando.`;
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 4, borderRadius: 999, background: T.surface2, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 999, background: color,
          width: `${Math.min(100, pct)}%`, transition: 'width .3s ease, background .3s ease',
        }} />
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6, marginTop: 7,
        fontSize: 13.5, color: listo ? T.green : T.text2, fontWeight: listo ? 600 : 400,
      }}>
        {listo && (
          <span style={{
            display: 'inline-flex', width: 17, height: 17, borderRadius: '50%', background: T.green,
            alignItems: 'center', justifyContent: 'center', animation: 'kxPop .4s ease', flex: 'none',
          }}>
            <IcoCheck size={11} stroke="#fff" sw={3} />
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
    <div style={{ marginTop: 14 }}>
      <button type="button" onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none',
        padding: 0, cursor: 'pointer', color: T.primaryInk, fontSize: 14, fontWeight: 600,
      }}>
        <IcoChevR size={15} stroke={T.primaryInk}
          style={{ transform: abierto ? 'rotate(90deg)' : 'none', transition: 'transform .2s' }} />
        {abierto ? 'Ocultar el ejemplo' : 'Así de largo nos sirve'}
      </button>
      {abierto && (
        <div style={{
          marginTop: 10, padding: '15px 16px', borderRadius: 14,
          background: T.primaryWash, border: '1px solid #E3E9FB',
          animation: 'kxUp .25s ease',
        }}>
          <div style={{ ...microLabel(T.primaryInk), marginBottom: 8 }}>Respuesta de ejemplo</div>
          <div style={{ fontSize: 15, lineHeight: 1.62, color: T.textSoft, whiteSpace: 'pre-wrap' }}>
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
  const ref = useRef(null);

  const len = String(valor || '').trim().length;
  const chips = q.chips || [];

  // El teclado del celular tapa el campo si no lo centramos al enfocar.
  const enfocar = () => {
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
      <label htmlFor={q.qkey} style={{ ...display(21, '-0.025em'), display: 'block', lineHeight: 1.25 }}>
        {q.label}
      </label>
      {q.sublabel && (
        <div style={{ fontSize: 15.5, lineHeight: 1.55, color: T.text2, marginTop: 8 }}>
          {q.sublabel}
        </div>
      )}
      {q.ayuda && (
        <div style={{
          fontSize: 14.5, lineHeight: 1.55, color: T.textSoft, marginTop: 10,
          padding: '11px 13px', background: T.surface2, borderRadius: 12,
        }}>
          {q.ayuda}
        </div>
      )}

      {/* Chips guía: recordatorios de qué contar. NO insertan texto — si lo
          hicieran, el cliente completaría los huecos en vez de contar su historia. */}
      {chips.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 13 }}>
          {chips.map((c) => {
            const usado = chipsUsados.includes(c);
            return (
              <button
                key={c} type="button"
                onClick={() => setChipsUsados((u) => (usado ? u.filter((x) => x !== c) : [...u, c]))}
                style={{
                  fontSize: 13, fontWeight: 600, padding: '7px 12px', borderRadius: 999,
                  border: `1px solid ${usado ? T.green : T.border}`,
                  background: usado ? T.greenSoft : '#fff',
                  color: usado ? T.green : T.text2,
                  textDecoration: usado ? 'line-through' : 'none',
                  cursor: 'pointer', transition: 'all .18s',
                }}
              >{c}</button>
            );
          })}
        </div>
      )}

      <textarea
        id={q.qkey} ref={ref} value={valor || ''}
        onChange={(e) => onChange(e.target.value)}
        onFocus={enfocar}
        autoFocus={autoFocus}
        placeholder={q.placeholder || 'Escribí acá, o tocá el micrófono y contalo hablando…'}
        style={{
          width: '100%', marginTop: 14, minHeight: 140, resize: 'none',
          border: '1px solid var(--mk-border)', borderRadius: 16, padding: '14px 16px',
          // 16px es obligatorio: por debajo, iOS hace zoom automático al enfocar
          // y el cliente queda con la pantalla descuadrada.
          fontSize: 16, lineHeight: 1.6, fontFamily: 'inherit', color: T.text,
          boxShadow: 'var(--shadow-sm)', outline: 'none', background: '#fff',
        }}
      />

      <Semaforo len={len} minChars={q.minChars} />

      {flag === 'audio_pendiente' && (
        <div style={{
          marginTop: 10, padding: '11px 13px', borderRadius: 12,
          background: T.amberSoft, fontSize: 13.5, lineHeight: 1.5, color: '#92400E',
        }}>
          Nos quedamos con tu audio. Lo pasamos a texto nosotros — no hace falta que lo repitas.
        </div>
      )}

      <Ejemplo texto={q.ejemplo} abierto={verEjemplo} onToggle={() => setVerEjemplo((v) => !v)} />

      {q.voz !== false && (
        <div style={{ marginTop: 18 }}>
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
