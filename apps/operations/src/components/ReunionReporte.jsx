import { useState, useEffect } from 'react';
import { Send, Sparkles, Check, Trash2, AlertCircle, MessageSquare, ListChecks } from 'lucide-react';
import { useApp } from '../context/AppContext';

const SUBTIPO_LABEL = {
  marketing: 'Marketing',
  socios: 'Socios',
  programacion: 'Programación',
  abogada: 'Legal',
  equipo: 'Equipo',
};

// Sección "Reporte de equipo" dentro del detalle de una llamada de equipo.
// Modelo revisar-y-enviar: preparar (IA arma borrador) → editar → enviar (manda
// DMs, agrega subtareas/comentarios y postea al canal del grupo).
export default function ReunionReporte({ llamada }) {
  const { prepareReunionReporte, sendReunionReporte, updateLlamada } = useApp();
  const l = llamada;
  const status = l.reporte_status || 'none';

  const [draft, setDraft] = useState(l.reporte_payload || null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => { setDraft(l.reporte_payload || null); }, [l.id, l.reporte_payload]);

  const handlePrepare = async () => {
    setBusy(true); setError('');
    try {
      const payload = await prepareReunionReporte(l.id);
      setDraft(payload);
    } catch (e) { setError(String(e.message || e)); }
    setBusy(false);
  };

  const persistDraft = (next) => {
    setDraft(next);
    updateLlamada(l.id, { reporte_payload: next });
  };

  const handleSend = async () => {
    setBusy(true); setError(''); setNote('');
    try {
      // Persistir cualquier edición antes de enviar.
      if (draft) await updateLlamada(l.id, { reporte_payload: draft });
      const res = await sendReunionReporte(l.id);
      if (res?.test_mode) {
        setNote('Modo prueba: se mandó el preview completo solo a tu Slack. No se tocó nada del equipo. (Apagá el modo prueba en Settings → Reuniones de equipo para enviar de verdad.)');
      }
    } catch (e) { setError(String(e.message || e)); }
    setBusy(false);
  };

  const editAccionable = (pi, ai, patch) => {
    const next = { ...draft, personas: draft.personas.map((p, i) => i !== pi ? p : {
      ...p, accionables: p.accionables.map((a, j) => j !== ai ? a : { ...a, ...patch }),
    }) };
    persistDraft(next);
  };
  const removeAccionable = (pi, ai) => {
    const next = { ...draft, personas: draft.personas.map((p, i) => i !== pi ? p : {
      ...p, accionables: p.accionables.filter((_, j) => j !== ai),
    }).filter(p => (p.accionables || []).length > 0) };
    persistDraft(next);
  };

  // ── Estado: enviado ──
  if (status === 'sent') {
    return (
      <div className="px-4 py-3 border-b border-gray-100 bg-green-50/40">
        <div className="flex items-center gap-2 text-[12px] text-green-700 font-semibold">
          <Check size={14} /> Reporte enviado
          {l.reporte_sent_at && (
            <span className="text-[10px] font-normal text-green-600">
              · {new Date(l.reporte_sent_at).toLocaleString('es-AR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-500 mt-1">
          Se mandaron los DMs, se agregaron subtareas/comentarios y se posteó al canal de {SUBTIPO_LABEL[l.equipo_subtipo] || 'Equipo'}.
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100 bg-indigo-50/30">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider flex items-center gap-1.5">
          <Sparkles size={12} /> Reporte de equipo
          <span className="text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-indigo-100 text-indigo-600 normal-case">
            {SUBTIPO_LABEL[l.equipo_subtipo] || 'Equipo'}
          </span>
        </div>
        {status === 'none' && (
          <button onClick={handlePrepare} disabled={busy}
            className="flex items-center gap-1.5 text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 rounded-lg py-1.5 px-3 border-none cursor-pointer disabled:opacity-50">
            <Sparkles size={12} /> {busy ? 'Preparando…' : 'Preparar reporte'}
          </button>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-600 bg-red-50 border border-red-200 rounded-lg p-2 mb-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {note && (
        <div className="flex items-start gap-1.5 text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-2 mb-2">
          <AlertCircle size={13} className="shrink-0 mt-0.5" /> {note}
        </div>
      )}

      {status === 'none' && !error && (
        <div className="text-[11px] text-gray-500">
          La IA arma los accionables por persona, los engancha con el sprint y prepara el post del canal. Nada se manda hasta que revises y aprietes Enviar.
        </div>
      )}

      {status === 'draft' && draft && (
        <div className="space-y-3">
          {/* Personas */}
          {(draft.personas || []).map((p, pi) => (
            <div key={pi} className="bg-white rounded-lg border border-gray-200 p-2.5">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[12px] font-semibold text-gray-800">{p.nombre || 'Sin asignar'}</span>
                {!p.has_slack && (
                  <span className="text-[9px] font-semibold rounded-full px-1.5 py-0.5 bg-amber-100 text-amber-700" title="Sin Slack: se notifica por canal + panel">
                    sin Slack → canal + panel
                  </span>
                )}
              </div>
              <div className="space-y-1.5">
                {(p.accionables || []).map((a, ai) => (
                  <div key={ai} className="group flex items-start gap-2 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                    <button
                      title={a.modo === 'subtask' ? 'Se agrega como subtarea' : 'Se agrega como comentario en la tarea'}
                      onClick={() => editAccionable(pi, ai, { modo: a.modo === 'subtask' ? 'comment' : 'subtask' })}
                      className="shrink-0 mt-0.5 p-1 rounded border border-gray-200 bg-white cursor-pointer hover:border-indigo-300 text-gray-500">
                      {a.modo === 'subtask' ? <ListChecks size={12} /> : <MessageSquare size={12} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <input value={a.texto || ''} onChange={e => editAccionable(pi, ai, { texto: e.target.value })}
                        className="w-full text-[12px] text-gray-700 bg-transparent border-none outline-none p-0 focus:bg-gray-50 rounded" />
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] text-gray-400">
                          {a.match_task_id ? (a.modo === 'subtask' ? 'subtarea en tarea del sprint' : 'comentario en tarea del sprint') : 'accionable suelto'}
                        </span>
                        {a.cliente && <span className="text-[10px] text-indigo-400">{a.cliente}</span>}
                      </div>
                    </div>
                    <button onClick={() => removeAccionable(pi, ai)}
                      className="shrink-0 p-1 text-gray-300 hover:text-red-500 bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100" title="Quitar">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Post del canal */}
          <div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
              Post al canal de {SUBTIPO_LABEL[draft.subtipo] || 'Equipo'}
            </div>
            <textarea
              value={draft.canal_post || ''}
              onChange={e => persistDraft({ ...draft, canal_post: e.target.value })}
              className="w-full border border-gray-200 rounded-lg py-2 px-2.5 text-[12px] font-sans outline-none focus:border-indigo-400 resize-y min-h-[80px] bg-white"
              placeholder="Puntos clave para el canal…" />
            {draft.recording_url && (
              <div className="text-[10px] text-gray-400 mt-1">Se adjunta el link de la grabación automáticamente.</div>
            )}
          </div>

          {/* Acciones */}
          <div className="flex items-center justify-between pt-1">
            <button onClick={handlePrepare} disabled={busy}
              className="text-[11px] text-gray-500 bg-transparent border border-gray-200 rounded-lg px-2.5 py-1.5 cursor-pointer hover:bg-gray-50 disabled:opacity-50">
              Volver a generar
            </button>
            <button onClick={handleSend} disabled={busy}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg py-2 px-4 border-none cursor-pointer disabled:opacity-50">
              <Send size={13} /> {busy ? 'Enviando…' : 'Enviar todo'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
