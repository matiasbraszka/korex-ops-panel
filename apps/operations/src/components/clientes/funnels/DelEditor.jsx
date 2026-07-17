import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink, Plus, Trash2, Check, Pencil, Eye, PenLine, Link2, Image as ImageIcon, Monitor, MessageSquare, Send, Lock, X } from 'lucide-react';
import { sbFetch, supabase } from '@korex/db';
import { useApp } from '../../../context/AppContext';
import RichTextEditor from '../../notas/RichTextEditor';
import { sanitizeDelHtml } from './delSanitize';

// Color estable por persona (para la presencia y los comentarios).
const PRESENCE_COLORS = ['#2E69E0', '#DB2777', '#16A34A', '#B45309', '#7C3AED', '#0891B2', '#DC2626', '#0D9488'];
const hashCode = (s) => { let h = 0; for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0; return Math.abs(h); };
const colorFor = (seed) => PRESENCE_COLORS[hashCode(seed) % PRESENCE_COLORS.length];
const initialOf = (s) => (String(s || '?').trim()[0] || '?').toUpperCase();
// "hace 3 min", "ayer", etc. — corto, sin dependencias.
const haceRato = (iso) => {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60) return 'recién';
  if (d < 3600) return `hace ${Math.floor(d / 60)} min`;
  if (d < 86400) return `hace ${Math.floor(d / 3600)} h`;
  return `hace ${Math.floor(d / 86400)} d`;
};

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

