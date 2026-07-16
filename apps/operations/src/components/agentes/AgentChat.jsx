// Chat del panel Agentes: conversación con el agente elegido + generación estructurada
// (botón "Generar") + guardado en el avatar (anuncios) o en el funnel (VSL).
// Honra el gate del pipeline.
import { useState, useRef, useEffect, useMemo } from 'react';
import { supabase } from '@korex/db';
import {
  Send, Loader2, Lock, Sparkles, Save, Check, AlertTriangle, Square,
  ThumbsUp, ThumbsDown, Copy, RefreshCw, Video,
} from 'lucide-react';
import { agentMeta } from './agentMeta';
import AgentMarkdown, { accentOf } from './AgentMarkdown';

const FEEDBACK_TAGS = ['Hook flojo', 'No va al avatar', 'Cliché', 'No alineado al VSL', 'Compliance', 'No se entiende', 'Perfecto'];
const fbid = () => `afb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const actionBtn = 'inline-flex items-center gap-1.5 bg-white border border-border text-text2 rounded-lg py-1.5 px-2.5 text-[11.5px] font-semibold cursor-pointer hover:bg-surface2 hover:text-text hover:border-border-light disabled:opacity-40 disabled:cursor-not-allowed';

// Acciones bajo cada respuesta del agente: copiar, rehacer y feedback (👍/👎).
// El feedback se escribe en agent_feedback y NO toca al agente en vivo: se procesa
// después, en lote, por el triage diario.
function MessageActions({ sel, chatId, subagentKey, userPrompt, responseText, onRegenerate, busy }) {
  const [mode, setMode] = useState(null);   // null | 'down'
  const [tags, setTags] = useState([]);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(null);   // 'up' | 'down'
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const submit = async (rating, tgs = [], note = '') => {
    setSaving(true);
    let uid = null;
    try { uid = (await supabase.auth.getUser())?.data?.user?.id || null; } catch { /* nada */ }
    await supabase.from('agent_feedback').insert({
      id: fbid(), subagent_key: subagentKey, chat_id: chatId || null,
      client_id: sel.clientId, funnel_id: sel.funnelId, avatar_id: sel.avatarId,
      user_prompt: (userPrompt || '').slice(0, 2000), response_text: (responseText || '').slice(0, 8000),
      rating, tags: tgs, comment: note.trim() || null, created_by: uid, status: 'new',
    });
    setSaving(false); setSent(rating); setMode(null);
  };

  const copy = async () => {
    try { await navigator.clipboard.writeText(responseText || ''); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch { /* nada */ }
  };

  const toggleTag = (t) => setTags((s) => (s.includes(t) ? s.filter((x) => x !== t) : [...s, t]));

  return (
    <div className="grid gap-2 mt-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <button onClick={copy} className={actionBtn} title="Copiar la respuesta">
          {copied ? <><Check size={14} className="text-green" /> Copiado</> : <><Copy size={14} /> Copiar</>}
        </button>
        <button onClick={onRegenerate} disabled={busy} className={actionBtn} title="Pedir otra versión">
          <RefreshCw size={14} /> Regenerar
        </button>
        {sent ? (
          <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-green ml-1"><Check size={13} /> ¡Gracias por el feedback!</span>
        ) : (
          <>
            <span className="w-px h-5 bg-border mx-1" />
            <button onClick={() => submit('up')} disabled={saving} className={actionBtn} title="Buena respuesta">
              <ThumbsUp size={14} className="text-green" /> Útil
            </button>
            <button onClick={() => setMode((m) => (m === 'down' ? null : 'down'))} disabled={saving} className={actionBtn} title="Se puede mejorar">
              <ThumbsDown size={14} className="text-red" /> Mejorar
            </button>
          </>
        )}
      </div>

      {mode === 'down' && !sent && (
        <div className="bg-bg border border-border rounded-xl p-2.5 grid gap-2 max-w-[460px]">
          <div className="flex flex-wrap gap-1">
            {FEEDBACK_TAGS.map((t) => (
              <button key={t} onClick={() => toggleTag(t)} className="text-[10.5px] font-semibold py-0.5 px-2 rounded-full border cursor-pointer"
                style={tags.includes(t) ? { background: 'var(--color-blue-bg)', color: '#2E69E0', borderColor: 'var(--color-blue)' } : { background: '#fff', color: 'var(--color-text2)', borderColor: 'var(--color-border)' }}>
                {t}
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={2} placeholder="¿Qué mejorarías? (ej: el hook 4 no va al avatar)"
            className="w-full py-1.5 px-2.5 text-[12px] border border-border rounded-lg outline-none focus:border-blue resize-y" />
          <div className="flex gap-2 justify-end">
            <button onClick={() => setMode(null)} className="text-[11.5px] text-text2 py-1 px-2 cursor-pointer bg-transparent border-none">Cancelar</button>
            <button onClick={() => submit('down', tags, comment)} disabled={saving || (!tags.length && !comment.trim())}
              className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-blue hover:bg-blue-dark text-white text-[11.5px] font-semibold cursor-pointer border-none disabled:opacity-50">
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Enviar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Hooks de un ángulo (tolera formato viejo con un solo `hook`).
function adHooks(a) {
  return Array.isArray(a.hooks) ? a.hooks.filter(Boolean) : (a.hook ? [a.hook] : []);
}

// Aplana un ángulo estructurado a texto (para guardar en el avatar y para copiar).
function adToText(a, i) {
  const hooks = adHooks(a);
  return [
    `ÁNGULO ${i + 1}${a.angle ? ` · ${a.angle}` : ''}`,
    a.headline ? `Titular: ${a.headline}` : '',
    hooks.length ? `Hooks:\n${hooks.map((h, k) => `${k + 1}. ${h}`).join('\n')}` : '',
    a.primary_text ? `Texto base:\n${a.primary_text}` : '',
    a.description ? `Descripción: ${a.description}` : '',
    a.creative_note ? `Nota creativa: ${a.creative_note}` : '',
  ].filter(Boolean).join('\n');
}

// Aplana un guión de VSL a texto (para guardar en el funnel y para copiar).
function vslToText(v) {
  const hooks = Array.isArray(v.hooks) ? v.hooks : [];
  const secs = Array.isArray(v.secciones) ? v.secciones : [];
  return [
    v.caso_base ? `Caso base: ${v.caso_base}` : '',
    v.duracion_estimada ? `Duración estimada: ${v.duracion_estimada}${v.palabras ? ` · ${v.palabras} palabras` : ''}` : '',
    hooks.length ? `\nMENÚ DE HOOKS\n${hooks.map((h, k) => `${k + 1}. [${h.formula || '—'}] ${h.texto || ''}`).join('\n')}` : '',
    secs.length ? `\nGUIÓN\n${secs.map((s) => `${s.n}) ${s.nombre}\n${s.texto}`).join('\n\n')}` : '',
    v.notas ? `\nNotas: ${v.notas}` : '',
  ].filter(Boolean).join('\n');
}

const GATE_COLOR = {
  listo:     { bg: 'var(--color-green-bg)', color: '#15803D', border: 'rgba(34,197,94,.28)' },
  pendiente: { bg: '#FEF9E7', color: '#A16207', border: '#F1E3B0' },
  bloqueado: { bg: 'var(--color-surface2)', color: 'var(--color-text2)', border: 'var(--color-border)' },
};

// El banner refleja la etapa del agente que estás usando: el de anuncios espera el VSL,
// el de VSL espera los avatares. Antes decía "Anuncios" fijo.
const GATE_TXT = {
  anuncios: { etapa: 'Anuncios', blocked: 'El agente puede ayudarte a completar el VSL, pero no escribe anuncios finales hasta tenerlo.' },
  vsl: { etapa: 'VSL', blocked: 'Sin los avatares del DEL no hay dolor definido: el agente puede ayudarte a avanzarlos, pero no escribe el guión final hasta tenerlos.' },
};

function GateBanner({ gate, agentKey }) {
  if (!gate) return null;
  const g = GATE_COLOR[gate.status] || GATE_COLOR.bloqueado;
  const blocked = gate.status === 'bloqueado';
  const t = GATE_TXT[agentKey] || { etapa: agentKey, blocked: '' };
  return (
    <div className="flex items-start gap-2.5 py-2.5 px-3.5 rounded-[11px] border text-[12.5px]" style={{ background: g.bg, borderColor: g.border }}>
      {blocked
        ? <Lock size={14} className="shrink-0 mt-0.5" style={{ color: g.color }} />
        : <span className="w-2 h-2 rounded-full shrink-0 mt-[5px]" style={{ background: g.color }} />}
      <span className="text-text">
        <strong className="font-bold" style={{ color: g.color }}>{t.etapa}: {gate.status}{gate.substate ? ` · ${gate.substate}` : ''}</strong>{' '}
        <span className="text-text2">— {gate.detail}</span>
        {blocked && t.blocked && <span className="text-text2"> · {t.blocked}</span>}
      </span>
    </div>
  );
}

function VslCard({ vsl, onSave, saved }) {
  const hooks = Array.isArray(vsl.hooks) ? vsl.hooks : [];
  const secs = Array.isArray(vsl.secciones) ? vsl.secciones : [];
  const a = accentOf('vsl');
  const [abierta, setAbierta] = useState(null); // null = todas abiertas
  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 py-2.5 px-3 border-b border-[#F1F3F7]" style={{ background: a.bg2 }}>
        <span className="text-[12px] font-bold text-text truncate flex items-center gap-2">
          <Video size={14} style={{ color: a.c }} />
          Guión de VSL
          {vsl.duracion_estimada && <span className="font-semibold text-[11px] py-0.5 px-2 rounded-full" style={{ background: a.bg, color: a.c }}>{vsl.duracion_estimada}</span>}
          {vsl.palabras > 0 && <span className="text-[11px] text-text3 font-normal">{vsl.palabras} palabras</span>}
        </span>
        <button onClick={() => onSave(vsl)} disabled={saved}
          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border shrink-0 disabled:cursor-default"
          style={saved ? { background: 'var(--color-green-bg)', color: '#15803D', borderColor: '#C7EBD4' } : { background: '#fff', color: a.c, borderColor: a.c + '66' }}>
          {saved ? <><Check size={12} /> Guardado</> : <><Save size={12} /> Guardar en el funnel</>}
        </button>
      </div>
      <div className="p-3 grid gap-3 text-[12.5px] text-[#374151]">
        {vsl.caso_base && (
          <div className="text-[11.5px] rounded-lg py-1.5 px-2.5 flex items-start gap-1.5" style={{ background: a.bg, color: '#4B5563' }}>
            <Sparkles size={12} style={{ color: a.c }} className="shrink-0 mt-0.5" />
            <span><strong style={{ color: a.c }}>Clonado de:</strong> {vsl.caso_base}</span>
          </div>
        )}

        {hooks.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>Menú de hooks ({hooks.length}) · elegí uno para grabar</span>
            <ol className="mt-1.5 grid gap-1.5 list-none p-0">
              {hooks.map((h, k) => (
                <li key={k} className="flex gap-2 items-start leading-snug rounded-lg p-2" style={{ background: k === 0 ? a.bg2 : 'transparent', border: k === 0 ? `1px solid ${a.bg}` : '1px solid transparent' }}>
                  <span className="flex-none w-[19px] h-[19px] rounded-md flex items-center justify-center text-[10.5px] font-bold mt-px" style={{ background: a.bg, color: a.c }}>{k + 1}</span>
                  <span className="flex-1 min-w-0 text-text">
                    {h.formula && <span className="text-[10px] font-bold mr-1.5 py-0.5 px-1.5 rounded" style={{ background: a.c, color: '#fff' }}>{h.formula}</span>}
                    {h.texto}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        {/* Las 10 secciones: cada una con su número, plegable para poder leer la estructura
            de un vistazo sin scrollear 2.000 palabras. */}
        {secs.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>El guión · {secs.length} secciones</span>
              <button onClick={() => setAbierta(abierta === 'none' ? null : 'none')}
                className="text-[10.5px] font-semibold cursor-pointer bg-transparent border-none" style={{ color: a.c }}>
                {abierta === 'none' ? 'Abrir todas' : 'Ver solo la estructura'}
              </button>
            </div>
            <div className="grid gap-1.5">
              {secs.map((s) => {
                const open = abierta !== 'none';
                return (
                  <div key={s.n} className="rounded-lg border border-[#EEF0F4] overflow-hidden">
                    <div className="flex items-center gap-2 py-1.5 px-2" style={{ background: a.bg2 }}>
                      <span className="flex-none w-[20px] h-[20px] rounded-md text-white flex items-center justify-center text-[10.5px] font-bold" style={{ background: a.c }}>{s.n}</span>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-text">{s.nombre}</span>
                    </div>
                    {open && (
                      <div className="p-2.5 leading-relaxed whitespace-pre-wrap text-[12.5px] text-[#3F4653]">{s.texto}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {vsl.notas && (
          <div className="text-[11.5px] rounded-lg p-2.5" style={{ background: 'var(--color-yellow-bg)', border: '1px solid #F1E3B0', color: '#7A5B00' }}>
            <strong>📝 Falta completar:</strong> {vsl.notas}
          </div>
        )}
      </div>
    </div>
  );
}

function AdCard({ ad, idx, onSave, saved }) {
  const hooks = adHooks(ad);
  const a = accentOf('anuncios');
  return (
    <div className="border border-border rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 py-2 px-3 border-b border-[#F1F3F7]" style={{ background: a.bg2 }}>
        <span className="text-[12px] font-bold text-text truncate flex items-center gap-2">
          <span className="inline-flex items-center justify-center w-[18px] h-[18px] rounded-md text-white text-[10px] font-bold" style={{ background: a.c }}>{idx + 1}</span>
          {ad.angle || `Ángulo ${idx + 1}`}
        </span>
        <button onClick={() => onSave(ad, idx)} disabled={saved}
          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border shrink-0 disabled:cursor-default"
          style={saved ? { background: 'var(--color-green-bg)', color: '#15803D', borderColor: '#C7EBD4' } : { background: '#fff', color: '#2E69E0', borderColor: 'var(--color-blue-light)' }}>
          {saved ? <><Check size={12} /> Guardado</> : <><Save size={12} /> Guardar en avatar</>}
        </button>
      </div>
      <div className="p-3 grid gap-2.5 text-[12.5px] text-[#374151]">
        {ad.headline && <div><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>Titular</span><div className="mt-0.5 font-semibold text-text">{ad.headline}</div></div>}
        {hooks.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>Hooks ({hooks.length}) · intercambiables con el texto base</span>
            <ol className="mt-1.5 grid gap-1.5 list-none p-0">
              {hooks.map((h, k) => (
                <li key={k} className="flex gap-2 items-start text-text leading-snug">
                  <span className="flex-none w-[19px] h-[19px] rounded-md flex items-center justify-center text-[10.5px] font-bold mt-px" style={{ background: a.bg, color: a.c }}>{k + 1}</span>
                  <span className="flex-1 min-w-0">{h}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
        {/* El texto base es el cuerpo del anuncio: se lee mejor destacado del resto. */}
        {ad.primary_text && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>Texto base</span>
            <div className="mt-1 rounded-lg p-2.5" style={{ background: a.bg2, borderLeft: `3px solid ${a.c}` }}>
              <AgentMarkdown text={ad.primary_text} agentKey="anuncios" className="text-[12.5px]" />
            </div>
          </div>
        )}
        {ad.description && <div><span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: a.c }}>Descripción</span><div className="mt-0.5">{ad.description}</div></div>}
        {ad.creative_note && <div className="text-[11.5px] text-text2 italic border-t border-[#F1F3F7] pt-2">🎬 {ad.creative_note}</div>}
      </div>
    </div>
  );
}

export default function AgentChat({ sel, gate, agentKey, agentName, currentUser, onSaveCopy, chatKey, initialMessages = [], onTurn }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedKeys, setSavedKeys] = useState({});
  const [totalCost, setTotalCost] = useState(0);
  const scrollRef = useRef(null);
  const taRef = useRef(null);
  const reqSeqRef = useRef(0); // para poder DETENER la respuesta en curso

  const meta = agentMeta(agentKey);
  const AgentIcon = meta.Icon;
  const accent = accentOf(agentKey);
  const isAds = agentKey === 'anuncios';
  const isVsl = agentKey === 'vsl';
  const canGenerate = isAds || isVsl; // los demás agentes solo chatean (sin salida estructurada)
  // El de funnels entrega la landing MAQUETADA en tablas (una banda = una tabla, las celdas
  // son sus columnas). Con la columna de lectura de 860px esas tablas se estrujan, así que
  // acá el chat se ensancha. Los demás siguen angostos: para texto corrido, 860 se lee mejor.
  const ANCHO = agentKey === 'landing' ? 'max-w-[1280px]' : 'max-w-[860px]';

  // Reset/carga al cambiar de conversación (chat nuevo o al abrir uno del historial).
  useEffect(() => { setMessages(initialMessages || []); setSavedKeys({}); setTotalCost(0); }, [chatKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);
  // El textarea crece con el texto hasta un tope.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [input]);

  const blocked = gate?.status === 'bloqueado';
  const chatId = chatKey && !String(chatKey).startsWith('new:') ? String(chatKey) : null;

  async function callAgent(historyForApi, mode) {
    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: {
        subagent_key: agentKey,
        client_id: sel.clientId, strategy_id: sel.strategyId, funnel_id: sel.funnelId, avatar_id: sel.avatarId,
        mode,
        messages: historyForApi.filter((m) => m.kind !== 'ads' && m.kind !== 'vsl' && m.kind !== 'notice').map((m) => ({ role: m.role, content: m.content })),
      },
    });
    if (error) throw new Error(error.message || 'No se pudo contactar al agente.');
    return data;
  }

  function stopReply() {
    reqSeqRef.current++; // invalida la respuesta en curso: cuando llegue, se descarta
    setBusy(false);
    setMessages((m) => [...m, { role: 'assistant', kind: 'notice', content: '⏹ Respuesta detenida. Podés escribir de nuevo.' }]);
  }

  // Corre un turno a partir de un historial que YA termina en el mensaje del usuario.
  async function run(withUser, mode) {
    setMessages(withUser);
    setBusy(true);
    const mySeq = ++reqSeqRef.current;
    let assistantMsg;
    try {
      const data = await callAgent(withUser, mode);
      if (!data?.ok) {
        const faltante = isVsl ? 'Faltan los avatares del DEL en este funnel para escribir el guión.' : 'Falta el VSL de este funnel para generar anuncios.';
        const detail = data?.detail || (data?.error === 'gate_blocked' ? faltante : 'Ocurrió un problema.');
        assistantMsg = { role: 'assistant', kind: 'notice', content: detail };
      } else if (mode === 'generate' && data.ad_copy?.ads?.length) {
        assistantMsg = { role: 'assistant', kind: 'ads', ads: data.ad_copy.ads, notes: data.ad_copy.notes || '' };
      } else if (mode === 'generate' && data.vsl_script?.secciones?.length) {
        assistantMsg = { role: 'assistant', kind: 'vsl', vsl: data.vsl_script };
      } else {
        assistantMsg = { role: 'assistant', content: data.reply || '(sin respuesta)' };
      }
      if (data?.cost_usd && reqSeqRef.current === mySeq) setTotalCost((c) => c + Number(data.cost_usd));
    } catch (e) {
      assistantMsg = { role: 'assistant', kind: 'notice', content: String(e.message || e) };
    }
    if (reqSeqRef.current !== mySeq) return; // se detuvo o fue reemplazada → descartar
    setBusy(false);
    const finalMsgs = [...withUser, assistantMsg];
    setMessages(finalMsgs);
    onTurn?.(finalMsgs); // persiste la conversación (historial)
  }

  function send(text, mode = 'chat') {
    const content = (text ?? input).trim();
    if ((!content && mode === 'chat') || busy) return;
    const userMsg = { role: 'user', content: content || 'Generá anuncios para este avatar.' };
    setInput('');
    run([...messages, userMsg], mode);
  }

  // Rehace la respuesta `idx`: vuelve a pedirla con el mismo historial previo.
  function regenerate(idx) {
    if (busy) return;
    const history = messages.slice(0, idx);
    if (!history.some((m) => m.role === 'user')) return;
    const k = messages[idx]?.kind;
    run(history, k === 'ads' || k === 'vsl' ? 'generate' : 'chat');
  }

  function saveAd(ad, idx) {
    const key = `${sel.funnelId}:${sel.avatarId}:${JSON.stringify(ad).length}:${idx}`;
    onSaveCopy(adToText(ad, idx));
    setSavedKeys((s) => ({ ...s, [key]: true }));
  }

  function saveVsl(vsl) {
    const key = `${sel.funnelId}:vsl:${JSON.stringify(vsl).length}`;
    onSaveCopy(vslToText(vsl));
    setSavedKeys((s) => ({ ...s, [key]: true }));
  }

  const empty = messages.length === 0;
  const suggestions = useMemo(() => meta.suggestions || [], [meta]);
  const initials = currentUser?.initials || 'YO';

  return (
    <>
      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto py-5 px-6 max-md:py-4 max-md:px-3.5">
        <div className={`${ANCHO} mx-auto flex flex-col gap-5`}>
          <GateBanner gate={gate} agentKey={agentKey} />

          {empty && (
            <div className="text-center py-8 grid gap-3 justify-items-center">
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-blue-bg text-blue"><Sparkles size={22} /></span>
              <div className="text-[13.5px] font-semibold text-[#4B5563] max-w-[520px]">
                {isVsl
                  ? 'El agente ya tiene el avatar de este funnel, el blueprint del método y los 28 VSLs de la biblioteca con su retención real de Voomly.'
                  : 'El agente ya tiene cargado el contexto de este avatar, su VSL y los anuncios ganadores.'}
              </div>
              <div className="text-[12px] text-text3">Empezá con un atajo de abajo o escribile lo que necesites.</div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.kind === 'notice') return (
              <div key={i} className="flex items-start gap-2 py-2.5 px-3.5 rounded-xl bg-orange-bg border border-[#FBD9A8] text-[12.5px] text-[#9A3412] self-center max-w-[85%]">
                <AlertTriangle size={15} className="shrink-0 mt-0.5" />{m.content}
              </div>
            );

            const isUser = m.role === 'user';
            if (isUser) return (
              <div key={i} className="flex gap-3 flex-row-reverse">
                <span className="w-[34px] h-[34px] rounded-full text-white flex items-center justify-center text-[12px] font-bold shrink-0"
                  style={{ background: 'linear-gradient(135deg,#3F4653,#1A1D26)' }}>{initials}</span>
                <div className="max-w-[82%] bg-blue text-white rounded-[16px_16px_4px_16px] py-3 px-4 text-[13.5px] leading-relaxed whitespace-pre-wrap" style={{ boxShadow: '0 2px 8px rgba(91,124,245,.28)' }}>
                  {m.content}
                </div>
              </div>
            );

            const prevUser = messages.slice(0, i).reverse().find((x) => x.role === 'user' && !x.kind)?.content || '';
            const responseText = m.kind === 'ads'
              ? (m.ads || []).map((ad, idx) => adToText(ad, idx)).join('\n\n') + (m.notes ? `\n\nNotas: ${m.notes}` : '')
              : m.kind === 'vsl' ? vslToText(m.vsl || {})
              : m.content;

            return (
              <div key={i} className="flex gap-3">
                <span className="w-[34px] h-[34px] rounded-[9px] text-white flex items-center justify-center shrink-0"
                  style={{ background: accent.c, boxShadow: `0 2px 8px ${accent.c}4D` }}>
                  <AgentIcon size={18} strokeWidth={1.85} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13.5px] font-bold text-text">{agentName}</span>
                  </div>

                  {m.kind === 'ads' ? (
                    <div className="grid gap-2.5">
                      {m.ads.map((ad, idx) => (
                        <AdCard key={idx} ad={ad} idx={idx} onSave={saveAd}
                          saved={!!savedKeys[`${sel.funnelId}:${sel.avatarId}:${JSON.stringify(ad).length}:${idx}`]} />
                      ))}
                      {m.notes && <div className="text-[12px] text-text2 bg-bg border border-border rounded-xl p-3">💡 {m.notes}</div>}
                    </div>
                  ) : m.kind === 'vsl' ? (
                    <VslCard vsl={m.vsl} onSave={saveVsl}
                      saved={!!savedKeys[`${sel.funnelId}:vsl:${JSON.stringify(m.vsl).length}`]} />
                  ) : (
                    <div className="bg-white border border-border rounded-[4px_16px_16px_16px] py-4 px-[18px]"
                      style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04), 0 1px 3px rgba(10,22,40,.06)' }}>
                      <AgentMarkdown text={m.content} agentKey={agentKey} />
                    </div>
                  )}

                  <MessageActions sel={sel} chatId={chatId} subagentKey={agentKey} userPrompt={prevUser}
                    responseText={responseText} busy={busy} onRegenerate={() => regenerate(i)} />
                </div>
              </div>
            );
          })}

          {busy && (
            <div className="flex gap-3 items-center">
              <span className="w-[34px] h-[34px] rounded-[9px] bg-blue text-white flex items-center justify-center shrink-0"><AgentIcon size={18} strokeWidth={1.85} /></span>
              <div className="py-2.5 px-3.5 rounded-2xl bg-surface2 inline-flex items-center gap-2 text-[12.5px] text-text2">
                <Loader2 size={14} className="animate-spin" /> Pensando…
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 bg-white border-t border-border py-3 px-6 max-md:py-2.5 max-md:px-3.5">
        <div className={`${ANCHO} mx-auto`}>
          {suggestions.length > 0 && (
            /* Una sola fila: los chips muestran el atajo corto y scrollean en horizontal
               si no entran, para no comerle alto al chat. */
            <div className="flex items-center gap-2 mb-2 flex-nowrap overflow-x-auto no-scrollbar">
              <span className="inline-flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.06em] text-text3 shrink-0">
                <Sparkles size={13} /> Sugerencias
              </span>
              {suggestions.map((s) => (
                <button key={s.label} onClick={() => send(s.prompt)} disabled={busy} title={s.prompt}
                  className="border rounded-full py-1 px-2.5 text-[11.5px] font-semibold cursor-pointer whitespace-nowrap shrink-0 hover:brightness-95 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: accent.bg2, borderColor: accent.bg, color: accent.c }}>
                  {s.label}
                </button>
              ))}
            </div>
          )}

          <div className="border border-border rounded-[14px] bg-white py-3 px-3.5 pb-2.5 focus-within:border-blue transition-colors"
            style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={`Escribile a ${agentName}… (Enter para enviar, Shift+Enter salto de línea)`}
              rows={1}
              className="w-full border-none outline-none resize-none text-[13.5px] leading-[1.55] text-text bg-transparent"
            />
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <div className="flex items-center gap-2 min-w-0">
                {canGenerate && (
                  <button onClick={() => send('', 'generate')} disabled={busy || blocked}
                    title={blocked
                      ? (isVsl ? 'Faltan los avatares de este funnel' : 'Falta el VSL de este funnel')
                      : (isVsl ? 'Escribir el guión completo para guardarlo en el funnel' : 'Generar una tanda de anuncios para guardar')}
                    className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border border-border bg-white text-[12px] font-semibold text-text2 cursor-pointer hover:bg-surface2 hover:text-text disabled:opacity-40 disabled:cursor-not-allowed shrink-0">
                    {blocked ? <Lock size={14} /> : <Sparkles size={14} style={{ color: accent.c }} />} {isVsl ? 'Generar guión' : 'Generar anuncios'}
                  </button>
                )}
                <span className="text-[11px] text-text3 truncate max-md:hidden">
                  {totalCost > 0 ? `Gasto de esta sesión: US$${totalCost.toFixed(3)}` : 'Contexto del cliente cargado'}
                </span>
              </div>
              <button
                onClick={() => (busy ? stopReply() : send())}
                disabled={!busy && !input.trim()}
                title={busy ? 'Detener la respuesta' : 'Enviar'}
                className="inline-flex items-center gap-1.5 border-none rounded-[10px] py-2 px-4 text-[13px] font-semibold text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                style={{ background: busy ? 'var(--color-red)' : 'var(--color-blue)', boxShadow: busy ? 'none' : '0 2px 8px rgba(91,124,245,.3)' }}
              >
                {busy ? <><Square size={14} fill="#fff" /> Detener</> : <>Enviar <Send size={16} /></>}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
