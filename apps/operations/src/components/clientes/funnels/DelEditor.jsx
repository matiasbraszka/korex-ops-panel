import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink, Plus, Trash2, Check, Pencil, Eye, PenLine, Link2, Image as ImageIcon, Monitor, MessageSquare, Send, Lock, X,
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3, List, ListOrdered, Table, UserPlus, Eraser, Baseline, FolderInput } from 'lucide-react';
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

// ── Barra ÚNICA fija (tipo Google Docs) ──────────────────────────────────────
// Aparece una sola vez arriba del documento y opera sobre la sección que tenés
// enfocada (cada sección avisa con onActive(api) al RichTextEditor). Si no hay
// ninguna enfocada, los botones quedan atenuados.
const TB_COLORS = ['#1F2937', '#6B7280', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#2563EB', '#7C3AED', '#DB2777'];
function TbBtn({ Icon, label, title, onClick, disabled }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} title={title}
      className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent">
      {Icon ? <Icon size={15} /> : <span className="text-[12px] font-bold">{label}</span>}
    </button>
  );
}
function TbDiv() { return <div className="w-px h-5 bg-gray-200 mx-0.5" />; }
function DelToolbar({ api }) {
  const [colorOpen, setColorOpen] = useState(false);
  const off = !api;
  const call = (fn, ...a) => { if (api && typeof api[fn] === 'function') api[fn](...a); };
  return (
    <div className="flex items-center gap-0.5 px-2 py-1.5 rounded-lg border border-[#E7EAF0] bg-white flex-wrap" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.05)' }}>
      <TbBtn Icon={Bold} title="Negrita" disabled={off} onClick={() => call('exec', 'bold')} />
      <TbBtn Icon={Italic} title="Cursiva" disabled={off} onClick={() => call('exec', 'italic')} />
      <TbBtn Icon={UnderlineIcon} title="Subrayado" disabled={off} onClick={() => call('exec', 'underline')} />
      <TbDiv />
      <TbBtn Icon={Heading1} title="Título principal (H1)" disabled={off} onClick={() => call('exec', 'formatBlock', 'H1')} />
      <TbBtn Icon={Heading2} title="Título grande (H2)" disabled={off} onClick={() => call('exec', 'formatBlock', 'H2')} />
      <TbBtn Icon={Heading3} title="Título chico (H3)" disabled={off} onClick={() => call('exec', 'formatBlock', 'H3')} />
      <TbDiv />
      <TbBtn Icon={List} title="Lista con viñetas" disabled={off} onClick={() => call('exec', 'insertUnorderedList')} />
      <TbBtn Icon={ListOrdered} title="Lista numerada" disabled={off} onClick={() => call('exec', 'insertOrderedList')} />
      <TbDiv />
      <div className="relative">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setColorOpen(v => !v)} disabled={off} title="Color de letra"
          className={`w-8 h-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 ${colorOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
          <Baseline size={15} />
        </button>
        {colorOpen && !off && (<>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setColorOpen(false)} className="fixed inset-0 z-30 bg-transparent border-none cursor-default" aria-label="Cerrar" />
          <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 w-[176px]">
            {TB_COLORS.map(c => (
              <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { call('applyColor', c); setColorOpen(false); }} title={c}
                className="w-6 h-6 rounded-full border border-gray-200 cursor-pointer hover:scale-110 transition-transform" style={{ background: c }} />
            ))}
          </div>
        </>)}
      </div>
      <TbDiv />
      <TbBtn label="A−" title="Achicar la letra seleccionada" disabled={off} onClick={() => call('changeFontSize', false)} />
      <TbBtn label="A+" title="Agrandar la letra seleccionada" disabled={off} onClick={() => call('changeFontSize', true)} />
      <TbBtn Icon={Table} title="Insertar tabla" disabled={off} onClick={() => call('openTable')} />
      <TbBtn Icon={ImageIcon} title="Insertar imagen" disabled={off} onClick={() => call('openImage')} />
      <TbBtn Icon={UserPlus} title="Insertar un avatar" disabled={off} onClick={() => call('openAvatar')} />
      <TbDiv />
      <TbBtn Icon={Link2} title="Insertar link" disabled={off} onClick={() => call('addLink')} />
      <TbBtn Icon={Eraser} title="Quitar formato" disabled={off} onClick={() => call('clearFormat')} />
      <span className="ml-auto text-[10.5px] text-[#AEB4BF] pr-1">{off ? 'Tocá una sección para editar' : 'Editando'}</span>
    </div>
  );
}

// El orden CANÓNICO del DEL (el de la maqueta): la estrategia arriba, después los avatares,
// la VSL, los anuncios, el recorrido de páginas, y al final los mensajes / lo viejo / lo suelto.
// El Doc real viene desordenado; con esto las secciones se leen como el documento estructurado
// que pidió Matías, agrupadas por categoría, sin tocar el texto.
const KIND_ORDER = ['estrategia', 'avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios', 'mensajes', 'pipeline_viejo', 'otros'];
const kindRank = (k) => { const i = KIND_ORDER.indexOf(k); return i === -1 ? 99 : i; };
// Categorías que SIEMPRE existen en TODO DEL, aunque estén vacías: así el casillero
// está listo para cuando se vaya a escribir (pedido de Matías — ej. Samantha sin páginas).
const STANDARD_KINDS = ['avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios'];
// Categorías a las que se puede MOVER una sección.
const MOVE_KINDS = ['estrategia', 'avatares', 'vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios', 'mensajes', 'otros'];
// Categorías que VERSIONAN (tienen V1, V2, V3…). El funnel se ve por versión: cambiás
// de "Este funnel V1" a "V2" y ves solo esa. Regla de Matías: el AVATAR y la ESTRATEGIA
// NO versionan (son iguales en todas las versiones), así que se ven siempre.
const VERSIONABLE_KINDS = ['vsl', 'anuncios', 'pg_prelanding', 'pg_landing', 'pg_formulario', 'pg_thankyou', 'pg_testimonios'];

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

export default function DelEditor({ strategyId, docId, docUrl, clientId, estrategiaNode, configNode, recursosNode, onAvatarCreate }) {
  const { currentUser } = useApp();
  const [secs, setSecs] = useState(null);
  const [err, setErr] = useState(null);
  const [activa, setActiva] = useState(null);
  const [modo, setModo] = useState('leer'); // 'leer' | 'editar'
  const [saveState, setSaveState] = useState({}); // id -> 'saving'|'saved'|'error'
  const [editTitle, setEditTitle] = useState(null); // id de la seccion con el titulo en edicion
  const [moveMenu, setMoveMenu] = useState(null); // id de la seccion con el menu "mover a categoria" abierto
  const [activeVersion, setActiveVersion] = useState(null); // versión del funnel que se está viendo (null = la última)
  // Qué se ve en el panel derecho: 'del' (el documento) | 'config' | 'recursos' | 'cliente:<docId>'
  const [view, setView] = useState('del');
  const [clientDocs, setClientDocs] = useState([]);
  // Colaboración: comentarios por sección + presencia en vivo + candado de edición.
  const [comments, setComments] = useState([]);      // todos los del DEL
  const [threadFor, setThreadFor] = useState(null);  // id de sección con el hilo abierto
  const [draft, setDraft] = useState('');            // texto del comentario nuevo
  const [present, setPresent] = useState([]);        // quién está en el DEL ahora (Realtime)
  const [myEditing, setMyEditing] = useState(null);  // qué sección estoy editando (para el candado)
  const [activeApi, setActiveApi] = useState(null);  // API de la sección enfocada (barra única)
  // Comentarios estilo Google Docs: marcás una frase → botón flotante → se guarda con
  // la frase (quote) y aparece en el margen derecho, con la frase resaltada en el texto.
  const [selBtn, setSelBtn] = useState(null);        // botón flotante: {top,left,quote,sectionId}
  const [composer, setComposer] = useState(null);    // caja de escribir: {quote,sectionId}
  const [flashCmt, setFlashCmt] = useState(null);     // id del comentario a destacar
  const [imgPicker, setImgPicker] = useState(null);   // selector de imagen de Recursos: {insert}
  const [imgList, setImgList] = useState(null);        // imágenes de Recursos del funnel
  const scrollRef = useRef(null);
  const timers = useRef({}); // id -> timeout (debounce de guardado)
  const channelRef = useRef(null);
  const editStopTimer = useRef(null);
  const myEditingRef = useRef(null); // espejo de myEditing para los handlers de broadcast
  const by = currentUser?.id || null;
  const myName = currentUser?.name || currentUser?.email?.split('@')[0] || 'Alguien';
  const myColor = colorFor(by || myName);

  // El doc_id lo necesitamos para agregar secciones. Si no vino, lo resolvemos del
  // primer del_section (todas comparten doc_id por estrategia).
  const [resolvedDoc, setResolvedDoc] = useState(docId || null);
  const [resolvedClient, setResolvedClient] = useState(clientId || null);

  // Carga las secciones del DEL de ESTE funnel. Si el funnel tiene su DEL propio
  // (docId, viene de del_doc_id), filtra por doc_id → ve SOLO su documento, aunque
  // comparta carpeta con otro funnel. Si no, fallback por strategy_id (la carpeta),
  // como antes. Esto además aísla el caso de dos "del" bajo la misma carpeta.
  const cargar = useCallback(async () => {
    try {
      const filtro = docId ? `doc_id=eq.${docId}` : `strategy_id=eq.${strategyId}`;
      const rows = await sbFetch(
        `del_sections?select=id,doc_id,client_id,ord,title,kind,text,html,char_count,source,version,status&${filtro}&order=ord.asc`,
        // cache:'no-store' -> el DEL SIEMPRE se trae fresco. Sin esto, el navegador
        // servía una versión vieja cacheada del documento tras reorganizarlo.
        { headers: { Prefer: 'return=representation' }, cache: 'no-store' },
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
  }, [strategyId, docId]);

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
        const [rows, hidden, extras] = await Promise.all([
          sbFetch(`client_brain_docs?select=id,node_id,title,doc_kind,text,panel_html,char_count,web_url&client_id=eq.${encodeURIComponent(cid)}&doc_kind=neq.del&order=doc_kind.asc`),
          sbFetch(`del_client_doc_hidden?select=node_id&client_id=eq.${encodeURIComponent(cid)}`),
          sbFetch(`del_client_extra_docs?select=id,title,html,updated_at&client_id=eq.${encodeURIComponent(cid)}&order=created_at.asc`),
        ]);
        if (!alive) return;
        // Unifico los del Drive (brain) con los propios del panel (extra) en una sola lista.
        const brain = (Array.isArray(rows) ? rows : []).map(d => ({ ...d, _kind: 'brain', key: 'b_' + d.id }));
        const extra = (Array.isArray(extras) ? extras : []).map(d => ({ id: d.id, title: d.title, panel_html: d.html, doc_kind: 'extra', _kind: 'extra', key: 'x_' + d.id }));
        setClientDocs([...brain, ...extra]);
        setExcluded(new Set((Array.isArray(hidden) ? hidden : []).map(p => p.node_id)));
      } catch { if (alive) setClientDocs([]); }
    })();
    return () => { alive = false; };
  }, [cid]);

  const quitarClientDoc = async (d) => {
    if (d._kind === 'extra') { borrarExtraDoc(d); return; } // los propios del panel se borran
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

  // Editar los documentos del cliente (guarda panel_html + text, con debounce).
  const [docEditing, setDocEditing] = useState(false);
  const docTimer = useRef(null);
  useEffect(() => { setDocEditing(false); }, [view]);
  const htmlToText = (h) => String(h || '')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<li[^>]*>/gi, '• ').replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n').trim();
  const saveClientDoc = (doc, html) => {
    setClientDocs((prev) => prev.map(d => d.id === doc.id ? { ...d, panel_html: html } : d));
    clearTimeout(docTimer.current);
    docTimer.current = setTimeout(() => {
      if (doc._kind === 'extra') {
        supabase.from('del_client_extra_docs').update({ html, updated_at: new Date().toISOString() }).eq('id', doc.id);
      } else {
        supabase.from('client_brain_docs').update({ panel_html: html, text: htmlToText(html), panel_edited_by: by, panel_edited_at: new Date().toISOString() }).eq('id', doc.id);
      }
    }, 900);
  };

  // Crear un documento propio del panel (aparece en todos los DEL de este cliente).
  const [newDocOpen, setNewDocOpen] = useState(false);
  const [newDocTitle, setNewDocTitle] = useState('');
  const crearDocNuevo = async () => {
    const title = newDocTitle.trim() || 'Documento nuevo';
    setNewDocOpen(false); setNewDocTitle('');
    const { data, error } = await supabase.from('del_client_extra_docs').insert({ client_id: cid, title, html: '', created_by: by }).select().single();
    if (error) { window.alert('No pude crear el documento: ' + (error.message || '')); return; }
    setClientDocs((prev) => [...prev, { id: data.id, title: data.title, panel_html: '', doc_kind: 'extra', _kind: 'extra', key: 'x_' + data.id }]);
    setView('cliente:' + data.id); setDocEditing(true);
  };
  const borrarExtraDoc = async (doc) => {
    if (!window.confirm(`¿Borrar el documento "${doc.title}"? No se puede deshacer.`)) return;
    setClientDocs((prev) => prev.filter(d => d.id !== doc.id));
    if (view === 'cliente:' + doc.id) setView('del');
    await supabase.from('del_client_extra_docs').delete().eq('id', doc.id);
  };

  // ── Comentarios del DEL ──────────────────────────────────────────────────────
  const cargarComments = useCallback(async () => {
    try {
      // Mismo criterio que las secciones: por doc_id si el funnel tiene DEL propio,
      // si no por strategy_id (la carpeta). Así los comentarios no se cruzan entre funnels.
      const filtro = docId ? `doc_id=eq.${docId}` : `strategy_id=eq.${strategyId}`;
      const rows = await sbFetch(`del_comments?select=id,section_id,body,quote,author_name,author_id,resolved,created_at&${filtro}&order=created_at.asc`, { cache: 'no-store' });
      setComments(Array.isArray(rows) ? rows : []);
    } catch { /* si falla, sin comentarios */ }
  }, [strategyId, docId]);
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
    emitir('comment', { action: 'upsert', row: { id: c.id, resolved: !c.resolved } });
  };
  const borrarComment = async (c) => {
    setComments((prev) => prev.filter(x => x.id !== c.id));
    await supabase.from('del_comments').delete().eq('id', c.id);
    emitir('comment', { action: 'delete', id: c.id });
  };
  // Comentarios por sección.
  const commentsBySection = useMemo(() => {
    const m = {};
    for (const c of comments) (m[c.section_id] ||= []).push(c);
    return m;
  }, [comments]);

  // Al soltar el mouse sobre el texto: si hay una frase marcada, muestro el botón flotante.
  const onDocMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!sel || sel.isCollapsed || text.length < 2) { setSelBtn(null); return; }
    let node = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    const secEl = node?.closest?.('[data-secid]');
    if (!secEl) { setSelBtn(null); return; }
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    setSelBtn({ top: rect.top, left: rect.left + rect.width / 2, quote: text.slice(0, 300), sectionId: secEl.getAttribute('data-secid') });
  };

  // Guardar el comentario anclado a la frase (optimista, con reversión).
  const comentarQuote = async () => {
    const body = draft.trim();
    if (!body || !composer) return;
    const comp = composer;
    const sec = secs?.find(x => x.id === comp.sectionId);
    setDraft(''); setComposer(null); setSelBtn(null);
    const tempId = 'tmp_' + Date.now();
    setComments(prev => [...prev, { id: tempId, section_id: comp.sectionId, quote: comp.quote, body, author_name: myName, author_id: by, resolved: false, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase.from('del_comments').insert({
      section_id: comp.sectionId, doc_id: sec?.doc_id, strategy_id: strategyId,
      author_id: by, author_name: myName, body, quote: comp.quote,
    }).select().single();
    if (error) { setComments(prev => prev.filter(c => c.id !== tempId)); window.alert('No pude guardar el comentario: ' + (error.message || error.code || '')); return; }
    setComments(prev => prev.map(c => c.id === tempId ? data : c));
    emitir('comment', { action: 'upsert', row: data });
  };

  // Resalta en el html las frases comentadas (primer match de texto plano, fuera de tags).
  const highlightHtml = useCallback((html, cmts) => {
    let out = html || '';
    for (const c of cmts) {
      const q = (c.quote || '').trim();
      if (q.length < 2 || c.resolved) continue;
      const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      try {
        const re = new RegExp('(?![^<]*>)(' + esc + ')');
        out = out.replace(re, `<mark data-cmt="${c.id}" class="del-cmt">$1</mark>`);
      } catch { /* frase con caracteres raros: sin resaltar */ }
    }
    return out;
  }, []);

  // Ir a un comentario: llevar la frase exacta a la vista y hacerla parpadear
  // fuerte (naranja) para que se distinga del resto de frases resaltadas.
  const irAComment = (c) => {
    setFlashCmt(c.id);
    // Limpio cualquier frase que haya quedado resaltada de un click anterior.
    document.querySelectorAll('mark.del-cmt.is-active').forEach(m => m.classList.remove('is-active'));
    const el = document.querySelector(`mark[data-cmt="${c.id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('is-active');
      setTimeout(() => el.classList.remove('is-active'), 1800);
    } else {
      // La sección está en modo edición (sin resaltado): al menos la llevo a la vista.
      const s = document.getElementById('sec-' + c.section_id);
      if (s && scrollRef.current) scrollRef.current.scrollTo({ top: s.offsetTop - 12, behavior: 'smooth' });
    }
    setTimeout(() => setFlashCmt(null), 1800);
  };

  // El botón de imagen del DEL abre las imágenes de Recursos del funnel (en vez de
  // pedir un link a mano) y la elegida se inserta en el texto. Conecta Recursos ↔ DEL.
  const abrirSelectorImagen = useCallback((insertHTML) => {
    setImgPicker({ insert: insertHTML });
    setImgList(null);
    (async () => {
      try {
        const rows = await sbFetch(`funnel_resources?select=id,title,public_url&strategy_id=eq.${encodeURIComponent(strategyId)}&kind=eq.image&order=created_at.desc`);
        setImgList(Array.isArray(rows) ? rows : []);
      } catch { setImgList([]); }
    })();
  }, [strategyId]);

  const elegirImagen = (r) => {
    imgPicker?.insert?.(`<img src="${(r.public_url || '').replace(/"/g, '&quot;')}" alt="${(r.title || '').replace(/"/g, '&quot;')}" style="max-width:100%;border-radius:8px;margin:8px 0" /><p></p>`);
    setImgPicker(null);
  };

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
    // ── Sincronización en vivo (broadcast sobre el mismo canal) ──────────────────
    // Cuando alguien comenta o guarda una sección, avisa por el canal y a los demás
    // les aparece solo, sin recargar. Sin CRDT, sin tocar la base: un mensajito.
    ch.on('broadcast', { event: 'comment' }, ({ payload }) => {
      if (!payload) return;
      if (payload.action === 'delete') { setComments(prev => prev.filter(c => c.id !== payload.id)); return; }
      // upsert (nuevo o cambio de estado resuelto)
      setComments(prev => prev.some(c => c.id === payload.row?.id)
        ? prev.map(c => (c.id === payload.row.id ? { ...c, ...payload.row } : c))
        : [...prev, payload.row]);
    });
    ch.on('broadcast', { event: 'section' }, ({ payload }) => {
      if (!payload?.row) return;
      // No piso una sección que YO esté editando en este momento.
      if (payload.row.id === myEditingRef.current) return;
      setSecs(prev => prev ? prev.map(s => (s.id === payload.row.id ? { ...s, ...payload.row } : s)) : prev);
    });
    ch.on('broadcast', { event: 'section-add' }, () => { cargar(); });
    ch.on('broadcast', { event: 'section-del' }, ({ payload }) => {
      if (payload?.id) setSecs(prev => prev ? prev.filter(s => s.id !== payload.id) : prev);
    });
    ch.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') await ch.track({ id: by, name: myName, color: myColor, editing: null });
    });
    return () => { channelRef.current = null; supabase.removeChannel(ch); };
  }, [strategyId, by, myName, myColor, cargar]);

  // Cuando cambia qué sección estoy editando, lo aviso por presencia (para el candado).
  useEffect(() => {
    myEditingRef.current = myEditing;
    channelRef.current?.track({ id: by, name: myName, color: myColor, editing: myEditing });
  }, [myEditing, by, myName, myColor]);

  // Avisar por el canal (broadcast). No falla si el canal aún no está listo.
  const emitir = useCallback((event, payload) => {
    channelRef.current?.send({ type: 'broadcast', event, payload });
  }, []);

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

  // Versiones del funnel presentes (según las secciones que versionan). Siempre al menos V1.
  const versions = useMemo(() => {
    const set = new Set([1]);
    for (const s of (secs || [])) if (VERSIONABLE_KINDS.includes(s.kind)) set.add(s.version || 1);
    return [...set].sort((a, b) => a - b);
  }, [secs]);
  // Versión que se está viendo: la elegida, o la última disponible por defecto.
  const verActiva = (activeVersion && versions.includes(activeVersion)) ? activeVersion : versions[versions.length - 1];
  // Si la versión elegida deja de existir (se borró), volvés a la última.
  useEffect(() => { if (activeVersion && !versions.includes(activeVersion)) setActiveVersion(null); }, [versions, activeVersion]);

  // Las secciones agrupadas por categoría, en orden canónico. De acá salen los grupos de
  // color del índice y las franjas del documento.
  // Las categorías que versionan muestran SOLO la versión activa; el avatar y la estrategia
  // se ven siempre. Además incluimos SIEMPRE las estándar (aunque vacías), listas para escribir.
  const groups = useMemo(() => {
    const byKind = {};
    for (const s of sorted) {
      if (VERSIONABLE_KINDS.includes(s.kind) && (s.version || 1) !== verActiva) continue;
      (byKind[s.kind] || (byKind[s.kind] = [])).push(s);
    }
    const kinds = Array.from(new Set([...STANDARD_KINDS, ...sorted.map(s => s.kind)]));
    kinds.sort((a, b) => kindRank(a) - kindRank(b));
    return kinds.map(k => ({ kind: k, items: byKind[k] || [] }));
  }, [sorted, verActiva]);

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
      if (!error) {
        emitir('section', { row: { id, html, source: 'panel' } }); // a los demás les aparece el cambio
        setTimeout(() => setSaveState((s) => { const n = { ...s }; if (n[id] === 'saved') delete n[id]; return n; }), 1800);
      }
    }, 800);
  };

  const agregar = async (afterOrd, kind = 'otros') => {
    if (!resolvedDoc) return;
    const { data, error } = await supabase.rpc('del_section_add', {
      p_doc_id: resolvedDoc, p_title: 'Sección nueva', p_kind: kind || 'otros', p_after_ord: afterOrd ?? null, p_by: by,
    });
    if (error) { window.alert('No pude agregar la sección: ' + error.message); return; }
    // Si la categoría versiona, la sección nueva nace en la versión que estás viendo (V2, V3…).
    if (data && VERSIONABLE_KINDS.includes(kind) && verActiva > 1) {
      await supabase.rpc('del_section_set_version', { p_id: data, p_version: verActiva, p_by: by });
    }
    await cargar();
    emitir('section-add', {});
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
        emitir('section-add', {});
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
    emitir('section-del', { id: s.id });
  };

  const renombrar = async (id, title) => {
    setEditTitle(null);
    const s = secs.find(x => x.id === id);
    if (!s || title.trim() === s.title) return;
    setSecs((prev) => prev.map(x => x.id === id ? { ...x, title: title.trim(), source: 'panel' } : x));
    const { error } = await supabase.rpc('del_section_rename', { p_id: id, p_title: title.trim(), p_by: by });
    if (error) window.alert('No pude renombrar: ' + error.message);
    else emitir('section', { row: { id, title: title.trim() } });
  };

  // Mover una sección a otra categoría (cambia su `kind` → aparece en otro grupo).
  const moverACategoria = async (id, kind) => {
    setMoveMenu(null);
    const s = secs.find(x => x.id === id);
    if (!s || s.kind === kind) return;
    setSecs((prev) => prev.map(x => x.id === id ? { ...x, kind, source: 'panel' } : x));
    const { error } = await supabase.rpc('del_section_set_kind', { p_id: id, p_kind: kind, p_by: by });
    if (error) { window.alert('No pude mover: ' + error.message); await cargar(); return; }
    emitir('section', { row: { id, kind } });
  };

  // ── Versionado a nivel funnel ─────────────────────────────────────────────────
  // "+" agrega la versión siguiente del funnel: crea un juego vacío de VSL / Anuncios /
  // Landings (V+1) listo para configurar, y te lleva a esa versión. El avatar y la
  // estrategia no se tocan (se ven en todas las versiones).
  const agregarVersion = async () => {
    if (!resolvedDoc) { window.alert('Este funnel todavía no tiene un DEL propio donde crear versiones.'); return; }
    const { data, error } = await supabase.rpc('del_version_add', { p_doc_id: resolvedDoc, p_by: by });
    if (error) { window.alert('No pude agregar la versión: ' + error.message); return; }
    await cargar();
    emitir('section-add', {});
    if (data) { setActiveVersion(data); setModo('editar'); setView('del'); }
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
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: '#FBFCFD' }} onMouseDown={() => { if (selBtn) setSelBtn(null); }}>
      <style>{`
        .del-rich mark.del-cmt{background:#FEF3C7;border-bottom:2px solid #EAB308;border-radius:2px;padding:0 1px;cursor:pointer;transition:background .2s,box-shadow .2s}
        .del-rich mark.del-cmt.is-active{background:#FDBA74;box-shadow:0 0 0 3px rgba(249,115,22,.45);border-bottom-color:#EA580C;animation:delCmtPulse 1.8s ease-out}
        @keyframes delCmtPulse{0%,55%{background:#FB923C}100%{background:#FDBA74}}
      `}</style>
      <div className="grid gap-5 items-start mx-auto py-5 px-6" style={{ maxWidth: view === 'del' ? 1440 : 1180, gridTemplateColumns: view === 'del' ? 'minmax(0,185px) minmax(0,1fr) 290px' : 'minmax(0,215px) minmax(0,1fr)' }}>

        {/* El menú del DEL (maqueta): ESTE FUNNEL (las secciones del documento) · las dos
            pestañas Configuración/Recursos · y abajo los documentos DEL CLIENTE, que
            comparten todos sus funnels. */}
        <nav className="sticky top-0 flex flex-col gap-0.5 p-2 rounded-xl border border-[#E7EAF0] bg-white max-h-[calc(100vh-120px)] overflow-y-auto" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>
          <div className="px-2 pt-1 pb-1.5">
            <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Este funnel</span>
            {/* Selector de versión del funnel: V1 por defecto; el + agrega V2, V3… con su
                propio juego de VSL / Anuncios / Landings. El avatar y la estrategia se ven
                en todas. Cambiás de versión con un clic y ves solo esa. */}
            <div className="flex items-center gap-1 flex-wrap mt-1.5">
              {versions.map(v => {
                const on = verActiva === v;
                return (
                  <button key={v} onClick={() => setActiveVersion(v)} title={`Ver la versión ${v} de este funnel`}
                    className="inline-flex items-center py-1 px-2.5 rounded-md text-[11px] font-bold border cursor-pointer transition-colors"
                    style={on
                      ? { background: '#EFEBFF', color: '#6D28D9', borderColor: '#DDD3FF' }
                      : { background: 'transparent', color: '#9098A4', borderColor: '#E7EAF0' }}>
                    V{v}
                  </button>
                );
              })}
              <button onClick={agregarVersion} title="Agregar una versión nueva del funnel (V2, V3…) con VSL, anuncios y landings propios"
                className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-dashed border-[#D0D5DD] text-[#9098A4] hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent cursor-pointer">
                <Plus size={13} />
              </button>
            </div>
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
            const emptyCat = gr.items.length === 0;
            return (
              <div key={gr.kind} className="mb-0.5" style={emptyCat ? { opacity: 0.6 } : undefined}>
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
                {emptyCat && (
                  <button onClick={() => editando ? agregar(null, gr.kind) : setModo('editar')}
                    className="flex items-center gap-1.5 w-full py-1 pl-4 pr-2.5 rounded-[9px] text-left border-none cursor-pointer text-[11px] font-medium italic text-[#AEB4BF] hover:text-[#7C3AED] bg-transparent">
                    — falta escribir —
                  </button>
                )}
              </div>
            );
          })}
          {editando && view === 'del' && resolvedDoc && (
            <button onClick={() => agregar(null)} className="flex items-center gap-2 py-2 px-2.5 mt-1 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11.5px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent">
              <Plus size={13} />Agregar sección
            </button>
          )}

          {/* Las páginas del funnel de la maqueta, debajo de las secciones. */}
          <div className="h-px my-2 mx-1" style={{ background: '#EDF0F5' }} />
          <button onClick={() => setView('estrategia')}
            className="flex items-center gap-2 w-full py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12.5px] font-semibold transition-colors"
            style={{ background: view === 'estrategia' ? '#ECFEFF' : 'transparent', color: view === 'estrategia' ? '#0891B2' : '#4B5563' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>Estrategia
          </button>
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
              Se pueden crear nuevos, quitar (×) y volver a agregar. */}
          <div className="px-2 pt-3 pb-1.5">
            <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Del cliente</span>
            <div className="text-[9.5px] text-[#C3C9D4] font-medium mt-0.5 normal-case tracking-normal">Aparecen en todos los DEL de este cliente</div>
          </div>
          {shownClientDocs.map(d => {
            const on = view === 'cliente:' + d.id;
            return (
              <div key={d.key || d.id} className="group/cd flex items-center gap-1 rounded-[9px]" style={{ background: on ? '#F1F3F7' : 'transparent' }}>
                <button onClick={() => setView('cliente:' + d.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 py-1.5 pl-2.5 pr-1 text-left border-none cursor-pointer text-[12px] font-semibold bg-transparent"
                  style={{ color: on ? '#1A1D26' : '#6B7280' }}>
                  {d._kind === 'extra' ? <FileText size={13} className="shrink-0 text-[#7C3AED]" /> : <Monitor size={13} className="shrink-0 text-[#9098A4]" />}
                  <span className="truncate flex-1 min-w-0">{d._kind === 'extra' ? d.title : (DOC_KIND_LABEL[d.doc_kind] || d.title)}</span>
                </button>
                <button onClick={() => quitarClientDoc(d)} title={d._kind === 'extra' ? 'Borrar documento' : 'Quitar de este cliente'} className="opacity-0 group-hover/cd:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 mr-1"><X size={12} /></button>
              </div>
            );
          })}
          {/* Agregar: crear un documento nuevo o restaurar uno que se había quitado. */}
          <div className="relative px-1 mt-0.5">
            <button onClick={() => setAddDocOpen(o => !o)}
              className="flex items-center gap-1.5 w-full py-1.5 px-1.5 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#7C3AED] hover:text-[#7C3AED] bg-transparent">
              <Plus size={12} />Agregar documento
            </button>
            {addDocOpen && (
              <div className="absolute left-1 right-1 top-9 z-30 bg-white border border-[#E2E5EB] rounded-lg p-1 flex flex-col gap-0.5" style={{ boxShadow: '0 6px 18px rgba(10,22,40,.14)' }}>
                <button onClick={() => { setAddDocOpen(false); setNewDocOpen(true); setNewDocTitle(''); }} className="flex items-center gap-2 py-1.5 px-2 rounded-md text-left text-[12px] font-bold text-[#7C3AED] hover:bg-[#F5F3FF] border-none bg-transparent cursor-pointer">
                  <Plus size={13} className="shrink-0" />Crear documento nuevo
                </button>
                {excludedDocs.length > 0 && <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#C3C9D4] px-2 pt-1.5 pb-0.5">Restaurar quitados</div>}
                {excludedDocs.map(d => (
                  <button key={d.key || d.id} onClick={() => restaurarClientDoc(d)} className="flex items-center gap-2 py-1.5 px-2 rounded-md text-left text-[12px] font-semibold text-[#4B5563] hover:bg-[#F4F6F9] border-none bg-transparent cursor-pointer">
                    <Monitor size={12} className="text-[#9098A4] shrink-0" /><span className="truncate">{DOC_KIND_LABEL[d.doc_kind] || d.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="min-w-0 flex flex-col gap-3" onMouseUp={view === 'del' ? onDocMouseUp : undefined}>
          {view === 'del' && (<>
          {/* Barra Leer/Editar + (en editar) la BARRA ÚNICA de herramientas, ambas fijas
              arriba tipo Google Docs: la barra opera sobre la sección que tengas enfocada. */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 pb-1" style={{ background: '#FBFCFD' }}>
          {/* Barra: leer vs editar + de dónde salió + link al Doc */}
          <div className="flex items-center gap-2.5 flex-wrap py-2 px-3 rounded-[10px] border border-[#E7EAF0] bg-white">
            <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
              <button onClick={() => setModo('leer')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
              <button onClick={() => setModo('editar')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: '#fff', color: '#7C3AED', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
            </div>
            <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold shrink-0" style={{ background: '#EFEBFF', color: '#6D28D9' }} title="Estás viendo esta versión del funnel. Cambiá de versión en el menú de la izquierda.">Este funnel · V{verActiva}</span>
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
          {/* La barra única: una sola, fija arriba, opera sobre la sección enfocada. */}
          {editando && <DelToolbar api={activeApi} />}
          </div>


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
                {gr.items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#E2E5EB] bg-white/60 py-5 px-5 text-center">
                    <div className="text-[12.5px] text-[#9098A4] font-medium">Todavía no está escrita la sección de <b style={{ color: gc.c }}>{gc.label}</b>.</div>
                    {editando
                      ? <button onClick={() => agregar(null, gr.kind)} className="inline-flex items-center gap-1.5 mt-2.5 py-1.5 px-3 rounded-[9px] border-none bg-[#7C3AED] text-white text-[12px] font-semibold cursor-pointer hover:brightness-95"><Plus size={13} />Escribir {gc.label}</button>
                      : <div className="text-[11px] text-[#C3C9D4] mt-1">Tocá “Editar” para empezar a escribirla.</div>}
                  </div>
                )}
                {gr.items.map(s => {
            const sc = secOf(s.kind);
            const st = saveState[s.id];
            const lock = lockedBy[s.id];                 // otra persona editando esta sección
            const scomments = commentsBySection[s.id] || [];
            const abiertos = scomments.filter(c => !c.resolved).length;
            const threadOpen = threadFor === s.id;
            return (
              <section key={s.id} id={'sec-' + s.id} data-secid={s.id} className="rounded-xl border border-[#E7EAF0] bg-white overflow-hidden" style={{ scrollMarginTop: 60 }}>
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
                  {scomments.length > 0 && (
                    <span title="Comentarios en esta sección" className="inline-flex items-center gap-1 shrink-0 text-[11px] font-bold" style={{ color: abiertos ? '#B45309' : '#9098A4' }}>
                      <MessageSquare size={13} />{scomments.length}
                    </span>
                  )}
                  {editando && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditTitle(s.id)} title="Renombrar" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#1A1D26] border-none bg-transparent cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => agregar(s.ord, s.kind)} title="Agregar sección debajo (misma categoría)" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#7C3AED] border-none bg-transparent cursor-pointer"><Plus size={14} /></button>
                      <span className="relative inline-flex">
                        <button onClick={() => setMoveMenu(moveMenu === s.id ? null : s.id)} title="Mover a otra categoría" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#0891B2] border-none bg-transparent cursor-pointer"><FolderInput size={13} /></button>
                        {moveMenu === s.id && (<>
                          <span className="fixed inset-0 z-30" onClick={() => setMoveMenu(null)} />
                          <div className="absolute right-0 top-8 z-40 bg-white border border-[#E2E5EB] rounded-lg p-1 min-w-[172px] max-h-[320px] overflow-y-auto" style={{ boxShadow: '0 6px 18px rgba(10,22,40,.14)' }}>
                            <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#C3C9D4] px-2 pt-1 pb-1">Mover a…</div>
                            {MOVE_KINDS.map(k => { const mc = secOf(k); const cur = k === s.kind; return (
                              <button key={k} onClick={() => moverACategoria(s.id, k)} disabled={cur}
                                className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-left text-[12px] font-semibold border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-[#F4F6F9]"
                                style={{ color: mc.c }}>
                                <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: mc.c }} />{mc.label}{cur && <Check size={12} className="ml-auto" />}
                              </button>
                            ); })}
                          </div>
                        </>)}
                      </span>
                      <button onClick={() => borrar(s)} title="Borrar sección" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:bg-[#FEF2F2] hover:text-[#B91C1C] border-none bg-transparent cursor-pointer"><Trash2 size={13} /></button>
                    </div>
                  )}
                  {!editando && <span className="text-[10.5px] text-[#C3C9D4] tabular-nums shrink-0">{(s.char_count || 0).toLocaleString('es-AR')}</span>}
                </div>

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
                      noToolbar
                      onActive={setActiveApi}
                      onInsertImage={abrirSelectorImagen}
                      onNewAvatar={(name) => crearAvatarSection(name)}
                      minHeight={90}
                      placeholder="Escribí acá el contenido de la sección…"
                    />
                  </div>
                ) : s.html ? (
                  <div className="del-rich py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '78ch' }}
                    dangerouslySetInnerHTML={{ __html: highlightHtml(sanitizeDelHtml(s.html), scomments) }} />
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

          {/* Estrategia — página propia (como Configuración y Recursos): tipo · punto
              diferencial · fecha. De acá comen el riel del funnel y los agentes. */}
          {view === 'estrategia' && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 py-2 px-1">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#ECFEFF', color: '#0891B2' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>
                </span>
                <div>
                  <div className="text-[14px] font-bold text-[#1A1D26]">Estrategia</div>
                  <div className="text-[11px] text-[#9098A4]">De qué va este funnel: tipo, punto diferencial y fecha de inicio.</div>
                </div>
              </div>
              {estrategiaNode || <div className="text-[12px] text-[#9098A4] p-4">Sin estrategia.</div>}
            </div>
          )}

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

          {/* Un documento DEL CLIENTE (personalidad / onboarding / investigación): editable. */}
          {view.startsWith('cliente:') && (() => {
            const doc = clientDocs.find(d => 'cliente:' + d.id === view);
            if (!doc) return null;
            const docHtml = doc.panel_html || plainToHtml(doc.text);
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-2 px-1 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#F1F3F7', color: '#6B7280' }}><Monitor size={16} /></span>
                    <div className="min-w-0">
                      <div className="text-[14px] font-bold text-[#1A1D26] truncate">{doc._kind === 'extra' ? doc.title : (DOC_KIND_LABEL[doc.doc_kind] || doc.title)}</div>
                      <div className="text-[11px] text-[#9098A4]">Aparece en todos los DEL de este cliente.{docEditing ? ' Se guarda solo.' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
                      <button onClick={() => setDocEditing(false)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
                      <button onClick={() => setDocEditing(true)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: '#fff', color: '#7C3AED', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
                    </div>
                    {doc.web_url && <a href={doc.web_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-[#2E69E0] hover:underline"><ExternalLink size={11} />Drive</a>}
                    {doc._kind === 'extra' && <button onClick={() => borrarExtraDoc(doc)} title="Borrar este documento" className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={13} /></button>}
                  </div>
                </div>
                {docEditing ? (
                  <RichTextEditor
                    key={doc.id}
                    value={docHtml}
                    onChange={(html) => saveClientDoc(doc, html)}
                    sanitize={sanitizeDelHtml}
                    delTools
                    minHeight={320}
                    placeholder="Escribí acá…"
                  />
                ) : (
                  <div className="del-rich rounded-xl border border-[#E7EAF0] bg-white py-4 px-5 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '80ch' }}>
                    {(doc.panel_html || (doc.text || '').trim())
                      ? <div dangerouslySetInnerHTML={{ __html: sanitizeDelHtml(docHtml) }} />
                      : <span className="italic text-[#C3C9D4]">Este documento está vacío o todavía no se sincronizó.</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Margen de comentarios (como Google Docs): las notas ancladas a frases. */}
        {view === 'del' && (
          <aside className="sticky top-0 flex flex-col gap-2 max-h-[calc(100vh-120px)] overflow-y-auto pb-6">
            <div className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF] px-1 pt-1">Comentarios</div>
            {comments.length === 0 && (
              <div className="text-[11px] text-[#AEB4BF] px-1 leading-snug">Marcá una frase en el texto y tocá <b>Comentar</b> para dejar una nota acá.</div>
            )}
            {[...comments].sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || (new Date(a.created_at) - new Date(b.created_at))).map(c => (
              <div key={c.id} onClick={() => irAComment(c)}
                className="rounded-lg border bg-white p-2.5 cursor-pointer transition-colors"
                style={{ borderColor: flashCmt === c.id ? '#2E69E0' : '#E7EAF0', boxShadow: flashCmt === c.id ? '0 0 0 2px #DBEAFE' : 'none', opacity: c.resolved ? 0.6 : 1 }}>
                {c.quote && <div className="text-[10.5px] text-[#8A6D2B] border-l-2 border-[#EAB308] pl-1.5 mb-1 italic line-clamp-2">“{c.quote}”</div>}
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: colorFor(c.author_id || c.author_name) }}>{initialOf(c.author_name)}</span>
                  <span className="text-[11.5px] font-bold text-[#1A1D26] truncate">{c.author_name || 'Alguien'}</span>
                  <span className="text-[10px] text-[#AEB4BF] ml-auto shrink-0">{haceRato(c.created_at)}</span>
                </div>
                <div className="text-[12px] text-[#3F4653] leading-snug whitespace-pre-wrap break-words" style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.body}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <button onClick={(e) => { e.stopPropagation(); resolverComment(c); }} className="inline-flex items-center gap-1 text-[10.5px] font-semibold py-0.5 px-1.5 rounded border-none cursor-pointer" style={c.resolved ? { background: '#F1F3F7', color: '#6B7280' } : { background: '#ECFDF5', color: '#15803D' }}><Check size={11} strokeWidth={3} />{c.resolved ? 'Reabrir' : 'Resolver'}</button>
                  {c.author_id === by && <button onClick={(e) => { e.stopPropagation(); borrarComment(c); }} title="Borrar" className="inline-flex items-center justify-center w-6 h-6 rounded text-[#C3C9D4] hover:text-[#B91C1C] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer"><Trash2 size={11} /></button>}
                </div>
              </div>
            ))}
          </aside>
        )}
      </div>

      {/* Botón flotante al marcar texto + caja para escribir el comentario. */}
      {selBtn && !composer && (
        <button onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }} onClick={() => { setComposer({ quote: selBtn.quote, sectionId: selBtn.sectionId, top: selBtn.top, left: selBtn.left }); setDraft(''); setSelBtn(null); }}
          className="fixed z-[70] inline-flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-[#1A1D26] text-white text-[12px] font-semibold cursor-pointer shadow-lg"
          style={{ top: selBtn.top, left: selBtn.left, transform: 'translate(-50%,-130%)' }}>
          <MessageSquare size={13} />Comentar
        </button>
      )}
      {composer && (
        <div onMouseDown={(e) => e.stopPropagation()} className="fixed z-[71] bg-white rounded-xl border border-[#E2E5EB] p-3 w-[300px]"
          style={{ top: Math.min(composer.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200), left: Math.min(composer.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320), transform: 'translate(-50%, 10px)', boxShadow: '0 12px 40px rgba(10,22,40,.22)' }}>
          <div className="text-[10.5px] text-[#8A6D2B] border-l-2 border-[#EAB308] pl-1.5 mb-2 italic line-clamp-3">“{composer.quote}”</div>
          <textarea value={draft} autoFocus onChange={e => setDraft(e.target.value)} rows={3}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); comentarQuote(); } if (e.key === 'Escape') { setComposer(null); setDraft(''); } }}
            placeholder="Escribí tu comentario…  (Ctrl+Enter)"
            className="w-full py-2 px-2.5 border border-[#E2E5EB] rounded-lg text-[12.5px] text-[#1A1D26] bg-white resize-y outline-none focus:border-blue leading-snug" />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => { setComposer(null); setDraft(''); }} className="py-1.5 px-3 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[12px] font-semibold cursor-pointer">Cancelar</button>
            <button onClick={comentarQuote} disabled={!draft.trim()} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border-none bg-[#2E69E0] text-white text-[12px] font-semibold cursor-pointer hover:bg-[#1D4FD8] disabled:opacity-50"><Send size={12} />Comentar</button>
          </div>
        </div>
      )}

      {/* Diálogo: crear un documento nuevo del cliente. */}
      {newDocOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setNewDocOpen(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-[380px] p-5" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }}>
            <div className="text-[15px] font-bold text-[#1A1D26] mb-1">Nuevo documento del cliente</div>
            <div className="text-[11.5px] text-[#9098A4] mb-3">Aparece en todos los DEL de este cliente. Lo podés editar como cualquier documento.</div>
            <input type="text" value={newDocTitle} autoFocus onChange={e => setNewDocTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') crearDocNuevo(); if (e.key === 'Escape') setNewDocOpen(false); }} placeholder="Nombre del documento" className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#7C3AED]" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setNewDocOpen(false)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
              <button onClick={crearDocNuevo} className="py-2 px-4 rounded-lg border-none bg-[#7C3AED] text-white text-[13px] font-semibold cursor-pointer">Crear</button>
            </div>
          </div>
        </div>
      )}

      {/* Selector de imagen desde Recursos: el botón de imagen del DEL muestra las
          imágenes ya subidas al funnel y la elegida se inserta en el texto. */}
      {imgPicker && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setImgPicker(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-[560px] max-h-[80vh] flex flex-col overflow-hidden" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }}>
            <div className="flex items-center gap-2 py-3 px-4 border-b border-[#EDF0F5]">
              <ImageIcon size={16} className="text-[#B45309]" />
              <div className="text-[14px] font-bold text-[#1A1D26] flex-1">Elegí una imagen de Recursos</div>
              <button onClick={() => setImgPicker(null)} className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-[#9098A4] hover:bg-[#F4F5F7] border-none bg-transparent cursor-pointer"><X size={16} /></button>
            </div>
            <div className="p-4 overflow-y-auto">
              {imgList === null ? (
                <div className="py-10 text-center text-[12px] text-[#9098A4] flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />Cargando imágenes…</div>
              ) : imgList.length === 0 ? (
                <div className="py-10 text-center">
                  <ImageIcon size={26} className="text-[#D0D5DD] mx-auto mb-2" />
                  <div className="text-[12.5px] text-[#6B7280] font-semibold">Todavía no hay imágenes en Recursos</div>
                  <div className="text-[11px] text-[#9098A4] mt-1">Subí imágenes en la pestaña Recursos y acá te aparecen para insertar.</div>
                </div>
              ) : (
                <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
                  {imgList.map(r => (
                    <button key={r.id} onClick={() => elegirImagen(r)} title={`Insertar: ${r.title}`} className="group flex flex-col rounded-lg border border-[#E7EAF0] bg-white overflow-hidden cursor-pointer hover:border-[#2E69E0] p-0">
                      <span className="w-full aspect-[4/3] bg-[#F4F5F7] overflow-hidden"><img src={r.public_url} alt={r.title} loading="lazy" className="w-full h-full object-cover" /></span>
                      <span className="text-[10.5px] font-semibold text-[#3F4653] truncate px-1.5 py-1">{r.title}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
