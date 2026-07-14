// AgentesPage — interfaz dedicada para chatear con los agentes especializados del cerebro
// de Korex. v1: agente de Anuncios. Flujo: elegir cliente → estrategia → funnel → avatar y
// chatear con contexto completo (DEL/avatar/VSL/ganadores) + generar y guardar copys.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../context/AppContext';
import { Bot, MousePointerClick } from 'lucide-react';
import AgentSelector from '../components/agentes/AgentSelector';
import AgentChat from '../components/agentes/AgentChat';

const PINK = '#EC4899';

export default function AgentesPage() {
  const { clients, strategies, strategyPages, updateStrategyPage } = useApp();
  const [sel, setSel] = useState({ clientId: '', strategyId: '', funnelId: '', avatarId: '' });
  const [pipeline, setPipeline] = useState([]);

  const onChange = useCallback((patch) => setSel(s => ({ ...s, ...patch })), []);

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

        {ready
          ? <AgentChat sel={sel} gate={gate} onSaveCopy={onSaveCopy} />
          : (
            <div className="bg-white rounded-2xl border border-dashed border-[#D8DDE6] flex flex-col items-center justify-center text-center py-16 px-5 gap-2.5" style={{ minHeight: 300 }}>
              <span className="inline-flex items-center justify-center w-12 h-12 rounded-2xl" style={{ background: '#F4F5F7', color: '#C3C9D4' }}><MousePointerClick size={24} /></span>
              <div className="text-[13.5px] font-semibold text-[#4B5563]">Elegí cliente, estrategia, funnel y avatar</div>
              <div className="text-[12px] text-[#9098A4] max-w-[420px]">En cuanto selecciones, el agente arranca con todo el contexto de ese avatar ya cargado: su descripción, el guión del VSL y los anuncios ganadores del cliente.</div>
            </div>
          )}
      </div>
    </div>
  );
}
