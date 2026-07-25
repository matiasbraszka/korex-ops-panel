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
import { T } from '../../components/theme';
import { IcoMic, IcoCheck, IcoBasura, IcoWarn } from '../../components/icons';
import { Spinner } from '../../components/ui';
import { transcribir, guardarAudio } from '../api';

const MAX_SEG = 240;        // 4 min: por encima, Whisper se pone caro y el cliente se pierde
const AVISO_SEG = 210;

const soporta = () => typeof MediaRecorder !== 'undefined'
  && !!navigator.mediaDevices?.getUserMedia;

const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export default function GrabadorVoz({ qkey, clientHint, onTexto, onAudioPendiente, sugerencia }) {
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
      <label style={{ ...botonBase, background: T.primary, cursor: 'pointer' }}>
        <IcoMic size={19} stroke="#fff" />
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
      <div style={{ ...cajaBase, background: T.primaryWash, borderColor: '#C3CFEF' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Spinner size={20} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.ink }}>
              Estamos pasando tu audio a texto
            </div>
            <div style={{ fontSize: 13.5, color: T.text2, marginTop: 2 }}>
              Grabaste {fmt(seg)}. Tarda unos 10 segundos.
            </div>
          </div>
        </div>
        <div style={{ fontSize: 13.5, color: T.text2, marginTop: 10, lineHeight: 1.5 }}>
          Después vas a poder leerlo y corregir lo que quieras.
        </div>
        {avisoLento && (
          <div style={{ fontSize: 13, color: T.orange, marginTop: 8, fontWeight: 600 }}>
            Está tardando un poco más de lo normal. No cierres la pantalla.
          </div>
        )}
      </div>
    );
  }

  // ── Grabando ───────────────────────────────────────────────────────────────
  if (fase === 'grabando') {
    return (
      <div style={{ ...cajaBase, background: '#fff', borderColor: '#FCA5A5' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', width: 52, height: 52, flex: 'none' }}>
            <div style={{
              position: 'absolute', inset: 0, borderRadius: '50%', background: T.red,
              animation: 'kxRing 1.6s ease-out infinite',
            }} />
            <div style={{
              position: 'relative', width: 52, height: 52, borderRadius: '50%',
              background: T.red, display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <IcoMic size={22} stroke="#fff" />
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 20, fontWeight: 800, color: T.ink,
              fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em',
            }}>{fmt(seg)}</div>
            <div style={{ fontSize: 13.5, color: T.text2 }}>
              {seg >= AVISO_SEG ? 'Se corta en un momento, andá cerrando.'
                : seg >= 15 ? 'Vas bien, seguí.'
                : 'Te escuchamos. Contá con calma.'}
            </div>
          </div>
          <div className="kx-onda" style={{
            display: 'flex', alignItems: 'center', gap: 3, height: 26, color: '#FCA5A5', flex: 'none',
          }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.11}s` }} />
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button type="button" onClick={() => frenar(true)} style={{
            ...botonBase, flex: '0 0 auto', width: 52, background: T.surface2, color: T.text2,
            padding: 0, gap: 0,
          }} aria-label="Descartar">
            <IcoBasura size={18} stroke={T.text2} />
          </button>
          <button type="button" onClick={() => frenar(false)} style={{
            ...botonBase, background: T.green, flex: 1,
          }}>
            <IcoCheck size={18} stroke="#fff" />
            <span>LISTO</span>
          </button>
        </div>
      </div>
    );
  }

  // ── Permiso denegado ───────────────────────────────────────────────────────
  if (fase === 'error' && err === 'permiso') {
    return (
      <div style={{ ...cajaBase, background: T.amberSoft, borderColor: '#FDE68A' }}>
        <div style={{ display: 'flex', gap: 10 }}>
          <IcoWarn size={19} stroke={T.orange} style={{ flex: 'none', marginTop: 1 }} />
          <div style={{ fontSize: 14.5, lineHeight: 1.55, color: '#92400E' }}>
            <strong>El navegador bloqueó el micrófono.</strong><br />
            Tocá el candado (o la cámara) en la barra de direcciones y permití el
            micrófono para este sitio. O escribí la respuesta, también está bien.
          </div>
        </div>
        <button type="button" onClick={arrancar} style={{
          ...botonBase, background: T.ink, marginTop: 14,
        }}>PROBAR DE NUEVO</button>
      </div>
    );
  }

  // ── Otro error ─────────────────────────────────────────────────────────────
  if (fase === 'error') {
    return (
      <div style={{ ...cajaBase, background: T.redSoft, borderColor: '#FECACA' }}>
        <div style={{ fontSize: 14.5, lineHeight: 1.55, color: '#991B1B' }}>{err}</div>
        <button type="button" onClick={arrancar} style={{
          ...botonBase, background: T.ink, marginTop: 14,
        }}>PROBAR DE NUEVO</button>
      </div>
    );
  }

  // ── Idle ───────────────────────────────────────────────────────────────────
  return (
    <div>
      <button type="button" onClick={arrancar} disabled={fase === 'permiso'} style={{
        ...botonBase, background: T.primary,
        boxShadow: '0 8px 22px rgba(91,124,245,.28)',
        opacity: fase === 'permiso' ? 0.7 : 1,
      }}>
        {fase === 'permiso' ? <Spinner size={18} color="#fff" /> : <IcoMic size={19} stroke="#fff" />}
        <span>{fase === 'permiso' ? 'ABRIENDO EL MICRÓFONO…' : 'CONTALO HABLANDO'}</span>
      </button>
      <div style={{ fontSize: 13, color: T.text2, textAlign: 'center', marginTop: 9, lineHeight: 1.5 }}>
        {sugerencia || 'Es más rápido y sale mucho más natural. Nosotros lo pasamos a texto.'}
      </div>
    </div>
  );
}

const botonBase = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
  width: '100%', border: 'none', borderRadius: 999, color: '#fff',
  fontSize: 12.5, fontWeight: 700, letterSpacing: '0.09em', textTransform: 'uppercase',
  height: 50, padding: '0 18px', cursor: 'pointer',
};

const cajaBase = {
  border: '1px solid', borderRadius: 18, padding: '16px 16px 18px',
};
