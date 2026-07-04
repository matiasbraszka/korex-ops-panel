// Herramienta "Auditoría de audios" (Soporte › Recursos).
// Cargás la exportación de un chat de WhatsApp (el .zip, o el _chat.txt + los
// audios) y te devuelve el chat completo en texto, en orden cronológico, con los
// audios y videos transcritos en su lugar. Listo para auditar.
//
// La transcripción corre en el servidor (edge function `transcribir-audio` →
// Groq/OpenAI Whisper). El navegador solo parsea, orquesta y arma el texto: por
// eso no agrega carga al backend más allá de una llamada corta por audio.

import { useMemo, useRef, useState } from 'react';
import { unzipSync } from 'fflate';
import {
  FileAudio, UploadCloud, Copy, Check, Download, Loader2, RefreshCw,
  AlertTriangle, Mic, Film, Image as ImageIcon, FileText, X,
} from 'lucide-react';
import { parseChat, assembleTranscript, countMedia, kindOfFile } from '../lib/waChatParser.js';
import { invokeTranscribir } from '../lib/api.js';

// ── Helpers de archivos ───────────────────────────────────────────────────────

const MIME_BY_EXT = {
  opus: 'audio/ogg', ogg: 'audio/ogg', oga: 'audio/ogg', mp3: 'audio/mpeg',
  m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav', amr: 'audio/amr',
  mp4: 'video/mp4', '3gp': 'video/3gpp', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm',
};
const mimeForName = (name) => MIME_BY_EXT[(name || '').split('.').pop().toLowerCase()] || 'application/octet-stream';
const baseName = (p) => (p || '').split(/[\\/]/).pop();

