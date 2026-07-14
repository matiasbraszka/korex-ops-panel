// Chat del panel Agentes: conversación con el agente de Anuncios + generación estructurada
// (botón "Generar anuncios") + guardado del copy en el avatar. Honra el gate del pipeline.
import { useState, useRef, useEffect } from 'react';
import { supabase } from '@korex/db';
import { Send, Loader2, Lock, Sparkles, Bot, User, Save, Check, ChevronRight, AlertTriangle, Square } from 'lucide-react';

const PINK = '#EC4899';
const QUICK_STARTS = [
  'Generá 3 anuncios con ángulos nuevos para este avatar',
  'Basate en los anuncios ganadores y proponé variaciones distintas',
  'Dame 5 ganchos (hooks) potentes para tráfico frío',
  '¿Qué ángulo todavía no estamos explotando con este avatar?',
];

// Hooks de un ángulo (tolera formato viejo con un solo `hook`).
function adHooks(a) {
  return Array.isArray(a.hooks) ? a.hooks.filter(Boolean) : (a.hook ? [a.hook] : []);
}

// Aplana un ángulo estructurado a texto (para guardar en el avatar y para copiar).
function adToText(a, i) {
  const hooks = adHooks(a);
  return [
    `ÁNGULO ${i + 1}${a.angle ? ` · ${a.angle}` : ''}`,
    a.primary_text ? `Texto base:\n${a.primary_text}` : '',
    hooks.length ? `Hooks:\n${hooks.map((h, k) => `${k + 1}. ${h}`).join('\n')}` : '',
    a.headline ? `Titular: ${a.headline}` : '',
    a.description ? `Descripción: ${a.description}` : '',
    a.creative_note ? `Nota creativa: ${a.creative_note}` : '',
  ].filter(Boolean).join('\n');
}

const GATE_COLOR = {
  listo: { bg: '#ECFDF5', color: '#15803D', border: '#C7EBD4' },
  pendiente: { bg: '#FEF9E7', color: '#A16207', border: '#F1E3B0' },
  bloqueado: { bg: '#F4F5F7', color: '#9CA3AF', border: '#E7E9ED' },
};

function GateBanner({ gate }) {
  if (!gate) return null;
  const g = GATE_COLOR[gate.status] || GATE_COLOR.bloqueado;
  const blocked = gate.status === 'bloqueado';
  return (
    <div className="flex items-center gap-2 py-2.5 px-3.5 rounded-xl border text-[12px] font-semibold" style={{ background: g.bg, color: g.color, borderColor: g.border }}>
      {blocked ? <Lock size={14} /> : <span className="w-2 h-2 rounded-full" style={{ background: g.color }} />}
      <span>Anuncios: {gate.status}{gate.substate ? ` · ${gate.substate}` : ''}</span>
      <span className="font-normal opacity-80">— {gate.detail}</span>
      {blocked && <span className="font-normal opacity-80">· El agente puede ayudarte a completar el VSL, pero no escribe anuncios finales hasta tenerlo.</span>}
    </div>
  );
}

