// FeedbackInbox — la bandeja donde Matías ve el feedback del equipo y APRUEBA las propuestas de mejora.
// El feedback lo procesa el triage diario (o "Analizar ahora"); acá solo se aprueba/rechaza. Aprobar aplica
// el cambio al toque (llama a apply-improvement): un ejemplo entra a la biblioteca; una regla edita las instrucciones.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { MessageSquareHeart, Check, X, Loader2, Sparkles, BookOpen, ScrollText, StickyNote, ThumbsUp, ThumbsDown } from 'lucide-react';

const KIND = {
  example: { label: 'Ejemplo', Icon: BookOpen, color: '#16A34A', bg: '#E6F7EE', hint: 'Entra a la biblioteca (barato, no infla el prompt)' },
  rule:    { label: 'Regla', Icon: ScrollText, color: '#CA8A04', bg: '#FEF9E7', hint: 'Edita las instrucciones del agente (usar con cuidado)' },
  note:    { label: 'Nota', Icon: StickyNote, color: '#6B7280', bg: '#F1F3F5', hint: 'Solo registro, no cambia nada' },
};

function ProposalCard({ p, onApprove, onReject }) {
  const [busy, setBusy] = useState(false);
  const meta = KIND[p.kind] || KIND.note;
  const { Icon } = meta;
  const pl = p.payload || {};
  const act = async (fn) => { setBusy(true); await fn(); setBusy(false); };
  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: meta.bg, color: meta.color }}><Icon size={15} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
            <span className="text-[13px] font-semibold text-[#1A1D26]">{p.title}</span>
          </div>
          {p.rationale && <div className="text-[12px] text-[#4B5563] mt-1 whitespace-pre-wrap">{p.rationale}</div>}
          {p.cost_note && <div className="text-[11px] text-[#8A6D00] bg-[#FEF9E7] border border-[#F1E3B0] rounded-lg px-2 py-1 mt-1.5">💰 {p.cost_note}</div>}
          {p.kind === 'example' && pl.content && (
            <div className="mt-1.5 text-[11.5px] text-[#374151] bg-[#FAFBFC] border border-[#EEF0F4] rounded-lg p-2 max-h-[140px] overflow-y-auto whitespace-pre-wrap">{pl.niche ? `[${pl.niche}] ` : ''}{pl.content}</div>
          )}
          {p.kind === 'rule' && (pl.find || pl.replace) && (
            <div className="mt-1.5 grid gap-1 text-[11px]">
              <div className="text-[#DC2626] bg-[#FEF2F2] border border-[#F3C9C9] rounded px-2 py-1 whitespace-pre-wrap"><b>Saca:</b> {pl.find}</div>
              <div className="text-[#15803D] bg-[#ECFDF5] border border-[#C7EBD4] rounded px-2 py-1 whitespace-pre-wrap"><b>Pone:</b> {pl.replace}</div>
            </div>
          )}
          <div className="text-[10px] text-[#AEB4BF] mt-1">{meta.hint}</div>
        </div>
      </div>
      <div className="flex gap-2 mt-2.5 justify-end">
        <button onClick={() => act(() => onReject(p))} disabled={busy} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#E2E5EB] text-[#6B7280] bg-white hover:bg-[#F9FAFB] disabled:opacity-50"><X size={14} /> Descartar</button>
        <button onClick={() => act(() => onApprove(p))} disabled={busy} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: '#16A34A' }}>{busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aprobar y aplicar</button>
      </div>
    </div>
  );
}

export default function FeedbackInbox() {
  const [proposals, setProposals] = useState([]);
  const [fbStats, setFbStats] = useState({ up: 0, down: 0, nuevos: 0 });
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const [{ data: props }, { data: fb }] = await Promise.all([
      supabase.from('agent_improvements').select('*').eq('status', 'proposed').order('created_at', { ascending: false }),
      supabase.from('agent_feedback').select('rating,status').eq('status', 'new'),
    ]);
    setProposals(props || []);
    const up = (fb || []).filter(f => f.rating === 'up').length;
    setFbStats({ up, down: (fb || []).length - up, nuevos: (fb || []).length });
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = useCallback(async (p) => {
    const { data, error } = await supabase.functions.invoke('apply-improvement', { body: { id: p.id, approve: true } });
    if (error || !data?.ok) setMsg(`No se pudo aplicar: ${data?.note || error?.message || 'error'}`);
    else setMsg(`✓ Aplicado: ${data.note}`);
    load();
  }, [load]);

  const reject = useCallback(async (p) => {
    await supabase.from('agent_improvements').update({ status: 'rejected' }).eq('id', p.id);
    load();
  }, [load]);

  const analyzeNow = useCallback(async () => {
    setAnalyzing(true); setMsg('');
    const { data, error } = await supabase.functions.invoke('agent-feedback-triage', { body: {} });
    if (error) setMsg(`Error al analizar: ${error.message}`);
    else setMsg(`Análisis listo: ${data?.propuestas_creadas ?? 0} propuestas nuevas de ${data?.feedback_procesado ?? 0} feedbacks.`);
    setAnalyzing(false); load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[#1A1D26] flex items-center gap-2"><MessageSquareHeart size={17} className="text-[#5B7CF5]" /> Feedback y mejoras</div>
          <p className="text-[12.5px] text-[#6B7280] mt-1 max-w-[600px]">El equipo deja feedback en el chat; cada día se procesa en lote y acá aparecen las propuestas. Aprobá las que quieras y se aplican solas. La mayoría suma <b>ejemplos</b> a la biblioteca (no infla el agente); las <b>reglas</b> son raras y se editan con tu OK.</p>
        </div>
        <button onClick={analyzeNow} disabled={analyzing || fbStats.nuevos === 0} title={fbStats.nuevos === 0 ? 'No hay feedback nuevo' : 'Procesar el feedback ahora'} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-40" style={{ background: '#5B7CF5' }}>
          {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analizar ahora
        </button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold py-1 px-2.5 rounded-full bg-[#E6F7EE] text-[#16A34A]"><ThumbsUp size={12} /> {fbStats.up} me gusta sin procesar</span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold py-1 px-2.5 rounded-full bg-[#FEF2F2] text-[#DC2626]"><ThumbsDown size={12} /> {fbStats.down} a mejorar sin procesar</span>
      </div>

      {msg && <div className="text-[12px] text-[#374151] bg-[#F4F5F7] border border-[#E7E9ED] rounded-lg px-3 py-2">{msg}</div>}

      {loading ? <div className="text-[#9CA3AF] text-center py-14 text-[13px]"><Loader2 size={18} className="animate-spin inline mr-2" />Cargando…</div>
        : proposals.length === 0
          ? <div className="text-center py-14 px-5 border border-dashed border-[#D8DDE6] rounded-2xl">
              <MessageSquareHeart size={26} className="text-[#C3C9D4] mx-auto mb-2" />
              <div className="text-[13px] font-semibold text-[#4B5563]">No hay propuestas pendientes</div>
              <div className="text-[12px] text-[#9098A4] mt-1 max-w-[440px] mx-auto">Cuando el equipo deje feedback en el chat, cada día vas a ver acá las propuestas de mejora ya razonadas, listas para aprobar. También podés apretar "Analizar ahora".</div>
            </div>
          : <div className="grid gap-3">{proposals.map(p => <ProposalCard key={p.id} p={p} onApprove={approve} onReject={reject} />)}</div>}
    </div>
  );
}
