// ─────────────────────────────────────────────────────────────────────────────
// Grabador de voz con transcripción.
//
// Es la pieza que resuelve el problema real del onboarding: el cliente escribe
// tres líneas donde necesitamos quince. Hablando dos minutos produce ~350
// palabras sin esfuerzo. Por eso el micrófono no es un iconito al costado del
// campo: es un botón de 48px, a lo ancho, debajo del textarea.
//
// Base: apps/soporte/src/components/Composer.jsx (notas de voz de WhatsApp).
//
// REGLA QUE MANDA SOBRE TODAS: nunca perder lo que el cliente ya dijo. Si la
// transcripción falla —sin saldo, sin red, 403— el audio se sube igual y la
// respuesta queda marcada para que lo transcribamos nosotros. El cliente
// avanza; nadie le pide que lo cuente de nuevo.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useRef, useState } from 'react';
import { IcoMic, IcoCheck, IcoBasura, IcoWarn } from '../../components/icons';
import { Spinner } from '../../components/ui';
import { TO, F } from '../tokens';
import { transcribir, guardarAudio } from '../api';

// Rojo de grabación oscurecido: el #EF4444 del portal con un icono blanco
// encima queda en 3.8:1 y en un celular al sol el micrófono desaparece.
const ROJO = '#C81E1E';

const MAX_SEG = 240;        // 4 min: por encima, Whisper se pone caro y el cliente se pierde
const AVISO_SEG = 210;

