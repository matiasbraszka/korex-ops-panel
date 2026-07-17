import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink, Plus, Trash2, Check, Pencil, Eye, PenLine, Link2, Image as ImageIcon, Monitor } from 'lucide-react';
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

// El orden CANÓNICO del DEL (el de la maqueta): la estrategia arriba, después los avatares,
// la VSL, los anuncios, el recorrido de páginas, y al final los mensajes / lo viejo / lo suelto.
// El Doc real viene desordenado; con esto las secciones se leen como el documento estructurado
// que pidió Matías, agrupadas por categoría, sin tocar el texto.
const KIND_ORDER = ['estrategia', 'avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios', 'mensajes', 'pipeline_viejo', 'otros'];
const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i === -1 ? 99 : i; };

// Las 4 secciones sin html (pestañas-puntero que ya no estan en el Doc) se editan
// igual: el texto plano se envuelve en parrafos para arrancar.
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainToHtml = (t) => String(t || '').split(/\n{2,}/).map(b => `<p>${esc(b.trim()).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';

// Los documentos del cliente que se comparten entre TODOS sus funnels (personalidad,
// onboarding, investigación). En la maqueta van al fondo del menú del DEL, bajo
// "DEL CLIENTE · compartidos". Son de solo lectura acá; se editan sincronizando el Drive.
const DOC_KIND_LABEL = {
  briefing: 'Personalidad', extra: 'Personalidad', investigacion: 'Investigación', onboarding: 'Onboarding',
};

export default function DelEditor({ strategyId, docId, docUrl, clientId, configNode, recursosNode }) {
  const { currentUser } = useApp();
  const [secs, setSecs] = useState(null);
  const [err, setErr] = useState(null);
  const [activa, setActiva] = useState(null);
  const [modo, setModo] = useState('leer'); // 'leer' | 'editar'
  const [saveState, setSaveState] = useState({}); // id -> 'saving'|'saved'|'error'
  const [editTitle, setEditTitle] = useState(null); // id de la seccion con el titulo en edicion
  // Qué se ve en el panel derecho: 'del' (el documento) | 'config' | 'recursos' | 'cliente:<docId>'
  const [view, setView] = useState('del');
  const [clientDocs, setClientDocs] = useState([]);
  const scrollRef = useRef(null);
  const timers = useRef({}); // id -> timeout (debounce de guardado)
  const by = currentUser?.id || null;

  // El doc_id lo necesitamos para agregar secciones. Si no vino, lo resolvemos del
  // primer del_section (todas comparten doc_id por estrategia).
  const [resolvedDoc, setResolvedDoc] = useState(docId || null);
  const [resolvedClient, setResolvedClient] = useState(clientId || null);

  const cargar = useCallback(async () => {
    try {
      const rows = await sbFetch(
        `del_sections?select=id,doc_id,client_id,ord,title,kind,text,html,char_count,source&strategy_id=eq.${strategyId}&order=ord.asc`,
        { headers: { Prefer: 'return=representation' } },
      );
      const list = Array.isArray(rows) ? rows : [];
      setSecs(list);
      if (list.length) {
        setActiva((a) => a || list[0].id);
        setResolvedDoc((d) => d || list[0].doc_id);
        setResolvedClient((c) => c || list[0].client_id);
      }
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }, [strategyId]);

  useEffect(() => { cargar(); }, [cargar]);

  // Documentos del cliente (compartidos por todos sus funnels), para el grupo "DEL CLIENTE".
  useEffect(() => {
    const cid = clientId || resolvedClient;
    if (!cid) return;
    let alive = true;
    (async () => {
      try {
        const rows = await sbFetch(`client_brain_docs?select=id,title,doc_kind,text,char_count,web_url&client_id=eq.${encodeURIComponent(cid)}&doc_kind=neq.del&order=doc_kind.asc`);
        if (alive) setClientDocs(Array.isArray(rows) ? rows : []);
      } catch { if (alive) setClientDocs([]); }
    })();
    return () => { alive = false; };
  }, [clientId, resolvedClient]);

  const resumen = useMemo(() => {
    if (!secs) return [];
    const m = new Map();
    secs.forEach(s => m.set(s.kind, (m.get(s.kind) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [secs]);

  // Secciones en el orden canónico del DEL (por categoría y, dentro de cada una, por su
  // posición real en el Doc). Es lo que estructura el documento sin reescribirlo.
  const sorted = useMemo(
    () => (secs ? [...secs].sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || (a.ord - b.ord)) : []),
    [secs],
  );

  // Las secciones agrupadas por categoría, en orden canónico. De acá salen los grupos de
  // color del índice y las franjas del documento.
  const groups = useMemo(() => {
    const g = [];
    for (const s of sorted) {
      const last = g[g.length - 1];
      if (last && last.kind === s.kind) last.items.push(s);
      else g.push({ kind: s.kind, items: [s] });
    }
    return g;
  }, [sorted]);

  const irA = (id) => {
    setActiva(id);
    setView('del');
    // Si veníamos de otra vista, el documento recién se monta: esperamos un tick.
    setTimeout(() => {
      const el = document.getElementById('sec-' + id);
      if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' });
    }, view === 'del' ? 0 : 60);
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

  const agregar = async (afterOrd, kind = 'otros') => {
    if (!resolvedDoc) return;
    const { data, error } = await supabase.rpc('del_section_add', {
      p_doc_id: resolvedDoc, p_title: 'Sección nueva', p_kind: kind || 'otros', p_after_ord: afterOrd ?? null, p_by: by,
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

        {/* El menú del DEL (maqueta): ESTE FUNNEL (las secciones del documento) · las dos
            pestañas Configuración/Recursos · y abajo los documentos DEL CLIENTE, que
            comparten todos sus funnels. */}
        <nav className="sticky top-0 flex flex-col gap-0.5 p-2 rounded-xl border border-[#E7EAF0] bg-white max-h-[calc(100vh-120px)] overflow-y-auto" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>
          <div className="px-2 pt-1 pb-1.5">
            <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Este funnel</span>
          </div>
          {/* "DEL" arriba de todo = el documento entero */}
          <button onClick={() => { setView('del'); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-2 w-full py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12.5px] font-bold transition-colors"
            style={{ background: view === 'del' ? '#EFEBFF' : 'transparent', color: view === 'del' ? '#6D28D9' : '#4B5563' }}>
            <FileText size={14} className="shrink-0" />DEL
          </button>
          {/* Las secciones del documento, agrupadas por categoría con su color. */}
          {groups.map(gr => {
            const sc = secOf(gr.kind);
            return (
              <div key={gr.kind} className="mb-0.5">
                <div className="flex items-center gap-1.5 px-2 pt-2 pb-1">
                  <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: sc.c }} />
                  <span className="text-[9.5px] font-extrabold tracking-[0.07em] uppercase" style={{ color: sc.c }}>{sc.label}</span>
                  <span className="text-[9.5px] font-bold text-[#C3C9D4]">{gr.items.length}</span>
                </div>
                {gr.items.map(s => {
                  const on = view === 'del' && activa === s.id;
                  return (
                    <button key={s.id} onClick={() => irA(s.id)}
                      className="flex items-center gap-2 w-full py-1.5 pl-4 pr-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12px] font-semibold transition-colors"
                      style={{ background: on ? sc.bg : 'transparent', color: on ? sc.c : '#6B7280' }}>
                      <span className="truncate flex-1 min-w-0">{s.title}</span>
                    </button>
                  );
                })}
              </div>
            );
          })}
          {editando && view === 'del' && resolvedDoc && (
            <button onClick={() => agregar(null)} className="flex items-center gap-2 py-2 px-2.5 mt-1 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11.5px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent">
              <Plus size={13} />Agregar sección
            </button>
          )}

          {/* Las dos pestañas de la maqueta, debajo de las secciones. */}
          <div className="h-px my-2 mx-1" style={{ background: '#EDF0F5' }} />
          <button onClick={() => setView('config')}
            className="flex items-center gap-2 w-full py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12.5px] font-semibold transition-colors"
            style={{ background: view === 'config' ? '#EEF3FF' : 'transparent', color: view === 'config' ? '#1D4FD8' : '#4B5563' }}>
            <Link2 size={14} className="shrink-0" />Configuración Meta y Links
          </button>
          <button onClick={() => setView('recursos')}
            className="flex items-center gap-2 w-full py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12.5px] font-semibold transition-colors"
            style={{ background: view === 'recursos' ? '#FFF7ED' : 'transparent', color: view === 'recursos' ? '#B45309' : '#4B5563' }}>
            <ImageIcon size={14} className="shrink-0" />Recursos
          </button>

          {/* DEL CLIENTE: los documentos compartidos por todos los funnels del cliente. */}
          {clientDocs.length > 0 && (
            <>
              <div className="px-2 pt-3 pb-1.5 flex items-center gap-1.5">
                <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Del cliente</span>
                <span className="text-[9px] font-bold py-0.5 px-1.5 rounded-full" style={{ background: '#FEF3C7', color: '#B45309' }}>compartidos</span>
              </div>
              {clientDocs.map(d => {
                const on = view === 'cliente:' + d.id;
                return (
                  <button key={d.id} onClick={() => setView('cliente:' + d.id)}
                    className="flex items-center gap-2 w-full py-1.5 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12px] font-semibold transition-colors"
                    style={{ background: on ? '#F1F3F7' : 'transparent', color: on ? '#1A1D26' : '#6B7280' }}>
                    <Monitor size={13} className="shrink-0 text-[#9098A4]" />
                    <span className="truncate flex-1 min-w-0">{DOC_KIND_LABEL[d.doc_kind] || d.title}</span>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        <div className="min-w-0 flex flex-col gap-3">
          {view === 'del' && (<>
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

          {/* El documento, agrupado por categoría en orden canónico. Cada grupo abre con su
              franja de color; adentro van sus secciones. Así el DEL se lee estructurado
              (la "S" de Estrategia arriba, después Avatares, VSL, Anuncios, Páginas…). */}
          {groups.map(gr => {
            const gc = secOf(gr.kind);
            return (
              <div key={gr.kind} className="flex flex-col gap-3">
                <div className="flex items-center gap-2 pt-1">
                  <span className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-full text-[11px] font-extrabold uppercase tracking-[0.06em]" style={{ background: gc.bg, color: gc.c }}>
                    <span className="w-[7px] h-[7px] rounded-full" style={{ background: gc.c }} />{gc.label}
                  </span>
                  <span className="h-px flex-1" style={{ background: '#EDF0F5' }} />
                </div>
                {gr.items.map(s => {
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
                      <button onClick={() => agregar(s.ord, s.kind)} title="Agregar sección debajo (misma categoría)" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#7C3AED] border-none bg-transparent cursor-pointer"><Plus size={14} /></button>
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
            );
          })}
          </>)}

          {/* Configuración Meta y Links — la config del funnel, movida acá desde la pantalla. */}
          {view === 'config' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 py-2 px-1">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#EEF3FF', color: '#1D4FD8' }}><Link2 size={16} /></span>
                <div>
                  <div className="text-[14px] font-bold text-[#1A1D26]">Configuración Meta y Links</div>
                  <div className="text-[11px] text-[#9098A4]">Enlaces, Pixel, Clarity y eventos de conversión de este funnel.</div>
                </div>
              </div>
              {configNode || <div className="text-[12px] text-[#9098A4] p-4">Sin configuración.</div>}
            </div>
          )}

          {/* Recursos — el material del funnel (avatares, VSL, copy). La galería de videos
              por avatar de la maqueta viene después; por ahora vive acá el material real. */}
          {view === 'recursos' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 py-2 px-1">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#FFF7ED', color: '#B45309' }}><ImageIcon size={16} /></span>
                <div>
                  <div className="text-[14px] font-bold text-[#1A1D26]">Recursos</div>
                  <div className="text-[11px] text-[#9098A4]">Avatares, VSL y copys de las páginas de este funnel.</div>
                </div>
              </div>
              {recursosNode || <div className="text-[12px] text-[#9098A4] p-4">Sin recursos.</div>}
            </div>
          )}

          {/* Un documento DEL CLIENTE (personalidad / onboarding / investigación), solo lectura. */}
          {view.startsWith('cliente:') && (() => {
            const doc = clientDocs.find(d => 'cliente:' + d.id === view);
            if (!doc) return null;
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-2 px-1 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#F1F3F7', color: '#6B7280' }}><Monitor size={16} /></span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-[#1A1D26] truncate">{DOC_KIND_LABEL[doc.doc_kind] || doc.title}</div>
                      <div className="text-[11px] text-[#9098A4]">Compartido por todos los funnels del cliente · solo lectura.</div>
                    </div>
                  </div>
                  {doc.web_url && <a href={doc.web_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2E69E0] hover:underline shrink-0"><ExternalLink size={11} />Abrir en Drive</a>}
                </div>
                <div className="rounded-xl border border-[#E7EAF0] bg-white py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] whitespace-pre-wrap break-words" style={{ maxWidth: '80ch' }}>
                  {(doc.text || '').trim() || <span className="italic text-[#C3C9D4]">Este documento está vacío o todavía no se sincronizó.</span>}
                </div>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
