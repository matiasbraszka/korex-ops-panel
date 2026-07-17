import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink, Plus, Trash2, Check, Pencil, Eye, PenLine } from 'lucide-react';
import { sbFetch, supabase } from '@korex/db';
import { useApp } from '../../../context/AppContext';
import RichTextEditor from '../../notas/RichTextEditor';
import { sanitizeDelHtml } from './delSanitize';

// El DEL, editable adentro del panel. Apalancado en la herramienta de notas de
// accountability (RichTextEditor), pero por secciones y con tablas.
//
// FLUJO: el equipo lee y edita el DEL sin salir del panel. El PRIMER cambio a un
// DEL lo adopta (del_claim, del lado de la base): desde ahi el importador y el
// rich-sync no lo pisan mas. Es el cutover, por DEL y automatico.
//
// Editar aca acomoda la copia del panel. Todavia no propaga al Google Doc ni a los
// agentes (esa flecha inversa es un paso posterior). Sirve para lo que pidio Matias:
// "voy acomodando los DEL una vez esten todos en el sistema".

const SEC = {
  estrategia:     { c: '#0891B2', bg: '#ECFEFF', label: 'Estrategia' },
  avatares:       { c: '#F97316', bg: '#FFF7ED', label: 'Avatares' },
  vsl:            { c: '#16A34A', bg: '#ECFDF5', label: 'VSL' },
  anuncios:       { c: '#5B7CF5', bg: '#EEF2FF', label: 'Anuncios' },
  pg_prelanding:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Pre-landing' },
  pg_landing:     { c: '#8B5CF6', bg: '#F5F3FF', label: 'Landing' },
  pg_formulario:  { c: '#8B5CF6', bg: '#F5F3FF', label: 'Formulario' },
  pg_thankyou:    { c: '#8B5CF6', bg: '#F5F3FF', label: 'Thank you' },
  pg_testimonios: { c: '#8B5CF6', bg: '#F5F3FF', label: 'Testimonios' },
  mensajes:       { c: '#0D9488', bg: '#F0FDFA', label: 'Mensajes' },
  pipeline_viejo: { c: '#9CA3AF', bg: '#F4F5F7', label: 'Estado (viejo)' },
  otros:          { c: '#9CA3AF', bg: '#F4F5F7', label: 'Otros' },
};
const secOf = (k) => SEC[k] || SEC.otros;

