// AgentesPage — interfaz dedicada para chatear con los agentes especializados del cerebro
// de Korex. v1: agente de Anuncios. Flujo: elegir cliente → estrategia → funnel → avatar y
// chatear con contexto completo (DEL/avatar/VSL/ganadores) + generar y guardar copys.
// El historial de cada chat se guarda (agent_chats) para poder retomarlo después.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Bot, MousePointerClick, Plus, MessageSquare, Trash2, History, Search } from 'lucide-react';
import AgentSelector from '../components/agentes/AgentSelector';
import AgentChat from '../components/agentes/AgentChat';

const PINK = '#EC4899';
const rid = () => `ach_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

function fmtDate(s) {
  if (!s) return '';
  const d = new Date(s);
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

export default function AgentesPage() {
  const { clients, strategies, strategyPages, updateStrategyPage } = useApp();
  const [sel, setSel] = useState({ clientId: '', strategyId: '', funnelId: '', avatarId: '' });
  const [pipeline, setPipeline] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [initialMessages, setInitialMessages] = useState([]);

  // Cualquier cambio manual de selección arranca un chat NUEVO (contexto distinto).
  const onChange = useCallback((patch) => {
    setSel(s => ({ ...s, ...patch }));
    setActiveChatId(null);
    setInitialMessages([]);
  }, []);

  // Estado del pipeline del cliente (para el gate de anuncios por funnel).
  useEffect(() => {
    let alive = true;
    if (!sel.clientId) { setPipeline([]); return; }
    supabase.rpc('cerebro_pipeline_status', { p_client_id: sel.clientId })
      .then(({ data }) => { if (alive) setPipeline(Array.isArray(data) ? data : []); })
      .catch(() => { if (alive) setPipeline([]); });
    return () => { alive = false; };
  }, [sel.clientId]);

  const gate = useMemo(
    () => pipeline.find(r => r.funnel_id === sel.funnelId && r.stage === 'anuncios') || null,
    [pipeline, sel.funnelId],
  );

  // ── Historial de chats (TODOS, de todos los clientes) ──
  const [q, setQ] = useState('');
  const loadChats = useCallback(async () => {
    const { data } = await supabase.from('agent_chats')
      .select('id,title,client_id,funnel_id,avatar_id,strategy_id,updated_at')
      .order('updated_at', { ascending: false }).limit(200);
    setChats(data || []);
  }, []);
  useEffect(() => { loadChats(); }, [loadChats]);

  // Nombre lindo para cada chat del historial (cliente · funnel · avatar).
  const chatLabel = useCallback((chat) => {
    const cl = clients.find(c => c.id === chat.client_id);
    const page = strategyPages.find(p => p.id === chat.funnel_id);
    const av = (Array.isArray(page?.avatars) ? page.avatars : []).find(a => a.id === chat.avatar_id);
    return [cl?.name, page?.name, av?.name].filter(Boolean).join(' · ');
  }, [clients, strategyPages]);

  const shownChats = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return chats;
    return chats.filter(c => `${c.title || ''} ${chatLabel(c)}`.toLowerCase().includes(t));
  }, [chats, q, chatLabel]);

  const newChat = useCallback(() => { setActiveChatId(null); setInitialMessages([]); }, []);

  const openChat = useCallback(async (chat) => {
    const { data } = await supabase.from('agent_chats').select('*').eq('id', chat.id).maybeSingle();
    setSel({ clientId: chat.client_id || '', strategyId: chat.strategy_id || '', funnelId: chat.funnel_id || '', avatarId: chat.avatar_id || '' });
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
    if (!msgs.some(m => m.role === 'user')) return;
    const firstUser = msgs.find(m => m.role === 'user');
    const title = (firstUser?.content || 'Chat').slice(0, 70);
    let id = activeChatId;
    if (!id) {
      id = rid();
      setInitialMessages(msgs);   // evita que el reset por cambio de chatKey borre lo recién escrito
      setActiveChatId(id);
      let uid = null;
      try { uid = (await supabase.auth.getUser())?.data?.user?.id || null; } catch { /* nada */ }
      await supabase.from('agent_chats').insert({
        id, subagent_key: 'anuncios', client_id: sel.clientId, strategy_id: sel.strategyId,
        funnel_id: sel.funnelId, avatar_id: sel.avatarId, title, messages: msgs, created_by: uid,
      });
    } else {
      await supabase.from('agent_chats').update({ messages: msgs, title, updated_at: new Date().toISOString() }).eq('id', id);
    }
    loadChats();
  }, [activeChatId, sel, loadChats]);

  // Guardar el copy generado en el avatar (strategy_pages.avatars[].ad_script), append.
  const onSaveCopy = useCallback((text) => {
    const page = strategyPages.find(p => p.id === sel.funnelId);
    if (!page) return;
    const avatars = Array.isArray(page.avatars) ? page.avatars : [];
    const nextAvatars = avatars.map(a => {
      if (a.id !== sel.avatarId) return a;
      const prev = (a.ad_script || '').trim();
      const stamp = `\n\n— Generado con el agente de Anuncios —\n${text}`;
      return { ...a, ad_script: prev ? prev + stamp : text };
    });
    updateStrategyPage(sel.funnelId, { avatars: nextAvatars });
  }, [strategyPages, sel.funnelId, sel.avatarId, updateStrategyPage]);

  const ready = sel.clientId && sel.strategyId && sel.funnelId && sel.avatarId;
  const chatKey = activeChatId || `new:${sel.funnelId}:${sel.avatarId}`;

  return (
    <div className="max-w-[1080px] mx-auto px-4 py-6">
      <div className="flex items-center gap-2.5 mb-1">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-xl" style={{ background: '#FDF2F8', color: PINK }}><Bot size={20} /></div>
        <div>
          <h1 className="text-[22px] font-extrabold text-text leading-tight">Agentes</h1>
          <p className="text-[12.5px] text-text3">Chateá con agentes expertos de Korex, ya cargados con el contexto del cliente.</p>
        </div>
      </div>

      <div className="grid gap-4 mt-4">
        <AgentSelector clients={clients} strategies={strategies} strategyPages={strategyPages} sel={sel} onChange={onChange} />

        {/* Historial de chats (TODOS, de todos los clientes) */}
        <div className="bg-white rounded-2xl p-3 border border-[#E7EAF0]" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.04)' }}>
          <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#9098A4] flex items-center gap-1.5">
              <History size={13} />Historial de chats <span className="text-[#C3C9D4] font-semibold normal-case tracking-normal">· {chats.length}</span>
            </span>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#AEB4BF]" />
                <input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por título o cliente…" className="w-[210px] py-1.5 pl-7 pr-2.5 text-[12px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#EC4899]" />
              </div>
              <button onClick={newChat} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-white text-[12px] font-semibold cursor-pointer shrink-0" style={{ background: PINK }}>
                <Plus size={14} /> Nuevo chat
              </button>
            </div>
          </div>
          {shownChats.length === 0
            ? <div className="text-[12px] text-[#AEB4BF] py-1.5 px-1">{chats.length === 0 ? 'Todavía no hay chats guardados. Empezá uno nuevo.' : 'Ningún chat coincide con la búsqueda.'}</div>
            : (
              <div className="grid gap-1.5 max-h-[260px] overflow-y-auto pr-1">
                {shownChats.map(c => {
                  const active = c.id === activeChatId;
                  return (
                    <button key={c.id} onClick={() => openChat(c)} title={c.title}
                      className="group flex items-center gap-2.5 py-2 px-2.5 rounded-lg border cursor-pointer text-left w-full"
                      style={active ? { background: '#FDF2F8', borderColor: PINK } : { background: '#fff', borderColor: '#EEF0F4' }}>
                      <MessageSquare size={14} className="shrink-0" style={{ color: active ? PINK : '#AEB4BF' }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[12.5px] font-semibold text-[#1A1D26] truncate">{c.title || 'Chat'}</span>
                        <span className="block text-[10.5px] text-[#AEB4BF] truncate">{chatLabel(c) || '—'}</span>
                      </span>
                      <span className="text-[10px] text-[#C3C9D4] shrink-0 whitespace-nowrap">{fmtDate(c.updated_at)}</span>
                      <span onClick={(e) => deleteChat(e, c.id)} title="Borrar" className="opacity-0 group-hover:opacity-100 inline-flex items-center justify-center w-6 h-6 rounded text-[#DC2626] hover:bg-[#FEF2F2] shrink-0"><Trash2 size={13} /></span>
                    </button>
                  );
                })}
              </div>
            )}
        </div>

        {ready
          ? <AgentChat sel={sel} gate={gate} onSaveCopy={onSaveCopy} chatKey={chatKey} initialMessages={initialMessages} onTurn={saveTurn} />
          : (
            <div className="bg-white rounded-2xl border border-dashed border-[#D8DDE6] flex flex-col items-center justify-center text-center py-16 px-5 gap-2.5" style={{ minHeight: 300 }}>
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: '#F4F5F7', color: '#C3C9D4' }}><MousePointerClick size={24} /></span>
              <div className="text-[13.5px] font-semibold text-[#4B5563]">Elegí cliente, estrategia, funnel y avatar</div>
              <div className="text-[12px] text-[#9098A4] max-w-[420px]">En cuanto selecciones, el agente arranca con todo el contexto de ese avatar ya cargado. También podés abrir un chat anterior del historial de arriba.</div>
            </div>
          )}
      </div>
    </div>
  );
}
