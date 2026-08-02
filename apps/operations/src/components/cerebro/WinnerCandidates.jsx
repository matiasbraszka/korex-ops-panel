// WinnerCandidates — la bandeja de "Candidatos a ganador" del flywheel.
// El job winners-promote detecta anuncios ganadores probados (meta_ad_insights) y los deja acá como
// status='candidate'. Matías aprueba con 1 click (entran a la biblioteca que lee el agente, status='approved')
// o rechaza (status='rejected', no vuelven a proponerse). También se puede cargar un ganador a mano.
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@korex/db';
import { useApp } from '../../context/AppContext';
import { Trophy, Check, X, Plus, Loader2, Tag, Pencil, Megaphone, Video, LayoutTemplate } from 'lucide-react';

const GREEN = '#16A34A';
const rid = (tipo) => `mal_man_${tipo}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
const input = 'w-full py-2 px-3 text-[13px] border border-[#E2E5EB] rounded-lg outline-none focus:border-[#16A34A] bg-white';

// A qué "part" de la biblioteca va cada tipo, para que el agente correcto lo lea como ejemplo.
//   anuncio → 'example' (agente Anuncios) · vsl → 'vsl_ficha' (agente VSL) · landing → 'cf_ficha' (agente Landing)
const TIPOS = [
  { key: 'anuncio', part: 'example', label: 'Anuncio', Icon: Megaphone, ph: 'Pegá el copy del anuncio ganador (hooks + texto base)…' },
  { key: 'vsl', part: 'vsl_ficha', label: 'VSL', Icon: Video, ph: 'Pegá el guión del VSL ganador (o su estructura beat a beat)…' },
  { key: 'landing', part: 'cf_ficha', label: 'Landing', Icon: LayoutTemplate, ph: 'Pegá el copy de la landing ganadora (título, secciones)…' },
];

function MetricChips({ metrics }) {
  if (!metrics || typeof metrics !== 'object') return null;
  const order = [
    ['hook_rate', 'hook', '%'], ['hold_rate', 'hold', '%'], ['cpl', 'CPL', ''],
    ['ctr', 'CTR', '%'], ['score', 'score', ''], ['spend', 'gasto', ''], ['leads', 'leads', ''],
  ];
  return (
    <div className="flex flex-wrap gap-1.5 mt-1.5">
      {order.filter(([k]) => metrics[k] !== null && metrics[k] !== undefined).map(([k, label, suf]) => (
        <span key={k} className="text-[10.5px] font-semibold py-0.5 px-2 rounded-full bg-[#E6F7EE] text-[#16A34A]">{label} {metrics[k]}{suf}</span>
      ))}
    </div>
  );
}

function CandidateCard({ item, onApprove, onReject }) {
  const [niche, setNiche] = useState(item.niche || '');
  const [title, setTitle] = useState(item.title || '');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  const approve = async () => { setBusy(true); await onApprove(item, { niche: niche.trim(), title: title.trim() }); setBusy(false); };
  const reject = async () => { setBusy(true); await onReject(item); setBusy(false); };

  return (
    <div className="bg-white border border-[#E2E5EB] rounded-xl p-3.5">
      <div className="flex items-start gap-2.5">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: '#E6F7EE', color: GREEN }}><Trophy size={17} /></div>
        <div className="min-w-0 flex-1">
          <input className={input + ' font-semibold'} value={title} onChange={e => setTitle(e.target.value)} placeholder="Título del ganador" />
          <MetricChips metrics={item.metrics} />
          <div className="flex items-center gap-1.5 mt-2">
            <Tag size={13} className="text-[#9CA3AF] shrink-0" />
            <input className={input + ' py-1.5'} value={niche} onChange={e => setNiche(e.target.value)} placeholder="Nicho (ej: cripto, salud, emprendimiento digital)" />
          </div>
          {item.content && (
            <button onClick={() => setOpen(o => !o)} className="text-[11.5px] font-semibold text-[#2E69E0] bg-transparent border-none cursor-pointer p-0 mt-2 hover:underline">
              {open ? 'Ocultar copy' : 'Ver copy / transcript'}
            </button>
          )}
          {open && item.content && <div className="text-[12px] text-[#4B5563] mt-1.5 whitespace-pre-wrap bg-[#FAFBFC] border border-[#EEF0F4] rounded-lg p-2.5 max-h-[240px] overflow-y-auto">{item.content}</div>}
        </div>
      </div>
      <div className="flex gap-2 mt-3 justify-end">
        <button onClick={reject} disabled={busy} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#F3C9C9] text-[#DC2626] bg-white hover:bg-[#FEF2F2] disabled:opacity-50"><X size={14} /> Rechazar</button>
        <button onClick={approve} disabled={busy || !niche.trim()} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: GREEN }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Aprobar
        </button>
      </div>
    </div>
  );
}

function ManualAdd({ onAdded }) {
  const { clients } = useApp();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState('anuncio');
  const [clientId, setClientId] = useState('');
  const [title, setTitle] = useState('');
  const [niche, setNiche] = useState('');
  const [avatar, setAvatar] = useState('');
  const [content, setContent] = useState('');
  const [metricas, setMetricas] = useState('');
  const [porQue, setPorQue] = useState('');
  const [busy, setBusy] = useState(false);

  const def = TIPOS.find((t) => t.key === tipo) || TIPOS[0];

  // Al elegir cliente, autocompleta el nicho desde su ficha (editable igual).
  const onCliente = (id) => {
    setClientId(id);
    const c = (clients || []).find((x) => x.id === id);
    if (c?.niche && !niche.trim()) setNiche(c.niche);
  };

  const reset = () => { setTipo('anuncio'); setClientId(''); setTitle(''); setNiche(''); setAvatar(''); setContent(''); setMetricas(''); setPorQue(''); };

  const save = async () => {
    if (!content.trim() || !niche.trim()) return;
    setBusy(true);
    const cli = (clients || []).find((x) => x.id === clientId);
    // El "por qué funcionó" y las métricas se EMBEBEN en el content además de guardarse en
    // metrics: así el agente los lee cuando trae esta ficha como ejemplo (no solo el copy).
    const cabecera = [
      porQue.trim() ? `POR QUÉ FUNCIONÓ:\n${porQue.trim()}` : '',
      metricas.trim() ? `MÉTRICAS: ${metricas.trim()}` : '',
      cli?.name ? `CLIENTE: ${cli.name}${cli.niche ? ` · nicho: ${cli.niche}` : ''}` : '',
    ].filter(Boolean).join('\n');
    const fullContent = cabecera ? `${cabecera}\n\n———\n\n${content.trim()}` : content.trim();

    const { error } = await supabase.from('marketing_ad_library').insert({
      id: rid(tipo), part: def.part, status: 'approved',
      niche: niche.trim(), niche_tags: [niche.trim()], avatar: avatar.trim() || null,
      title: title.trim() || `${def.label} ganador — ${niche.trim()}`,
      content: fullContent, char_count: fullContent.length,
      client_id: clientId || null,
      metrics: { tier: 'ganador', por_que: porQue.trim() || null, metricas: metricas.trim() || null, cliente: cli?.name || null, tipo },
    });
    setBusy(false);
    if (error) { alert('No se pudo guardar: ' + error.message); return; }
    reset(); setOpen(false); onAdded();
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-lg text-[12.5px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#4B5563] hover:border-[#16A34A]"><Plus size={14} /> Cargar a la bitácora</button>
  );
  return (
    <div className="bg-[#FAFBFC] border border-[#E2E5EB] rounded-xl p-3.5 grid gap-2.5 w-full max-w-[560px]">
      <div className="text-[12.5px] font-bold text-[#1A1D26] flex items-center gap-1.5"><Pencil size={14} /> Cargar un ganador a la bitácora (entra ya aprobado)</div>

      {/* Tipo: define qué agente lo usa como referencia */}
      <div className="grid grid-cols-3 gap-1.5">
        {TIPOS.map((t) => {
          const on = t.key === tipo; const I = t.Icon;
          return (
            <button key={t.key} onClick={() => setTipo(t.key)}
              className="inline-flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[12px] font-semibold cursor-pointer border"
              style={on ? { background: '#E6F7EE', borderColor: GREEN, color: '#15803D' } : { background: '#fff', borderColor: '#E2E5EB', color: '#6B7280' }}>
              <I size={14} /> {t.label}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <select className={input} value={clientId} onChange={(e) => onCliente(e.target.value)}>
          <option value="">Cliente (opcional)…</option>
          {(clients || []).slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')).map((c) => (
            <option key={c.id} value={c.id}>{c.name || c.id}</option>
          ))}
        </select>
        <div className="flex items-center gap-1.5">
          <Tag size={13} className="text-[#9CA3AF] shrink-0" />
          <input className={input} value={niche} onChange={(e) => setNiche(e.target.value)} placeholder="Nicho (ej: viajes, salud, cripto)" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 max-md:grid-cols-1">
        <input className={input} placeholder="Título (opcional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className={input} placeholder="Avatar (opcional, ej: mujeres viajeras)" value={avatar} onChange={(e) => setAvatar(e.target.value)} />
      </div>

      <textarea className={input + ' resize-y min-h-[110px] leading-relaxed'} placeholder={def.ph} value={content} onChange={(e) => setContent(e.target.value)} />
      <input className={input} placeholder="Métricas (ej: CPL 1,80 · hook 32% · hold 12% · 40 registros)" value={metricas} onChange={(e) => setMetricas(e.target.value)} />
      <textarea className={input + ' resize-y min-h-[64px] leading-relaxed'} placeholder="¿Por qué funcionó? (el ángulo, el hook, la promesa… lo que lo hizo ganar)" value={porQue} onChange={(e) => setPorQue(e.target.value)} />

      <div className="flex gap-2 justify-end">
        <button onClick={() => { reset(); setOpen(false); }} className="py-1.5 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border border-[#E2E5EB] bg-white text-[#6B7280]">Cancelar</button>
        <button onClick={save} disabled={busy || !content.trim() || !niche.trim()} className="inline-flex items-center gap-1.5 py-1.5 px-3.5 rounded-lg text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: GREEN }}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Guardar en la bitácora
        </button>
      </div>
    </div>
  );
}

export default function WinnerCandidates() {
  const [candidates, setCandidates] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { data } = await supabase.from('marketing_ad_library')
      .select('id,niche,niche_tags,title,content,metrics,client_id,source_ad_id,created_at')
      .eq('status', 'candidate').order('created_at', { ascending: false });
    setCandidates(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = useCallback(async (item, patch) => {
    const niche = patch.niche || item.niche || 'sin nicho';
    await supabase.from('marketing_ad_library').update({
      status: 'approved', niche, niche_tags: [niche], title: patch.title || item.title,
    }).eq('id', item.id);
    load();
  }, [load]);

  const reject = useCallback(async (item) => {
    await supabase.from('marketing_ad_library').update({ status: 'rejected' }).eq('id', item.id);
    load();
  }, [load]);

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-bold text-[#1A1D26] flex items-center gap-2"><Trophy size={17} className="text-[#16A34A]" /> Bitácora de ganadores</div>
          <p className="text-[12.5px] text-[#6B7280] mt-1 max-w-[560px]">Anuncios ganadores detectados solos por las métricas (hook, hold, CPL): aprobalos —editá el nicho antes— y el agente de Anuncios los usa como referencia por nicho. Y con <b>“Cargar a la bitácora”</b> sumás a mano ganadores de <b>Anuncios, VSL o Landing</b> (contenido, cliente, nicho, métricas y por qué funcionó) para que cada agente se retroalimente en su próxima corrida.</p>
        </div>
        <ManualAdd onAdded={load} />
      </div>

      {loading ? <div className="text-[#9CA3AF] text-center py-16 text-[13px]">Cargando…</div>
        : candidates.length === 0
          ? <div className="text-center py-14 px-5 border border-dashed border-[#D8DDE6] rounded-2xl">
              <Trophy size={26} className="text-[#C3C9D4] mx-auto mb-2" />
              <div className="text-[13px] font-semibold text-[#4B5563]">No hay candidatos pendientes</div>
              <div className="text-[12px] text-[#9CA3AF] mt-1 max-w-[420px] mx-auto">Cuando el sistema detecte un anuncio ganador con suficiente gasto y rendimiento, va a aparecer acá para que lo apruebes. También podés cargar uno a mano.</div>
            </div>
          : <div className="grid gap-3">{candidates.map(c => <CandidateCard key={c.id} item={c} onApprove={approve} onReject={reject} />)}</div>}
    </div>
  );
}
