// FeedbackInbox — la bandeja donde Matías ve el feedback del equipo y APRUEBA las propuestas de mejora.
// El feedback lo procesa el triage diario (o "Analizar ahora"); acá solo se aprueba/rechaza. Aprobar aplica
// el cambio al toque (llama a apply-improvement): un ejemplo entra a la biblioteca; una regla edita las instrucciones.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { MessageSquareHeart, Check, X, Loader2, Sparkles, BookOpen, ScrollText, StickyNote, ThumbsUp, ThumbsDown, Plus, Pencil } from 'lucide-react';

const AGENTES = [
  { key: 'general', label: 'General (todos)' },
  { key: 'anuncios', label: 'Anuncios' },
  { key: 'vsl', label: 'VSL' },
  { key: 'landing', label: 'Landing' },
  { key: 'descubrimiento', label: 'Descubrimiento' },
];
const imp_input = 'w-full py-2 px-3 text-[13px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#5B7CF5] bg-white';

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

// Cargar una mejora a mano (sin esperar feedback del chat). Entra como propuesta y se aprueba/aplica igual.
function ManualImprovement({ onAdded }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('example');
  const [agent, setAgent] = useState('anuncios');
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [content, setContent] = useState('');   // para 'example'
  const [niche, setNiche] = useState('');        // para 'example'
  const [find, setFind] = useState('');          // para 'rule'
  const [replace, setReplace] = useState('');    // para 'rule'
  const [busy, setBusy] = useState(false);

  const reset = () => { setKind('example'); setAgent('anuncios'); setTitle(''); setRationale(''); setContent(''); setNiche(''); setFind(''); setReplace(''); };

  const ready = title.trim() && (
    (kind === 'example' && content.trim()) ||
    (kind === 'rule' && find.trim() && replace.trim()) ||
    (kind === 'note')
  );

  const save = async () => {
    if (!ready) return;
    setBusy(true);
    const payload = kind === 'example' ? { content: content.trim(), niche: niche.trim() || null }
      : kind === 'rule' ? { find: find.trim(), replace: replace.trim() }
      : {};
    const { error } = await supabase.from('agent_improvements').insert({
      id: `imp_man_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      subagent_key: agent, kind, title: title.trim(), rationale: rationale.trim() || null,
      cost_note: kind === 'rule' ? 'Edita las instrucciones del agente' : null,
      payload, status: 'proposed',
    });
    setBusy(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    reset(); setOpen(false); onAdded();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#4B5563] hover:border-[#5B7CF5]"><Plus size={14} /> Cargar mejora a mano</button>
  );
  return (
    <div className="bg-[#FAFBFC] border border-[#E2E5EB] rounded-xl p-3.5 grid gap-2.5 w-full max-w-[560px]">
      <div className="text-[12.5px] font-bold text-[#1A1D26] flex items-center gap-1.5"><Pencil size={14} /> Cargar una mejora a mano (entra como propuesta para aprobar)</div>
      <div className="grid grid-cols-3 gap-1.5">
        {Object.entries(KIND).map(([k, meta]) => {
          const on = k === kind; const I = meta.Icon;
          return (
            <button key={k} onClick={() => setKind(k)} className="inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border"
              style={on ? { background: meta.bg, borderColor: meta.color, color: meta.color } : { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }}>
              <I size={14} /> {meta.label}
            </button>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <select className={imp_input} value={agent} onChange={(e) => setAgent(e.target.value)}>
          {AGENTES.map((a) => <option key={a.key} value={a.key}>{a.label}</option>)}
        </select>
        <input className={imp_input} placeholder="Título de la mejora" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <input className={imp_input} placeholder="Por qué / contexto (opcional)" value={rationale} onChange={(e) => setRationale(e.target.value)} />
      {kind === 'example' && <>
        <input className={imp_input} placeholder="Nicho (opcional)" value={niche} onChange={(e) => setNiche(e.target.value)} />
        <textarea className={imp_input + ' resize-y min-h-[90px] leading-relaxed'} placeholder="El ejemplo que querés que el agente tenga en cuenta…" value={content} onChange={(e) => setContent(e.target.value)} />
      </>}
      {kind === 'rule' && <>
        <textarea className={imp_input + ' resize-y min-h-[54px]'} placeholder="Texto actual de la instrucción a cambiar (Saca)…" value={find} onChange={(e) => setFind(e.target.value)} />
        <textarea className={imp_input + ' resize-y min-h-[54px]'} placeholder="Texto nuevo (Pone)…" value={replace} onChange={(e) => setReplace(e.target.value)} />
      </>}
      <div className="flex gap-2 justify-end">
        <button onClick={() => { reset(); setOpen(false); }} className="py-1.5 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#6B7280]">Cancelar</button>
        <button onClick={save} disabled={busy || !ready} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: '#5B7CF5' }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Guardar propuesta
        </button>
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
        <div className="flex gap-2 flex-wrap">
          <ManualImprovement onAdded={load} />
          <button onClick={analyzeNow} disabled={analyzing || fbStats.nuevos === 0} title={fbStats.nuevos === 0 ? 'No hay feedback nuevo del chat para procesar' : 'Procesar el feedback ahora'} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-40" style={{ background: '#5B7CF5' }}>
            {analyzing ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Analizar ahora
          </button>
        </div>
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
              <div className="text-[13px] font-semibold text-[#4B5563]">Todavía no hay propuestas</div>
              <div className="text-[12px] text-[#9098A4] mt-1 max-w-[480px] mx-auto">
                Esta bandeja se llena solita: cuando alguien del equipo toca <b>👍 / 👎</b> en las respuestas de un agente (dentro del chat de Agentes), cada día se procesan en lote y aparecen acá las mejoras razonadas para aprobar.
                {fbStats.nuevos === 0
                  ? ' Ahora mismo no hay ningún 👍/👎 sin procesar, por eso está vacío.'
                  : ` Hay ${fbStats.nuevos} sin procesar — tocá “Analizar ahora”.`}
                <br />También podés usar <b>“Cargar mejora a mano”</b> arriba para anotar una vos mismo.
              </div>
            </div>
          : <div className="grid gap-3">{proposals.map(p => <ProposalCard key={p.id} p={p} onApprove={approve} onReject={reject} />)}</div>}
    </div>
  );
}