export default function DelEditor({ strategyId, docId, docUrl, clientId, configNode, recursosNode, onAvatarCreate }) {
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
  // Colaboración: comentarios por sección + presencia en vivo + candado de edición.
  const [comments, setComments] = useState([]);      // todos los del DEL
  const [threadFor, setThreadFor] = useState(null);  // id de sección con el hilo abierto
  const [draft, setDraft] = useState('');            // texto del comentario nuevo
  const [present, setPresent] = useState([]);        // quién está en el DEL ahora (Realtime)
  const [myEditing, setMyEditing] = useState(null);  // qué sección estoy editando (para el candado)
  const scrollRef = useRef(null);
  const timers = useRef({}); // id -> timeout (debounce de guardado)
  const channelRef = useRef(null);
  const editStopTimer = useRef(null);
  const by = currentUser?.id || null;
  const myName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Alguien';
  const myColor = colorFor(by || myName);

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

  // Documentos del cliente (aparecen en todos sus DEL), para el grupo "DEL CLIENTE".
  // Se pueden quitar/agregar: el que se quita se guarda como "excluido" (client_brain_pins
  // slot='del_excl') para que no vuelva a aparecer; agregar = restaurar uno excluido.
  const [excluded, setExcluded] = useState(new Set());
  const [addDocOpen, setAddDocOpen] = useState(false);
  const cid = clientId || resolvedClient;
  useEffect(() => {
    if (!cid) return;
    let alive = true;
    (async () => {
      try {
        const [rows, hidden] = await Promise.all([
          sbFetch(`client_brain_docs?select=id,node_id,title,doc_kind,text,char_count,web_url&client_id=eq.${encodeURIComponent(cid)}&doc_kind=neq.del&order=doc_kind.asc`),
          sbFetch(`del_client_doc_hidden?select=node_id&client_id=eq.${encodeURIComponent(cid)}`),
        ]);
        if (!alive) return;
        setClientDocs(Array.isArray(rows) ? rows : []);
        setExcluded(new Set((Array.isArray(hidden) ? hidden : []).map(p => p.node_id)));
      } catch { if (alive) setClientDocs([]); }
    })();
    return () => { alive = false; };
  }, [cid]);

  const quitarClientDoc = async (d) => {
    setExcluded((prev) => new Set(prev).add(d.node_id));
    if (view === 'cliente:' + d.id) setView('del');
    await supabase.from('del_client_doc_hidden').upsert({ client_id: cid, node_id: d.node_id }, { onConflict: 'client_id,node_id' });
  };
  const restaurarClientDoc = async (d) => {
    setExcluded((prev) => { const n = new Set(prev); n.delete(d.node_id); return n; });
    setAddDocOpen(false);
    await supabase.from('del_client_doc_hidden').delete().eq('client_id', cid).eq('node_id', d.node_id);
  };
  const shownClientDocs = useMemo(() => clientDocs.filter(d => !excluded.has(d.node_id)), [clientDocs, excluded]);
  const excludedDocs = useMemo(() => clientDocs.filter(d => excluded.has(d.node_id)), [clientDocs, excluded]);

  // ── Comentarios del DEL ──────────────────────────────────────────────────────
  const cargarComments = useCallback(async () => {
    try {
      const rows = await sbFetch(`del_comments?select=id,section_id,body,author_name,author_id,resolved,created_at&strategy_id=eq.${strategyId}&order=created_at.asc`);
      setComments(Array.isArray(rows) ? rows : []);
    } catch { /* si falla, sin comentarios */ }
  }, [strategyId]);
  useEffect(() => { cargarComments(); }, [cargarComments]);

  const comentar = async (section) => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    // Optimista: el comentario aparece al instante. Si el guardado falla de verdad,
    // se revierte y se muestra el error (así nunca "no pasa nada" en silencio).
    const tempId = 'tmp_' + Date.now();
    setComments((prev) => [...prev, { id: tempId, section_id: section.id, body, author_name: myName, author_id: by, resolved: false, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase.from('del_comments').insert({
      section_id: section.id, doc_id: section.doc_id, strategy_id: strategyId,
      author_id: by, author_name: myName, body,
    }).select().single();
    if (error) {
      setComments((prev) => prev.filter(c => c.id !== tempId));
      window.alert('No pude guardar el comentario: ' + (error.message || error.code || 'error desconocido'));
      return;
    }
    setComments((prev) => prev.map(c => c.id === tempId ? data : c));
  };
  const resolverComment = async (c) => {
    setComments((prev) => prev.map(x => x.id === c.id ? { ...x, resolved: !x.resolved } : x));
    await supabase.from('del_comments').update({ resolved: !c.resolved }).eq('id', c.id);
  };
  const borrarComment = async (c) => {
    setComments((prev) => prev.filter(x => x.id !== c.id));
    await supabase.from('del_comments').delete().eq('id', c.id);
  };
  // Comentarios por sección (los sin resolver primero cuentan para el badge).
  const commentsBySection = useMemo(() => {
    const m = {};
    for (const c of comments) (m[c.section_id] ||= []).push(c);
    return m;
  }, [comments]);

  // ── Presencia en vivo (Supabase Realtime, efímero — sin base) ─────────────────
  // Todos los que tienen el DEL abierto se ven entre sí; y si alguien está editando
  // una sección, los demás ven el candado. Es la parte "colaborativa" sin CRDT.
  useEffect(() => {
    if (!strategyId) return;
    const ch = supabase.channel(`del-presence-${strategyId}`, { config: { presence: { key: by || myName } } });
    channelRef.current = ch;
    ch.on('presence', { event: 'sync' }, () => {
      const state = ch.presenceState();
      setPresent(Object.values(state).flat());
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ id: by, name: myName, color: myColor, editing: null });
    });
    return () => { channelRef.current = null; supabase.removeChannel(ch); };
  }, [strategyId, by, myName, myColor]);

  // Cuando cambia qué sección estoy editando, lo aviso por presencia (para el candado).
  useEffect(() => {
    channelRef.current?.track({ id: by, name: myName, color: myColor, editing: myEditing });
  }, [myEditing, by, myName, myColor]);

  // Los que están AHORA (sin contarme a mí) y qué sección edita cada uno.
  const otros = useMemo(() => present.filter(u => u.id !== by), [present, by]);
  const lockedBy = useMemo(() => {
    const m = {};
    for (const u of otros) if (u.editing) m[u.editing] = u;
    return m;
  }, [otros]);

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
    // Aviso que estoy editando ESTA sección (candado para los demás). Se libera sola
    // a los 4s de no tocar nada.
    setMyEditing(id);
    clearTimeout(editStopTimer.current);
    editStopTimer.current = setTimeout(() => setMyEditing(null), 4000);
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

  // Crear un avatar = crear una SECCIÓN de la categoría Avatares (así aparece en el
  // menú "Avatares", no enterrado dentro de otra sección). El título de la sección ES
  // el nombre del avatar. Además avisa al funnel para registrarlo + crear sus carpetas.
  const crearAvatarSection = async (name) => {
    const nom = (name || '').trim();
    if (!nom) return;
    if (resolvedDoc) {
      const { data: newId, error } = await supabase.rpc('del_section_add', {
        p_doc_id: resolvedDoc, p_title: nom, p_kind: 'avatares', p_after_ord: null, p_by: by,
      });
      if (!error && newId) {
        await supabase.rpc('del_section_save', { p_id: newId, p_html: '<h3>Segmentación</h3><p></p><h3>Descripción</h3><p></p>', p_by: by });
        await cargar();
        setModo('editar'); setView('del'); setActiva(newId);
        setTimeout(() => { const el = document.getElementById('sec-' + newId); if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 12, behavior: 'smooth' }); }, 80);
      }
    }
    onAvatarCreate?.(nom); // registra el avatar en el funnel + crea las carpetas del Drive
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

          {/* DEL CLIENTE: los documentos que aparecen en todos los DEL de este cliente.
              Se pueden quitar (×) y volver a agregar (+). */}
          {(shownClientDocs.length > 0 || excludedDocs.length > 0) && (
            <>
              <div className="px-2 pt-3 pb-1.5">
                <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Del cliente</span>
                <div className="text-[9.5px] text-[#C3C9D4] font-medium mt-0.5 normal-case tracking-normal">Aparecen en todos los DEL de este cliente</div>
              </div>
              {shownClientDocs.map(d => {
                const on = view === 'cliente:' + d.id;
                return (
                  <div key={d.id} className="group/cd flex items-center gap-1 rounded-[9px]" style={{ background: on ? '#F1F3F7' : 'transparent' }}>
                    <button onClick={() => setView('cliente:' + d.id)}
                      className="flex items-center gap-2 flex-1 min-w-0 py-1.5 pl-2.5 pr-1 text-left border-none cursor-pointer text-[12px] font-semibold bg-transparent"
                      style={{ color: on ? '#1A1D26' : '#6B7280' }}>
                      <Monitor size={13} className="shrink-0 text-[#9098A4]" />
                      <span className="truncate flex-1 min-w-0">{DOC_KIND_LABEL[d.doc_kind] || d.title}</span>
                    </button>
                    <button onClick={() => quitarClientDoc(d)} title="Quitar de este cliente" className="opacity-0 group-hover/cd:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 mr-1"><X size={12} /></button>
                  </div>
                );
              })}
              {/* Agregar: restaura un documento que se había quitado. */}
              <div className="relative px-1 mt-0.5">
                <button onClick={() => setAddDocOpen(o => !o)} disabled={excludedDocs.length === 0}
                  className="flex items-center gap-1.5 w-full py-1.5 px-1.5 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent disabled:opacity-40 disabled:cursor-default disabled:hover:border-[#D0D5DD] disabled:hover:text-[#9098A4]">
                  <Plus size={12} />{excludedDocs.length ? 'Agregar documento' : 'Todos agregados'}
                </button>
                {addDocOpen && excludedDocs.length > 0 && (
                  <div className="absolute left-1 right-1 top-9 z-30 bg-white border border-[#E2E5EB] rounded-lg p-1 flex flex-col gap-0.5" style={{ boxShadow: '0 6px 18px rgba(10,22,40,.14)' }}>
                    {excludedDocs.map(d => (
                      <button key={d.id} onClick={() => restaurarClientDoc(d)} className="flex items-center gap-2 py-1.5 px-2 rounded-md text-left text-[12px] font-semibold text-[#4B5563] hover:bg-[#F4F6F9] border-none bg-transparent cursor-pointer">
                        <Plus size={12} className="text-[#7C3AED] shrink-0" /><span className="truncate">{DOC_KIND_LABEL[d.doc_kind] || d.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
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
            {/* Presencia: quién tiene el DEL abierto ahora mismo (en vivo). */}
            {otros.length > 0 && (
              <span className="ml-auto inline-flex items-center gap-1.5" title={`En el DEL ahora: ${[myName, ...otros.map(u => u.name)].join(', ')}`}>
                <span className="flex items-center -space-x-1.5">
                  <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white border-2 border-white" style={{ background: myColor }}>{initialOf(myName)}</span>
                  {otros.slice(0, 4).map((u, i) => (
                    <span key={u.id || i} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white border-2 border-white" style={{ background: u.color || colorFor(u.name) }}>{initialOf(u.name)}</span>
                  ))}
                </span>
                <span className="text-[11px] font-semibold text-[#16A34A] inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" style={{ animation: 'mkPulse 1.8s ease-in-out infinite' }} />{otros.length + 1} acá</span>
              </span>
            )}
            {docUrl && <a href={docUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2E69E0] hover:underline ${otros.length > 0 ? '' : 'ml-auto'}`}><ExternalLink size={11} />Abrir el Doc original</a>}
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
            const lock = lockedBy[s.id];                 // otra persona editando esta sección
            const scomments = commentsBySection[s.id] || [];
            const abiertos = scomments.filter(c => !c.resolved).length;
            const threadOpen = threadFor === s.id;
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
                  {lock && (
                    <span className="text-[10.5px] font-semibold inline-flex items-center gap-1 shrink-0 py-0.5 px-2 rounded-full" title={`${lock.name} está editando esta sección`} style={{ background: (lock.color || '#B45309') + '1F', color: lock.color || '#B45309' }}>
                      <Lock size={10} />{String(lock.name).split(' ')[0]}
                    </span>
                  )}
                  {/* Comentarios de la sección: badge + abrir el hilo. */}
                  <button onClick={() => { setThreadFor(threadOpen ? null : s.id); setDraft(''); }} title="Comentarios de esta sección"
                    className="inline-flex items-center gap-1 shrink-0 h-7 px-2 rounded-md border-none cursor-pointer text-[11px] font-bold"
                    style={threadOpen ? { background: '#EEF3FF', color: '#1D4FD8' } : { background: 'transparent', color: abiertos ? '#B45309' : '#9098A4' }}>
                    <MessageSquare size={13} />{scomments.length > 0 && <span>{scomments.length}</span>}
                  </button>
                  {editando && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditTitle(s.id)} title="Renombrar" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#1A1D26] border-none bg-transparent cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => agregar(s.ord, s.kind)} title="Agregar sección debajo (misma categoría)" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#7C3AED] border-none bg-transparent cursor-pointer"><Plus size={14} /></button>
                      <button onClick={() => borrar(s)} title="Borrar sección" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:bg-[#FEF2F2] hover:text-[#B91C1C] border-none bg-transparent cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  )}
                  {!editando && <span className="text-[10.5px] text-[#C3C9D4] tabular-nums shrink-0">{(s.char_count || 0).toLocaleString('es-AR')}</span>}
                </div>

                {/* Hilo de comentarios: JUSTO debajo del encabezado (al lado del botón),
                    para que se vea al instante aunque la sección sea larga. */}
                {threadOpen && (
                  <div className="border-b border-[#EDF0F5] bg-[#FBFCFE] p-3.5 flex flex-col gap-2.5">
                    {scomments.length === 0 && <div className="text-[11.5px] text-[#9098A4] italic">Todavía no hay comentarios en esta sección. Escribí el primero abajo.</div>}
                    {scomments.map(c => (
                      <div key={c.id} className="flex items-start gap-2.5" style={{ opacity: c.resolved ? 0.55 : 1 }}>
                        <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: colorFor(c.author_id || c.author_name) }}>{initialOf(c.author_name)}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[12px] font-bold text-[#1A1D26]">{c.author_name || 'Alguien'}</span>
                            <span className="text-[10.5px] text-[#AEB4BF]">{haceRato(c.created_at)}</span>
                            {c.resolved && <span className="text-[9.5px] font-bold py-0.5 px-1.5 rounded-full" style={{ background: '#ECFDF5', color: '#15803D' }}>resuelto</span>}
                          </div>
                          <div className="text-[12.5px] text-[#3F4653] leading-snug whitespace-pre-wrap break-words mt-0.5" style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.body}</div>
                        </div>
                        <button onClick={() => resolverComment(c)} title={c.resolved ? 'Reabrir' : 'Marcar como resuelto'} className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#ECFDF5] hover:text-[#15803D] border-none bg-transparent cursor-pointer shrink-0"><Check size={13} strokeWidth={2.6} /></button>
                        {(c.author_id === by) && <button onClick={() => borrarComment(c)} title="Borrar" className="w-6 h-6 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:bg-[#FEF2F2] hover:text-[#B91C1C] border-none bg-transparent cursor-pointer shrink-0"><Trash2 size={12} /></button>}
                      </div>
                    ))}
                    <div className="flex items-end gap-2 pt-1">
                      <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={1} autoFocus
                        onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); comentar(s); } }}
                        placeholder="Escribí un comentario…  (Ctrl+Enter para enviar)"
                        className="flex-1 min-w-0 py-2 px-3 border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white resize-y outline-none focus:border-blue leading-snug" />
                      <button onClick={() => comentar(s)} disabled={!draft.trim()} className="inline-flex items-center gap-1.5 py-2 px-3 rounded-lg border-none bg-[#2E69E0] text-white text-[12px] font-semibold cursor-pointer hover:bg-[#1D4FD8] disabled:opacity-50 shrink-0"><Send size={13} />Comentar</button>
                    </div>
                  </div>
                )}

                {/* Si OTRO está editando esta sección, no dejo editarla acá: se ve el
                    candado y el contenido en lectura, para no pisarse. */}
                {editando && lock && (
                  <div className="flex items-center gap-2 py-2 px-4 text-[11.5px] font-semibold" style={{ background: (lock.color || '#B45309') + '14', color: lock.color || '#B45309', borderBottom: '1px solid #EDF0F5' }}>
                    <Lock size={12} />{lock.name} está editando esta sección. Se libera sola cuando termine.
                  </div>
                )}
                {editando && !lock ? (
                  <div className="p-3">
                    <RichTextEditor
                      key={s.id}
                      value={s.html || plainToHtml(s.text)}
                      onChange={(html) => onEdit(s.id, html)}
                      sanitize={sanitizeDelHtml}
                      delTools
                      onNewAvatar={(name) => crearAvatarSection(name)}
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
                      <div className="text-[11px] text-[#9098A4]">Aparece en todos los DEL de este cliente · solo lectura.</div>
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