const soporta = () => typeof MediaRecorder !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function GrabadorVoz({ qkey, clientHint, onTexto, onAudioPendiente, sugerencia, variante }) {
  const [fase, setFase] = useState('idle');   // idle|permiso|grabando|transcribiendo|error
  const [seg, setSeg] = useState(0);
  const [err, setErr] = useState('');
  const [avisoLento, setAvisoLento] = useState(false);

  const recRef = useRef(null);
  const chunks = useRef([]);
  const stream = useRef(null);
  const timer = useRef(null);
  const descartar = useRef(false);

  const limpiar = useCallback(() => {
    clearInterval(timer.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recRef.current = null;
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
        setFase('idle');
        setSeg(0);
        return;
      }
      throw new Error('vacio');
    } catch (e) {
      clearTimeout(lento);
      // No pudimos pasarlo a texto: guardamos el audio y seguimos.
      try {
        const path = await guardarAudio(clientHint, qkey, blob);
        onAudioPendiente?.(path, { ms: seg * 1000 });
        setFase('idle');
        setSeg(0);
      } catch {
        setErr('No pudimos guardar el audio. Probá de nuevo, o escribí la respuesta.');
        setFase('error');
      }
    }
  }, [onTexto, onAudioPendiente, qkey, clientHint, seg]);

  // ── Arranque ───────────────────────────────────────────────────────────────
  const arrancar = useCallback(async () => {
    setErr('');
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
        if (descartar.current) { setFase('idle'); setSeg(0); return; }
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
      <label style={{ ...botonBase, background: TO.blueBtn, cursor: 'pointer' }}>
        <IcoMic size={20} stroke="#fff" />
        <span>GRABAR UNA NOTA DE VOZ</span>
        <input
          type="file" accept="audio/*" capture hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) procesar(f); e.target.value = ''; }}
        />
      </label>
    );
  }

  // ── Transcribiendo ─────────────────────────────────────────────────────────
  // El estado más delicado: el cliente acaba de hablar dos minutos y no ve nada.
  // Le mostramos cuánto grabó (prueba de que lo tenemos) y cuánto va a tardar.
  if (fase === 'transcribiendo') {
    return (
      <div style={{ ...cajaBase, background: TO.blueWash, borderColor: TO.blueLine }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Spinner size={22} />
          <div>
            <div style={{ fontSize: 17, fontWeight: 800, color: TO.ink }}>
              Estamos pasando tu audio a texto
            </div>
            <div style={{ fontSize: F.meta, color: TO.body, marginTop: 3 }}>
              Grabaste {fmt(seg)}. Tarda unos 10 segundos.
            </div>
          </div>
        </div>
        <div style={{ fontSize: F.meta, color: TO.body, marginTop: 12, lineHeight: 1.5 }}>
          Después vas a poder leerlo y corregir lo que quieras.
        </div>
        {avisoLento && (
          <div style={{ fontSize: F.meta, color: TO.amber, marginTop: 10, fontWeight: 700 }}>
            Está tardando un poco más de lo normal. No cierres la pantalla.
          </div>
        )}
      </div>
    );
  }

  // ── Grabando ───────────────────────────────────────────────────────────────
  if (fase === 'grabando') {
    return (
      <div style={{ ...cajaBase, background: '#fff', borderColor: ROJO, borderWidth: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 56, height: 56, flex: 'none' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: ROJO,
              animation: 'kxRing 1.6s ease-out infinite',
            }} />
            <div style={{
              position: 'relative', width: 56, height: 56, borderRadius: '50%',
              background: ROJO, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IcoMic size={24} stroke="#fff" sw={2.2} />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 24, fontWeight: 800, color: TO.ink,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>{fmt(seg)}</div>
            <div style={{ fontSize: F.meta, color: TO.body, fontWeight: 600 }}>
              {seg >= AVISO_SEG ? 'Se corta en un momento, andá cerrando.'
                : seg >= 15 ? 'Vas bien, seguí.'
                : 'Te escuchamos. Contá con calma.'}
            </div>
          </div>
          <div className="kx-onda" style={{
            display: 'flex', alignItems: 'center', gap: 3, height: 26, color: ROJO,
            opacity: 0.55, flex: 'none',
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.11}s` }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button type="button" onClick={() => frenar(true)} style={{
            ...botonBase, flex: '0 0 auto', width: 56, background: '#fff', color: TO.body,
            border: `2px solid ${TO.lineStrong}`, padding: 0, gap: 0,
          }} aria-label="Descartar la grabación">
            <IcoBasura size={20} stroke={TO.body} />
          </button>
          <button type="button" onClick={() => frenar(false)} style={{
            ...botonBase, background: TO.greenInk, flex: 1,
          }}>
            <IcoCheck size={20} stroke="#fff" sw={2.6} />
            <span>LISTO</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Permiso denegado ───────────────────────────────────────────────────────
  if (fase === 'error' && err === 'permiso') {
    return (
      <div style={{ ...cajaBase, background: TO.amberWash, borderColor: '#E0A96A' }}>
        <div style={{ display: 'flex', gap: 11 }}>
          <IcoWarn size={21} stroke={TO.amber} style={{ flex: 'none', marginTop: 2 }} />
          <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.amber }}>
            <strong>El navegador bloqueó el micrófono.</strong><br />
            Tocá el candado (o la cámara) en la barra de direcciones y permití el
            micrófono para este sitio. O escribí la respuesta, también está bien.
          </div>
        </div>
        <button type="button" onClick={arrancar} style={{
          ...botonBase, background: TO.ink, marginTop: 16,
        }}>PROBAR DE NUEVO</button>
      </div>
    );
  }

  // ── Otro error ─────────────────────────────────────────────────────────────
  if (fase === 'error') {
    return (
      <div style={{ ...cajaBase, background: TO.redWash, borderColor: '#E8A0A0' }}>
        <div style={{ fontSize: F.sub, lineHeight: 1.55, color: TO.redInk }}>{err}</div>
        <button type="button" onClick={arrancar} style={{
          ...botonBase, background: TO.ink, marginTop: 16,
        }}>PROBAR DE NUEVO</button>
      </div>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  // `variante="delineado"`: el micrófono sigue a lo ancho porque es el mecanismo
  // que resuelve las respuestas de tres líneas, pero no compite con el botón de
  // avanzar. El ícono va en un círculo relleno para que se vea igual de fuerte
  // sin ser un segundo botón macizo.
  const delineado = variante === 'delineado';

  return (
    <div>
      <button type="button" onClick={arrancar} disabled={fase === 'permiso'} style={{
        ...botonBase,
        background: delineado ? '#fff' : TO.blueBtn,
        color: delineado ? TO.blue : '#fff',
        border: delineado ? `2px solid ${TO.blue}` : 'none',
        boxShadow: delineado ? 'none' : '0 8px 22px rgba(74,103,216,.26)',
        opacity: fase === 'permiso' ? 0.7 : 1,
      }}>
        {fase === 'permiso'
          ? <Spinner size={19} color={delineado ? TO.blue : '#fff'} />
          : delineado
            ? (
              <span style={{
                width: 30, height: 30, borderRadius: '50%', background: TO.blueBtn, flex: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}><IcoMic size={17} stroke="#fff" sw={2.2} /></span>
            )
            : <IcoMic size={20} stroke="#fff" sw={2.2} />}
        <span>{fase === 'permiso' ? 'ABRIENDO EL MICRÓFONO…' : 'CONTALO HABLANDO'}</span>
      </button>
      {(sugerencia || !delineado) && (
        <div style={{
          fontSize: F.meta, color: TO.meta, textAlign: 'center', marginTop: 10, lineHeight: 1.5,
        }}>
          {sugerencia || 'Es más rápido y sale mucho más natural. Nosotros lo pasamos a texto.'}
        </div>
      )}
    </div>
  );
}

const botonBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', border: 'none', borderRadius: 999, color: '#fff',
  fontSize: 13.5, fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase',
  height: 56, padding: '0 18px', cursor: 'pointer',
};

const cajaBase = {
  border: '1px solid', borderRadius: 18, padding: '17px 17px 19px',
};
