// Dictado por voz para el composer de los agentes: grabás, y al frenar se transcribe
// (Whisper vía la edge fn `transcribir-audio`, la misma del onboarding/soporte) y el
// texto se inserta en el input. Sirve para escribirle a los agentes hablando.
import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@korex/db';
import { Mic, Square, Loader2, AlertTriangle } from 'lucide-react';

const MAX_SEG = 180; // tope defensivo (Whisper aguanta audios largos, pero no hace falta más)

const soporta = () => typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

// Códigos de la edge fn → mensaje claro para el equipo.
const MSG_ERROR = {
  no_transcription_key: 'La transcripción no está configurada. Avisale a un admin.',
  quota_exhausted: 'La transcripción se quedó sin crédito. Avisale a un admin.',
  rate_limited: 'Muchos audios seguidos. Esperá unos segundos y probá de nuevo.',
  empty_file: 'No se escuchó nada. Probá de nuevo, más cerca del micrófono.',
  file_too_big: 'El audio quedó muy largo. Probá en tramos más cortos.',
  forbidden: 'No tenés permiso para transcribir.',
  permiso: 'No pudimos usar el micrófono. Dale permiso en el navegador y probá de nuevo.',
};

export default function MicDictado({ onText, disabled }) {
  const [fase, setFase] = useState('idle'); // idle | grabando | procesando | error
  const [seg, setSeg] = useState(0);
  const [err, setErr] = useState('');

  const recRef = useRef(null);
  const streamRef = useRef(null);
  const chunks = useRef([]);
  const timer = useRef(null);
  const descartar = useRef(false);

  const limpiar = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    try { streamRef.current?.getTracks().forEach((t) => t.stop()); } catch { /* nada */ }
    streamRef.current = null;
    recRef.current = null;
  }, []);

  // Al desmontar, cortar el micrófono si quedó abierto.
  useEffect(() => () => limpiar(), [limpiar]);

  const transcribir = useCallback(async (blob) => {
    setFase('procesando');
    try {
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result || '').split(',')[1] || '');
        r.onerror = reject;
        r.readAsDataURL(blob);
      });
      const ext = (blob.type || '').includes('mp4') ? 'm4a' : 'webm';
      const { data, error } = await supabase.functions.invoke('transcribir-audio', {
        body: { base64, mimetype: blob.type || 'audio/webm', filename: `dictado.${ext}` },
      });
      if (error) throw new Error(error.message?.includes('403') ? 'forbidden' : 'red');
      if (!data?.ok) throw new Error(data?.error || 'provider');
      const texto = String(data.text || '').trim();
      setFase('idle'); setSeg(0);
      if (texto) onText(texto);
      else { setErr(MSG_ERROR.empty_file); setFase('error'); }
    } catch (e) {
      setFase('error');
      setErr(MSG_ERROR[String(e.message)] || 'No se pudo transcribir. Probá de nuevo.');
    }
  }, [onText]);

  const arrancar = useCallback(async () => {
    setErr('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = s;
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
        transcribir(blob);
      };
      recRef.current = rec;
      rec.start();
      setFase('grabando'); setSeg(0);
      timer.current = setInterval(() => {
        setSeg((v) => {
          if (v + 1 >= MAX_SEG) { try { rec.stop(); } catch { /* ya parado */ } }
          return v + 1;
        });
      }, 1000);
    } catch (e) {
      limpiar();
      setFase('error');
      setErr(e?.name === 'NotAllowedError' ? MSG_ERROR.permiso : 'No se pudo usar el micrófono.');
    }
  }, [limpiar, transcribir]);

  const frenar = useCallback((tirar) => {
    descartar.current = !!tirar;
    try { recRef.current?.stop(); } catch { limpiar(); setFase('idle'); setSeg(0); }
  }, [limpiar]);

  if (!soporta()) return null; // navegador sin grabación → no mostramos el botón

  const mmss = `${String(Math.floor(seg / 60)).padStart(1, '0')}:${String(seg % 60).padStart(2, '0')}`;

  if (fase === 'grabando') {
    return (
      <div className="inline-flex items-center gap-1.5 shrink-0">
        <button onClick={() => frenar(true)} title="Descartar"
          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-white text-text3 cursor-pointer hover:bg-surface2">
          <span className="text-[16px] leading-none">×</span>
        </button>
        <button onClick={() => frenar(false)} title="Listo, transcribir"
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer animate-pulse"
          style={{ background: 'var(--color-red)' }}>
          <Square size={13} fill="#fff" /> {mmss}
        </button>
      </div>
    );
  }

  if (fase === 'procesando') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text2 shrink-0 px-1">
        <Loader2 size={14} className="animate-spin" /> Transcribiendo…
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <button onClick={arrancar} disabled={disabled} title="Dictar por voz"
        className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-border bg-white text-text2 cursor-pointer hover:bg-surface2 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed">
        <Mic size={16} />
      </button>
      {fase === 'error' && err && (
        <span className="inline-flex items-center gap-1 text-[11px] text-[#B45309] max-w-[240px] leading-tight">
          <AlertTriangle size={12} className="shrink-0" /> {err}
        </span>
      )}
    </span>
  );
}
