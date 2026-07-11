// CerebroPage — la "capacitación" (skills) de los subagentes de marketing.
// Editor visual tipo Proyecto de Claude: por subagente se cargan INSTRUCCIONES
// (el skill) + MATERIAL de entrenamiento (texto, links, docs de Drive, archivos).
// Fuente de verdad = Supabase (marketing_subagents + marketing_training_material).
// El cerebro de Claude Code lee de estas tablas para componer sus prompts.
import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@korex/db';
import {
  Brain, Save, Plus, Trash2, FileText, Link2, Upload, Trophy,
  BookOpen, Lightbulb, ShieldCheck, FolderOpen, Loader2,
} from 'lucide-react';

const PINK = '#EC4899';
const rid = () => `mtm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const KIND_META = {
  guia:             { label: 'Guía',    Icon: BookOpen,    color: '#2E69E0', bg: '#E9F1FF' },
  ejemplo:          { label: 'Ejemplo', Icon: Lightbulb,   color: '#CA8A04', bg: '#FEF9E7' },
  regla:            { label: 'Regla',   Icon: ShieldCheck, color: '#DC2626', bg: '#FEF2F2' },
  link:             { label: 'Link',    Icon: Link2,       color: '#7C3AED', bg: '#F4F1FE' },
  doc_drive:        { label: 'Doc Drive', Icon: FolderOpen, color: '#C79A3E', bg: '#FCEFD0' },
  archivo:          { label: 'Archivo', Icon: Upload,      color: '#16A34A', bg: '#E6F7EE' },
  creativo_ganador: { label: 'Ganador', Icon: Trophy,      color: '#16A34A', bg: '#E6F7EE' },
};

const btnPrimary = 'inline-flex items-center gap-1.5 py-2 px-3.5 border-none rounded-lg text-white text-[12.5px] font-semibold cursor-pointer disabled:opacity-50';
const input = 'w-full py-2 px-3 text-[13px] border border-[#E2E5EB] rounded-lg outline-none focus:border-blue bg-white';

// ── Fila de material ─────────────────────────────────────────────────────────
function MaterialRow({ item, onDelete }) {
  const meta = KIND_META[item.kind] || KIND_META.guia;
  const { Icon } = meta;
  const openFile = async () => {
    if (item.url) { window.open(item.url, '_blank', 'noopener'); return; }
    if (item.file_path) {
      const { data } = await supabase.storage.from('marketing-training').createSignedUrl(item.file_path, 3600);
      if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener');
    }
  };
  const clickable = !!(item.url || item.file_path);
  return (
    <div className="flex items-start gap-2.5 p-3 rounded-lg bg-white border border-[#E2E5EB]">
      <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg shrink-0" style={{ background: meta.bg, color: meta.color }}><Icon size={15} /></div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full" style={{ color: meta.color, background: meta.bg }}>{meta.label}</span>
          {item.source === 'auto' && <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full text-[#9CA3AF] bg-[#F0F2F5]">Auto</span>}
          <span className="text-[12.5px] font-semibold text-[#1A1D26] truncate">{item.title || '(sin título)'}</span>
        </div>
        {item.content && <div className="text-[12px] text-[#4B5563] mt-1 whitespace-pre-wrap line-clamp-4">{item.content}</div>}
        {clickable && (
          <button onClick={openFile} className="text-[11.5px] font-semibold text-[#2E69E0] bg-transparent border-none cursor-pointer p-0 mt-1 hover:underline inline-flex items-center gap-1">
            {item.url ? 'Abrir link' : 'Abrir archivo'}
          </button>
        )}
        {item.metrics && (
          <div className="text-[11px] text-[#16A34A] mt-1">
            {Object.entries(item.metrics).map(([k, v]) => `${k}: ${v}`).join(' · ')}
          </div>
        )}
      </div>
      <button onClick={() => onDelete(item.id)} title="Borrar" className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white border border-[#F3C9C9] text-[#DC2626] cursor-pointer hover:bg-[#FEF2F2] shrink-0"><Trash2 size={13} /></button>
    </div>
  );
}

// ── Formulario para agregar material ─────────────────────────────────────────
function AddMaterial({ scope, onAdded }) {
  const [tab, setTab] = useState('texto'); // texto | link | archivo
  const [kind, setKind] = useState('guia');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);

  const reset = () => { setTitle(''); setContent(''); setUrl(''); setKind('guia'); };

  const addText = async () => {
    if (!content.trim() && !title.trim()) return;
    setBusy(true);
    await supabase.from('marketing_training_material').insert({
      id: rid(), scope, kind, title: title.trim() || null, content: content.trim() || null, source: 'manual',
    });
    setBusy(false); reset(); onAdded();
  };
  const addLink = async () => {
    if (!url.trim()) return;
    const isDrive = /drive\.google\.com|docs\.google\.com/i.test(url);
    setBusy(true);
    await supabase.from('marketing_training_material').insert({
      id: rid(), scope, kind: isDrive ? 'doc_drive' : 'link', title: title.trim() || url.trim(), url: url.trim(), source: 'manual',
    });
    setBusy(false); reset(); onAdded();
  };
  const addFile = async (file) => {
    if (!file) return;
    setBusy(true);
    const safe = file.name.replace(/[^\w.-]+/g, '_');
    const path = `${scope}/${Date.now()}_${safe}`;
    const up = await supabase.storage.from('marketing-training').upload(path, file, { upsert: false });
    if (!up.error) {
      await supabase.from('marketing_training_material').insert({
        id: rid(), scope, kind: 'archivo', title: file.name, file_path: path, source: 'manual',
      });
      onAdded();
    }
    setBusy(false);
  };

  const tabs = [
    { key: 'texto', label: 'Texto', Icon: FileText },
    { key: 'link', label: 'Link / Doc', Icon: Link2 },
    { key: 'archivo', label: 'Archivo', Icon: Upload },
  ];

  return (
    <div className="bg-[#FAFBFC] border border-[#E2E5EB] rounded-xl p-3.5">
      <div className="flex gap-1 mb-3">
        {tabs.map(t => {
          const active = tab === t.key;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg text-[12px] font-semibold cursor-pointer border" style={active ? { background: PINK, color: '#fff', borderColor: PINK } : { background: '#fff', color: '#6B7280', borderColor: '#E2E5EB' }}>
              <t.Icon size={13} /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'texto' && (
        <div className="grid gap-2">
          <div className="flex gap-1.5">
            {['guia', 'ejemplo', 'regla'].map(k => (
              <button key={k} onClick={() => setKind(k)} className="py-1 px-2.5 rounded-md text-[11.5px] font-semibold cursor-pointer border" style={kind === k ? { background: KIND_META[k].bg, color: KIND_META[k].color, borderColor: KIND_META[k].color } : { background: '#fff', color: '#9CA3AF', borderColor: '#E2E5EB' }}>{KIND_META[k].label}</button>
            ))}
          </div>
          <input className={input} placeholder="Título (opcional)" value={title} onChange={e => setTitle(e.target.value)} />
          <textarea className={input + ' resize-y min-h-[90px] leading-relaxed'} placeholder="Escribí la guía, el ejemplo o la regla…" value={content} onChange={e => setContent(e.target.value)} />
          <div><button onClick={addText} disabled={busy} className={btnPrimary} style={{ background: PINK }}><Plus size={14} /> Agregar</button></div>
        </div>
      )}

      {tab === 'link' && (
        <div className="grid gap-2">
          <input className={input} placeholder="Título (opcional)" value={title} onChange={e => setTitle(e.target.value)} />
          <input className={input} placeholder="https://… (link o Doc de Drive)" value={url} onChange={e => setUrl(e.target.value)} />
          <div><button onClick={addLink} disabled={busy} className={btnPrimary} style={{ background: PINK }}><Plus size={14} /> Agregar</button></div>
        </div>
      )}

      {tab === 'archivo' && (
        <div className="grid gap-2">
          <label className="flex flex-col items-center justify-center gap-2 py-6 px-4 border-2 border-dashed border-[#E2E5EB] rounded-xl cursor-pointer hover:border-[#EC4899] bg-white text-center">
            {busy ? <Loader2 size={20} className="animate-spin text-[#EC4899]" /> : <Upload size={20} className="text-[#9CA3AF]" />}
            <span className="text-[12.5px] font-semibold text-[#6B7280]">{busy ? 'Subiendo…' : 'Subir PDF, imagen o archivo'}</span>
            <span className="text-[11px] text-[#9CA3AF]">Ej: anuncios ganadores, capturas, guías en PDF</span>
            <input type="file" className="hidden" disabled={busy} onChange={e => addFile(e.target.files?.[0])} />
          </label>
        </div>
      )}
    </div>
  );
}

export default function CerebroPage() {
  const [subagents, setSubagents] = useState([]);
  const [selected, setSelected] = useState('general');
  const [material, setMaterial] = useState([]);
  const [instructions, setInstructions] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadSubagents = useCallback(async () => {
    const { data } = await supabase.from('marketing_subagents').select('*').order('position');
    setSubagents(data || []);
    setLoading(false);
  }, []);
  const loadMaterial = useCallback(async (scope) => {
    const { data } = await supabase.from('marketing_training_material').select('*').eq('scope', scope).order('created_at', { ascending: false });
    setMaterial(data || []);
  }, []);

  useEffect(() => { loadSubagents(); }, [loadSubagents]);
  useEffect(() => { loadMaterial(selected); }, [selected, loadMaterial]);
  // Reflejar las instrucciones del subagente elegido (salvo que haya cambios sin guardar).
  useEffect(() => {
    const sa = subagents.find(s => s.key === selected);
    if (sa && !dirty) setInstructions(sa.instructions || '');
  }, [selected, subagents, dirty]);

  const current = subagents.find(s => s.key === selected);
  const saveInstructions = async () => {
    setSaving(true);
    await supabase.from('marketing_subagents').update({ instructions, updated_at: new Date().toISOString() }).eq('key', selected);
    setDirty(false); setSaving(false);
    await loadSubagents();
  };
  const deleteMaterial = async (id) => {
    await supabase.from('marketing_training_material').delete().eq('id', id);
    loadMaterial(selected);
  };

  const winners = useMemo(() => material.filter(m => m.kind === 'creativo_ganador'), [material]);
  const regular = useMemo(() => material.filter(m => m.kind !== 'creativo_ganador'), [material]);

  return (
    <div className="max-w-[1180px] mx-auto px-4 py-6">
      <div className="flex items-center gap-2 mb-1">
        <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg" style={{ background: '#FDF2F8', color: PINK }}><Brain size={18} /></div>
        <h1 className="text-[22px] font-extrabold text-text">Cerebro · Capacitación</h1>
      </div>
      <p className="text-[13px] text-text3 mb-5">Entrená a cada subagente de marketing: sus instrucciones y su material. El cerebro lo usa para crear anuncios, VSL y landings.</p>

      {loading ? <div className="text-text3 text-center py-20">Cargando…</div> : (
        <div className="grid gap-4" style={{ gridTemplateColumns: '220px 1fr' }}>
          {/* Panel izquierdo: subagentes */}
          <div className="flex flex-col gap-1.5">
            {subagents.map(sa => {
              const active = selected === sa.key;
              return (
                <button key={sa.key} onClick={() => { setDirty(false); setSelected(sa.key); }} className="flex items-center gap-2 py-2.5 px-3 rounded-xl text-left cursor-pointer border transition-colors" style={active ? { background: '#FDF2F8', borderColor: PINK, color: '#1A1D26' } : { background: '#fff', borderColor: '#E2E5EB', color: '#4B5563' }}>
                  <span className="text-[13px] font-semibold flex-1">{sa.name}</span>
                  {sa.key === 'general' && <span className="text-[9px] font-bold uppercase tracking-wider py-0.5 px-1.5 rounded-full text-[#EC4899] bg-white border" style={{ borderColor: '#FBCFE8' }}>Base</span>}
                </button>
              );
            })}
            <div className="text-[11px] text-[#9CA3AF] mt-2 leading-relaxed px-1">
              <strong>General</strong> = modelo Korex + lineamientos que <em>todos</em> los subagentes heredan.
            </div>
          </div>

          {/* Panel derecho: instrucciones + material */}
          <div className="grid gap-5">
            {/* Instrucciones */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[13px] font-bold text-[#1A1D26]">Instrucciones {current ? `· ${current.name}` : ''}</div>
                <button onClick={saveInstructions} disabled={saving || !dirty} className={btnPrimary} style={{ background: dirty ? PINK : '#C4C9D2' }}>
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} {saving ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
              <textarea
                className={input + ' resize-y min-h-[220px] leading-relaxed font-mono text-[12.5px]'}
                placeholder={selected === 'general'
                  ? 'Describí el modelo de negocio de Método Korex, el nicho, Reclutamiento vs Producto, el tono y los lineamientos generales que todos los subagentes deben seguir…'
                  : 'Describí cómo debe trabajar este subagente: qué crea, con qué estructura, qué reglas sigue, qué evita…'}
                value={instructions}
                onChange={e => { setInstructions(e.target.value); setDirty(true); }}
              />
            </div>

            {/* Material */}
            <div>
              <div className="text-[13px] font-bold text-[#1A1D26] mb-2">Material de entrenamiento</div>
              <div className="mb-3"><AddMaterial scope={selected} onAdded={() => loadMaterial(selected)} /></div>
              {regular.length === 0
                ? <div className="text-[12.5px] text-[#9CA3AF] py-3">Todavía no hay material. Agregá guías, ejemplos, reglas, links o archivos arriba.</div>
                : <div className="grid gap-2">{regular.map(m => <MaterialRow key={m.id} item={m} onDelete={deleteMaterial} />)}</div>}
            </div>

            {/* Creativos ganadores */}
            {winners.length > 0 && (
              <div>
                <div className="text-[13px] font-bold text-[#1A1D26] mb-2 flex items-center gap-1.5"><Trophy size={15} className="text-[#16A34A]" /> Creativos que funcionan</div>
                <div className="grid gap-2">{winners.map(m => <MaterialRow key={m.id} item={m} onDelete={deleteMaterial} />)}</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
