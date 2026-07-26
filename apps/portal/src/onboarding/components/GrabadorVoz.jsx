// ─────────────────────────────────────────────────────────────────────────────
// Grabador de voz con transcripción.
//
// Es la pieza que resuelve el problema real del onboarding: el cliente escribe
// tres líneas donde necesitamos quince. Hablando dos minutos produce ~350
// palabras sin esfuerzo. Por eso el micrófono no es un iconito al costado: es
// una barra azul dentro del campo, a lo ancho, imposible de no ver.
//
// Base de la lógica: apps/soporte/src/components/Composer.jsx (notas de voz).
//
// REGLA QUE MANDA SOBRE TODAS: nunca perder lo que el cliente ya dijo. Si la
// transcripción falla —sin saldo, sin red, 403— el audio se sube igual y la
// respuesta queda marcada para que lo transcribamos nosotros. El cliente
// avanza; nadie le pide que lo cuente de nuevo.
//
// El dictado en vivo (webkitSpeechRecognition, solo Chrome/Edge) se usa como
// VISTA PREVIA dentro de la tarjeta de grabación, nunca como la respuesta. La
// respuesta siempre sale de Whisper: si escribiéramos las dos, el texto se
// duplicaría en los navegadores que soportan ambas cosas.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { T } from '../tokens';
import { transcribir, guardarAudio } from '../api';

const MAX_SEG = 240;        // 4 min: por encima, Whisper se pone caro y el cliente se pierde
const AVISO_SEG = 210;

const soporta = () => typeof MediaRecorder !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