// Uint8Array → base64 (por chunks, para no reventar el call stack con archivos grandes).
function bytesToBase64(bytes) {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

const readTextFile = (file) => file.text();
const readBytes = async (file) => new Uint8Array(await file.arrayBuffer());

// Pool de concurrencia simple: corre `worker(item, i)` sobre `items` con un tope
// de `limit` en paralelo. No rechaza: cada worker maneja su propio error.
async function runPool(items, limit, worker) {
  let idx = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (idx < items.length) {
      const i = idx++;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

const CONCURRENCY = 3;

// ── Componente ────────────────────────────────────────────────────────────────

export default function TranscripcionWhatsApp() {
  const [stage, setStage] = useState('idle'); // idle | loading | ready | transcribing | done
  const [error, setError] = useState('');
  const [chatName, setChatName] = useState('chat');
  const [parsed, setParsed] = useState(null); // { messages, mediaFiles }
  const [filesMap, setFilesMap] = useState({}); // filename -> { bytes, mimetype }
  const [transcripts, setTranscripts] = useState({}); // filename -> { text } | { error }
  const [progress, setProgress] = useState({ done: 0, total: 0, current: '' });
  const [copied, setCopied] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  // Lista de audios+videos que SÍ tienen archivo (los transcribibles).
  const toTranscribe = useMemo(() => {
    if (!parsed) return [];
    return parsed.mediaFiles.filter(
      (f) => (f.kind === 'audio' || f.kind === 'video') && filesMap[f.filename],
    );
  }, [parsed, filesMap]);

  const counts = parsed ? countMedia(parsed.messages) : null;
  const missingCount = useMemo(() => {
    if (!parsed) return 0;
    return parsed.mediaFiles.filter(
      (f) => (f.kind === 'audio' || f.kind === 'video') && !filesMap[f.filename],
    ).length;
  }, [parsed, filesMap]);

  const reset = () => {
    setStage('idle'); setError(''); setChatName('chat'); setParsed(null);
    setFilesMap({}); setTranscripts({}); setProgress({ done: 0, total: 0, current: '' });
    setCopied(false);
  };

  // ── Carga de archivos (zip o txt+media) ──
  const handleFiles = async (fileList) => {
    setError('');
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setStage('loading');
    // dejar pintar el estado "loading" antes del unzip síncrono
    await new Promise((r) => setTimeout(r, 20));

    try {
      const zip = files.find((f) => f.name.toLowerCase().endsWith('.zip'));
      let chatText = '';
      const media = {}; // filename -> { bytes, mimetype }
      let name = 'chat';

      if (zip) {
        name = zip.name.replace(/\.zip$/i, '').trim() || 'chat';
        const bytes = await readBytes(zip);
        const entries = unzipSync(bytes); // { path: Uint8Array }
        for (const [path, data] of Object.entries(entries)) {
          const bn = baseName(path);
          if (!bn) continue;
          if (bn === '_chat.txt' || (bn.toLowerCase().endsWith('.txt') && !chatText)) {
            chatText = new TextDecoder('utf-8').decode(data);
          } else {
            media[bn] = { bytes: data, mimetype: mimeForName(bn) };
          }
        }
      } else {
        // Modo manual: un .txt (el _chat.txt) + los audios/videos sueltos.
        const txt = files.find((f) => f.name.toLowerCase().endsWith('.txt'));
        if (!txt) {
          setError('Cargá el .zip exportado por WhatsApp, o el _chat.txt junto con los audios.');
          setStage('idle');
          return;
        }
        name = txt.name.replace(/\.txt$/i, '').replace(/^_?chat$/i, 'chat').trim() || 'chat';
        chatText = await readTextFile(txt);
        for (const f of files) {
          if (f === txt) continue;
          const bn = baseName(f.name);
          media[bn] = { bytes: await readBytes(f), mimetype: f.type || mimeForName(bn) };
        }
      }

      if (!chatText.trim()) {
        setError('No se encontró el texto del chat (_chat.txt) en lo que cargaste.');
        setStage('idle');
        return;
      }

      const result = parseChat(chatText);
      if (!result.messages.length) {
        setError('No pude leer mensajes del chat. ¿Es una exportación de WhatsApp válida?');
        setStage('idle');
        return;
      }
      setChatName(name);
      setParsed(result);
      setFilesMap(media);
      setTranscripts({});
      setStage('ready');
    } catch (e) {
      console.error('handleFiles', e);
      setError('No pude abrir el archivo. Si es un .zip muy grande, esperá unos segundos e intentá de nuevo.');
      setStage('idle');
    }
  };

  // ── Transcripción ──
  const transcribeOne = async (f) => {
    const entry = filesMap[f.filename];
    if (!entry) return;
    const base64 = bytesToBase64(entry.bytes);
    const call = () => invokeTranscribir({ base64, mimetype: entry.mimetype, filename: f.filename });
    try {
      let res = await call();
      // Un reintento si el proveedor pide throttle.
      if (res && res.ok === false && res.error === 'rate_limited') {
        await new Promise((r) => setTimeout(r, 2500));
        res = await call();
      }
      if (res && res.ok) {
        setTranscripts((t) => ({ ...t, [f.filename]: { text: res.text || '' } }));
      } else {
        setTranscripts((t) => ({ ...t, [f.filename]: { error: res?.error || 'desconocido' } }));
      }
    } catch (e) {
      setTranscripts((t) => ({ ...t, [f.filename]: { error: e?.message || 'error' } }));
    } finally {
      setProgress((p) => ({ ...p, done: p.done + 1, current: f.filename }));
    }
  };

  const startTranscription = async () => {
    // Solo los que faltan (permite reintentar fallidos sin re-cobrar los ok).
    const pending = toTranscribe.filter((f) => !transcripts[f.filename] || transcripts[f.filename].error);
    if (!pending.length) { setStage('done'); return; }
    setStage('transcribing');
    setProgress({ done: transcripts ? Object.keys(transcripts).length : 0, total: toTranscribe.length, current: '' });
    // recomputar done real (los ya ok)
    const okCount = toTranscribe.filter((f) => transcripts[f.filename]?.text !== undefined).length;
    setProgress({ done: okCount, total: toTranscribe.length, current: '' });
    await runPool(pending, CONCURRENCY, transcribeOne);
    setStage('done');
  };

  // ── Salida ──
  const output = useMemo(() => {
    if (!parsed) return '';
    return assembleTranscript(parsed.messages, transcripts);
  }, [parsed, transcripts]);

  const failed = toTranscribe.filter((f) => transcripts[f.filename]?.error);

  const copy = async () => {
    try { await navigator.clipboard.writeText(output); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* no clipboard */ }
  };
  const download = () => {
    const blob = new Blob([output], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${chatName.replace(/[^\w\s.-]+/g, '').trim() || 'chat'}_transcrito.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 max-md:p-3 max-w-[860px]">
      <div className="text-[12px] text-text3 mb-3 leading-snug">
        Cargá la exportación de WhatsApp <b>con archivos multimedia</b> (el <code className="text-[11px] bg-surface2 px-1 rounded">.zip</code>,
        o el <code className="text-[11px] bg-surface2 px-1 rounded">_chat.txt</code> junto con los audios). Se arma el chat completo en texto,
        en orden, con cada audio y video transcrito en su lugar.
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-[10px] border border-[#FECACA] bg-[#FEF2F2] text-[#B91C1C] text-[12px] px-3 py-2 mb-3">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> <span>{error}</span>
        </div>
      )}

      {/* Zona de carga */}
      {(stage === 'idle' || stage === 'loading') && (
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => stage === 'idle' && inputRef.current?.click()}
          className={`rounded-[14px] border-2 border-dashed p-8 text-center transition-colors ${
            dragOver ? 'border-[#F59E0B] bg-[#FFFBF2]' : 'border-border bg-surface hover:border-[#F59E0B]/50'
          } ${stage === 'loading' ? 'cursor-default' : 'cursor-pointer'}`}
        >
          <input
            ref={inputRef} type="file" className="hidden" multiple
            accept=".zip,.txt,audio/*,video/*,.opus,.ogg,.m4a,.mp3,.mp4"
            onChange={(e) => handleFiles(e.target.files)}
          />
          {stage === 'loading' ? (
            <div className="flex flex-col items-center gap-2 text-text2">
              <Loader2 size={26} className="animate-spin text-[#F59E0B]" />
              <div className="text-[13px] font-semibold">Abriendo la exportación…</div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5">
              <span className="w-12 h-12 rounded-[14px] bg-[#FEF0D7] flex items-center justify-center mb-1">
                <UploadCloud size={22} className="text-[#B45309]" />
              </span>
              <div className="text-[13.5px] font-bold text-text">Soltá el .zip acá o hacé clic para elegirlo</div>
              <div className="text-[11.5px] text-text3">También podés seleccionar el <code className="bg-surface2 px-1 rounded">_chat.txt</code> + los audios juntos</div>
            </div>
          )}
        </div>
      )}

      {/* Resumen + acción */}
      {stage !== 'idle' && stage !== 'loading' && parsed && (
        <div className="rounded-[14px] border border-border bg-white p-4 shadow-[0_1px_2px_rgba(10,22,40,.04)]">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-8 h-8 rounded-[10px] bg-[#FEF0D7] flex items-center justify-center shrink-0">
                <FileText size={15} className="text-[#B45309]" />
              </span>
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold truncate">{chatName}</div>
                <div className="text-[11px] text-text3">{parsed.messages.length} mensajes</div>
              </div>
            </div>
            <button onClick={reset} title="Empezar de nuevo"
                    className="flex items-center gap-1 text-[12px] text-text2 hover:text-[#DC2626] cursor-pointer">
              <X size={13} /> Descartar
            </button>
          </div>

          {/* Chips de conteo */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <Stat Icon={Mic} label="audios" n={counts.audio} tone="#B45309" bg="#FEF0D7" />
            <Stat Icon={Film} label="videos" n={counts.video} tone="#7C3AED" bg="#F3E8FF" />
            <Stat Icon={ImageIcon} label="imágenes" n={counts.image} tone="#0369A1" bg="#E0F2FE" />
            {counts.omitted > 0 && <Stat Icon={AlertTriangle} label="omitidos" n={counts.omitted} tone="#9CA3AF" bg="#F3F4F6" />}
          </div>

          {missingCount > 0 && (
            <div className="text-[11.5px] text-[#B45309] bg-[#FFFBF2] border border-[#FDE6BC] rounded-[10px] px-3 py-2 mb-3 leading-snug">
              Hay {missingCount} audio/video referenciado(s) en el chat cuyo archivo no está en lo que cargaste.
              Se marcarán como “no disponible”. Asegurate de exportar <b>con archivos multimedia</b>.
            </div>
          )}

          {/* Progreso / acción */}
          {stage === 'transcribing' ? (
            <div>
              <div className="flex items-center justify-between text-[12px] text-text2 mb-1.5">
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin text-[#F59E0B]" /> Transcribiendo…</span>
                <span className="font-semibold">{progress.done}/{progress.total}</span>
              </div>
              <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                <div className="h-full bg-[#F59E0B] transition-all duration-300"
                     style={{ width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%` }} />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              {toTranscribe.length > 0 && stage !== 'done' && (
                <button onClick={startTranscription}
                        className="py-2 px-4 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 shadow-[0_2px_6px_rgba(245,158,11,.35)]">
                  <Mic size={14} /> Transcribir {toTranscribe.length} audio{toTranscribe.length !== 1 ? 's' : ''}/video
                </button>
              )}
              {stage === 'done' && failed.length > 0 && (
                <button onClick={startTranscription}
                        className="py-2 px-3.5 rounded-[10px] border border-[#F59E0B]/50 bg-[#FEF0D7] text-[#B45309] text-[12.5px] font-bold cursor-pointer hover:bg-[#FDE6BC] flex items-center gap-1.5">
                  <RefreshCw size={13} /> Reintentar {failed.length} fallido{failed.length !== 1 ? 's' : ''}
                </button>
              )}
              {toTranscribe.length === 0 && (
                <div className="text-[12px] text-text3">Este chat no tiene audios ni videos con archivo para transcribir. Igual podés ver/descargar el texto.</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Resultado */}
      {parsed && (stage === 'done' || (stage === 'ready' && toTranscribe.length === 0)) && (
        <div className="mt-4">
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <div className="text-[12.5px] font-semibold text-text2">
              Chat combinado
              {failed.length > 0 && <span className="text-[#B45309] font-normal"> · {failed.length} audio(s) no se pudieron transcribir</span>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={copy}
                      className="py-1.5 px-3 rounded-[10px] border border-border bg-white text-[12px] font-semibold text-text2 cursor-pointer hover:bg-surface2 flex items-center gap-1.5">
                {copied ? <><Check size={13} className="text-[#15803D]" /> Copiado</> : <><Copy size={13} /> Copiar</>}
              </button>
              <button onClick={download}
                      className="py-1.5 px-3 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 shadow-[0_2px_6px_rgba(245,158,11,.35)]">
                <Download size={13} /> Descargar .txt
              </button>
            </div>
          </div>
          <textarea
            readOnly value={output}
            className="w-full h-[420px] max-md:h-[300px] p-3 text-[12.5px] font-mono leading-relaxed rounded-[12px] border border-border bg-surface outline-none resize-y"
          />
        </div>
      )}
    </div>
  );
}

function Stat({ Icon, label, n, tone, bg }) {
  return (
    <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-[10px] text-[12px] font-semibold" style={{ background: bg, color: tone }}>
      <Icon size={13} /> {n} {label}
    </span>
  );
}
