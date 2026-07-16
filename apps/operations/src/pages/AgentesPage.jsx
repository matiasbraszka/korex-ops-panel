// AgentesPage — interfaz dedicada para chatear con los agentes especializados del cerebro
// de Korex. v1: agente de Anuncios. Flujo: elegir agente → cliente → estrategia → funnel →
// avatar y chatear con contexto completo (DEL/avatar/VSL/ganadores) + generar y guardar copys.
// El historial de cada chat se guarda (agent_chats) para poder retomarlo después.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { MousePointerClick, SlidersHorizontal } from 'lucide-react';
import ContextBar from '../components/agentes/ContextBar';
import AgentPicker from '../components/agentes/AgentPicker';
import ChatHistoryMenu from '../components/agentes/ChatHistoryMenu';
import AgentChat from '../components/agentes/AgentChat';
import { chatAgents, agentMeta } from '../components/agentes/agentMeta';

const rid = () => `ach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export default function AgentesPage() {
  const { clients, strategies, strategyPages, updateStrategyPage, currentUser } = useApp();
  const navigate = useNavigate();
  const [sel, setSel] = useState({ clientId: '', strategyId: '', funnelId: '', avatarId: '' });
  const [agentKey, setAgentKey] = useState('anuncios');
  const [subagents, setSubagents] = useState([]);
  const [pipeline, setPipeline] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [initialMessages, setInitialMessages] = useState([]);

  // Lista real de agentes (marketing_subagents). La capa visual (ícono/desc) vive en agentMeta.
  useEffect(() => {
    let alive = true;
    supabase.from('marketing_subagents').select('key,name,active,position').order('position')
      .then(({ data }) => { if (alive) setSubagents(data || []); });
    return () => { alive = false; };
  }, []);

  const agents = useMemo(() => chatAgents(subagents), [subagents]);
  const agentName = agents.find((a) => a.key === agentKey)?.name || 'Anuncios';

  // Cualquier cambio manual de selección arranca un chat NUEVO (contexto distinto).
  const onChange = useCallback((patch) => {
    setSel((s) => ({ ...s, ...patch }));
    setActiveChatId(null);
    setInitialMessages([]);
  }, []);

  const onAgentChange = useCallback((key) => {
    setAgentKey(key);
    setActiveChatId(null);
    setInitialMessages([]);
  }, []);

  // Estado del pipeline del cliente (para el gate de cada agente, por funnel).
  useEffect(() => {
    let alive = true;
    if (!sel.clientId) { setPipeline([]); return undefined; }
    supabase.rpc('cerebro_pipeline_status', { p_client_id: sel.clientId })
      .then(({ data }) => { if (alive) setPipeline(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setPipeline([]); });
    return () => { alive = false; };
  }, [sel.clientId]);

  // Cada agente mira SU etapa: el de anuncios espera el VSL, el de VSL espera los avatares.
  // Tiene que coincidir con STAGE_BY_AGENT de la edge fn agent-chat (que es la autoridad).
  //
  // `descubrimiento` NO está acá a propósito: usa otro gate (descubrimiento_status, a nivel
  // cliente) y no necesita el aviso preventivo de esta barra — su respuesta SIEMPRE arranca
  // diciendo en qué paso está el cliente, así que el cartel sería decir dos veces lo mismo.
  // Cae en el `return null` de abajo.
  const gate = useMemo(() => {
    const stage = { anuncios: 'anuncios', vsl: 'vsl', landing: 'landing' }[agentKey];
    if (!stage) return null;
    return pipeline.find((r) => r.funnel_id === sel.funnelId && r.stage === stage) || null;
  }, [pipeline, sel.funnelId, agentKey]);

  // ── Historial de chats (TODOS, de todos los clientes) ──
  const loadChats = useCallback(async () => {
    const { data } = await supabase.from('agent_chats')
      .select('id,title,client_id,funnel_id,avatar_id,strategy_id,subagent_key,updated_at')
      .order('updated_at', { ascending: false }).limit(200);
    setChats(data || []);
  }, []);
  useEffect(() => { loadChats(); }, [loadChats]);

  // Nombre lindo para cada chat del historial (cliente · funnel · avatar).
  const chatLabel = useCallback((chat) => {
    const cl = clients.find((c) => c.id === chat.client_id);
    const page = strategyPages.find((p) => p.id === chat.funnel_id);
    const av = (Array.isArray(page?.avatars) ? page.avatars : []).find((a) => a.id === chat.avatar_id);
    return [cl?.name, page?.name, av?.name].filter(Boolean).join(' · ');
  }, [clients, strategyPages]);

  const newChat = useCallback(() => { setActiveChatId(null); setInitialMessages([]); }, []);

  const openChat = useCallback(async (chat) => {
    const { data } = await supabase.from('agent_chats').select('*').eq('id', chat.id).maybeSingle();
    setSel({ clientId: chat.client_id || '', strategyId: chat.strategy_id || '', funnelId: chat.funnel_id || '', avatarId: chat.avatar_id || '' });
    if (chat.subagent_key) setAgentKey(chat.subagent_key);
    setActiveChatId(chat.id);
    setInitialMessages(Array.isArray(data?.messages) ? data.messages : []);
  }, []);

  const deleteChat = useCallback(async (e, id) => {
    e.stopPropagation();
    await supabase.from('agent_chats').delete().eq('id', id);
    if (id === activeChatId) newChat();
    loadChats();
  }, [activeChatId, loadChats, newChat]);

  // Persistir cada turno (lo llama AgentChat al terminar de responder).
  const saveTurn = useCallback(async (msgs) => {
    if (!msgs.some((m) => m.role === 'user')) return;
    const firstUser = msgs.find((m) => m.role === 'user');
    const title = (firstUser?.content || 'Chat').slice(0, 70);
    let id = activeChatId;
    if (!id) {
      id = rid();
      setInitialMessages(msgs);   // evita que el reset por cambio de chatKey borre lo recién escrito
      setActiveChatId(id);
      let uid = null;
      try { uid = (await supabase.auth.getUser())?.data?.user?.id || null; } catch { /* nada */ }
      await supabase.from('agent_chats').insert({
        id, subagent_key: agentKey, client_id: sel.clientId, strategy_id: sel.strategyId,
        funnel_id: sel.funnelId, avatar_id: sel.avatarId, title, messages: msgs, created_by: uid,
      });
    } else {
      await supabase.from('agent_chats').update({ messages: msgs, title, updated_at: new Date().toISOString() }).eq('id', id);
    }
    loadChats();
  }, [activeChatId, agentKey, sel, loadChats]);

  // Guardar lo generado. Cada agente escribe en el campo que alimenta SU etapa del pipeline:
  //   anuncios → strategy_pages.avatars[].ad_script  (por avatar, dentro del array)
  //   vsl      → strategy_pages.vsl_script           (escalar, uno por funnel)
  // Siempre APPEND con sello, nunca pisar: ahí ya vive el guión que vino del DEL.
  const onSaveCopy = useCallback((text) => {
    const page = strategyPages.find((p) => p.id === sel.funnelId);
    if (!page) return;

    if (agentKey === 'vsl') {
      const prev = (page.vsl_script || '').trim();
      const stamp = `\n\n— Generado con el agente de VSL —\n${text}`;
      // Backup antes de tocar: el mismo par de campos que usa el "Deshacer" de Funnels.
      updateStrategyPage(sel.funnelId, {
        vsl_script_backup: page.vsl_script || null,
        backup_at: new Date().toISOString(),
        vsl_script: prev ? prev + stamp : text,
      });
      return;
    }

    const avatars = Array.isArray(page.avatars) ? page.avatars : [];
    const nextAvatars = avatars.map((a) => {
      if (a.id !== sel.avatarId) return a;
      const prev = (a.ad_script || '').trim();
      const stamp = `\n\n— Generado con el agente de Anuncios —\n${text}`;
      return { ...a, ad_script: prev ? prev + stamp : text };
    });
    updateStrategyPage(sel.funnelId, { avatars: nextAvatars });
  }, [strategyPages, sel.funnelId, sel.avatarId, agentKey, updateStrategyPage]);

  // Descubrimiento corre ANTES de que existan funnel y avatar (el avatar es su SALIDA, el
  // paso 5): le alcanza con el cliente. Los demás siguen necesitando el avatar, que es de
  // donde sacan el dolor. El flag vive en agentMeta.js y la edge fn lo replica server-side.
  const soloCliente = !!agentMeta(agentKey).nivelCliente;
  const ready = soloCliente ? !!sel.clientId : (sel.clientId && sel.strategyId && sel.funnelId && sel.avatarId);
  const chatKey = activeChatId || `new:${agentKey}:${soloCliente ? sel.clientId : `${sel.funnelId}:${sel.avatarId}`}`;

  return (
    <div className="h-full min-h-0 flex flex-col bg-white border border-border rounded-2xl overflow-hidden" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
      {/* Header: agente + historial + acceso a la config */}
      <div className="shrink-0 bg-white border-b border-border">
        <div className="flex items-center gap-2.5 py-3 px-6 max-md:py-2.5 max-md:px-3.5">
          <AgentPicker subagents={subagents} agentKey={agentKey} onChange={onAgentChange} />
          <ChatHistoryMenu chats={chats} activeChatId={activeChatId} chatLabel={chatLabel}
            onOpen={openChat} onDelete={deleteChat} onNew={newChat} />
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <button onClick={() => navigate('/marketing/config')} title="Configurar y entrenar a los agentes"
              className="w-[38px] h-[38px] rounded-[9px] border border-border bg-white text-text2 flex items-center justify-center cursor-pointer hover:bg-surface2 hover:text-text shrink-0">
              <SlidersHorizontal size={17} />
            </button>
          </div>
        </div>

        <div className="py-0 px-6 pb-3.5 max-md:px-3.5 max-md:pb-3">
          <ContextBar clients={clients} strategies={strategies} strategyPages={strategyPages} sel={sel} onChange={onChange} />
        </div>
      </div>

      {ready ? (
        <AgentChat sel={sel} gate={gate} agentKey={agentKey} agentName={agentName} currentUser={currentUser}
          onSaveCopy={onSaveCopy} chatKey={chatKey} initialMessages={initialMessages} onTurn={saveTurn} />
      ) : (
        <div className="flex-1 min-h-0 flex flex-col items-center justify-center text-center py-16 px-5 gap-2.5">
          <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-surface2 text-text3"><MousePointerClick size={24} /></span>
          <div className="text-[13.5px] font-semibold text-[#4B5563]">
            {soloCliente ? 'Elegí un cliente' : 'Elegí cliente, estrategia, funnel y avatar'}
          </div>
          <div className="text-[12px] text-text3 max-w-[420px]">
            {soloCliente
              ? 'Este agente trabaja sobre el cliente entero: con eso alcanza. Te va a decir en qué momento del descubrimiento está y qué paso corresponde.'
              : 'En cuanto selecciones, el agente arranca con todo el contexto de ese avatar ya cargado. También podés abrir un chat anterior desde el historial.'}
          </div>
        </div>
      )}
    </div>
  );
}
