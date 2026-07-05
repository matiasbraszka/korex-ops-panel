import { useState } from 'react';
import { X, Download, Loader2, Mic } from 'lucide-react';
import { invokeExport, invokeMedia } from '../lib/api.js';
import { transcribeAudioUrl } from '../lib/audioTranscribe.js';

// Pool de concurrencia simple.
async function runPool(items, limit, worker) {
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) { const idx = i++; await worker(items[idx], idx); }
    }),
  );
}

function download(name, text) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name || 'chat.txt';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Modal de exportación del chat a .txt: rango de fechas opcional + opción de
// transcribir los audios (los reemplaza en su lugar cronológico).
export default function ExportChatModal({ open, onClose, conv }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [transcribe, setTranscribe] = useState(true);
  const [stage, setStage] = useState('idle'); // idle | working | error
  const [phase, setPhase] = useState(''); // 'export' | 'audios'
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');

  if (!open || !conv) return null;
  const busy = stage === 'working';
  const close = () => { if (!busy) onClose(); };

  const run = async () => {
    setStage('working'); setError(''); setPhase('export'); setProgress({ done: 0, total: 0 });
    try {
      const fromIso = from ? new Date(from + 'T00:00:00').toISOString() : '';
      const toIso = to ? new Date(to + 'T23:59:59.999').toISOString() : '';
      const { text, audios, filename } = await invokeExport({ conversationId: conv.id, from: fromIso, to: toIso });
      let finalText = text || '';

      if (transcribe && Array.isArray(audios) && audios.length) {
        setPhase('audios');
        setProgress({ done: 0, total: audios.length });
        const map = {};
        await runPool(audios, 3, async (a) => {
          let val = null;
          try {
            const media = await invokeMedia(a.id); // { url, mime, filename }
            const res = media?.url ? await transcribeAudioUrl(media.url, media.filename) : null;
            if (res?.ok) val = (res.text || '').trim();
          } catch { /* queda null → se marca como no transcrito */ }
          map[a.id] = val;
          setProgress((p) => ({ ...p, done: p.done + 1 }));
        });
        finalText = finalText.replace(/⟦AUDIO:([^⟧]+)⟧/g, (_, id) => {
          const t = map[id];
          if (t == null) return '🎙 Audio (no se pudo transcribir)';
          return t ? `🎤 [Audio] ${t}` : '🎙 Audio (sin voz)';
        });
      } else {
        finalText = finalText.replace(/⟦AUDIO:[^⟧]+⟧/g, '🎙 Audio');
      }

      download(filename, finalText);
      onClose();
    } catch (e) {
      console.error('ExportChatModal', e);
      setError('No se pudo exportar. Probá de nuevo.');
      setStage('error');
    }
  };

  const pct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[#0D1117]/45" onClick={close} />
      <div className="relative bg-white rounded-[16px] w-full max-w-[420px] shadow-2xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-4 h-[52px] border-b border-surface2">
          <span className="text-[14px] font-bold flex items-center gap-2"><Download size={15} className="text-[#B45309]" /> Exportar chat</span>
          <button onClick={close} disabled={busy} className="text-text3 hover:text-text cursor-pointer p-1 disabled:opacity-40"><X size={16} /></button>
        </div>

        <div className="p-4 flex flex-col gap-3.5">
          {/* Rango de fechas */}
          <div>
            <div className="text-[11px] font-bold tracking-widest text-text3 uppercase mb-1.5">Rango de fechas</div>
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-text3">Desde</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} disabled={busy}
                       className="px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[10.5px] text-text3">Hasta</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} disabled={busy}
                       className="px-2.5 py-1.5 text-[12.5px] rounded-lg border border-border outline-none focus:border-[#F59E0B]" />
              </label>
            </div>
            <div className="text-[10.5px] text-text3 mt-1">Dejá ambas vacías para exportar el chat completo.</div>
          </div>

          {/* Transcribir audios */}
          <label className="flex items-start gap-2.5 cursor-pointer select-none rounded-[12px] border border-border p-2.5 hover:border-[#F5D9A8]">
            <input type="checkbox" checked={transcribe} onChange={(e) => setTranscribe(e.target.checked)} disabled={busy}
                   className="mt-0.5 accent-[#F59E0B] w-4 h-4 cursor-pointer" />
            <span className="min-w-0">
              <span className="block text-[12.5px] font-semibold flex items-center gap-1.5"><Mic size={12} className="text-[#B45309]" /> Transcribir los audios a texto</span>
              <span className="block text-[11px] text-text3 leading-snug mt-0.5">Cada audio se reemplaza por su transcripción en su lugar cronológico. En chats con muchos audios tarda un poco.</span>
            </span>
          </label>

          {/* Progreso */}
          {busy && (
            <div>
              <div className="flex items-center justify-between text-[12px] text-text2 mb-1.5">
                <span className="flex items-center gap-1.5"><Loader2 size={13} className="animate-spin text-[#F59E0B]" />
                  {phase === 'audios' ? 'Transcribiendo audios…' : 'Preparando el chat…'}</span>
                {phase === 'audios' && <span className="font-semibold">{progress.done}/{progress.total}</span>}
              </div>
              {phase === 'audios' && (
                <div className="h-2 rounded-full bg-surface2 overflow-hidden">
                  <div className="h-full bg-[#F59E0B] transition-all duration-300" style={{ width: `${pct}%` }} />
                </div>
              )}
            </div>
          )}

          {error && <div className="text-[12px] text-[#B91C1C]">{error}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-surface2">
          <button onClick={close} disabled={busy}
                  className="py-2 px-3.5 rounded-[10px] border border-border bg-white text-[12.5px] font-semibold text-text2 cursor-pointer hover:bg-surface2 disabled:opacity-50">Cancelar</button>
          <button onClick={run} disabled={busy}
                  className="py-2 px-4 rounded-[10px] border-0 bg-[#F59E0B] text-white text-[12.5px] font-bold cursor-pointer hover:bg-[#E08C0B] flex items-center gap-1.5 shadow-[0_2px_6px_rgba(245,158,11,.35)] disabled:opacity-60 disabled:cursor-default">
            {busy ? <><Loader2 size={13} className="animate-spin" /> Exportando…</> : <><Download size={13} /> Exportar .txt</>}
          </button>
        </div>
      </div>
    </div>
  );
}
