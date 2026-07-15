// ContextStatus — vista read-only "qué tiene cargado el agente y qué le falta".
// Muestra en vivo (contando desde la base) todo lo que compone el contexto del agente de Anuncios:
// instrucciones, blueprint + compliance, material, ejemplos por nicho aprobados, candidatos pendientes,
// y la config de API (modelo + topes). Abajo, un semáforo de qué agentes están sin configurar.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { CheckCircle2, AlertTriangle, FileText, BookOpen, Layers, Trophy, Cpu, Loader2 } from 'lucide-react';

function StatCard({ Icon, label, value, sub, ok = true }) {
  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5 flex items-start gap-3">
      <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: ok ? '#E6F7EE' : '#FEF9E7', color: ok ? '#16A34A' : '#CA8A04' }}><Icon size={17} /></div>
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-wider text-[#9098A4]">{label}</div>
        <div className="text-[15px] font-extrabold text-[#1A1D26] mt-0.5 flex items-center gap-1.5">
          {value}
          {ok ? <CheckCircle2 size={14} className="text-[#16A34A]" /> : <AlertTriangle size={14} className="text-[#CA8A04]" />}
        </div>
        {sub && <div className="text-[11.5px] text-[#6B7280] mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}

export default function ContextStatus({ subagentKey = 'anuncios' }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    // Cada agente tiene su corpus dentro de marketing_ad_library, distinguido por `part`.
    const CORPUS = {
      anuncios: { blueprintId: 'mal_blueprint', example: 'example', section: 'blueprint_section' },
      vsl: { blueprintId: 'mal_vsl_blueprint', example: 'vsl_ficha', section: 'vsl_section' },
    };
    const c = CORPUS[subagentKey] || CORPUS.anuncios;
    const [{ data: subs }, { data: bp }, { data: mats }, { data: examples }, { data: sections }, { data: cands }, { data: apiRow }] = await Promise.all([
      supabase.from('marketing_subagents').select('key,name,instructions,updated_at').order('position'),
      // OJO: marketing_ad_library NO tiene updated_at. Pedirla hacía que PostgREST devolviera
      // 400 y el resumen mostrara "0 car." para siempre, con el blueprint bien cargado.
      supabase.from('marketing_ad_library').select('char_count').eq('id', c.blueprintId).maybeSingle(),
      supabase.from('marketing_training_material').select('id').eq('scope', subagentKey),
      supabase.from('marketing_ad_library').select('niche,metrics').eq('part', c.example).eq('status', 'approved'),
      supabase.from('marketing_ad_library').select('id').eq('part', c.section).eq('status', 'approved'),
      supabase.from('marketing_ad_library').select('id').eq('status', 'candidate'),
      supabase.from('app_settings').select('value').eq('key', 'api_config').maybeSingle(),
    ]);
    const specialist = (subs || []).find(s => s.key === subagentKey);
    const nicheCounts = {};
    for (const e of (examples || [])) { const n = e.niche || 'sin nicho'; nicheCounts[n] = (nicheCounts[n] || 0) + 1; }
    // Cuántos ejemplos tienen veredicto de retención (solo aplica al corpus de VSL).
    const tierCounts = {};
    for (const e of (examples || [])) { const t = e.metrics?.tier; if (t) tierCounts[t] = (tierCounts[t] || 0) + 1; }
    const api = apiRow?.value || {};
    setState({
      instrLen: (specialist?.instructions || '').length,
      instrUpdated: specialist?.updated_at,
      specialistName: specialist?.name || subagentKey,
      blueprintLen: bp?.char_count || 0,
      sectionCount: (sections || []).length,
      materialCount: (mats || []).length,
      exampleCount: (examples || []).length,
      nicheCounts,
      tierCounts,
      candidateCount: (cands || []).length,
      model: (api.chat_models && api.chat_models[subagentKey]) || api.chat_model || '—',
      dailyCap: api.daily_cap_usd, monthlyCap: api.monthly_cap_usd, maxTokens: api.chat_max_tokens,
      empties: (subs || []).filter(s => s.key !== 'general' && !(s.instructions || '').trim()).map(s => s.name),
    });
    setLoading(false);
  }, [subagentKey]);
  useEffect(() => { load(); }, [load]);

  if (loading || !state) return <div className="text-[#9CA3AF] text-center py-16 text-[13px]"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando estado…</div>;

  const nicheList = Object.entries(state.nicheCounts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="grid gap-4">
      <div>
        <div className="text-[15px] font-bold text-[#1A1D26]">Qué tiene cargado el agente de {state.specialistName}</div>
        <p className="text-[12.5px] text-[#6B7280] mt-1">Todo esto entra automáticamente en el contexto del agente cada vez que le escribís. Verde = listo; amarillo = conviene completarlo.</p>
      </div>

      <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        <StatCard Icon={FileText} label="Instrucciones" value={`${state.instrLen.toLocaleString('es-AR')} car.`} ok={state.instrLen > 500} sub={state.instrLen > 500 ? 'El "skill" del agente' : 'Está corto — reforzalo'} />
        <StatCard Icon={BookOpen} label="Resumen del método (siempre activo)" value={`${state.blueprintLen.toLocaleString('es-AR')} car.`} ok={state.blueprintLen > 500} sub={subagentKey === 'vsl' ? 'Núcleo + esqueleto de 10 secciones' : 'Base + tabla de compliance Meta'} />
        <StatCard Icon={BookOpen} label="Secciones del blueprint (buscables)" value={`${state.sectionCount}`} ok={state.sectionCount > 0} sub="El método completo, por sección" />
        <StatCard Icon={Layers} label="Material de capacitación" value={`${state.materialCount}`} ok={state.materialCount > 0} sub="Guías, ejemplos, reglas" />
        <StatCard Icon={Trophy} label={subagentKey === 'vsl' ? 'VSLs de la biblioteca (buscables)' : 'Ejemplos buscables por nicho'} value={`${state.exampleCount}`} ok={state.exampleCount > 0}
          sub={subagentKey === 'vsl' && state.tierCounts.ganador
            ? `${nicheList.length} nichos · ${state.tierCounts.ganador} ganadores medidos`
            : `${nicheList.length} nichos`} />
        <StatCard Icon={Trophy} label="Candidatos pendientes" value={`${state.candidateCount}`} ok={state.candidateCount === 0} sub={state.candidateCount > 0 ? 'Revisá la pestaña Ganadores' : 'Nada por aprobar'} />
        <StatCard Icon={Cpu} label="Modelo · topes" value={String(state.model).replace('claude-', '')} ok sub={`Máx US$${state.dailyCap}/día · ${state.monthlyCap}/mes · ${state.maxTokens} tokens`} />
      </div>

      {nicheList.length > 0 && (
        <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5">
          <div className="text-[12.5px] font-bold text-[#1A1D26] mb-2">{subagentKey === 'vsl' ? 'VSLs de la biblioteca por nicho' : 'Ejemplos aprobados por nicho'}</div>
          <div className="flex flex-wrap gap-1.5">
            {nicheList.map(([n, c]) => (
              <span key={n} className="text-[11.5px] font-semibold py-1 px-2.5 rounded-full bg-[#F4F5F7] text-[#4B5563]">{n} <span className="text-[#16A34A]">· {c}</span></span>
            ))}
          </div>
          {subagentKey === 'vsl' && Object.keys(state.tierCounts).length > 0 && (
            <>
              <div className="text-[12.5px] font-bold text-[#1A1D26] mt-3 mb-2">Veredicto de retención (Voomly)</div>
              <div className="flex flex-wrap gap-1.5">
                {[['ganador', '#16A34A', 'ganadores'], ['medio', '#CA8A04', 'medios'], ['perdedor', '#DC2626', 'perdedores'], ['sin_datos', '#9CA3AF', 'sin datos suficientes']].map(([t, color, label]) => (
                  state.tierCounts[t] ? (
                    <span key={t} className="text-[11.5px] font-semibold py-1 px-2.5 rounded-full bg-[#F4F5F7] text-[#4B5563]">{label} <span style={{ color }}>· {state.tierCounts[t]}</span></span>
                  ) : null
                ))}
              </div>
              <p className="text-[11.5px] text-[#6B7280] mt-2">El agente prioriza clonar los ganadores y evita repetir a los perdedores. Un VSL necesita 50+ reproducciones únicas para tener veredicto.</p>
            </>
          )}
        </div>
      )}

      {state.empties.length > 0 && (
        <div className="bg-[#FEF9E7] border border-[#FBE7A1] rounded-xl p-3.5 flex items-start gap-2.5">
          <AlertTriangle size={16} className="text-[#CA8A04] shrink-0 mt-0.5" />
          <div className="text-[12.5px] text-[#7A5B00]">
            <strong>Agentes sin configurar todavía:</strong> {state.empties.join(', ')}. Cargales instrucciones en la pestaña <em>Capacitación</em> cuando quieras activarlos.
          </div>
        </div>
      )}
    </div>
  );
}