// Las 4 secciones sin html (pestañas-puntero que ya no estan en el Doc) se editan
// igual: el texto plano se envuelve en parrafos para arrancar.
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainToHtml = (t) => String(t || '').split(/\n{2,}/).map(b => `<p>${esc(b.trim()).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';

export default function DelEditor({ strategyId, docId, docUrl }) {
  const { currentUser } = useApp();
  const [secs, setSecs] = useState(null);
  const [err, setErr] = useState(null);
  const [activa, setActiva] = useState(null);
  const [modo, setModo] = useState('leer'); // 'leer' | 'editar'
  const [saveState, setSaveState] = useState({}); // id -> 'saving'|'saved'|'error'
  const [editTitle, setEditTitle] = useState(null); // id de la seccion con el titulo en edicion
  const scrollRef = useRef(null);
  const timers = useRef({}); // id -> timeout (debounce de guardado)
  const by = currentUser?.id || null;

  // El doc_id lo necesitamos para agregar secciones. Si no vino, lo resolvemos del
  // primer del_section (todas comparten doc_id por estrategia).
  const [resolvedDoc, setResolvedDoc] = useState(docId || null);

  const cargar = useCallback(async () => {
    try {
      const rows = await sbFetch(
        `del_sections?select=id,doc_id,ord,title,kind,text,html,char_count,source&strategy_id=eq.${strategyId}&order=ord.asc`,
        { headers: { Prefer: 'return=representation' } },
      );
      const list = Array.isArray(rows) ? rows : [];
      setSecs(list);
      if (list.length) {
        setActiva((a) => a || list[0].id);
        setResolvedDoc((d) => d || list[0].doc_id);
      }
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }, [strategyId]);

  useEffect(() => { cargar(); }, [cargar]);

  const resumen = useMemo(() => {
    if (!secs) return [];
    const m = new Map();
    secs.forEach(s => m.set(s.kind, (m.get(s.kind) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [secs]);

  const irA = (id) => {
    setActiva(id);
    const el = document.getElementById('sec-' + id);
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
  };

  // Guardado con debounce por seccion (800ms tras la ultima tecla).
  const onEdit = (id, html) => {
    setSaveState((s) => ({ ...s, [id]: 'saving' }));
    setSecs((prev) => prev.map(x => x.id === id ? { ...x, html, source: 'panel' } : x));
    clearTimeout(timers.current[id]);
    timers.current[id] = setTimeout(async () => {
      const { error } = await supabase.rpc('del_section_save', { p_id: id, p_html: html, p_by: by });
      setSaveState((s) => ({ ...s, [id]: error ? 'error' : 'saved' }));
      if (!error) setTimeout(() => setSaveState((s) => { const n = { ...s }; if (n[id] === 'saved') delete n[id]; return n; }), 1800);
    }, 800);
  };

  const agregar = async (afterOrd) => {
    if (!resolvedDoc) return;
    const { data, error } = await supabase.rpc('del_section_add', {
      p_doc_id: resolvedDoc, p_title: 'Sección nueva', p_kind: 'otros', p_after_ord: afterOrd ?? null, p_by: by,
    });
    if (error) { window.alert('No pude agregar la sección: ' + error.message); return; }
    await cargar();
    setModo('editar');
    if (data) { setActiva(data); setEditTitle(data); }
  };

  const borrar = async (s) => {
    if (!window.confirm(`¿Borrar la sección "${s.title}"? No se puede deshacer.`)) return;
    const { error } = await supabase.rpc('del_section_delete', { p_id: s.id, p_by: by });
    if (error) { window.alert('No pude borrar: ' + error.message); return; }
    setSecs((prev) => prev.filter(x => x.id !== s.id));
  };

  const renombrar = async (id, title) => {
    setEditTitle(null);
    const s = secs.find(x => x.id === id);
    if (!s || title.trim() === s.title) return;
    setSecs((prev) => prev.map(x => x.id === id ? { ...x, title: title.trim(), source: 'panel' } : x));
    const { error } = await supabase.rpc('del_section_rename', { p_id: id, p_title: title.trim(), p_by: by });
    if (error) window.alert('No pude renombrar: ' + error.message);
  };

  if (err) {
    return (
      <div className="p-6"><div className="rounded-xl border p-4 text-[13px]" style={{ background: '#FEF2F2', borderColor: '#F5C2C2', color: '#B91C1C' }}>
        <div className="font-semibold mb-1 flex items-center gap-1.5"><AlertCircle size={14} />No pude traer el DEL</div>
        <div className="text-[12px] opacity-90">{err}</div>
      </div></div>
    );
  }
  if (!secs) return <div className="flex items-center justify-center gap-2 h-full text-[13px] text-[#9098A4]"><Loader2 size={15} className="animate-spin" />Abriendo el DEL…</div>;
  if (!secs.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 h-full text-center px-6">
        <FileText size={22} className="text-[#C3C9D4]" />
        <div className="text-[13px] font-semibold text-[#4B5563]">Este funnel todavía no tiene DEL importado</div>
        <div className="text-[11.5px] text-[#9098A4] max-w-[420px]">Puede que la carpeta no tenga un DEL, o que el documento exista con un nombre que el sistema no reconoce.</div>
        {resolvedDoc && <button onClick={() => agregar(null)} className="inline-flex items-center gap-1.5 py-2 px-3.5 rounded-[9px] border-none bg-[#7C3AED] text-white text-[12px] font-semibold cursor-pointer hover:brightness-95"><Plus size={13} />Crear la primera sección</button>}
      </div>
    );
  }

  const editando = modo === 'editar';

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: '#FBFCFD' }}>
      <div className="grid gap-5 items-start mx-auto max-w-[1180px] py-5 px-6" style={{ gridTemplateColumns: 'minmax(0,215px) minmax(0,1fr)' }}>

        {/* Índice fijo (anda gracias a overflow-x: clip en index.css). */}
        <nav className="sticky top-0 flex flex-col gap-0.5 p-2 rounded-xl border border-[#E7EAF0] bg-white max-h-[calc(100vh-140px)] overflow-y-auto" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>
          <div className="flex items-center justify-between px-2 pt-1 pb-2">
            <span className="text-[9.5px] font-extrabold tracking-[0.1em] uppercase text-[#AEB4BF]">{secs.length} secciones</span>
          </div>
          {secs.map(s => {
            const sc = secOf(s.kind);
            const on = activa === s.id;
            return (
              <button key={s.id} onClick={() => irA(s.id)}
                className="group/idx flex items-center gap-2 py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12px] font-semibold transition-colors"
                style={{ background: on ? sc.bg : 'transparent', color: on ? sc.c : '#6B7280' }}>
                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: sc.c, opacity: on ? 1 : .45 }} />
                <span className="truncate flex-1 min-w-0">{s.title}</span>
              </button>
            );
          })}
          {editando && resolvedDoc && (
            <button onClick={() => agregar(null)} className="flex items-center gap-2 py-2 px-2.5 mt-1 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11.5px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent">
              <Plus size={13} />Agregar sección
            </button>
          )}
        </nav>

        <div className="min-w-0 flex flex-col gap-3">
          {/* Barra: leer vs editar + de dónde salió + link al Doc */}
          <div className="flex items-center gap-2.5 flex-wrap py-2 px-3 rounded-[10px] border border-[#E7EAF0] bg-white sticky top-0 z-10">
            <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
              <button onClick={() => setModo('leer')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
              <button onClick={() => setModo('editar')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: '#fff', color: '#7C3AED', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
            </div>
            <span className="text-[11px] text-[#9098A4]">{editando ? 'Los cambios se guardan solos. Este DEL pasa a vivir en el panel.' : 'Copia de lectura · el documento vive en Drive'}</span>
            {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2E69E0] hover:underline"><ExternalLink size={11} />Abrir el Doc original</a>}
          </div>

          {!editando && (
            <div className="flex items-center gap-1.5 flex-wrap">
              {resumen.map(([k, n]) => { const sc = secOf(k); return (
                <span key={k} className="inline-flex items-center gap-1.5 py-[3px] px-2 rounded-md text-[10.5px] font-bold" style={{ background: sc.bg, color: sc.c }}>{sc.label}<span className="opacity-60">{n}</span></span>
              ); })}
            </div>
          )}

          {secs.map(s => {
            const sc = secOf(s.kind);
            const st = saveState[s.id];
            return (
              <section key={s.id} id={'sec-' + s.id} className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden" style={{ scrollMarginTop: 60 }}>
                <div className="flex items-center gap-2.5 py-2.5 px-4 border-b border-[#EDF0F5]" style={{ borderLeft: `4px solid ${sc.c}` }}>
                  <span className="text-[9.5px] font-extrabold tracking-[0.09em] uppercase shrink-0" style={{ color: sc.c }}>{sc.label}</span>
                  {editTitle === s.id ? (
                    <input autoFocus defaultValue={s.title}
                      onBlur={(e) => renombrar(s.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditTitle(null); }}
                      className="flex-1 min-w-0 text-[15px] font-bold text-[#1A1D26] border border-[#7C3AED] rounded px-1.5 py-0.5 outline-none" />
                  ) : (
                    <span className="text-[15px] font-bold text-[#1A1D26] tracking-[-.01em] flex-1 min-w-0 truncate">{s.title}</span>
                  )}
                  {st === 'saving' && <span className="text-[10.5px] text-[#9098A4] inline-flex items-center gap-1 shrink-0"><Loader2 size={11} className="animate-spin" />Guardando…</span>}
                  {st === 'saved' && <span className="text-[10.5px] text-[#15803D] inline-flex items-center gap-1 shrink-0"><Check size={11} strokeWidth={3} />Guardado</span>}
                  {st === 'error' && <span className="text-[10.5px] text-[#B91C1C] shrink-0">No se guardó</span>}
                  {editando && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditTitle(s.id)} title="Renombrar" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#1A1D26] border-none bg-transparent cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => agregar(s.ord)} title="Agregar sección debajo" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#7C3AED] border-none bg-transparent cursor-pointer"><Plus size={14} /></button>
                      <button onClick={() => borrar(s)} title="Borrar sección" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:bg-[#FEF2F2] hover:text-[#B91C1C] border-none bg-transparent cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  )}
                  {!editando && <span className="text-[10.5px] text-[#C3C9D4] tabular-nums shrink-0">{(s.char_count || 0).toLocaleString('es-AR')}</span>}
                </div>

                {editando ? (
                  <div className="p-3">
                    <RichTextEditor
                      key={s.id}
                      value={s.html || plainToHtml(s.text)}
                      onChange={(html) => onEdit(s.id, html)}
                      sanitize={sanitizeDelHtml}
                      minHeight={90}
                      placeholder="Escribí acá el contenido de la sección…"
                    />
                  </div>
                ) : s.html ? (
                  <div className="del-rich py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '78ch' }}
                    dangerouslySetInnerHTML={{ __html: sanitizeDelHtml(s.html) }} />
                ) : (
                  <div className="py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] whitespace-pre-wrap break-words" style={{ maxWidth: '78ch' }}>
                    {s.text.trim() || <span className="italic text-[#C3C9D4]">Vacía</span>}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