function AdCard({ ad, idx, onSave, saved }) {
  const hooks = adHooks(ad);
  return (
    <div className="border border-[#E7EAF0] rounded-xl bg-white overflow-hidden">
      <div className="flex items-center justify-between gap-2 py-2 px-3 border-b border-[#F1F3F7] bg-[#FBFCFE]">
        <span className="text-[12px] font-bold text-[#1A1D26] truncate">Ángulo {idx + 1}{ad.angle ? ` · ${ad.angle}` : ''}</span>
        <button onClick={() => onSave(ad, idx)} disabled={saved} className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-lg text-[11px] font-semibold cursor-pointer border shrink-0" style={saved ? { background: '#ECFDF5', color: '#15803D', borderColor: '#C7EBD4' } : { background: '#fff', color: PINK, borderColor: '#F5C2DD' }}>
          {saved ? <><Check size={12} /> Guardado</> : <><Save size={12} /> Guardar en avatar</>}
        </button>
      </div>
      <div className="p-3 grid gap-2.5 text-[12.5px] text-[#374151]">
        {ad.primary_text && <div><span className="text-[10px] font-bold uppercase tracking-wider text-[#9098A4]">Texto base</span><div className="mt-0.5 whitespace-pre-wrap leading-relaxed">{ad.primary_text}</div></div>}
        {hooks.length > 0 && (
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#9098A4]">Hooks ({hooks.length}) · intercambiables con el texto base</span>
            <ol className="mt-1 grid gap-1 list-decimal pl-5">
              {hooks.map((h, k) => <li key={k} className="text-[#1A1D26] leading-snug">{h}</li>)}
            </ol>
          </div>
        )}
        <div className="flex gap-4 flex-wrap">
          {ad.headline && <div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-wider text-[#9098A4]">Titular</span><div className="mt-0.5">{ad.headline}</div></div>}
          {ad.description && <div className="min-w-0"><span className="text-[10px] font-bold uppercase tracking-wider text-[#9098A4]">Descripción</span><div className="mt-0.5">{ad.description}</div></div>}
        </div>
        {ad.creative_note && <div className="text-[11.5px] text-[#6B7280] italic border-t border-[#F1F3F7] pt-2">🎬 {ad.creative_note}</div>}
      </div>
    </div>
  );
}

export default function AgentChat({ sel, gate, onSaveCopy, chatKey, initialMessages = [], onTurn }) {
  const [messages, setMessages] = useState(initialMessages);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedKeys, setSavedKeys] = useState({});
  const [totalCost, setTotalCost] = useState(0);
  const scrollRef = useRef(null);
  const reqSeqRef = useRef(0); // para poder DETENER la respuesta en curso

  // Reset/carga al cambiar de conversación (chat nuevo o al abrir uno del historial).
  useEffect(() => { setMessages(initialMessages || []); setSavedKeys({}); setTotalCost(0); }, [chatKey]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' }); }, [messages, busy]);

  const blocked = gate?.status === 'bloqueado';

  async function callAgent(historyForApi, mode) {
    const { data, error } = await supabase.functions.invoke('agent-chat', {
      body: {
        subagent_key: 'anuncios',
        client_id: sel.clientId, strategy_id: sel.strategyId, funnel_id: sel.funnelId, avatar_id: sel.avatarId,
        mode,
        messages: historyForApi.filter(m => m.kind !== 'ads' && m.kind !== 'notice').map(m => ({ role: m.role, content: m.content })),
      },
    });
    if (error) throw new Error(error.message || 'No se pudo contactar al agente.');
    return data;
  }

  function stopReply() {
    reqSeqRef.current++; // invalida la respuesta en curso: cuando llegue, se descarta
    setBusy(false);
    setMessages(m => [...m, { role: 'assistant', kind: 'notice', content: '⏹ Respuesta detenida. Podés escribir de nuevo.' }]);
  }

  async function send(text, mode = 'chat') {
    const content = (text ?? input).trim();
    if ((!content && mode === 'chat') || busy) return;
    const userMsg = { role: 'user', content: content || (mode === 'generate' ? 'Generá anuncios para este avatar.' : '') };
    const withUser = [...messages, userMsg];
    setMessages(withUser);
    setInput('');
    setBusy(true);
    const mySeq = ++reqSeqRef.current;
    let assistantMsg;
    try {
      const data = await callAgent(withUser, mode);
      if (!data?.ok) {
        const detail = data?.detail || (data?.error === 'gate_blocked' ? 'Falta el VSL de este funnel para generar anuncios.' : 'Ocurrió un problema.');
        assistantMsg = { role: 'assistant', kind: 'notice', content: detail };
      } else if (mode === 'generate' && data.ad_copy?.ads?.length) {
        assistantMsg = { role: 'assistant', kind: 'ads', ads: data.ad_copy.ads, notes: data.ad_copy.notes || '' };
      } else {
        assistantMsg = { role: 'assistant', content: data.reply || '(sin respuesta)' };
      }
      if (data?.cost_usd && reqSeqRef.current === mySeq) setTotalCost(c => c + Number(data.cost_usd));
    } catch (e) {
      assistantMsg = { role: 'assistant', kind: 'notice', content: String(e.message || e) };
    }
    if (reqSeqRef.current !== mySeq) return; // se detuvo o fue reemplazada → descartar
    setBusy(false);
    const finalMsgs = [...withUser, assistantMsg];
    setMessages(finalMsgs);
    onTurn?.(finalMsgs); // persiste la conversación (historial)
  }

  function saveAd(ad, idx) {
    const key = `${sel.funnelId}:${sel.avatarId}:${JSON.stringify(ad).length}:${idx}`;
    onSaveCopy(adToText(ad, idx));
    setSavedKeys(s => ({ ...s, [key]: true }));
  }

  const empty = messages.length === 0;

  return (
    <div className="bg-white rounded-2xl border border-[#E7EAF0] flex flex-col overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04)', height: 'calc(100vh - 320px)', minHeight: 420 }}>
      {/* Header + gate */}
      <div className="p-3 border-b border-[#F1F3F7] grid gap-2.5" style={{ background: '#FBFCFE' }}>
        <GateBanner gate={gate} />
      </div>

      {/* Mensajes */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 grid gap-3 content-start">
        {empty && (
          <div className="text-center py-8 grid gap-3 justify-items-center">
            <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: '#FDF2F8', color: PINK }}><Sparkles size={22} /></span>
            <div className="text-[13.5px] font-semibold text-[#4B5563]">El agente ya tiene cargado el contexto de este avatar, su VSL y los anuncios ganadores.</div>
            <div className="text-[12px] text-[#9098A4]">Empezá con un atajo o escribile lo que necesites.</div>
            <div className="flex flex-col gap-2 max-w-[520px] w-full mt-1">
              {QUICK_STARTS.map(q => (
                <button key={q} onClick={() => send(q)} disabled={busy} className="text-left py-2.5 px-3.5 rounded-xl border border-[#EFE2EC] bg-[#FEFAFC] text-[12.5px] text-[#4B5563] hover:border-[#EC4899] hover:bg-[#FDF2F8] cursor-pointer inline-flex items-center gap-2 disabled:opacity-50">
                  <ChevronRight size={13} className="text-[#EC4899] shrink-0" />{q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          if (m.kind === 'notice') return (
            <div key={i} className="flex items-start gap-2 py-2.5 px-3.5 rounded-xl bg-[#FFF7ED] border border-[#FBD9A8] text-[12.5px] text-[#9A3412] self-center max-w-[85%]">
              <AlertTriangle size={15} className="shrink-0 mt-0.5" />{m.content}
            </div>
          );
          if (m.kind === 'ads') return (
            <div key={i} className="grid gap-2.5 w-full">
              <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-[#9098A4]"><Bot size={13} className="text-[#EC4899]" />Anuncios generados</div>
              {m.ads.map((ad, idx) => <AdCard key={idx} ad={ad} idx={idx} saved={!!savedKeys[`${sel.funnelId}:${sel.avatarId}:${JSON.stringify(ad).length}:${idx}`]} onSave={saveAd} />)}
              {m.notes && <div className="text-[12px] text-[#6B7280] bg-[#F9FAFB] border border-[#EDF0F5] rounded-xl p-3">💡 {m.notes}</div>}
            </div>
          );
          const isUser = m.role === 'user';
          return (
            <div key={i} className={`flex gap-2 max-w-[85%] ${isUser ? 'self-end flex-row-reverse' : 'self-start'}`}>
              <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg shrink-0" style={isUser ? { background: '#EEF2FF', color: '#5B7CF5' } : { background: '#FDF2F8', color: PINK }}>{isUser ? <User size={15} /> : <Bot size={15} />}</span>
              <div className={`py-2.5 px-3.5 rounded-2xl text-[13px] leading-relaxed whitespace-pre-wrap ${isUser ? 'bg-[#5B7CF5] text-white rounded-tr-sm' : 'bg-[#F4F5F7] text-[#1A1D26] rounded-tl-sm'}`}>{m.content}</div>
            </div>
          );
        })}
        {busy && (
          <div className="flex gap-2 self-start items-center text-[#9098A4]">
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-lg" style={{ background: '#FDF2F8', color: PINK }}><Bot size={15} /></span>
            <div className="py-2.5 px-3.5 rounded-2xl bg-[#F4F5F7] inline-flex items-center gap-2 text-[12.5px]"><Loader2 size={14} className="animate-spin" /> Pensando…</div>
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="p-3 border-t border-[#F1F3F7] grid gap-2">
        <div className="flex items-center gap-2">
          <button onClick={() => send('', 'generate')} disabled={busy || blocked} title={blocked ? 'Falta el VSL de este funnel' : 'Generar una tanda de anuncios para guardar'} className="inline-flex items-center gap-1.5 py-2 px-3 rounded-xl text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" style={{ background: blocked ? '#C4C9D2' : PINK }}>
            {blocked ? <Lock size={14} /> : <Sparkles size={14} />} Generar anuncios
          </button>
          <span className="text-[11px] text-[#AEB4BF] ml-auto">{totalCost > 0 ? `Gasto de esta sesión: US$${totalCost.toFixed(3)}` : 'Se registra en Gasto de API'}</span>
        </div>
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
            placeholder="Escribile al agente de anuncios… (Enter para enviar, Shift+Enter salto de línea)"
            rows={1}
            className="flex-1 py-2.5 px-3.5 border border-[#E2E5EB] rounded-xl text-[13px] resize-none outline-none focus:border-[#EC4899] max-h-[140px] leading-relaxed"
            style={{ minHeight: 44 }}
          />
          <button onClick={() => (busy ? stopReply() : send())} disabled={!busy && !input.trim()} title={busy ? 'Detener la respuesta' : 'Enviar'} className="inline-flex items-center justify-center w-11 h-11 rounded-xl text-white cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed shrink-0" style={{ background: busy ? '#DC2626' : '#5B7CF5' }}>
            {busy ? <Square size={15} fill="#fff" /> : <Send size={18} />}
          </button>
        </div>
      </div>
    </div>
  );
}