const IcoMicSvg = ({ size = 16, color = '#fff', sw = 2.2 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
       strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <path d="M12 19v3" />
  </svg>
);

const barra = {
  height: 11, borderRadius: 999,
  background: `linear-gradient(90deg,${T.fill} 8%,${T.line} 18%,${T.fill} 33%)`,
  backgroundSize: '440px 100%',
  animation: 'mkshimmer 1.1s linear infinite',
};

export default function GrabadorVoz({ qkey, clientHint, onTexto, onAudioPendiente, pista, etiqueta }) {
  const [fase, setFase] = useState('idle');   // idle|permiso|grabando|transcribiendo|error
  const [seg, setSeg] = useState(0);
  const [err, setErr] = useState('');
  const [avisoLento, setAvisoLento] = useState(false);
  const [parcial, setParcial] = useState('');

  const recRef = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const timer = useRef(null);
  const descartar = useRef(false);
  const dictado = useRef(null);

  const limpiar = useCallback(() => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recRef.current = null;
    try { dictado.current?.stop(); } catch { /* ya parado */ }
    dictado.current = null;
  }, []);

  useEffect(() => () => limpiar(), [limpiar]);

  // ── Procesado del audio grabado ────────────────────────────────────────────
  const procesar = useCallback(async (blob) => {
    if (!blob || blob.size < 1200) { setFase('idle'); return; }   // toque accidental
    setFase('transcribiendo');
    setAvisoLento(false);
    const lento = setTimeout(() => setAvisoLento(true), 12000);

    try {
      const texto = await transcribir(blob);
      clearTimeout(lento);
      if (texto) {
        onTexto?.(texto, { ms: seg * 1000 });
        setFase('idle'); setSeg(0); setParcial('');
        return;
      }
      throw new Error('vacio');
    } catch {
      clearTimeout(lento);
      // No pudimos pasarlo a texto: guardamos el audio y seguimos.
      try {
        const path = await guardarAudio(clientHint, qkey, blob);
        onAudioPendiente?.(path, { ms: seg * 1000 });
        setFase('idle'); setSeg(0); setParcial('');
      } catch {
        setErr('No pudimos guardar el audio. Probá de nuevo, o escribí la respuesta.');
        setFase('error');
      }
    }
  }, [onTexto, onAudioPendiente, qkey, clientHint, seg]);

  // ── Arranque ───────────────────────────────────────────────────────────────
  const arrancar = useCallback(async () => {
    setErr(''); setParcial('');
    setFase('permiso');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = s;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm'
        : MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '';
      const rec = new MediaRecorder(s, mime ? { mimeType: mime } : undefined);
      chunks.current = [];
      descartar.current = false;

      rec.ondataavailable = (e) => { if (e.data?.size) chunks.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunks.current, { type: rec.mimeType || 'audio/webm' });
        limpiar();
        if (descartar.current) { setFase('idle'); setSeg(0); setParcial(''); return; }
        procesar(blob);
      };

      recRef.current = rec;
      rec.start();
      setFase('grabando');
      setSeg(0);
      timer.current = setInterval(() => {
        setSeg((v) => {
          if (v + 1 >= MAX_SEG) { try { rec.stop(); } catch { /* ya parado */ } }
          return v + 1;
        });
      }, 1000);

      // Vista previa en vivo, si el navegador la tiene. Es puro efecto: da la
      // señal de que lo estamos escuchando de verdad.
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (SR) {
        try {
          const d = new SR();
          d.lang = 'es-419'; d.continuous = true; d.interimResults = true;
          d.onresult = (e) => {
            let txt = '';
            for (let i = 0; i < e.results.length; i += 1) txt += e.results[i][0].transcript;
            setParcial(txt.trim());
          };
          d.onerror = () => { /* si falla, se sigue grabando igual */ };
          d.start();
          dictado.current = d;
        } catch { dictado.current = null; }
      }
    } catch (e) {
      limpiar();
      setFase('error');
      setErr(e?.name === 'NotAllowedError'
        ? 'permiso'
        : 'No pudimos usar el micrófono. Podés escribir la respuesta, también está bien.');
    }
  }, [limpiar, procesar]);

  const frenar = (tirar) => {
    descartar.current = !!tirar;
    try { recRef.current?.stop(); } catch { limpiar(); setFase('idle'); }
  };

  // ── Fallback sin MediaRecorder (Safari viejo, WebViews de apps) ────────────
  // No es un cartel de error: en iOS este input abre la grabadora nativa, así
  // que el cliente igual puede contestar hablando.
  if (!soporta()) {
    return (
      <label style={{ ...barraMic, cursor: 'pointer' }}>
        <span style={circulo}><IcoMicSvg /></span>
        <span style={textoMic}>Grabar una nota de voz</span>
        <input
          type="file" accept="audio/*" capture hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ''; }}
        />
      </label>
    );
  }

  // ── Transcribiendo ─────────────────────────────────────────────────────────
  // El estado más delicado: el cliente acaba de hablar dos minutos y no ve nada.
  if (fase === 'transcribiendo') {
    return (
      <div style={{ borderRadius: 18, border: `1px solid ${T.line}`, background: '#fff', padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', background: T.azul,
            animation: 'mkdot .9s ease-in-out infinite',
          }} />
          <div style={{ fontSize: 13, fontWeight: 700, color: T.soft }}>
            Pasando tu audio a texto…
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ fontSize: 12, color: T.muted }}>Grabaste {fmt(seg)}</div>
        </div>
        <div style={{ ...barra, marginBottom: 8 }} />
        <div style={{ ...barra, width: '82%', marginBottom: 8 }} />
        <div style={{ ...barra, width: '56%' }} />
        {avisoLento && (
          <div style={{ fontSize: 12.5, color: T.ambarTinta, marginTop: 12, fontWeight: 700 }}>
            Está tardando un poco más de lo normal. No cierres la pantalla.
          </div>
        )}
      </div>
    );
  }

  // ── Grabando ───────────────────────────────────────────────────────────────
  if (fase === 'grabando') {
    return (
      <div style={{
        borderRadius: 18, background: T.dark, padding: 22, animation: 'mkpop .25s ease both',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <div style={{ position: 'relative', width: 12, height: 12, flex: '0 0 12px' }}>
            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: T.rojo }} />
            <span style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: T.rojo,
              animation: 'mkpulse 1.6s ease-out infinite',
            }} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '.04em' }}>
            Te estamos escuchando
          </div>
          <div style={{ flex: 1 }} />
          <div style={{
            fontSize: 13, fontWeight: 700, color: T.faint, fontVariantNumeric: 'tabular-nums',
          }}>{fmt(seg)}</div>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          gap: 5, height: 48, marginBottom: 20,
        }}>
          {Array.from({ length: 18 }).map((_, i) => (
            <span key={i} style={{
              width: 4, height: 44, borderRadius: 999, background: T.azulMarca,
              transformOrigin: 'center', animation: 'mkbar 1s ease-in-out infinite',
              animationDelay: `${(i * 0.07).toFixed(2)}s`,
            }} />
          ))}
        </div>

        {/* La vista previa del dictado: lo que se está escuchando, ahora. */}
        {parcial && (
          <div style={{
            fontSize: 13, lineHeight: 1.6, color: '#D4D7DE', marginBottom: 16,
            maxHeight: 96, overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 4, WebkitBoxOrient: 'vertical',
          }}>{parcial}</div>
        )}

        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: T.faint, marginBottom: 18 }}>
          {seg >= AVISO_SEG
            ? 'Se corta en un momento, andá cerrando.'
            : 'Habla tranquilo, como si te estuvieran entrevistando. Los «eh» y las repeticiones las limpiamos nosotros.'}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={() => frenar(true)} aria-label="Descartar la grabación"
            style={{
              flex: '0 0 auto', width: 52, height: 48, borderRadius: 999,
              background: 'rgba(255,255,255,.1)', border: 'none', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF"
                 strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18" /><path d="M6 6l12 12" />
            </svg>
          </button>
          <button type="button" onClick={() => frenar(false)} style={{
            flex: 1, background: '#fff', color: T.dark, border: 'none', borderRadius: 999,
            padding: 15, fontSize: 13, fontWeight: 800, letterSpacing: '.06em',
            textTransform: 'uppercase', cursor: 'pointer',
          }}>Listo, terminé</button>
        </div>
      </div>
    );
  }

  // ── Permiso denegado ───────────────────────────────────────────────────────
  if (fase === 'error' && err === 'permiso') {
    return (
      <div style={{
        borderRadius: 16, background: T.ambarWash, border: '1px solid #E0C067', padding: 18,
      }}>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: T.ambarTinta }}>
          <strong>El navegador bloqueó el micrófono.</strong><br />
          Tocá el candado en la barra de direcciones y permití el micrófono para
          este sitio. O escribí la respuesta, también está bien.
        </div>
        <button type="button" onClick={arrancar} style={{
          ...barraMic, position: 'static', marginTop: 14,
        }}>
          <span style={circulo}><IcoMicSvg /></span>
          <span style={textoMic}>Probar de nuevo</span>
        </button>
      </div>
    );
  }

  // ── Otro error ─────────────────────────────────────────────────────────────
  if (fase === 'error') {
    return (
      <div style={{
        borderRadius: 16, background: '#FEF2F2', border: '1px solid #F3B0B0', padding: 18,
      }}>
        <div style={{ fontSize: 14, lineHeight: 1.55, color: '#B02020' }}>{err}</div>
        <button type="button" onClick={arrancar} style={{
          ...barraMic, position: 'static', marginTop: 14,
        }}>
          <span style={circulo}><IcoMicSvg /></span>
          <span style={textoMic}>Probar de nuevo</span>
        </button>
      </div>
    );
  }

  // ── En reposo ──────────────────────────────────────────────────────────────
  // Va posicionado ABSOLUTO dentro del textarea (que reserva el espacio con su
  // padding-bottom): el micrófono forma parte del campo, no es otra cosa más
  // que decidir.
  return (
    <button type="button" onClick={arrancar} disabled={fase === 'permiso'} style={{
      ...barraMic, opacity: fase === 'permiso' ? 0.75 : 1,
    }}>
      <span style={circulo}><IcoMicSvg /></span>
      <span style={textoMic}>{fase === 'permiso' ? 'Abriendo el micrófono…' : (etiqueta || 'Contéstalo hablando')}</span>
      {pista && (
        <span style={{
          flex: '0 0 auto', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,.75)',
        }}>{pista}</span>
      )}
    </button>
  );
}

const barraMic = {
  position: 'absolute', left: 12, bottom: 12, right: 12,
  border: 'none', borderRadius: 12, background: T.azul, color: '#fff',
  padding: '11px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center',
  gap: 11, textAlign: 'left', boxShadow: '0 2px 8px rgba(91,124,245,.32)',
  transition: 'background .15s',
};

const circulo = {
  width: 30, height: 30, flex: '0 0 30px', borderRadius: '50%',
  background: 'rgba(255,255,255,.2)', display: 'flex',
  alignItems: 'center', justifyContent: 'center',
};

const textoMic = {
  flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 800, letterSpacing: '-.01em',
};
