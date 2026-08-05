import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Loader2, AlertCircle, FileText, ExternalLink, Plus, Trash2, Check, Pencil, Eye, PenLine, Link2, Image as ImageIcon, Monitor, MessageSquare, Send, Lock, X,
  Bold, Italic, Underline as UnderlineIcon, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Table, UserPlus, Eraser, Baseline, FolderInput, LayoutTemplate,
  Highlighter, AlignLeft, AlignCenter, AlignRight, Share2, Copy, Menu, HelpCircle, PaintBucket, PanelLeft, PanelLeftClose, Minus, ChevronRight, ChevronLeft, FolderDown } from 'lucide-react';
import { sbFetch, supabase } from '@korex/db';
import { useApp } from '../../../context/AppContext';
import RichTextEditor from '../../notas/RichTextEditor';
import { sanitizeDelHtml } from './delSanitize';
import { getCfgJump, clearCfgJump } from './cfgJump';
import { BLUEPRINTS } from './blueprints';
import { resolveDelTabs, esGrabable } from './delTabs';
import { publicOrigin } from '../../../utils/helpers';

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

// ¿Pantalla chica? El DEL colapsa a UNA columna y el menú de la izquierda pasa a
// un cajón lateral que se abre con las tres rayitas (☰). Igual de funcional.
function useIsMobile(bp = 900) {
  const [m, setM] = useState(() => typeof window !== 'undefined' && window.matchMedia(`(max-width:${bp}px)`).matches);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width:${bp}px)`);
    const fn = (e) => setM(e.matches);
    if (mq.addEventListener) mq.addEventListener('change', fn); else mq.addListener(fn);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', fn); else mq.removeListener(fn); };
  }, [bp]);
  return m;
}

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


// ── Barra ÚNICA fija (tipo Google Docs) ──────────────────────────────────────
// Aparece una sola vez arriba del documento y opera sobre la sección que tenés
// enfocada (cada sección avisa con onActive(api) al RichTextEditor). Si no hay
// ninguna enfocada, los botones quedan atenuados.
const TB_COLORS = ['#1F2937', '#6B7280', '#DC2626', '#EA580C', '#CA8A04', '#16A34A', '#2563EB', '#7C3AED', '#DB2777'];
// Cajas de color (fondo del párrafo entero). La primera lo quita. Misma paleta que
// la del editor (RichTextEditor).
const BOX_COLORS = [
  { c: null,      label: 'Quitar caja' },
  { c: '#FEF3C7', label: 'Amarillo (aviso)' },
  { c: '#E7EDFF', label: 'Azul (consejo)' },
  { c: '#E8F7EE', label: 'Verde (bien)' },
  { c: '#FDE8E8', label: 'Rojo (cuidado)' },
  { c: '#F3F4F6', label: 'Gris (nota)' },
  { c: '#0E1F38', label: 'Azul oscuro (destacado, letra blanca)' },
];
// Colores del marcador (resaltado de fondo). El primero (transparent) lo QUITA.
const HL_COLORS = [
  { c: 'transparent', label: 'Sin marcador' },
  { c: '#FFF176', label: 'Amarillo' }, { c: '#C8F7C5', label: 'Verde' },
  { c: '#C7E3FF', label: 'Celeste' }, { c: '#FBD0E4', label: 'Rosa' }, { c: '#FDE4B8', label: 'Naranja' },
];

// Etiquetas de las categorías de Recursos, para agrupar el selector de imágenes.
// (espejo de CLIENT_CATS/VID_BUCKETS de FunnelsView, sin acoplar los componentes)
const IMG_BUCKET_LABELS = {
  autoridad: 'Fotos de Autoridad', estilo_vida: 'Fotos Estilo de vida', branding: 'Branding',
  productos: 'Foto de productos', empresa: 'Material de la empresa', stock: 'Stock / B-Roll',
  imagenes_diseno: 'Imagenes para diseño', instagram: 'Imágenes de Instagram', testimonios: 'Testimonios', sin_clasif: 'Sin clasificar',
  ad_rec: 'Anuncios · grabación', ad_edit: 'Anuncios · edición', vsl_rec: 'VSL · grabación', vsl_edit: 'VSL · edición',
};
// Orden de las categorías del cliente (las del funnel van al final).
const IMG_CAT_ORDER = ['autoridad', 'estilo_vida', 'branding', 'productos', 'empresa', 'stock', 'imagenes_diseno', 'instagram', 'testimonios', 'sin_clasif'];
// Agrupa las imágenes por (scope + categoría) para mostrarlas rotuladas en el modal.
function agruparImagenes(list) {
  const groups = new Map();
  for (const r of (list || [])) {
    const key = (r._scope === 'funnel' ? 'f:' : 'c:') + (r.bucket_key || 'otros');
    if (!groups.has(key)) {
      const label = (r._scope === 'funnel' ? 'Este funnel — ' : '') + (IMG_BUCKET_LABELS[r.bucket_key] || 'Otros');
      groups.set(key, { key, label, scope: r._scope, bucket: r.bucket_key, items: [] });
    }
    groups.get(key).items.push(r);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.scope === 'funnel' && b.scope !== 'funnel') return 1;   // el funnel, al final
    if (b.scope === 'funnel' && a.scope !== 'funnel') return -1;
    const ia = IMG_CAT_ORDER.indexOf(a.bucket), ib = IMG_CAT_ORDER.indexOf(b.bucket);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}
// Carpetas destino del importador de Drive (= bucket_key de funnel_resources).
// scope 'funnel' → usa el strategy_id del funnel; 'cliente' → carpeta general (strategy_id null).
const IMPORT_DESTINOS = [
  { grupo: 'De este funnel', opciones: [
    { key: 'ad_rec', label: 'Anuncios — grabados', scope: 'funnel' },
    { key: 'ad_edit', label: 'Anuncios — editados', scope: 'funnel' },
    { key: 'vsl_rec', label: 'VSL — grabados', scope: 'funnel' },
    { key: 'vsl_edit', label: 'VSL — editados', scope: 'funnel' },
    { key: 'testimonios', label: 'Testimonios', scope: 'funnel' },
  ] },
  { grupo: 'Generales del cliente', opciones: [
    { key: 'branding', label: 'Branding', scope: 'cliente' },
    { key: 'productos', label: 'Productos', scope: 'cliente' },
    { key: 'estilo_vida', label: 'Estilo de vida', scope: 'cliente' },
    { key: 'autoridad', label: 'Autoridad', scope: 'cliente' },
    { key: 'empresa', label: 'Empresa', scope: 'cliente' },
    { key: 'testimonios_korex', label: 'Testimonios Korex', scope: 'cliente' },
  ] },
];
const IMPORT_OPT = (k) => IMPORT_DESTINOS.flatMap((g) => g.opciones).find((o) => o.key === k);

function TbBtn({ Icon, label, title, onClick, disabled }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} disabled={disabled} title={title}
      className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 disabled:cursor-default disabled:hover:bg-transparent">
      {Icon ? <Icon size={15} /> : <span className="text-[12px] font-bold">{label}</span>}
    </button>
  );
}
function TbDiv() { return <div className="w-px h-5 bg-gray-200 mx-0.5" />; }
function DelToolbar({ api, onImportDrive }) {
  const [colorOpen, setColorOpen] = useState(false);
  const [hlOpen, setHlOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [bpOpen, setBpOpen] = useState(false);
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
      <TbBtn Icon={ListChecks} title="Checklist (casilleros ☐)" disabled={off} onClick={() => call('toggleChecklist')} />
      <TbBtn Icon={Minus} title="Divisor (línea horizontal)" disabled={off} onClick={() => call('exec', 'insertHorizontalRule')} />
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
      {/* Marcador / resaltado (fondo del texto). La primera opción lo quita. */}
      <div className="relative">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setHlOpen(v => !v)} disabled={off} title="Marcador (resaltar)"
          className={`w-8 h-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 ${hlOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
          <Highlighter size={15} />
        </button>
        {hlOpen && !off && (<>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setHlOpen(false)} className="fixed inset-0 z-30 bg-transparent border-none cursor-default" aria-label="Cerrar" />
          <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-3 gap-1.5 w-[132px]">
            {HL_COLORS.map(h => (
              <button key={h.c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { call('applyHighlight', h.c); setHlOpen(false); }} title={h.label}
                className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
                style={{ background: h.c === 'transparent' ? '#fff' : h.c }}>
                {h.c === 'transparent' && <span className="text-[13px] text-[#9098A4] leading-none">⌀</span>}
              </button>
            ))}
          </div>
        </>)}
      </div>
      {/* Caja de color: pinta el fondo del párrafo entero (avisos/consejos). */}
      <div className="relative">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBoxOpen(v => !v)} disabled={off} title="Caja de color (fondo del párrafo)"
          className={`w-8 h-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 ${boxOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
          <PaintBucket size={15} />
        </button>
        {boxOpen && !off && (<>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBoxOpen(false)} className="fixed inset-0 z-30 bg-transparent border-none cursor-default" aria-label="Cerrar" />
          <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-3 gap-1.5 w-[132px]">
            {BOX_COLORS.map(b => (
              <button key={b.label} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { call('applyBox', b.c); setBoxOpen(false); }} title={b.label}
                className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
                style={{ background: b.c || '#fff' }}>
                {!b.c && <span className="text-[13px] text-[#9098A4] leading-none">⌀</span>}
              </button>
            ))}
          </div>
        </>)}
      </div>
      <TbDiv />
      <TbBtn Icon={AlignLeft} title="Alinear a la izquierda" disabled={off} onClick={() => call('exec', 'justifyLeft')} />
      <TbBtn Icon={AlignCenter} title="Centrar" disabled={off} onClick={() => call('exec', 'justifyCenter')} />
      <TbBtn Icon={AlignRight} title="Alinear a la derecha" disabled={off} onClick={() => call('exec', 'justifyRight')} />
      <TbDiv />
      <TbBtn label="A−" title="Achicar la letra seleccionada" disabled={off} onClick={() => call('changeFontSize', false)} />
      <TbBtn label="A+" title="Agrandar la letra seleccionada" disabled={off} onClick={() => call('changeFontSize', true)} />
      <TbBtn Icon={Table} title="Insertar tabla" disabled={off} onClick={() => call('openTable')} />
      <div className="relative">
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBpOpen(v => !v)} disabled={off} title="Insertar estructura de landing"
          className={`w-8 h-8 flex items-center justify-center rounded-md bg-transparent border-none cursor-pointer transition-colors disabled:opacity-40 ${bpOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}>
          <LayoutTemplate size={15} />
        </button>
        {bpOpen && !off && (<>
          <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBpOpen(false)} className="fixed inset-0 z-30 bg-transparent border-none cursor-default" aria-label="Cerrar" />
          <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-1.5 w-[252px]">
            <div className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#9098A4] px-2 py-1">Estructuras de landing</div>
            {BLUEPRINTS.map(bp => (
              <button key={bp.id} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { call('insertBlueprint', bp.html); setBpOpen(false); }}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[#F4F5F7] border-none bg-transparent cursor-pointer">
                <div className="text-[12px] font-semibold text-[#1A1D26]">{bp.label}</div>
                <div className="text-[10.5px] text-[#9098A4] leading-snug">{bp.descripcion}</div>
              </button>
            ))}
          </div>
        </>)}
      </div>
      <TbBtn Icon={ImageIcon} title="Insertar imagen" disabled={off} onClick={() => call('openImage')} />
      <TbBtn Icon={UserPlus} title="Insertar un avatar" disabled={off} onClick={() => call('openAvatar')} />
      {onImportDrive && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onImportDrive} title="Importar archivos de una carpeta de Drive"
          className="w-8 h-8 flex items-center justify-center rounded-md text-[#0891B2] hover:bg-[#ECFEFF] hover:text-[#0E7490] bg-transparent border-none cursor-pointer transition-colors">
          <FolderDown size={15} />
        </button>
      )}
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

// Las 4 secciones sin html (pestañas-puntero que ya no estan en el Doc) se editan
// igual: el texto plano se envuelve en parrafos para arrancar.
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const plainToHtml = (t) => String(t || '').split(/\n{2,}/).map(b => `<p>${esc(b.trim()).replace(/\n/g, '<br>')}</p>`).join('') || '<p></p>';

// Los documentos del cliente que se comparten entre TODOS sus funnels (personalidad,
// onboarding, investigación) van al fondo del menú del DEL, bajo "DEL CLIENTE".
// Se muestran con su título real (editable con el lápiz), no con un rótulo fijo.

// Título con lápiz: clic para renombrar (guías y documentos del cliente).
function TituloEditable({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  if (editing) return (
    <input autoFocus defaultValue={value}
      onBlur={(e) => { setEditing(false); onSave(e.target.value); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }}
      className="w-full min-w-0 text-[14px] font-bold text-[#1A1D26] border border-[#2E69E0] rounded px-1.5 py-0.5 outline-none bg-white" />
  );
  return (
    <button onClick={() => setEditing(true)} title="Cambiar el nombre" className="group/te flex items-center gap-1.5 min-w-0 text-left border-none bg-transparent cursor-pointer p-0">
      <span className="text-[14px] font-bold text-[#1A1D26] truncate">{value}</span>
      <Pencil size={11} className="opacity-0 group-hover/te:opacity-100 text-[#C3C9D4] shrink-0 transition-opacity" />
    </button>
  );
}

export default function DelEditor({ strategyId, docId, docUrl, clientId, siblingDels = [], estrategiaNode, configNode, recursosNode, onAvatarCreate, onVersionComplete, onVersionDelete }) {
  const { currentUser, appSettings } = useApp();
  // Categorías/pestañas del DEL, configurables desde Ajustes (P9). Con fallback al default.
  const { SEC, secOf, KIND_ORDER, kindRank, STANDARD_KINDS, MOVE_KINDS, VERSIONABLE_KINDS, kindCat } =
    useMemo(() => resolveDelTabs(appSettings), [appSettings]);
  const [secs, setSecs] = useState(null);
  const [err, setErr] = useState(null);
  const [activa, setActiva] = useState(null);
  const [modo, setModo] = useState('leer'); // 'leer' | 'editar'
  const [saveState, setSaveState] = useState({}); // id -> 'saving'|'saved'|'error'
  const [editTitle, setEditTitle] = useState(null); // id de la seccion con el titulo en edicion
  const [moveMenu, setMoveMenu] = useState(null); // id de la seccion con el menu "mover a categoria" abierto
  const [moveTo, setMoveTo] = useState(null); // submenu "mover a otro embudo": { docId, name } elegido (falta la categoria)
  const [moveRect, setMoveRect] = useState(null); // posicion (fixed) del menu de mover, para que no lo recorte el contenedor
  // Importador de archivos de Drive (one-shot): link + carpeta destino → funnel_resources.
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importBucket, setImportBucket] = useState('ad_rec');
  const [importBusy, setImportBusy] = useState(false);
  const [importRes, setImportRes] = useState(null);
  const [activeVersion, setActiveVersion] = useState(null); // versión del funnel que se está viendo (null = la última)
  const [verModal, setVerModal] = useState(null); // modal "nueva versión": { scope:'paginas'|'completa', avatars:Set }
  const [delVerModal, setDelVerModal] = useState(null); // modal "borrar versión": { v, texto }
  // Qué se ve en el panel derecho: 'estrategia' | 'del' (el documento) | 'config' | 'recursos' | 'cliente:<docId>'
  // Por defecto abre en ESTRATEGIA (decisión de Matías): es la primera pestaña y la vista de arranque.
  // Excepción: si hay un salto pendiente desde el Panorama (cfgJump), arranca en CONFIGURACIÓN.
  const [view, setView] = useState(() => {
    const j = getCfgJump();
    if (!j) return 'estrategia';
    return j.destino === 'del' ? 'del' : 'config';   // salto a una pestaña del DEL vs. a la configuración
  });
  const [clientDocs, setClientDocs] = useState([]);
  // Colaboración: comentarios por sección + presencia en vivo + candado de edición.
  const [comments, setComments] = useState([]);      // todos los del DEL
  const [threadFor, setThreadFor] = useState(null);  // id de sección con el hilo abierto
  const [draft, setDraft] = useState('');            // texto del comentario nuevo
  const [replyDraft, setReplyDraft] = useState({});  // texto de la respuesta por comentario {id: texto}
  const [present, setPresent] = useState([]);        // quién está en el DEL ahora (Realtime)
  const [myEditing, setMyEditing] = useState(null);  // qué sección estoy editando (para el candado)
  const [activeApi, setActiveApi] = useState(null);  // API de la sección enfocada (barra única)
  // Comentarios estilo Google Docs: marcás una frase → botón flotante → se guarda con
  // la frase (quote) y aparece en el margen derecho, con la frase resaltada en el texto.
  // (Lo marcado NO vive en el estado: va en `selRef`, más abajo, para no
  //  redibujar el documento mientras se está marcando.)
  const [composer, setComposer] = useState(null);    // caja de escribir: {quote,sectionId}
  const [flashCmt, setFlashCmt] = useState(null);     // id del comentario a destacar
  const [imgPicker, setImgPicker] = useState(null);   // selector de imagen de Recursos: {insert}
  const [imgList, setImgList] = useState(null);        // imágenes de Recursos del funnel
  const [imgCat, setImgCat] = useState(null);          // carpeta activa del selector (key de grupo)
  const [shareDelOpen, setShareDelOpen] = useState(false);   // popover compartir secciones del DEL
  const [shareSel, setShareSel] = useState(() => new Set()); // secciones tildadas para compartir
  const [shareDelLinks, setShareDelLinks] = useState(null);  // links de comentarios activos
  const [shareDelBusy, setShareDelBusy] = useState(false);
  const [copiedDelTok, setCopiedDelTok] = useState(null);
  const [aviso, setAviso] = useState(null);   // mensajito verde abajo, se va solo
  const [saltoFlash, setSaltoFlash] = useState(null); // sección a la que se saltó desde el Panorama
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
  // Personas a las que se puede asignar la grabación de un guión: el cliente +
  // sus colaboradores "Encargado de grabarse".
  const [asignables, setAsignables] = useState([{ id: '', nombre: 'Cliente' }]);
  // Avatares del funnel (para asignar a qué avatar es cada guión de anuncios).
  const [avatarsFunnel, setAvatarsFunnel] = useState([]);
  // Cuántos funnels comparten la carpeta de Drive de este funnel. Si es >1, el borrado
  // de una versión no puede tocar las grabaciones sin avatar (las del VSL), porque no
  // hay forma de saber de cuál de los funnels son.
  const [funnelsEnCarpeta, setFunnelsEnCarpeta] = useState(1);

  // Carga las secciones del DEL de ESTE funnel, SIEMPRE por doc_id (del_doc_id) y
  // acotado además por client_id.
  //
  // Antes había un fallback: si el funnel no traía docId, filtraba por strategy_id —
  // o sea por la CARPETA de Drive. Dos funnels pueden compartir carpeta, y una carpeta
  // puede quedar apuntando a otro cliente, así que ese camino podía traer secciones
  // ajenas. Hoy los 62 funnels tienen del_doc_id (verificado: 0 sin él), así que el
  // fallback no aportaba nada y solo abría la puerta. Si algún día falta, es mejor
  // mostrar el error que adivinar el documento.
  //
  // El client_id del filtro es defensa en profundidad: la base ya tiene una clave
  // foránea compuesta que garantiza que doc y sección son del mismo cliente
  // (migrations/del_v2_candado_cliente.sql), pero que la consulta también lo diga
  // significa que hacen falta DOS fallas para filtrar algo, no una.
  const cargar = useCallback(async () => {
    try {
      if (!docId) { setErr('Este funnel no tiene un DEL asociado.'); setSecs([]); return; }
      const filtro = `doc_id=eq.${docId}${clientId ? `&client_id=eq.${clientId}` : ''}`;
      const rows = await sbFetch(
        `del_sections?select=id,doc_id,client_id,ord,title,kind,text,html,char_count,source,version,status,para_grabar,orden_grabacion,accion_cliente,estado_seccion,grab_colab_id,grab_flujo,grab_flujo_at,grab_avatar_id,fase&${filtro}&order=ord.asc`,
        // cache:'no-store' -> el DEL SIEMPRE se trae fresco. Sin esto, el navegador
        // servía una versión vieja cacheada del documento tras reorganizarlo.
        { headers: { Prefer: 'return=representation' }, cache: 'no-store' },
      );
      const list = Array.isArray(rows) ? rows : [];
      setSecs(list);
      if (list.length) {
        // Salto desde el Panorama a una PESTAÑA del DEL (Avatar, VSL guión…):
        // se abre esa pestaña directamente en vez de la de arranque.
        // (FunnelRow ya comprobó que el salto es para ESTE funnel antes de abrir
        // el DEL, así que acá solo importa el destino.)
        const j = getCfgJump();
        const destinoDel = j?.destino === 'del';
        const objetivo = destinoDel ? list.find((s) => s.kind === j.campo) : null;
        if (destinoDel) {
          clearCfgJump();
          setView('del');
          setActiva(objetivo?.id ?? list[0].id);
          setSaltoFlash(objetivo?.id ?? null);
        } else {
          // Por defecto abre la sección de Estrategia (si existe); si no, la primera.
          setActiva((a) => a || (list.find((s) => s.kind === 'estrategia')?.id ?? list[0].id));
        }
      }
      // La identidad del editor sale de las PROPS, nunca de los datos que llegaron.
      // Antes era `d || list[0].doc_id` / `c || list[0].client_id`: el editor adoptaba
      // el documento y el cliente de la primera fila recibida. Y resolvedDoc es el
      // p_doc_id con el que agregar() y crearAvatarSection() CREAN secciones nuevas,
      // así que una lectura contaminada se convertía en escrituras contaminadas.
      setResolvedDoc(docId);
      if (clientId) setResolvedClient(clientId);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }, [docId, clientId]);

  useEffect(() => {
    if (!aviso) return undefined;
    const t = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(t);
  }, [aviso]);

  // Llegada del salto del Panorama: bajar hasta la pestaña y destacarla en amarillo,
  // igual que hace FunnelConfigBlock con los campos de configuración.
  useEffect(() => {
    if (!saltoFlash) return undefined;
    const t = setTimeout(() => {
      const el = document.getElementById('sec-' + saltoFlash);
      setSaltoFlash(null);
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      const prev = el.style.boxShadow;
      el.style.transition = 'box-shadow .25s';
      el.style.boxShadow = '0 0 0 3px #FFD84D';
      setTimeout(() => { el.style.boxShadow = prev; }, 2600);
    }, 400);
    return () => clearTimeout(t);
  }, [saltoFlash]);

  // Carga las personas asignables (cliente + Encargados de grabarse) del cliente.
  useEffect(() => {
    if (!resolvedClient) return;
    let vivo = true;
    (async () => {
      try {
        const [cli, colabs] = await Promise.all([
          sbFetch(`clients?select=name&id=eq.${resolvedClient}`),
          sbFetch(`portal_collaborators?select=id,full_name,email,role&client_id=eq.${resolvedClient}&enabled=eq.true&role=ilike.Encargado*`),
        ]);
        if (!vivo) return;
        const nombreCli = (Array.isArray(cli) && cli[0]?.name) || 'Cliente';
        const lista = [{ id: '', nombre: `${nombreCli} (cliente)` }];
        (Array.isArray(colabs) ? colabs : []).forEach((c) => lista.push({ id: c.id, nombre: c.full_name || c.email || 'Encargado' }));
        setAsignables(lista);
      } catch { /* deja solo Cliente */ }
    })();
    return () => { vivo = false; };
  }, [resolvedClient]);

  // Asigna el responsable de grabación de un guión (cliente o colaborador).
  const asignarGrabador = async (s, colabId) => {
    const val = colabId || null;
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, grab_colab_id: val } : x));
    const { data, error } = await supabase.rpc('del_section_asignar_grabador', { p_id: s.id, p_colab_id: val, p_by: by });
    if (error || !data?.ok) { window.alert('No pude asignar el responsable' + (data?.error ? ': ' + data.error : '')); await cargar(); }
  };

  // Avatares de ESTE funnel, resueltos por su DEL.
  //
  // Antes preguntaba por strategy_id — la CARPETA de Drive — y FUSIONABA los avatares de
  // todos los funnels que la comparten (el `vistos` de acá abajo era literalmente eso).
  // O sea: en el selector de "a qué avatar es este guión" aparecían avatares de otro
  // funnel del mismo cliente. del_doc_id tiene un índice único (del_v1), así que
  // identifica un solo funnel sin ambigüedad.
  //
  // De paso guardo cuántos funnels comparten la carpeta: lo necesita el borrado de
  // versiones para no llevarse grabaciones ajenas (ver borrarVersion).
  useEffect(() => {
    if (!docId) return undefined;
    let vivo = true;
    (async () => {
      try {
        const rows = await sbFetch(`strategy_pages?select=id,strategy_id,avatars&del_doc_id=eq.${docId}`);
        if (!vivo) return;
        const mio = (Array.isArray(rows) ? rows : [])[0];
        const avs = (Array.isArray(mio?.avatars) ? mio.avatars : [])
          .filter((a) => a?.id)
          .map((a) => ({ id: a.id, name: a.name || a.id }));
        setAvatarsFunnel(avs);

        if (mio?.strategy_id) {
          const hermanos = await sbFetch(`strategy_pages?select=id&strategy_id=eq.${mio.strategy_id}`);
          if (vivo) setFunnelsEnCarpeta(Array.isArray(hermanos) ? hermanos.length : 1);
        }
      } catch { /* sin avatares */ }
    })();
    return () => { vivo = false; };
  }, [docId]);

  // Asigna a qué avatar es un guión de anuncios (para que el cliente no lo elija al subir).
  const asignarAvatar = async (s, avatarId) => {
    const val = avatarId || null;
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, grab_avatar_id: val } : x));
    const { data, error } = await supabase.rpc('del_section_set_grab_avatar', { p_id: s.id, p_avatar: val, p_by: by });
    if (error || !data?.ok) { window.alert('No pude asignar el avatar'); await cargar(); }
  };

  // Fase del guión: 'lanzamiento' (se requiere para llegar al 100% del embudo) u
  // 'optimizacion' (adicional, después del 100%: no frena el avance).
  const setFase = async (s, fase) => {
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, fase } : x));
    const { data, error } = await supabase.rpc('del_section_set_fase', { p_id: s.id, p_fase: fase, p_by: by });
    if (error || !data?.ok) { window.alert('No pude cambiar la fase' + (data?.error ? ': ' + data.error : '')); await cargar(); }
  };

  // APROBAR grabado: el equipo confirma que el guión REALMENTE se grabó. Solo esto
  // lo da por grabado (no que el cliente diga que grabó o suba videos). Mueve el
  // flujo a 'grabado' y es lo que cuenta para el 100% del embudo.
  const setGrabado = async (s, grabado) => {
    const flujo = grabado ? 'grabado' : 'grabacion';
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, grab_flujo: flujo, grab_flujo_at: new Date().toISOString() } : x));
    const { data, error } = await supabase.rpc('del_grab_marcar_grabado', { p_section_id: s.id, p_grabado: grabado, p_by: by });
    if (error || !data?.ok) { window.alert('No pude marcar Grabado' + (data?.error ? ': ' + data.error : '')); await cargar(); }
  };

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
          sbFetch(`del_client_extra_docs?select=id,title,html,updated_at,system&client_id=eq.${encodeURIComponent(cid)}&order=created_at.asc`),
        ]);
        if (!alive) return;
        // Unifico los del Drive (brain) con los propios del panel (extra) en una sola lista.
        const brain = (Array.isArray(rows) ? rows : []).map(d => ({ ...d, _kind: 'brain', key: 'b_' + d.id }));
        const extra = (Array.isArray(extras) ? extras : []).map(d => ({ id: d.id, title: d.title, panel_html: d.html, doc_kind: 'extra', _kind: 'extra', _system: !!d.system, key: 'x_' + d.id }));
        setClientDocs([...brain, ...extra]);
        setExcluded(new Set((Array.isArray(hidden) ? hidden : []).map(p => p.node_id)));
      } catch { if (alive) setClientDocs([]); }
    })();
    return () => { alive = false; };
  }, [cid]);

  const quitarClientDoc = async (d) => {
    if (d._kind === 'extra') { if (d._system) { window.alert('El “Resumen de la venta” es un documento del sistema: no se puede borrar.'); return; } borrarExtraDoc(d); return; } // los propios del panel se borran
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
    docTimer.current = setTimeout(async () => {
      // `client_brain_docs` va por RPC: la tabla tiene RLS con política de SELECT
      // nada más, así que el update directo devolvía 200 sin tocar una fila. En
      // 185 documentos, `panel_edited_by` estaba en cero — no guardó nunca.
      const { error } = doc._kind === 'extra'
        ? await supabase.from('del_client_extra_docs')
            .update({ html, updated_at: new Date().toISOString() }).eq('id', doc.id)
        : await supabase.rpc('client_doc_save_panel', {
            p_id: doc.id, p_html: html, p_text: htmlToText(html), p_by: by,
          });
      // Y se mira el error: antes ni se esperaba la promesa.
      if (error) window.alert('No pude guardar el documento: ' + (error.message || ''));

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
    if (doc._system) return; // el resumen de la venta es del sistema
    if (!window.confirm(`¿Borrar el documento "${doc.title}"? No se puede deshacer.`)) return;
    setClientDocs((prev) => prev.filter(d => d.id !== doc.id));
    if (view === 'cliente:' + doc.id) setView('del');
    await supabase.from('del_client_extra_docs').delete().eq('id', doc.id);
  };

  // ── GUÍAS GLOBALES: páginas del sistema que aparecen en TODOS los DEL de
  //    TODOS los clientes (guías de grabación). Se editan acá; el portal las
  //    muestra nativas al cliente (tabla del_guias_globales).
  const [guias, setGuias] = useState([]);
  useEffect(() => {
    let alive = true;
    sbFetch('del_guias_globales?select=id,title,html,text,orden,activo&order=orden.asc,created_at.asc')
      .then((rows) => { if (alive) setGuias(Array.isArray(rows) ? rows : []); })
      .catch(() => { if (alive) setGuias([]); });
    return () => { alive = false; };
  }, []);
  const guiaTimer = useRef(null);
  const saveGuia = (g, html) => {
    setGuias((prev) => prev.map(x => x.id === g.id ? { ...x, html } : x));
    clearTimeout(guiaTimer.current);
    guiaTimer.current = setTimeout(() => {
      supabase.from('del_guias_globales')
        .update({ html, text: htmlToText(html), updated_at: new Date().toISOString() }).eq('id', g.id);
    }, 900);
  };
  const crearGuia = async () => {
    const title = window.prompt('Nombre de la guía (la ven TODOS los clientes):', 'Guía nueva');
    if (!title || !title.trim()) return;
    const { data, error } = await supabase.from('del_guias_globales')
      .insert({ title: title.trim(), html: '', text: '', orden: guias.length + 1, created_by: by }).select().single();
    if (error) { window.alert('No pude crear la guía: ' + (error.message || '')); return; }
    setGuias((prev) => [...prev, data]);
    setView('guia:' + data.id); setDocEditing(true);
  };
  const borrarGuia = async (g) => {
    if (!window.confirm(`¿Borrar la guía "${g.title}" para TODOS los clientes? No se puede deshacer.`)) return;
    setGuias((prev) => prev.filter(x => x.id !== g.id));
    if (view === 'guia:' + g.id) setView('del');
    await supabase.from('del_guias_globales').delete().eq('id', g.id);
  };

  // ── Paridad guías/docs con las pestañas del DEL: renombrar, PDF y compartir ──
  const renombrarGuia = async (g, title) => {
    const t = (title || '').trim(); if (!t || t === g.title) return;
    setGuias(prev => prev.map(x => x.id === g.id ? { ...x, title: t } : x));
    await supabase.from('del_guias_globales').update({ title: t }).eq('id', g.id);
  };
  const renombrarClientDoc = async (doc, title) => {
    const t = (title || '').trim(); if (!t || t === doc.title) return;
    setClientDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: t } : d));
    const { error } = doc._kind === 'extra'
      ? await supabase.from('del_client_extra_docs').update({ title: t }).eq('id', doc.id)
      : await supabase.from('client_brain_docs').update({ title: t, panel_edited_by: by, panel_edited_at: new Date().toISOString() }).eq('id', doc.id);
    if (error) {
      setClientDocs(prev => prev.map(d => d.id === doc.id ? { ...d, title: doc.title } : d));
      window.alert('No se pudo cambiar el nombre: ' + (error.message || ''));
    }
  };

  // PDF de UNA página suelta (guía o documento del cliente): mismo molde que el DEL.
  const descargarPdfPagina = (titulo, html, texto) => {
    const escapa = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const inner = `<h2 class="pdf-sec">${escapa(titulo || 'Documento')}</h2>` +
      ((html || '').trim() ? sanitizeDelHtml(html) : `<p style="white-space:pre-wrap">${escapa(texto || '')}</p>`);
    let css = '';
    try {
      css = [...document.styleSheets]
        .flatMap((ss) => { try { return [...ss.cssRules].map((r) => r.cssText); } catch { return []; } })
        .join('\n');
    } catch { /* hoja externa */ }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>${escapa(titulo || 'Documento')}</title><style>${css}</style><style>
      html,body{background:#fff!important;margin:0;padding:0}
      body{padding:28px 34px;font-family:Inter,system-ui,sans-serif;color:#1A1D26}
      .pdf-doc{max-width:800px;margin:0 auto;font-size:13.5px;line-height:1.62}
      img{max-width:100%!important;height:auto}
      .pdf-sec{font-size:17px;font-weight:800;color:#111827;margin:10px 0 8px;letter-spacing:-.01em}
    </style></head><body><div class="pdf-doc del-rich">${inner}</div></body></html>`);
    d.close();
    const listo = () => {
      Promise.all([...d.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))))
        .then(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 60000); });
    };
    if (d.readyState === 'complete') listo(); else f.onload = listo;
  };

  // Compartir una página suelta: link público de SOLO LECTURA (share_get kind 'pagina').
  const [sharePgOpen, setSharePgOpen] = useState(false);
  const [sharePgLinks, setSharePgLinks] = useState(null);
  const [sharePgBusy, setSharePgBusy] = useState(false);
  const [copiedPgTok, setCopiedPgTok] = useState(null);
  useEffect(() => { setSharePgOpen(false); }, [view]);
  const sharePgCtx = () => {
    if (view.startsWith('guia:')) { const g = guias.find(x => 'guia:' + x.id === view); return g ? { kind: 'guia', id: g.id, label: g.title } : null; }
    if (view.startsWith('cliente:')) {
      const d = clientDocs.find(x => 'cliente:' + x.id === view);
      return d ? { kind: d._kind === 'extra' ? 'doc_extra' : 'doc_brain', id: d.id, label: d.title } : null;
    }
    return null;
  };
  const cargarSharePg = async () => {
    const ctx = sharePgCtx(); if (!ctx) return;
    try {
      const { data, error } = await supabase.rpc('share_link_list', { p: { kind: ctx.kind, doc_id: String(ctx.id) } });
      if (error) throw error;
      setSharePgLinks(Array.isArray(data) ? data : []);
    } catch { setSharePgLinks([]); }
  };
  const abrirSharePg = () => { setSharePgOpen(o => !o); if (!sharePgOpen) { setSharePgLinks(null); cargarSharePg(); } };
  const crearSharePg = async () => {
    const ctx = sharePgCtx(); if (!ctx) return;
    setSharePgBusy(true);
    try {
      const { data, error } = await supabase.rpc('share_link_create', { p: { kind: ctx.kind, doc_id: String(ctx.id), client_id: cid || null, label: ctx.label, created_by: by } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el link');
      if (data.token) { copyClip(urlShare(data.token)); setCopiedPgTok(data.token); setTimeout(() => setCopiedPgTok(null), 1800); }
      await cargarSharePg();
    } catch (e) { window.alert('No pude crear el link: ' + (e?.message || e)); }
    setSharePgBusy(false);
  };
  const revocarSharePg = async (id) => {
    try { await supabase.rpc('share_link_revoke', { p_id: id }); } catch { /* */ }
    cargarSharePg();
  };
  // Botonera de las páginas sueltas (guías y docs del cliente): PDF + Compartir.
  const accionesPagina = (titulo, html, texto) => (
    <>
      <button onClick={() => descargarPdfPagina(titulo, html, texto)} title="Descargar esta página en PDF"
        className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11.5px] font-semibold cursor-pointer bg-white text-[#6B7280] border-[#E2E5EB] hover:text-[#2E69E0] hover:border-[#C7D2FE]">
        <FileText size={13} />PDF
      </button>
      <div className="relative">
        <button onClick={abrirSharePg} title="Compartir esta página (link de solo lectura)"
          className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11.5px] font-semibold cursor-pointer bg-white text-[#6B7280] border-[#E2E5EB] hover:text-[#2E69E0] hover:border-[#C7D2FE]">
          <Share2 size={13} />Compartir
        </button>
        {sharePgOpen && (
          <div className="absolute z-[60] mt-1 right-0 w-[320px] rounded-xl border border-[#E7EAF0] bg-white p-3 text-left" style={{ boxShadow: '0 12px 32px rgba(10,22,40,.16)' }}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9098A4]">Compartir esta página</span>
              <button onClick={() => setSharePgOpen(false)} className="text-[#C3C9D4] hover:text-[#6B7280] border-none bg-transparent cursor-pointer"><X size={14} /></button>
            </div>
            <div className="text-[11px] text-[#9098A4] mb-2 leading-snug">Cualquiera con el link la ve en solo lectura (sin cuenta).</div>
            <button onClick={crearSharePg} disabled={sharePgBusy}
              className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer disabled:opacity-60 mb-2" style={{ background: '#2E69E0' }}>
              {sharePgBusy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}Crear link y copiar
            </button>
            {sharePgLinks === null ? (
              <div className="py-2 text-center text-[11px] text-[#AEB4BF] flex items-center justify-center gap-1.5"><Loader2 size={12} className="animate-spin" />Cargando…</div>
            ) : sharePgLinks.length > 0 && (
              <div className="flex flex-col gap-1.5 border-t border-[#F1F3F7] pt-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#AEB4BF]">Links activos</span>
                {sharePgLinks.map(l => (
                  <div key={l.id} className="flex items-center gap-1.5 rounded-lg border border-[#EEF0F3] bg-[#FBFCFE] px-2 py-1.5">
                    <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-[#3F4653]">/compartir/{l.token}</span>
                    <button onClick={() => { copyClip(urlShare(l.token)); setCopiedPgTok(l.token); setTimeout(() => setCopiedPgTok(null), 1500); }} title="Copiar" className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#E2E8FA] bg-white cursor-pointer" style={{ color: copiedPgTok === l.token ? '#16A34A' : '#9CA3AF' }}>{copiedPgTok === l.token ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}</button>
                    <button onClick={() => revocarSharePg(l.id)} title="Revocar" className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#E2E5EB] bg-white text-[#C3C9D4] cursor-pointer hover:text-[#EF4444] hover:border-[#FECACA]"><Trash2 size={11} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );

  // ── Comentarios del DEL ──────────────────────────────────────────────────────
  const cargarComments = useCallback(async () => {
    try {
      // Mismo criterio que las secciones: SIEMPRE por doc_id, nunca por strategy_id.
      // Filtrar por la carpeta de Drive traía los comentarios de todos los funnels que
      // la comparten. Verificado que ningún comentario depende del camino viejo (0 de 1
      // sin doc_id), así que sacarlo no esconde nada.
      // del_comments no tiene client_id, así que acá no hay segunda barrera posible:
      // el aislamiento lo dan su RLS (is_team_member) y el doc_id.
      if (!docId) { setComments([]); return; }
      const rows = await sbFetch(`del_comments?select=id,section_id,body,quote,author_name,author_id,resolved,created_at,parent_id,guest_id&doc_id=eq.${docId}&order=created_at.asc`, { cache: 'no-store' });
      setComments(Array.isArray(rows) ? rows : []);
    } catch { /* si falla, sin comentarios */ }
  }, [docId]);
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
  // Dar OK a un comentario va por RPC, no por update directo: cuando se cierra el
  // ÚLTIMO comentario abierto del cliente, la pestaña vuelve sola a sus manos
  // (estado "revisión" y se le limpia el "ya lo revisé"). Es el paso que antes no
  // existía y dejaba las correcciones colgadas para siempre.
  const resolverComment = async (c) => {
    setComments((prev) => prev.map(x => x.id === c.id ? { ...x, resolved: !x.resolved } : x));
    const { data, error } = await supabase.rpc('del_comment_resolver', {
      p_comment_id: c.id, p_resolved: !c.resolved, p_by: by,
    });
    if (error || data?.ok === false) {   // la base mandó: volvemos atrás
      setComments((prev) => prev.map(x => x.id === c.id ? { ...x, resolved: c.resolved } : x));
      return;
    }
    emitir('comment', { action: 'upsert', row: { id: c.id, resolved: !c.resolved } });
    if (data?.rehabilitada) {
      setSecs((prev) => prev.map(x => x.id === c.section_id
        ? { ...x, grab_flujo: 'revision', grab_flujo_at: new Date().toISOString(),
            estado_seccion: 'terminado', accion_cliente: 'revisar' }
        : x));
      setAviso('Listo: se la devolvimos al cliente para que la revise.');
    }
  };

  // "Habilitar para revisión" a mano: cuando el equipo corrigió sin que hubiera
  // comentarios que cerrar, o quiere devolverla igual.
  const rehabilitar = async (s) => {
    const { data, error } = await supabase.rpc('del_seccion_rehabilitar', { p_section_id: s.id, p_by: by });
    if (error || data?.ok === false) { setAviso('No se pudo habilitar. Probá de nuevo.'); return; }
    setComments((prev) => prev.map(x => x.section_id === s.id && x.portal_client_id ? { ...x, resolved: true } : x));
    setSecs((prev) => prev.map(x => x.id === s.id
      ? { ...x, grab_flujo: 'revision', grab_flujo_at: new Date().toISOString(),
          estado_seccion: 'terminado', accion_cliente: 'revisar' }
      : x));
    setAviso('Listo: se la devolvimos al cliente para que la revise.');
  };
  const borrarComment = async (c) => {
    // Al borrar un comentario padre, sus respuestas caen con él (FK ON DELETE CASCADE en la base).
    setComments((prev) => prev.filter(x => x.id !== c.id && x.parent_id !== c.id));
    await supabase.from('del_comments').delete().eq('id', c.id);
    emitir('comment', { action: 'delete', id: c.id });
  };
  // Responder a un comentario (hilo): la respuesta hereda la sección del padre.
  const responder = async (parent) => {
    const body = (replyDraft[parent.id] || '').trim();
    if (!body) return;
    setReplyDraft(d => ({ ...d, [parent.id]: '' }));
    const sec = secs?.find(x => x.id === parent.section_id);
    const tempId = 'tmp_' + Date.now();
    setComments(prev => [...prev, { id: tempId, section_id: parent.section_id, parent_id: parent.id, body, author_name: myName, author_id: by, resolved: false, created_at: new Date().toISOString() }]);
    const { data, error } = await supabase.from('del_comments').insert({
      section_id: parent.section_id, doc_id: sec?.doc_id, strategy_id: strategyId,
      parent_id: parent.id, author_id: by, author_name: myName, body,
    }).select().single();
    if (error) { setComments(prev => prev.filter(c => c.id !== tempId)); window.alert('No pude guardar la respuesta: ' + (error.message || error.code || '')); return; }
    setComments(prev => prev.map(c => c.id === tempId ? data : c));
    emitir('comment', { action: 'upsert', row: data });
  };
  // Comentarios por sección (solo de primer nivel: las respuestas no cuentan como notas nuevas).
  const commentsBySection = useMemo(() => {
    const m = {};
    for (const c of comments) if (!c.parent_id) (m[c.section_id] ||= []).push(c);
    return m;
  }, [comments]);
  // Hilos: comentarios de primer nivel + sus respuestas agrupadas por parent_id.
  const topComments = useMemo(() => comments.filter(c => !c.parent_id), [comments]);
  const repliesByParent = useMemo(() => {
    const m = {};
    for (const c of comments) if (c.parent_id) (m[c.parent_id] ||= []).push(c);
    for (const k in m) m[k].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return m;
  }, [comments]);

  // Marcar una frase muestra el botón flotante para comentarla.
  //
  // La selección solo lo MUESTRA: nunca lo esconde. El navegador colapsa la
  // selección apenas se apoya el mouse en cualquier lado (el propio botón
  // incluido), así que esconderlo ahí lo hacía desaparecer justo al ir a
  // apretarlo. Se esconde a propósito: al abrir la caja, al tocar fuera o con Esc.
  // Lo marcado NO va al estado de React: cada guardado redibuja el documento, y
  // redibujar el documento le suelta la selección al navegador. Va en un `ref` y
  // el botón se mueve/enciende escribiéndole el estilo directo al elemento.
  const selRef = useRef(null);     // { quote, sectionId, top, margenIzq }
  const btnRef = useRef(null);

  const pintarBoton = () => {
    const el = btnRef.current;
    if (!el) return;
    const s = selRef.current;
    if (!s) { el.style.display = 'none'; return; }
    const vw = window.innerWidth; const vh = window.innerHeight;
    // Al MARGEN de la hoja (como Google Docs), a la altura de lo marcado. Nunca
    // encima del texto: si lo tapa, hay que esquivarlo para volver a marcar.
    const cabe = s.margenIzq && s.margenIzq < vw - 130;
    el.style.display = composer ? 'none' : 'inline-flex';
    if (cabe) {
      el.style.top = `${Math.min(Math.max(56, s.top - 6), vh - 60)}px`;
      el.style.left = `${s.margenIzq}px`;
      el.style.bottom = 'auto'; el.style.right = 'auto';
    } else {
      el.style.top = 'auto'; el.style.left = 'auto';
      el.style.bottom = '18px'; el.style.right = '18px';
    }
  };

  const onDocMouseUp = () => {
    const sel = window.getSelection();
    const text = sel ? sel.toString().trim() : '';
    if (!sel || sel.isCollapsed || text.length < 2 || !sel.rangeCount) return;
    let node = sel.anchorNode;
    while (node && node.nodeType !== 1) node = node.parentNode;
    const secEl = node?.closest?.('[data-secid]');
    if (!secEl) return;
    const rect = sel.getRangeAt(0).getBoundingClientRect();
    if (!rect || (!rect.width && !rect.height)) return;
    const hoja = secEl.getBoundingClientRect();
    selRef.current = {
      quote: text.slice(0, 300), sectionId: secEl.getAttribute('data-secid'),
      top: rect.top, margenIzq: hoja.right + 12,
    };
    pintarBoton();
  };

  const apagarBoton = () => { selRef.current = null; pintarBoton(); };

  // Cambiar de pestaña o de vista deja el botón colgado: se apaga.
  useEffect(() => { apagarBoton(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [view, activa]);

  // Soltar el mouse dentro del documento sin dejar nada marcado = "estoy leyendo":
  // ahí sí se apaga. Nunca se apaga solo por quedarse sin selección.
  const onDocPointerUp = () => {
    setTimeout(() => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.toString().trim().length < 2) apagarBoton();
      else onDocMouseUp();
    }, 120);
  };

  // Al apretar "Comentar" se relee la selección real: si marcaste mal y volviste a
  // marcar, manda lo último, no lo que estaba guardado.
  const abrirComentario = () => {
    const sel = window.getSelection();
    const texto = sel ? sel.toString().trim() : '';
    let elegido = selRef.current;
    if (texto.length >= 2 && sel?.rangeCount) {
      let node = sel.anchorNode;
      while (node && node.nodeType !== 1) node = node.parentNode;
      const secEl = node?.closest?.('[data-secid]');
      if (secEl) elegido = { ...selRef.current, quote: texto.slice(0, 300), sectionId: secEl.getAttribute('data-secid') };
    }
    if (!elegido?.sectionId) return;
    const pos = { top: elegido.top, left: elegido.margenIzq };
    apagarBoton();
    setComposer({ quote: elegido.quote, sectionId: elegido.sectionId, ...pos });
    setDraft('');
  };

  // En el teléfono/tablet los tiradores de la selección son del sistema y no
  // disparan mouseup: `selectionchange` es el único que llega siempre.
  useEffect(() => {
    let t = null;
    const onSel = () => { clearTimeout(t); t = setTimeout(onDocMouseUp, 150); };
    document.addEventListener('selectionchange', onSel);
    return () => { clearTimeout(t); document.removeEventListener('selectionchange', onSel); };
  }); // sin deps: onDocMouseUp se reconstruye en cada render

  useEffect(() => {
    const esc = (e) => {
      if (e.key !== 'Escape' || !selRef.current) return;
      apagarBoton();
      window.getSelection()?.removeAllRanges?.();
    };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  });

  // Guardar el comentario anclado a la frase (optimista, con reversión).
  const comentarQuote = async () => {
    const body = draft.trim();
    if (!body || !composer) return;
    const comp = composer;
    const sec = secs?.find(x => x.id === comp.sectionId);
    setDraft(''); setComposer(null); apagarBoton();
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

  // Resalta en el html las frases comentadas.
  //
  // Buscar la frase EXACTA casi nunca funcionaba: lo que devuelve el navegador al
  // marcar trae los espacios normalizados, y en el medio suele haber etiquetas
  // (<strong>, <em>, <br>) que la parten. Resultado: comentario sin su marca.
  // Ahora se busca palabra por palabra, tolerando espacios y etiquetas inline; si
  // la selección cruzó párrafos, se marca al menos el primer renglón.
  const highlightHtml = useCallback((html, cmts) => {
    const rxEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const ENTRE = '(?:\\s|&nbsp;|<\\/?(?:strong|em|b|i|u|span|small|mark|br)\\b[^>]*>)+';
    const rxDe = (q, max) => {
      const w = q.trim().split(/\s+/).filter(Boolean).map(rxEsc);
      const usar = max ? w.slice(0, max) : w;
      if (!usar.length) return null;
      try { return new RegExp('(?![^<]*>)(' + usar.join(ENTRE) + ')'); } catch { return null; }
    };
    let out = html || '';
    for (const c of cmts) {
      const q = (c.quote || '').trim();
      if (q.length < 2 || c.resolved) continue;
      const primer = q.split(/\n/).map(s => s.trim()).find(s => s.length >= 2);
      const cands = primer && primer !== q ? [q, primer] : [q];
      let hecho = false;
      for (const cand of cands) {
        for (const n of [null, 14, 7, 4]) {
          const re = rxDe(cand, n);
          if (!re || !re.test(out)) continue;
          out = out.replace(re, `<mark data-cmt="${c.id}" class="del-cmt">$1</mark>`);
          hecho = true; break;
        }
        if (hecho) break;
      }
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
      document.getElementById('sec-' + c.section_id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    setTimeout(() => setFlashCmt(null), 1800);
  };

  // El botón de imagen del DEL abre las imágenes de Recursos del funnel (en vez de
  // pedir un link a mano) y la elegida se inserta en el texto. Conecta Recursos ↔ DEL.
  const abrirSelectorImagen = useCallback((insertHTML) => {
    setImgPicker({ insert: insertHTML });
    setImgList(null);
    setImgCat(null);   // arranca en la primera carpeta (se fija al cargar)
    (async () => {
      try {
        // Dos fuentes: las imágenes del funnel (strategy_id) Y las del cliente
        // (scope cliente, strategy_id null → Fotos de Autoridad, Estilo de vida,
        // Branding, Productos, Empresa, Stock…). Antes solo se veían las del funnel.
        const parts = [];
        if (strategyId) parts.push({ scope: 'funnel', q: `funnel_resources?select=id,title,public_url,bucket_key&strategy_id=eq.${encodeURIComponent(strategyId)}&kind=eq.image&order=created_at.desc` });
        if (cid) parts.push({ scope: 'client', q: `funnel_resources?select=id,title,public_url,bucket_key&client_id=eq.${encodeURIComponent(cid)}&strategy_id=is.null&kind=eq.image&order=created_at.desc` });
        const results = await Promise.all(parts.map(p =>
          sbFetch(p.q).then(rows => (Array.isArray(rows) ? rows : []).map(r => ({ ...r, _scope: p.scope }))).catch(() => [])
        ));
        setImgList(results.flat());
      } catch { setImgList([]); }
    })();
  }, [strategyId, cid]);

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

  // Para cada categoría que versiona: en qué versiones tiene secciones propias.
  const kindVersionsMap = useMemo(() => {
    const m = {};
    for (const s of (secs || [])) if (VERSIONABLE_KINDS.includes(s.kind)) (m[s.kind] || (m[s.kind] = new Set())).add(s.version || 1);
    return m;
  }, [secs]);

  // Las secciones agrupadas por categoría, en orden canónico. De acá salen los grupos de
  // color del índice y las franjas del documento.
  // Una categoría que versiona muestra la versión activa SI la cambió; si no, cae a la V1
  // (compartida). Así una V2 de "solo landing" muestra el VSL/anuncios de la V1 sin duplicarlos.
  // El avatar y la estrategia se ven siempre. Se incluyen SIEMPRE las estándar (aunque vacías).
  const groups = useMemo(() => {
    const byKind = {};
    for (const s of sorted) {
      if (VERSIONABLE_KINDS.includes(s.kind)) {
        const has = kindVersionsMap[s.kind];
        const target = (has && has.has(verActiva)) ? verActiva : 1;
        if ((s.version || 1) !== target) continue;
      }
      (byKind[s.kind] || (byKind[s.kind] = [])).push(s);
    }
    // 'estrategia' SIEMPRE presente: es el encabezado del DEL (bloque del funnel
    // arriba + la estrategia real escrita abajo), aunque todavía esté vacía.
    const kinds = Array.from(new Set(['estrategia', ...STANDARD_KINDS, ...sorted.map(s => s.kind)]));
    kinds.sort((a, b) => kindRank(a) - kindRank(b));
    return kinds.map(k => ({ kind: k, items: byKind[k] || [] }));
  }, [sorted, verActiva, kindVersionsMap]);

  const irA = (id) => {
    setActiva(id);
    setView('del');
    // Si veníamos de otra vista, el documento recién se monta: esperamos un tick.
    // scrollIntoView es robusto (no depende del offsetParent) y respeta scroll-margin-top.
    setTimeout(() => {
      document.getElementById('sec-' + id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        setTimeout(() => { document.getElementById('sec-' + newId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 80);
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

  // "Para grabar": marca la sección (VSL/anuncios) para que aparezca en el
  // PORTAL DEL CLIENTE como guion a grabar. Antes se marcaba por SQL.
  // Acción del cliente + estado por pestaña (reemplazan el tilde 🎬):
  // "Grabarse" + "Terminado" ⇒ para_grabar (compatibilidad con el portal).
  // Va por RPC, no por `supabase.from('del_sections').update(...)`. La tabla tiene
  // RLS con política de SELECT nada más, pero el rol authenticated conserva el
  // GRANT de UPDATE: el update se ejecuta, RLS no deja pasar ninguna fila y
  // PostgREST responde 200 sin error. Escribiendo derecho a la tabla esto no
  // guardaba nada y nadie se enteraba hasta recargar la página.
  const setSeccionMeta = async (s, cambios) => {
    const accion = cambios.accion ?? s.accion_cliente ?? 'solo_equipo';
    const estado = cambios.estado ?? s.estado_seccion ?? 'en_construccion';
    const paraGrabar = esGrabable(s.kind) && accion === 'grabarse' && estado === 'terminado';
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, accion_cliente: accion, estado_seccion: estado, para_grabar: paraGrabar } : x));
    const { error } = await supabase.rpc('del_section_set_meta', {
      p_id: s.id, p_accion: accion, p_estado: estado, p_para_grabar: paraGrabar,
      p_orden: s.orden_grabacion ?? s.ord ?? null, p_by: by,
    });
    if (error) { window.alert('No pude guardarlo: ' + error.message); await cargar(); return; }
    emitir('section', { row: { id: s.id, accion_cliente: accion, estado_seccion: estado, para_grabar: paraGrabar } });
  };

  const toggleParaGrabar = async (s) => {
    const next = !s.para_grabar;
    setSecs((prev) => prev.map(x => x.id === s.id ? { ...x, para_grabar: next } : x));
    const { error } = await supabase.rpc('del_section_set_meta', {
      p_id: s.id, p_para_grabar: next,
      p_orden: s.orden_grabacion ?? s.ord ?? null, p_by: by,
    });
    if (error) { window.alert('No pude marcarla: ' + error.message); await cargar(); return; }
    emitir('section', { row: { id: s.id, para_grabar: next } });
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

  // Mover una sección a OTRO embudo (otro DEL) del MISMO cliente, cayendo en la
  // categoría elegida. La sección desaparece de este DEL y aparece en el de destino.
  const moverAEmbudo = async (id, targetDocId, kind) => {
    setMoveMenu(null); setMoveTo(null);
    const s = secs.find(x => x.id === id);
    if (!s || !targetDocId || targetDocId === resolvedDoc) return;
    setSecs((prev) => prev.filter(x => x.id !== id)); // se va de este DEL
    const { error } = await supabase.rpc('del_section_move_doc', {
      p_id: id, p_target_doc_id: targetDocId, p_kind: kind || s.kind, p_by: by,
    });
    if (error) { window.alert('No pude mover a otro embudo: ' + error.message); await cargar(); return; }
    emitir('section-add', {}); // que el DEL destino (y este) se refresquen
  };

  // Importar de Drive a los recursos (one-shot): una carpeta entera o un archivo suelto.
  // `folderUrl` se llama así por historia (antes solo aceptaba carpetas); la edge fn
  // importar-drive resuelve sola si el link es carpeta o archivo.
  const ejecutarImportDrive = async () => {
    const url = (importUrl || '').trim();
    if (!url) return;
    const opt = IMPORT_OPT(importBucket);
    const esFunnel = opt?.scope === 'funnel';
    if (esFunnel && !strategyId) { setImportRes({ error: 'Este funnel todavía no tiene su carpeta de recursos. Elegí una carpeta general o creá el funnel primero.' }); return; }
    setImportBusy(true); setImportRes(null);
    try {
      const { data, error } = await supabase.functions.invoke('importar-drive', {
        body: { folderUrl: url, clientId, strategyId: esFunnel ? strategyId : null, bucketKey: importBucket },
      });
      if (error) setImportRes({ error: 'No se pudo importar. Revisá el link y probá de nuevo.' });
      else if (data && data.ok === false) setImportRes({ error: data.error || 'No se pudo importar.' });
      else setImportRes(data || { ok: true });
    } catch (e) {
      setImportRes({ error: String(e?.message || e) });
    } finally { setImportBusy(false); }
  };

  // ── Versionado a nivel funnel ─────────────────────────────────────────────────
  // "+" abre un modal que pregunta qué cambia en la versión nueva: solo las páginas
  // (VSL/anuncios se comparten, sin carpetas nuevas) o un relanzamiento completo
  // (VSL/anuncios nuevos → se preparan las carpetas de grabación de los avatares elegidos).
  const nombresAvatar = useMemo(() => (secs || []).filter(s => s.kind === 'avatares').map(s => s.title), [secs]);
  const agregarVersion = () => {
    if (!resolvedDoc) { window.alert('Este funnel todavía no tiene un DEL propio donde crear versiones.'); return; }
    setVerModal({ scope: 'paginas', avatars: new Set() });
  };
  const confirmarVersion = async () => {
    const scope = verModal?.scope || 'paginas';
    const chosen = [...(verModal?.avatars || [])];
    setVerModal(null);
    const { data, error } = await supabase.rpc('del_version_add', { p_doc_id: resolvedDoc, p_by: by, p_scope: scope });
    if (error) { window.alert('No pude agregar la versión: ' + error.message); return; }
    await cargar();
    emitir('section-add', {});
    if (data) {
      setActiveVersion(data); setModo('editar'); setView('del');
      // Relanzamiento completo → los avatares elegidos suman la versión (carpetas grabación/edición V2).
      if (scope === 'completa') onVersionComplete?.(data, chosen.length ? chosen : nombresAvatar);
    }
  };

  // Borrar una versión ENTERA: sus secciones del DEL + las grabaciones (videos crudos).
  // Las ediciones / videos editados NO se borran (el trabajo terminado se conserva).
  const confirmarBorrarVersion = async () => {
    const v = delVerModal?.v;
    setDelVerModal(null);
    if (!v || v <= 1) return;
    // ¿Quedan ediciones de esta versión? Si sí, la versión sigue existiendo en Recursos para ellas.
    let tieneEdiciones = false;
    try {
      const ed = await sbFetch(`funnel_resources?select=id&strategy_id=eq.${encodeURIComponent(strategyId)}&version=eq.${v}&bucket_key=in.(ad_edit,vsl_edit)&limit=1`);
      tieneEdiciones = Array.isArray(ed) && ed.length > 0;
    } catch { /* si falla el chequeo, seguimos */ }
    const { error } = await supabase.rpc('del_version_delete', { p_doc_id: resolvedDoc, p_version: v, p_by: by });
    if (error) { window.alert('No pude borrar la versión: ' + error.message); return; }
    // Borrar SOLO las grabaciones (videos crudos) de esa versión; las ediciones quedan intactas.
    //
    // Esto borraba por strategy_id — la CARPETA de Drive — así que en un cliente con varios
    // funnels en la misma carpeta se llevaba las grabaciones de funnels que no eran este.
    // Ahora:
    //   · los anuncios (ad_rec) se acotan a los avatares DE ESTE funnel;
    //   · las del VSL (vsl_rec) no tienen avatar, así que no hay forma de saber de qué
    //     funnel son: solo se borran si este funnel es el único de la carpeta.
    const míos = avatarsFunnel.map((a) => a.id).filter(Boolean);
    if (míos.length) {
      await supabase.from('funnel_resources').delete()
        .eq('client_id', clientId).eq('strategy_id', strategyId).eq('version', v)
        .eq('bucket_key', 'ad_rec').in('avatar_id', míos);
    }
    if (funnelsEnCarpeta <= 1) {
      await supabase.from('funnel_resources').delete()
        .eq('client_id', clientId).eq('strategy_id', strategyId).eq('version', v)
        .in('bucket_key', ['ad_rec', 'vsl_rec']).is('avatar_id', null);
    }
    setActiveVersion(null);
    await cargar();
    emitir('section-add', {});
    onVersionDelete?.(v, tieneEdiciones);
  };

  // Mobile: el menú de la izquierda vive en un cajón lateral (tres rayitas ☰).
  // Elegir una sección / vista / versión lo cierra solo.
  // OJO: estos hooks van ANTES de los returns tempranos de abajo (regla de React:
  // los hooks corren siempre, en el mismo orden — si no, pantalla en blanco).
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(false);
  useEffect(() => { setNavOpen(false); }, [view, activa, verActiva]);

  // Ocultar/mostrar el menú lateral del DEL (queda guardada la preferencia).
  const [sidebarOculta, setSidebarOculta] = useState(() => localStorage.getItem('del_menu_oculto') === '1');
  const toggleSidebar = () => setSidebarOculta((v) => {
    try { localStorage.setItem('del_menu_oculto', v ? '0' : '1'); } catch { /* privado */ }
    return !v;
  });

  // Lectura cómoda: zoom del documento (solo modo Leer).
  const [zoomDoc, setZoomDoc] = useState(() => {
    const v = parseInt(localStorage.getItem('del_zoom_lectura') || '100', 10);
    return Number.isFinite(v) ? Math.min(160, Math.max(80, v)) : 100;
  });
  const cambiarZoomDoc = (d) => setZoomDoc((z) => {
    const n = Math.min(160, Math.max(80, z + d));
    try { localStorage.setItem('del_zoom_lectura', String(n)); } catch { /* privado */ }
    return n;
  });

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

  // ── Compartir secciones del DEL con externos (link para comentar) ──
  const urlShare = (tok) => `${publicOrigin()}/compartir/${tok}`;
  const copyClip = (v) => { try { navigator.clipboard?.writeText(v); } catch { /* */ } };
  const cargarDelShares = async () => {
    if (!resolvedDoc) { setShareDelLinks([]); return; }
    try {
      const { data, error } = await supabase.rpc('share_link_list', { p: { kind: 'del', doc_id: resolvedDoc } });
      if (error) throw error;
      setShareDelLinks(Array.isArray(data) ? data : []);
    } catch { setShareDelLinks([]); }
  };
  const abrirShareDel = () => { const next = !shareDelOpen; setShareDelOpen(next); if (next) { setShareDelLinks(null); setShareSel(new Set()); cargarDelShares(); } };
  const toggleShareSec = (id) => setShareSel(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const crearDelShare = async () => {
    if (!shareSel.size || !resolvedDoc) return;
    setShareDelBusy(true);
    try {
      const { data, error } = await supabase.rpc('share_link_create', { p: { kind: 'del', doc_id: resolvedDoc, strategy_id: strategyId || null, client_id: cid || null, section_ids: Array.from(shareSel), label: 'Comentarios del DEL', created_by: by } });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'No se pudo crear el link');
      if (data.token) { copyClip(urlShare(data.token)); setCopiedDelTok(data.token); setTimeout(() => setCopiedDelTok(null), 1800); }
      setShareSel(new Set());
      await cargarDelShares();
    } catch (e) { window.alert('No pude crear el link: ' + (e?.message || e)); }
    setShareDelBusy(false);
  };
  const copiarDelShare = (tok) => { copyClip(urlShare(tok)); setCopiedDelTok(tok); setTimeout(() => setCopiedDelTok(null), 1500); };
  const revocarDelShare = async (id) => { try { await supabase.rpc('share_link_revoke', { p_id: id }); } catch { /* */ } cargarDelShares(); };

  const editando = modo === 'editar';
  // Arma una copia imprimible del documento (todas las pestañas visibles, con los
  // estilos del panel) en un iframe oculto y abre el diálogo de impresión, donde se
  // elige "Guardar como PDF".
  const descargarPdfDel = () => {
    const escapa = (t) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
    let inner = '';
    for (const gr of groups) {
      if (!gr.items.length) continue;
      const gc = secOf(gr.kind);
      inner += `<div class="pdf-cat">${escapa(gc.label)}</div>`;
      for (const s of gr.items) {
        inner += `<h2 class="pdf-sec">${escapa(s.title || 'Sección')}</h2>`;
        inner += s.html ? sanitizeDelHtml(s.html) : `<p style="white-space:pre-wrap">${escapa(s.text || '')}</p>`;
      }
    }
    let css = '';
    try {
      css = [...document.styleSheets]
        .flatMap((ss) => { try { return [...ss.cssRules].map((r) => r.cssText); } catch { return []; } })
        .join('\n');
    } catch { /* hoja externa */ }
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;visibility:hidden';
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open();
    d.write(`<!doctype html><html><head><meta charset="utf-8"><title>Documento del DEL · V${verActiva}</title><style>${css}</style><style>
      html,body{background:#fff!important;margin:0;padding:0}
      body{padding:28px 34px;font-family:Inter,system-ui,sans-serif;color:#1A1D26}
      .pdf-doc{max-width:800px;margin:0 auto;font-size:13.5px;line-height:1.62}
      img{max-width:100%!important;height:auto}
      .pdf-cat{margin:22px 0 4px;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#6B7280;border-top:2px solid #E5E7EB;padding-top:12px}
      .pdf-cat:first-child{margin-top:0;border-top:0;padding-top:0}
      .pdf-sec{font-size:17px;font-weight:800;color:#111827;margin:10px 0 8px;letter-spacing:-.01em}
    </style></head><body><div class="pdf-doc del-rich">${inner}</div></body></html>`);
    d.close();
    const listo = () => {
      Promise.all([...d.images].map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))))
        .then(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch { /* */ } setTimeout(() => f.remove(), 60000); });
    };
    if (d.readyState === 'complete') listo(); else f.onload = listo;
  };
  // La columna de comentarios (solo lectura) aparece SOLO si hay comentarios: si no,
  // la hoja gana esos ~300px y queda protagonista, tipo Google Docs.
  const showComments = view === 'del' && !editando && comments.length > 0;

  // Ojo: este contenedor NO esconde el botón "Comentar" con onMouseDown. Eso lo
  // borraba al empezar a marcar y, sobre todo, justo al ir a apretarlo. De
  // esconderlo se encarga el listener de "tocaste fuera", que respeta el botón.
  return (
    <div ref={scrollRef} className="h-full overflow-y-auto" style={{ background: '#FBFCFD' }}>
      <style>{`
        .del-rich mark.del-cmt{background:#FEF3C7;border-bottom:2px solid #EAB308;border-radius:2px;padding:0 1px;cursor:pointer;transition:background .2s,box-shadow .2s}
        .del-rich mark.del-cmt.is-active{background:#FDBA74;box-shadow:0 0 0 3px rgba(249,115,22,.45);border-bottom-color:#EA580C;animation:delCmtPulse 1.8s ease-out}
        @keyframes delCmtPulse{0%,55%{background:#FB923C}100%{background:#FDBA74}}
        /* Latido del botón "Comentar": avisa que hay algo marcado, sin taparlo. */
        @keyframes delLate{0%,100%{box-shadow:0 0 0 0 rgba(26,29,38,.35)}50%{box-shadow:0 0 0 7px rgba(26,29,38,0)}}
        @media (prefers-reduced-motion:reduce){@keyframes delLate{0%,100%{box-shadow:none}}}
      `}</style>
      <div className="grid gap-5 items-start mx-auto py-5 px-6" style={isMobile
        ? { maxWidth: '100%', gridTemplateColumns: 'minmax(0,1fr)', padding: '10px 10px 48px', gap: 12 }
        : { maxWidth: view === 'del' ? (editando ? 1520 : (showComments ? 1640 : 1360)) : 1180, gridTemplateColumns: (() => {
            const menu = sidebarOculta ? '' : (view === 'del' ? 'minmax(0,190px) ' : 'minmax(0,215px) ');
            return view === 'del' && !editando && showComments ? `${menu}minmax(0,1fr) 300px` : `${menu}minmax(0,1fr)`;
          })() }}>

        {/* El menú del DEL (maqueta): ESTE FUNNEL (las secciones del documento) · las dos
            pestañas Configuración/Recursos · y abajo los documentos DEL CLIENTE, que
            comparten todos sus funnels. */}
        {/* En mobile el menú vive en un cajón lateral que se abre con las tres rayitas ☰;
            en desktop es la columna fija de siempre. Mismo contenido en los dos casos. */}
        <div className={isMobile ? (navOpen ? 'fixed inset-0 z-[75] flex' : 'hidden') : (sidebarOculta ? 'hidden' : 'contents')}
          style={isMobile && navOpen ? { background: 'rgba(15,23,42,.45)' } : undefined}
          onMouseDown={isMobile ? (e) => { if (e.target === e.currentTarget) setNavOpen(false); } : undefined}>
        <nav className={isMobile
            ? 'flex flex-col gap-0.5 p-2 bg-white h-full w-[300px] max-w-[86vw] overflow-y-auto'
            : 'sticky top-0 flex flex-col gap-0.5 p-2 rounded-xl border border-[#E7EAF0] bg-white max-h-[calc(100vh-120px)] overflow-y-auto'}
          style={isMobile ? { boxShadow: '8px 0 30px rgba(10,22,40,.25)' } : { boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>
          {isMobile && (
            <div className="flex items-center justify-between px-2 pt-1 pb-2 border-b border-[#F1F3F7] mb-1">
              <span className="text-[12px] font-bold text-[#1A1D26]">Menú del DEL</span>
              <button onClick={() => setNavOpen(false)} aria-label="Cerrar" className="w-8 h-8 inline-flex items-center justify-center rounded-lg border border-[#E7EAF0] bg-white text-[#6B7280] cursor-pointer"><X size={15} /></button>
            </div>
          )}
          <div className="px-2 pt-1 pb-1.5">
            {/* Fila 1: rótulo + botón de ocultar el menú. Fila 2 (abajo): las versiones. */}
            <div className="flex items-center justify-between gap-2">
              <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF] whitespace-nowrap">Este funnel</span>
              {!isMobile && (
                <button onClick={toggleSidebar} title="Ocultar este menú (más espacio para el documento)"
                  className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#E7EAF0] bg-white text-[#9098A4] cursor-pointer hover:text-[#1A1D26] hover:border-[#C9D2E0] shrink-0">
                  <PanelLeftClose size={13} />
                </button>
              )}
            </div>
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
              {verActiva > 1 && (
                <button onClick={() => setDelVerModal({ v: verActiva, texto: '' })} title={`Borrar la Versión ${verActiva} entera`}
                  className="inline-flex items-center justify-center w-7 h-7 rounded-md border border-[#F3D0D0] text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] hover:border-[#FECACA] bg-transparent cursor-pointer">
                  <Trash2 size={12} />
                </button>
              )}
            </div>
          </div>
          {/* Estrategia PRIMERO (decisión de Matías): ya no es una vista aparte —
              es la primera categoría del documento, con el bloque del funnel como
              encabezado y la estrategia real escrita abajo. El botón lleva ahí.
              (El botón "DEL" se eliminó: no aportaba nada.) */}
          <button onClick={() => { setView('del'); scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' }); }}
            className="flex items-center gap-2 w-full py-2 px-2.5 rounded-[9px] text-left border-none cursor-pointer text-[12.5px] font-bold transition-colors"
            style={{ background: view === 'estrategia' ? '#ECFEFF' : 'transparent', color: view === 'estrategia' ? '#0891B2' : '#4B5563' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="shrink-0"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" fill="currentColor" /></svg>Estrategia
          </button>
          {/* Las secciones del documento, agrupadas por categoría con su color. */}
          {groups.map(gr => {
            const sc = secOf(gr.kind);
            const emptyCat = gr.items.length === 0;
            // Encabezado de CATEGORÍA (P9): se muestra arriba de su primera pestaña, sólo
            // cuando la categoría agrupa varias pestañas o tiene un nombre propio distinto
            // (ej. "Ventas" con "Playbook"). En el default (1 categoría = 1 pestaña con el
            // mismo nombre) no se muestra, así el menú se ve igual que antes.
            const cat = kindCat?.[gr.kind];
            const showCatHead = cat && cat.first && (cat.multi || cat.label !== sc.label);
            return (
              <div key={gr.kind} className="mb-0.5" style={emptyCat ? { opacity: 0.6 } : undefined}>
                {showCatHead && (
                  <div className="flex items-center gap-1.5 px-2 pt-3 pb-0.5">
                    <span className="text-[10px] font-extrabold tracking-[0.11em] uppercase" style={{ color: cat.color }}>{cat.label}</span>
                  </div>
                )}
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

          {/* Separador antes de las vistas especiales del funnel (Config / Recursos).
              La "Estrategia" ya no va acá: se movió arriba de todo (primera pestaña). */}
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
                  <span className="truncate flex-1 min-w-0">{d.title}</span>
                  {d._system && <span className="text-[8px] font-bold text-[#7C3AED] bg-[#F3EFFF] rounded px-1 shrink-0 uppercase tracking-wide">venta</span>}
                </button>
                {d._system
                  ? <span title="Resumen de la venta · documento del sistema (no se borra)" className="w-6 h-6 inline-flex items-center justify-center text-[#C3C9D4] shrink-0 mr-1"><Lock size={11} /></span>
                  : <button onClick={() => quitarClientDoc(d)} title={d._kind === 'extra' ? 'Borrar documento' : 'Quitar de este cliente'} className="opacity-0 group-hover/cd:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 mr-1"><X size={12} /></button>}
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
                    <Monitor size={12} className="text-[#9098A4] shrink-0" /><span className="truncate">{d.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* GUÍAS: páginas del sistema, iguales en TODOS los DEL de TODOS los
              clientes (las guías de grabación que ve el cliente en su portal). */}
          <div className="px-2 pt-3 pb-1.5">
            <span className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF]">Guías</span>
            <div className="text-[9.5px] text-[#C3C9D4] font-medium mt-0.5 normal-case tracking-normal">Iguales para todos los clientes; el cliente las ve en su portal</div>
          </div>
          {guias.map(g => {
            const on = view === 'guia:' + g.id;
            return (
              <div key={g.id} className="group/gg flex items-center gap-1 rounded-[9px]" style={{ background: on ? '#ECFEFF' : 'transparent' }}>
                <button onClick={() => setView('guia:' + g.id)}
                  className="flex items-center gap-2 flex-1 min-w-0 py-1.5 pl-2.5 pr-1 text-left border-none cursor-pointer text-[12px] font-semibold bg-transparent"
                  style={{ color: on ? '#0891B2' : '#6B7280' }}>
                  <HelpCircle size={13} className="shrink-0" style={{ color: '#0891B2' }} />
                  <span className="truncate flex-1 min-w-0">{g.title}</span>
                </button>
                <button onClick={() => borrarGuia(g)} title="Borrar la guía (para todos los clientes)" className="opacity-0 group-hover/gg:opacity-100 w-6 h-6 inline-flex items-center justify-center rounded-md text-[#C3C9D4] hover:text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer shrink-0 mr-1"><X size={12} /></button>
              </div>
            );
          })}
          <div className="px-1 mt-0.5">
            <button onClick={crearGuia}
              className="flex items-center gap-1.5 w-full py-1.5 px-1.5 rounded-[9px] border border-dashed border-[#D0D5DD] text-[11px] font-semibold text-[#9098A4] cursor-pointer hover:border-[#0891B2] hover:text-[#0891B2] bg-transparent">
              <Plus size={12} />Agregar guía
            </button>
          </div>
        </nav>
        </div>

        {/* En el celular la selección llega con el dedo: el touchend se revisa con un
            pequeño delay para que la selección termine de asentarse (igual que /compartir). */}
        <div className="min-w-0 flex flex-col gap-3 w-full" style={editando && view === 'del' ? { maxWidth: 1040, marginInline: 'auto' } : undefined} onPointerUp={view === 'del' ? onDocPointerUp : undefined}>
          {/* Tres rayitas para las vistas que no tienen barra propia (Estrategia, Config, Recursos, docs del cliente). */}
          {(isMobile || sidebarOculta) && view !== 'del' && (
            <div className="sticky top-0 z-10 py-1.5" style={{ background: '#FBFCFD' }}>
              <button onClick={() => (isMobile ? setNavOpen(true) : toggleSidebar())} className="inline-flex items-center gap-2 py-2 px-3 rounded-[10px] border border-[#E7EAF0] bg-white text-[12.5px] font-bold text-[#1A1D26] cursor-pointer">
                <Menu size={16} />Menú del DEL
              </button>
            </div>
          )}
          {view === 'del' && (<>
          {/* Barra Leer/Editar + (en editar) la BARRA ÚNICA de herramientas, ambas fijas
              arriba tipo Google Docs: la barra opera sobre la sección que tengas enfocada. */}
          <div className="sticky top-0 z-10 flex flex-col gap-2 pb-1" style={{ background: '#FBFCFD' }}>
          {/* Barra: leer vs editar + de dónde salió + link al Doc */}
          <div className="flex items-center gap-2.5 flex-wrap py-2 px-3 rounded-[10px] border border-[#E7EAF0] bg-white">
            {isMobile && (
              <button onClick={() => setNavOpen(true)} aria-label="Abrir el menú del DEL" title="Menú del DEL (secciones, versiones, documentos)"
                className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#E7EAF0] bg-white text-[#1A1D26] cursor-pointer shrink-0">
                <Menu size={17} />
              </button>
            )}
            {/* El botón de OCULTAR vive arriba del menú lateral; acá solo aparece el de
                VOLVER A MOSTRARLO cuando está oculto. */}
            {!isMobile && sidebarOculta && (
              <button onClick={toggleSidebar} title="Mostrar el menú del DEL"
                className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E7EAF0] bg-white text-[#6B7280] cursor-pointer hover:text-[#1A1D26] shrink-0">
                <PanelLeft size={15} />
              </button>
            )}
            <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
              <button onClick={() => setModo('leer')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
              <button onClick={() => setModo('editar')} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none transition-colors" style={editando ? { background: '#fff', color: '#7C3AED', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
            </div>
            <span className="inline-flex items-center gap-1 py-1 px-2.5 rounded-full text-[11px] font-bold shrink-0" style={{ background: '#EFEBFF', color: '#6D28D9' }} title="Estás viendo esta versión del funnel. Cambiá de versión en el menú de la izquierda.">Este funnel · V{verActiva}</span>
            <span className="text-[11px] text-[#9098A4]">{editando ? 'Los cambios se guardan solos. Este DEL pasa a vivir en el panel.' : 'Copia de lectura'}</span>
            {/* Lectura cómoda: zoom (en Leer y en Editar) + Descargar PDF */}
            <span className="inline-flex items-center gap-0.5 rounded-lg border border-[#E7EAF0] p-0.5" style={{ background: '#F7F8FA' }}>
              <button onClick={() => cambiarZoomDoc(-10)} title="Achicar la letra del documento" className="py-1 px-2 rounded-md border-none bg-white text-[11px] font-extrabold text-[#4B5563] cursor-pointer" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>A−</button>
              <span className="text-[10.5px] font-bold text-[#6B7280] w-9 text-center tabular-nums">{zoomDoc}%</span>
              <button onClick={() => cambiarZoomDoc(10)} title="Agrandar la letra del documento" className="py-1 px-2 rounded-md border-none bg-white text-[11px] font-extrabold text-[#4B5563] cursor-pointer" style={{ boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}>A+</button>
            </span>
            {!editando && (
              <button onClick={descargarPdfDel} title="Descargar el documento completo en PDF"
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11.5px] font-semibold cursor-pointer bg-white text-[#6B7280] border-[#E2E5EB] hover:text-[#2E69E0] hover:border-[#C7D2FE]">
                <FileText size={13} />Descargar PDF
              </button>
            )}
            {/* Compartir secciones del DEL con externos (link para comentar). */}
            <div className="relative ml-auto">
              <button onClick={abrirShareDel} title="Compartir secciones para que un externo comente"
                className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-lg border text-[11.5px] font-semibold cursor-pointer bg-white text-[#6B7280] border-[#E2E5EB] hover:text-[#2E69E0] hover:border-[#C7D2FE]">
                <Share2 size={13} />Compartir
              </button>
              {shareDelOpen && (
                <div className="absolute z-[60] mt-1 right-0 w-[340px] rounded-xl border border-[#E7EAF0] bg-white p-3" style={{ boxShadow: '0 12px 32px rgba(10,22,40,.16)' }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#9098A4]">Compartir para comentar</span>
                    <button onClick={() => setShareDelOpen(false)} className="text-[#C3C9D4] hover:text-[#6B7280] border-none bg-transparent cursor-pointer"><X size={14} /></button>
                  </div>
                  <div className="text-[11px] text-[#9098A4] mb-2 leading-snug">Tildá las secciones que querés compartir. El externo las ve en solo lectura y puede comentar (con su nombre).</div>
                  <div className="max-h-[190px] overflow-y-auto flex flex-col gap-0.5 mb-2 pr-1">
                    {sorted.map(s => (
                      <label key={s.id} className="flex items-center gap-2 py-1 px-1.5 rounded-md cursor-pointer hover:bg-[#F7F8FA]">
                        <input type="checkbox" checked={shareSel.has(s.id)} onChange={() => toggleShareSec(s.id)} />
                        <span className="text-[11.5px] text-[#3F4653] truncate">{s.title || 'Sección'}</span>
                        <span className="ml-auto text-[9px] font-bold uppercase text-[#C3C9D4]">{secOf(s.kind).label}</span>
                      </label>
                    ))}
                  </div>
                  <button onClick={crearDelShare} disabled={shareDelBusy || shareSel.size === 0}
                    className="w-full inline-flex items-center justify-center gap-1.5 py-2 rounded-lg border-none text-white text-[12px] font-semibold cursor-pointer disabled:opacity-50 mb-2" style={{ background: '#2E69E0' }}>
                    {shareDelBusy ? <Loader2 size={13} className="animate-spin" /> : <Share2 size={13} />}Crear link{shareSel.size ? ` (${shareSel.size})` : ''} y copiar
                  </button>
                  {shareDelLinks === null ? (
                    <div className="py-2 text-center text-[11px] text-[#AEB4BF] flex items-center justify-center gap-1.5"><Loader2 size={12} className="animate-spin" />Cargando…</div>
                  ) : shareDelLinks.length > 0 && (
                    <div className="flex flex-col gap-1.5 border-t border-[#F1F3F7] pt-2">
                      <span className="text-[10px] font-bold uppercase tracking-[0.06em] text-[#AEB4BF]">Links activos</span>
                      {shareDelLinks.map(l => (
                        <div key={l.id} className="flex items-center gap-1.5 rounded-lg border border-[#EEF0F3] bg-[#FBFCFE] px-2 py-1.5">
                          <span className="flex-1 min-w-0 truncate text-[11px] font-mono text-[#3F4653]" title={`${(Array.isArray(l.section_ids) ? l.section_ids.length : 0)} sección(es)`}>/compartir/{l.token}</span>
                          <button onClick={() => copiarDelShare(l.token)} title="Copiar" className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#E2E8FA] bg-white cursor-pointer" style={{ color: copiedDelTok === l.token ? '#16A34A' : '#9CA3AF' }}>{copiedDelTok === l.token ? <Check size={11} strokeWidth={3} /> : <Copy size={11} />}</button>
                          <button onClick={() => revocarDelShare(l.id)} title="Revocar" className="inline-flex items-center justify-center w-6 h-6 rounded-md border border-[#E2E5EB] bg-white text-[#C3C9D4] cursor-pointer hover:text-[#EF4444] hover:border-[#FECACA]"><Trash2 size={11} /></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            {/* Presencia: quién tiene el DEL abierto ahora mismo (en vivo). */}
            {otros.length > 0 && (
              <span className="inline-flex items-center gap-1.5" title={`En el DEL ahora: ${[myName, ...otros.map(u => u.name)].join(', ')}`}>
                <span className="flex items-center -space-x-1.5">
                  <span className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white border-2 border-white" style={{ background: myColor }}>{initialOf(myName)}</span>
                  {otros.slice(0, 4).map((u, i) => (
                    <span key={u.id || i} className="w-6 h-6 rounded-full inline-flex items-center justify-center text-[10px] font-bold text-white border-2 border-white" style={{ background: u.color || colorFor(u.name) }}>{initialOf(u.name)}</span>
                  ))}
                </span>
                <span className="text-[11px] font-semibold text-[#16A34A] inline-flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-[#22C55E]" style={{ animation: 'mkPulse 1.8s ease-in-out infinite' }} />{otros.length + 1} acá</span>
              </span>
            )}
          </div>
          {/* La barra única: una sola, fija arriba, opera sobre la sección enfocada. */}
          {editando && <DelToolbar api={activeApi} onImportDrive={() => { setImportRes(null); setImportOpen(true); }} />}
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
                {/* Estrategia incrustada (decisión de Matías): el bloque del funnel
                    (tipo · punto diferencial · fecha) es el ENCABEZADO de la primera
                    categoría; abajo el equipo escribe la estrategia real como pestaña. */}
                {gr.kind === 'estrategia' && estrategiaNode && (
                  <div className="rounded-xl border border-[#E7EAF0] bg-white p-3">{estrategiaNode}</div>
                )}
                {gr.items.length === 0 && (
                  <div className="rounded-xl border border-dashed border-[#E2E5EB] bg-white/60 py-5 px-5 text-center">
                    <div className="text-[12.5px] text-[#9098A4] font-medium">
                      {gr.kind === 'estrategia'
                        ? <>Todavía no está escrita la <b style={{ color: gc.c }}>estrategia real</b> de este embudo (el texto completo, debajo del encabezado).</>
                        : <>Todavía no está escrita la sección de <b style={{ color: gc.c }}>{gc.label}</b>.</>}
                    </div>
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
              <section key={s.id} id={'sec-' + s.id} data-secid={s.id} className="rounded-xl border bg-white overflow-hidden" style={{ scrollMarginTop: 108, borderColor: '#D5DCE7', borderLeft: `4px solid ${sc.c}`, boxShadow: '0 2px 5px rgba(10,22,40,.09), 0 10px 28px rgba(10,22,40,.05)' }}>
                <div className="flex items-center gap-2.5 py-2.5 px-4 border-b border-[#E3E8F0]" style={{ background: sc.bg || '#F8FAFC' }}>
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
                  {/* ACCIÓN DEL CLIENTE + ESTADO por pestaña (reemplazan el tilde 🎬):
                      la acción dice qué hace el cliente con esta pestaña; el estado
                      dice si ya está terminada. El cliente solo ve lo TERMINADO que
                      no sea "Solo equipo". Grabarse+Terminado = le aparece para grabar. */}
                  <select
                    value={s.accion_cliente || 'solo_equipo'}
                    onChange={(e) => setSeccionMeta(s, { accion: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    title="Qué tiene que hacer el cliente con esta pestaña"
                    className="shrink-0 py-1 px-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.03em] border cursor-pointer outline-none"
                    style={{
                      grabarse: { background: '#EFEBFF', color: '#6D28D9', borderColor: '#DDD3FF' },
                      revisar: { background: '#EEF3FF', color: '#1D4FD8', borderColor: '#C7D2FE' },
                      solo_ver: { background: '#ECFEFF', color: '#0891B2', borderColor: '#A5F3FC' },
                      solo_equipo: { background: '#F4F5F7', color: '#7A8290', borderColor: '#E2E5EB' },
                    }[s.accion_cliente || 'solo_equipo']}>
                    {/* "Grabarse" SOLO en lo que se graba de verdad (VSL y anuncios).
                        En una landing no existe grabar: se revisa y se aprueba, y de
                        ahí pasa a diseño. Ofrecerlo era lo que metía el vocabulario de
                        grabación en las páginas del funnel. Si alguna quedó marcada
                        así de antes, la opción se muestra igual para poder sacarla. */}
                    {(esGrabable(s.kind) || s.accion_cliente === 'grabarse') && <option value="grabarse">🎬 Grabarse</option>}
                    <option value="revisar">{esGrabable(s.kind) ? 'Revisar' : 'Revisar y aprobar'}</option>
                    <option value="solo_ver">Solo ver</option>
                    <option value="solo_equipo">Solo equipo</option>
                  </select>
                  <select
                    value={s.estado_seccion || 'en_construccion'}
                    onChange={(e) => setSeccionMeta(s, { estado: e.target.value })}
                    onClick={(e) => e.stopPropagation()}
                    title="Estado de esta pestaña (el cliente solo ve lo terminado)"
                    className="shrink-0 py-1 px-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.03em] border cursor-pointer outline-none"
                    style={(s.estado_seccion || 'en_construccion') === 'terminado'
                      ? { background: '#DCFCE7', color: '#15803D', borderColor: '#BBF7D0' }
                      : { background: '#FEF6E7', color: '#B45309', borderColor: '#FDE9C8' }}>
                    <option value="en_construccion">🔨 En construcción</option>
                    <option value="terminado">✔ Terminado</option>
                  </select>
                  {/* Secciones que NO se graban (landings, formulario, thank you…):
                      no llevan responsable ni fase, pero sí muestran que el cliente
                      ya las aprobó o que pidió correcciones. */}
                  {!esGrabable(s.kind) && s.grab_flujo && (() => {
                    const dias = s.grab_flujo_at ? Math.max(0, Math.floor((Date.now() - new Date(s.grab_flujo_at)) / 86400000)) : null;
                    const m = {
                      revision:   { t: '👀 Con el cliente', c: '#1D4FD8', b: '#EEF3FF', ay: 'Está en manos del cliente: la tiene para leer y aprobar.' },
                      correccion: { t: '✏️ Corrección', c: '#B45309', b: '#FEF6E7', ay: 'El cliente pidió cambios. Al dar OK al último comentario vuelve a él.' },
                      aprobado:   { t: '✅ Aprobado por el cliente', c: '#15803D', b: '#DCFCE7', ay: 'El cliente le dio el OK. Lista para diseño.' },
                    }[s.grab_flujo];
                    if (!m) return null;
                    return (
                      <span className="hidden lg:inline shrink-0 text-[10px] font-bold py-1 px-1.5 rounded-md whitespace-nowrap" style={{ background: m.b, color: m.c }}
                        title={`${m.ay}${dias != null ? ` Hace ${dias} día(s) en este estado.` : ''}`}>
                        {m.t}{dias != null ? ` · ${dias}d` : ''}
                      </span>
                    );
                  })()}
                  {/* Devolvérsela al cliente a mano. Normalmente pasa solo al dar OK
                      al último comentario, pero si se corrigió sin comentarios que
                      cerrar, este botón es la única forma de que vuelva a verla. */}
                  {s.grab_flujo === 'correccion' && (
                    <button
                      onClick={(e) => { e.stopPropagation(); rehabilitar(s); }}
                      title="Ya lo corregimos: devolvérsela al cliente para que la revise de nuevo"
                      className="shrink-0 inline-flex items-center gap-1 py-1 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-[0.03em] border cursor-pointer outline-none bg-white text-[#1D4FD8] border-[#C7D7FE] hover:bg-[#EEF3FF]">
                      ↩ Habilitar
                    </button>
                  )}
                  {/* RESPONSABLE de grabación (cliente o Encargado) + estado del flujo */}
                  {esGrabable(s.kind) && (
                    <>
                      <select
                        value={s.grab_colab_id || ''}
                        onChange={(e) => asignarGrabador(s, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        title="Quién graba este guión"
                        className="shrink-0 py-1 px-1.5 rounded-md text-[10px] font-bold border cursor-pointer outline-none bg-white text-[#4B5563] border-[#E2E5EB] max-w-[130px] truncate">
                        {asignables.map((a) => <option key={a.id || 'cliente'} value={a.id}>🎥 {a.nombre}</option>)}
                      </select>
                      {/* Avatar del guión (solo anuncios y si el funnel tiene más de uno):
                          así el cliente no elige avatar al subir la grabación. */}
                      {s.kind === 'anuncios' && avatarsFunnel.length > 1 && (
                        <select
                          value={s.grab_avatar_id || ''}
                          onChange={(e) => asignarAvatar(s, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          title="A qué avatar es este guión"
                          className="shrink-0 py-1 px-1.5 rounded-md text-[10px] font-bold border cursor-pointer outline-none bg-white text-[#4B5563] border-[#E2E5EB] max-w-[120px] truncate">
                          <option value="">👤 Elegir avatar…</option>
                          {avatarsFunnel.map((a) => <option key={a.id} value={a.id}>👤 {a.name}</option>)}
                        </select>
                      )}
                      {/* FASE del guión: lanzamiento (cuenta para el 100%) u
                          optimización (adicional, no frena el avance). */}
                      <select
                        value={s.fase || 'lanzamiento'}
                        onChange={(e) => setFase(s, e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        title="Lanzamiento = se necesita para llegar al 100%. Optimización = adicional, después del 100% (no frena el avance)."
                        className="shrink-0 py-1 px-1.5 rounded-md text-[10px] font-extrabold uppercase tracking-[0.03em] border cursor-pointer outline-none"
                        style={(s.fase || 'lanzamiento') === 'optimizacion'
                          ? { background: '#ECFEFF', color: '#0E7490', borderColor: '#A5F3FC' }
                          : { background: '#FFF1E7', color: '#C2410C', borderColor: '#FED7AA' }}>
                        <option value="lanzamiento">🚀 Lanzamiento</option>
                        <option value="optimizacion">✨ Optimización</option>
                      </select>
                      {/* Estado del flujo (revisión/corrección/grabación). 'grabado'
                          se muestra en el botón de aprobar de al lado. */}
                      {s.grab_flujo && s.grab_flujo !== 'grabado' && (() => {
                        const dias = s.grab_flujo_at ? Math.max(0, Math.floor((Date.now() - new Date(s.grab_flujo_at)) / 86400000)) : null;
                        const m = {
                          revision:   { t: '👀 Con el cliente', c: '#1D4FD8', b: '#EEF3FF' },
                          correccion: { t: '✏️ Corrección', c: '#B45309', b: '#FEF6E7' },
                          grabacion:  { t: '🎬 Grabación', c: '#15803D', b: '#DCFCE7' },
                        }[s.grab_flujo];
                        if (!m) return null;
                        return (
                          <span className="hidden lg:inline shrink-0 text-[10px] font-bold py-1 px-1.5 rounded-md whitespace-nowrap" style={{ background: m.b, color: m.c }}
                            title={dias != null ? `Hace ${dias} día(s) en este estado` : ''}>
                            {m.t}{dias != null ? ` · ${dias}d` : ''}
                          </span>
                        );
                      })()}
                      {/* APROBAR GRABADO (solo el equipo). Es lo único que da el guión
                          por grabado para el 100% — no que el cliente diga que grabó. */}
                      {s.para_grabar && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setGrabado(s, s.grab_flujo !== 'grabado'); }}
                          title={s.grab_flujo === 'grabado' ? 'Grabado y aprobado por el equipo (clic para desmarcar)' : 'Marcar como grabado: confirmás que el cliente realmente lo grabó'}
                          className="shrink-0 inline-flex items-center gap-1 py-1 px-2 rounded-md text-[10px] font-extrabold uppercase tracking-[0.03em] border cursor-pointer outline-none"
                          style={s.grab_flujo === 'grabado'
                            ? { background: '#16A34A', color: '#fff', borderColor: '#16A34A' }
                            : { background: '#fff', color: '#15803D', borderColor: '#BBF7D0' }}>
                          {s.grab_flujo === 'grabado' ? <><Check size={11} strokeWidth={3} /> Grabado</> : '✅ Marcar grabado'}
                        </button>
                      )}
                    </>
                  )}
                  {editando && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button onClick={() => setEditTitle(s.id)} title="Renombrar" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#1A1D26] border-none bg-transparent cursor-pointer"><Pencil size={13} /></button>
                      <button onClick={() => agregar(s.ord, s.kind)} title="Agregar sección debajo (misma categoría)" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#7C3AED] border-none bg-transparent cursor-pointer"><Plus size={14} /></button>
                      <span className="relative inline-flex">
                        <button onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMoveTo(null); setMoveMenu(moveMenu === s.id ? null : s.id); setMoveRect({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) }); }} title="Mover a otra categoría o a otro embudo" className="w-7 h-7 inline-flex items-center justify-center rounded-md text-[#9098A4] hover:bg-[#F4F5F7] hover:text-[#0891B2] border-none bg-transparent cursor-pointer"><FolderInput size={13} /></button>
                        {moveMenu === s.id && (<>
                          <span className="fixed inset-0 z-30" onClick={() => { setMoveMenu(null); setMoveTo(null); }} />
                          <div className="fixed z-40 bg-white border border-[#E2E5EB] rounded-lg p-1 min-w-[188px] overflow-y-auto" style={{ boxShadow: '0 6px 18px rgba(10,22,40,.14)', top: moveRect?.top ?? 0, right: moveRect?.right ?? 8, maxHeight: `calc(100vh - ${(moveRect?.top ?? 0) + 12}px)` }}>
                            {!moveTo ? (<>
                              {/* Dentro de ESTE embudo: cambia la categoría */}
                              <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#C3C9D4] px-2 pt-1 pb-1">Mover a una categoría</div>
                              {MOVE_KINDS.map(k => { const mc = secOf(k); const cur = k === s.kind; return (
                                <button key={k} onClick={() => moverACategoria(s.id, k)} disabled={cur}
                                  className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-left text-[12px] font-semibold border-none bg-transparent cursor-pointer disabled:opacity-40 disabled:cursor-default hover:bg-[#F4F6F9]"
                                  style={{ color: mc.c }}>
                                  <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: mc.c }} />{mc.label}{cur && <Check size={12} className="ml-auto" />}
                                </button>
                              ); })}
                              {/* A OTRO embudo del mismo cliente */}
                              {siblingDels.length > 0 && (<>
                                <div className="h-px bg-[#EDF0F5] my-1" />
                                <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#C3C9D4] px-2 pt-1 pb-1">Mover a otro embudo</div>
                                {siblingDels.map(d => (
                                  <button key={d.docId} onClick={() => setMoveTo(d)}
                                    className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-left text-[12px] font-semibold border-none bg-transparent cursor-pointer text-[#3F4653] hover:bg-[#F4F6F9]">
                                    <FolderInput size={12} className="shrink-0 text-[#9098A4]" />
                                    <span className="truncate">{d.name}</span>
                                    <ChevronRight size={13} className="ml-auto shrink-0 text-[#C3C9D4]" />
                                  </button>
                                ))}
                              </>)}
                            </>) : (<>
                              {/* Elegir la categoría de destino en el embudo elegido */}
                              <button onClick={() => setMoveTo(null)} className="flex items-center gap-1.5 w-full py-1.5 px-2 rounded-md text-left text-[11px] font-bold border-none bg-transparent cursor-pointer text-[#6B7280] hover:bg-[#F4F6F9]">
                                <ChevronLeft size={13} className="shrink-0" />Volver
                              </button>
                              <div className="text-[9.5px] font-bold uppercase tracking-[0.06em] text-[#C3C9D4] px-2 pt-1 pb-0.5">En «{moveTo.name}», categoría:</div>
                              {MOVE_KINDS.map(k => { const mc = secOf(k); return (
                                <button key={k} onClick={() => moverAEmbudo(s.id, moveTo.docId, k)}
                                  className="flex items-center gap-2 w-full py-1.5 px-2 rounded-md text-left text-[12px] font-semibold border-none bg-transparent cursor-pointer hover:bg-[#F4F6F9]"
                                  style={{ color: mc.c }}>
                                  <span className="w-[7px] h-[7px] rounded-full shrink-0" style={{ background: mc.c }} />{mc.label}
                                </button>
                              ); })}
                            </>)}
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
                  <div className="p-3" style={{ zoom: zoomDoc / 100 }}>
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
                  <div className="del-rich py-7 px-10 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '115ch', padding: isMobile ? '20px 16px' : undefined, zoom: zoomDoc / 100 }}
                    dangerouslySetInnerHTML={{ __html: highlightHtml(sanitizeDelHtml(s.html), scomments) }} />
                ) : (
                  <div className="py-7 px-10 text-[13.5px] leading-[1.62] text-[#2A2E3A] whitespace-pre-wrap break-words" style={{ maxWidth: '115ch', padding: isMobile ? '20px 16px' : undefined, zoom: zoomDoc / 100 }}>
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
            // El onboarding de la plataforma lo ESCRIBE el cliente. Su panel_html
            // es la maqueta que arma `onboarding_sync_texto` cada dos minutos a
            // partir de las respuestas: portada con el avance por bloque, un
            // encabezado por bloque, un título por paso y las respuestas cortas
            // en tabla. No lo escribe una persona — y por eso la pestaña es de
            // solo lectura: una edición a mano quedaría pisada en la siguiente
            // pasada, o peor, congelaría la pestaña en una foto vieja mientras
            // el cliente sigue contestando, sin que nadie se entere.
            const generado = String(doc.node_id || '').startsWith('native_onb_');
            const docHtml = doc.panel_html || plainToHtml(doc.text);
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-2 px-1 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#F1F3F7', color: '#6B7280' }}><Monitor size={16} /></span>
                    <div className="min-w-0">
                      <TituloEditable value={doc.title} onSave={(t) => renombrarClientDoc(doc, t)} />
                      <div className="text-[11px] text-[#9098A4]">
                        {generado
                          ? 'Lo completa el cliente en su plataforma. Se actualiza solo cada 2 minutos.'
                          : `Aparece en todos los DEL de este cliente.${docEditing ? ' Se guarda solo.' : ''}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {accionesPagina(doc.title, docHtml, doc.text)}
                    {!generado && (
                    <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
                      <button onClick={() => setDocEditing(false)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
                      <button onClick={() => setDocEditing(true)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: '#fff', color: '#7C3AED', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
                    </div>
                    )}
                    {doc._kind === 'extra' && <button onClick={() => borrarExtraDoc(doc)} title="Borrar este documento" className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={13} /></button>}
                  </div>
                </div>
                {docEditing && !generado ? (
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
                  <div className="del-rich rounded-xl border border-[#E7EAF0] bg-white py-7 px-10 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '115ch', padding: isMobile ? '20px 16px' : undefined }}>
                    {(doc.panel_html || (doc.text || '').trim())
                      ? <div dangerouslySetInnerHTML={{ __html: sanitizeDelHtml(docHtml) }} />
                      : <span className="italic text-[#C3C9D4]">
                          {generado
                            ? 'El cliente todavía no empezó su onboarding.'
                            : 'Este documento está vacío. Tocá “Editar” para escribirlo.'}
                        </span>}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Una GUÍA GLOBAL (igual para todos los clientes): editable. */}
          {view.startsWith('guia:') && (() => {
            const g = guias.find(x => 'guia:' + x.id === view);
            if (!g) return null;
            return (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2 py-2 px-1 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-[9px] shrink-0" style={{ background: '#ECFEFF', color: '#0891B2' }}><HelpCircle size={16} /></span>
                    <div className="min-w-0">
                      <TituloEditable value={g.title} onSave={(t) => renombrarGuia(g, t)} />
                      <div className="text-[11px] text-[#9098A4]">Guía global: la ven TODOS los clientes en su portal.{docEditing ? ' Se guarda solo.' : ''}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {accionesPagina(g.title, g.html, g.text)}
                    <div className="inline-flex rounded-lg p-0.5" style={{ background: '#F1F3F7' }}>
                      <button onClick={() => setDocEditing(false)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: 'transparent', color: '#6B7280' } : { background: '#fff', color: '#1A1D26', boxShadow: '0 1px 2px rgba(10,22,40,.06)' }}><Eye size={13} />Leer</button>
                      <button onClick={() => setDocEditing(true)} className="inline-flex items-center gap-1.5 py-1.5 px-3 rounded-md text-[12px] font-semibold cursor-pointer border-none" style={docEditing ? { background: '#fff', color: '#0891B2', boxShadow: '0 1px 2px rgba(10,22,40,.06)' } : { background: 'transparent', color: '#6B7280' }}><PenLine size={13} />Editar</button>
                    </div>
                    <button onClick={() => borrarGuia(g)} title="Borrar esta guía (para todos los clientes)" className="inline-flex items-center justify-center w-8 h-8 border border-[#E2E5EB] rounded-lg bg-white text-[#C3C9D4] cursor-pointer hover:bg-[#FEF2F2] hover:border-[#FECACA] hover:text-[#EF4444]"><Trash2 size={13} /></button>
                  </div>
                </div>
                {docEditing ? (
                  <RichTextEditor
                    key={g.id}
                    value={g.html || ''}
                    onChange={(html) => saveGuia(g, html)}
                    sanitize={sanitizeDelHtml}
                    delTools
                    minHeight={320}
                    placeholder="Escribí acá la guía (el cliente la ve tal cual en su portal)…"
                  />
                ) : (
                  <div className="del-rich rounded-xl border border-[#E7EAF0] bg-white py-7 px-10 text-[13.5px] leading-[1.62] text-[#2A2E3A] break-words" style={{ maxWidth: '115ch', padding: isMobile ? '20px 16px' : undefined }}>
                    {(g.html || '').trim()
                      ? <div dangerouslySetInnerHTML={{ __html: sanitizeDelHtml(g.html) }} />
                      : <span className="italic text-[#C3C9D4]">Esta guía está vacía. Tocá “Editar” para escribirla.</span>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>

        {/* Margen de comentarios (como Google Docs): las notas ancladas a frases.
            En modo edición se oculta para que la página ocupe el protagonismo. */}
        {showComments && (
          <aside className={isMobile ? 'flex flex-col gap-2 pb-6' : 'sticky top-0 flex flex-col gap-2 max-h-[calc(100vh-120px)] overflow-y-auto pb-6'}>
            <div className="text-[9.5px] font-extrabold tracking-[0.11em] uppercase text-[#AEB4BF] px-1 pt-1">Comentarios</div>
            {comments.length === 0 && (
              <div className="text-[11px] text-[#AEB4BF] px-1 leading-snug">Marcá una frase en el texto y tocá <b>Comentar</b> para dejar una nota acá.</div>
            )}
            {[...topComments].sort((a, b) => (a.resolved ? 1 : 0) - (b.resolved ? 1 : 0) || (new Date(a.created_at) - new Date(b.created_at))).map(c => {
              const reps = repliesByParent[c.id] || [];
              return (
              <div key={c.id}
                className="rounded-lg border bg-white p-2.5 transition-colors"
                style={{ borderColor: flashCmt === c.id ? '#2E69E0' : '#E7EAF0', boxShadow: flashCmt === c.id ? '0 0 0 2px #DBEAFE' : 'none', opacity: c.resolved ? 0.6 : 1 }}>
                <div onClick={() => irAComment(c)} className="cursor-pointer">
                  {c.quote && <div className="text-[10.5px] text-[#8A6D2B] border-l-2 border-[#EAB308] pl-1.5 mb-1 italic line-clamp-2">“{c.quote}”</div>}
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="w-5 h-5 rounded-full inline-flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: colorFor(c.author_id || c.author_name) }}>{initialOf(c.author_name)}</span>
                    <span className="text-[11.5px] font-bold text-[#1A1D26] truncate">{c.author_name || 'Alguien'}</span>
                    {!c.author_id && <span className="text-[8.5px] font-bold text-[#B45309] bg-[#FEF3C7] rounded px-1 py-px shrink-0 uppercase tracking-wide">externo</span>}
                    <span className="text-[10px] text-[#AEB4BF] ml-auto shrink-0">{haceRato(c.created_at)}</span>
                  </div>
                  <div className="text-[12px] text-[#3F4653] leading-snug whitespace-pre-wrap break-words" style={{ textDecoration: c.resolved ? 'line-through' : 'none' }}>{c.body}</div>
                </div>
                {reps.length > 0 && (
                  <div className="mt-1.5 pl-2 border-l-2 border-[#EDF0F5] flex flex-col gap-1.5">
                    {reps.map(r => (
                      <div key={r.id}>
                        <div className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full inline-flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ background: colorFor(r.author_id || r.author_name) }}>{initialOf(r.author_name)}</span>
                          <span className="text-[11px] font-bold text-[#1A1D26] truncate">{r.author_name || 'Alguien'}</span>
                          {!r.author_id && <span className="text-[8.5px] font-bold text-[#B45309] bg-[#FEF3C7] rounded px-1 py-px shrink-0 uppercase tracking-wide">externo</span>}
                          <span className="text-[9.5px] text-[#AEB4BF] ml-auto shrink-0">{haceRato(r.created_at)}</span>
                          <button onClick={(e) => { e.stopPropagation(); borrarComment(r); }} title="Borrar respuesta" className="inline-flex items-center justify-center w-5 h-5 rounded text-[#C3C9D4] hover:text-[#B91C1C] border-none bg-transparent cursor-pointer shrink-0"><Trash2 size={10} /></button>
                        </div>
                        <div className="text-[11.5px] text-[#3F4653] leading-snug whitespace-pre-wrap break-words pl-[22px]">{r.body}</div>
                      </div>
                    ))}
                  </div>
                )}
                {threadFor === c.id ? (
                  <div className="mt-1.5">
                    <textarea value={replyDraft[c.id] || ''} autoFocus onChange={e => setReplyDraft(d => ({ ...d, [c.id]: e.target.value }))} rows={2}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); responder(c); } if (e.key === 'Escape') setThreadFor(null); }}
                      placeholder="Responder…  (Ctrl+Enter)"
                      className="w-full py-1.5 px-2 border border-[#E2E5EB] rounded-lg text-[12px] text-[#1A1D26] bg-white resize-y outline-none focus:border-blue leading-snug" />
                    <div className="flex justify-end gap-1.5 mt-1">
                      <button onClick={() => setThreadFor(null)} className="py-1 px-2 rounded border border-[#E2E5EB] bg-white text-[#4B5563] text-[11px] font-semibold cursor-pointer">Cancelar</button>
                      <button onClick={() => responder(c)} disabled={!(replyDraft[c.id] || '').trim()} className="inline-flex items-center gap-1 py-1 px-2 rounded border-none bg-[#2E69E0] text-white text-[11px] font-semibold cursor-pointer hover:bg-[#1D4FD8] disabled:opacity-50"><Send size={11} />Responder</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 mt-1.5">
                    <button onClick={(e) => { e.stopPropagation(); setThreadFor(c.id); }} className="inline-flex items-center gap-1 text-[10.5px] font-semibold py-0.5 px-1.5 rounded border-none cursor-pointer bg-[#EFF3FF] text-[#2E69E0]"><MessageSquare size={11} />Responder</button>
                    <button onClick={(e) => { e.stopPropagation(); resolverComment(c); }} className="inline-flex items-center gap-1 text-[10.5px] font-semibold py-0.5 px-1.5 rounded border-none cursor-pointer" style={c.resolved ? { background: '#F1F3F7', color: '#6B7280' } : { background: '#ECFDF5', color: '#15803D' }}><Check size={11} strokeWidth={3} />{c.resolved ? 'Reabrir' : 'OK'}</button>
                    <button onClick={(e) => { e.stopPropagation(); borrarComment(c); }} title="Borrar" className="inline-flex items-center justify-center w-6 h-6 rounded text-[#C3C9D4] hover:text-[#B91C1C] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer ml-auto"><Trash2 size={11} /></button>
                  </div>
                )}
              </div>
              );
            })}
          </aside>
        )}
      </div>

      {/* Botón "Comentar" AL MARGEN de la hoja, a la altura de lo marcado — como
          Google Docs. Nunca encima del texto: si lo tapa, hay que esquivarlo para
          volver a marcar. Si la pantalla es angosta cae abajo a la derecha.

          Está SIEMPRE montado y arranca oculto: mostrarlo y moverlo se hace
          escribiéndole el estilo directo (ver pintarBoton), no con estado de
          React. Montarlo/desmontarlo obliga a redibujar, y redibujar mientras el
          usuario marca le suelta la selección al navegador. */}
      <button ref={btnRef} data-sel-btn
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); }}
        onClick={abrirComentario}
        title="Comentar lo que marcaste"
        className="fixed z-[70] items-center gap-1.5 py-2 px-3.5 rounded-full bg-[#1A1D26] text-white text-[12.5px] font-semibold cursor-pointer shadow-lg select-none"
        style={{ display: 'none', touchAction: 'manipulation', animation: 'delLate 1.4s ease-in-out infinite' }}>
        <MessageSquare size={13} />Comentar
      </button>

      {composer && (
        /* En mobile el composer va como hoja pegada abajo (el teclado no lo tapa);
           en desktop flota anclado a la frase, como siempre. */
        <div onMouseDown={(e) => e.stopPropagation()}
          className={`fixed z-[71] bg-white border border-[#E2E5EB] p-3 ${isMobile ? 'inset-x-2 bottom-2 rounded-2xl' : 'rounded-xl w-[300px]'}`}
          style={isMobile
            ? { boxShadow: '0 -8px 40px rgba(10,22,40,.20)' }
            : { top: Math.min(composer.top, (typeof window !== 'undefined' ? window.innerHeight : 800) - 200), left: Math.min(composer.left, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 320), transform: 'translate(-50%, 10px)', boxShadow: '0 12px 40px rgba(10,22,40,.22)' }}>
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

      {/* Diálogo: borrar una versión entera (doble confirmación: hay que escribir BORRAR). */}
      {delVerModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setDelVerModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-[430px] p-5" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }}>
            <div className="text-[15px] font-bold text-[#B91C1C] mb-1.5 flex items-center gap-1.5"><AlertCircle size={16} />Borrar la Versión {delVerModal.v} entera</div>
            <div className="text-[12px] text-[#4B5563] mb-3 leading-snug">
              Se van a borrar <b>todas las secciones del DEL de la Versión {delVerModal.v}</b> (estrategia, VSL, anuncios y páginas de esa versión) y sus <b>grabaciones (videos crudos)</b>.<br />
              <span className="text-[#15803D] font-semibold">Las ediciones / videos ya editados NO se borran.</span><br />
              <span className="text-[#B91C1C]">Esto no se puede deshacer.</span>
            </div>
            <div className="text-[11px] font-semibold text-[#6B7280] mb-1.5">Escribí <b>BORRAR</b> para confirmar:</div>
            <input value={delVerModal.texto} autoFocus onChange={e => setDelVerModal(m => ({ ...m, texto: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Escape') setDelVerModal(null); if (e.key === 'Enter' && delVerModal.texto.trim().toUpperCase() === 'BORRAR') confirmarBorrarVersion(); }}
              placeholder="BORRAR" className="w-full py-2 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#DC2626]" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDelVerModal(null)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
              <button onClick={confirmarBorrarVersion} disabled={delVerModal.texto.trim().toUpperCase() !== 'BORRAR'}
                className="py-2 px-4 rounded-lg border-none bg-[#DC2626] text-white text-[13px] font-semibold cursor-pointer hover:brightness-95 disabled:opacity-40 disabled:cursor-default">Borrar versión</button>
            </div>
          </div>
        </div>
      )}

      {/* Diálogo: nueva versión del funnel (solo páginas vs relanzamiento completo). */}
      {verModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }} onMouseDown={(e) => { if (e.target === e.currentTarget) setVerModal(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-[460px] p-5" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }}>
            <div className="text-[15px] font-bold text-[#1A1D26] mb-1">Nueva versión del funnel</div>
            <div className="text-[11.5px] text-[#9098A4] mb-3">¿Qué cambia en esta versión nueva?</div>
            <div className="flex flex-col gap-2 mb-1">
              <label className="flex gap-2.5 items-start p-2.5 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: verModal.scope === 'paginas' ? '#7C3AED' : '#E2E5EB', background: verModal.scope === 'paginas' ? '#F5F3FF' : '#fff' }}>
                <input type="radio" checked={verModal.scope === 'paginas'} onChange={() => setVerModal(v => ({ ...v, scope: 'paginas' }))} className="mt-0.5 shrink-0" />
                <span><b className="text-[12.5px] text-[#1A1D26]">Solo las páginas</b><br /><span className="text-[11px] text-[#6B7280] leading-snug">Cambian la landing / pre-landing / formulario / thank you. El <b>VSL y los anuncios se comparten</b> con la versión actual. <b>No</b> se crean carpetas de grabación nuevas.</span></span>
              </label>
              <label className="flex gap-2.5 items-start p-2.5 rounded-lg border cursor-pointer transition-colors" style={{ borderColor: verModal.scope === 'completa' ? '#7C3AED' : '#E2E5EB', background: verModal.scope === 'completa' ? '#F5F3FF' : '#fff' }}>
                <input type="radio" checked={verModal.scope === 'completa'} onChange={() => setVerModal(v => ({ ...v, scope: 'completa' }))} className="mt-0.5 shrink-0" />
                <span><b className="text-[12.5px] text-[#1A1D26]">Relanzamiento completo</b><br /><span className="text-[11px] text-[#6B7280] leading-snug">También cambian el <b>VSL y/o los anuncios</b> (hay que grabar de nuevo). Se preparan las carpetas de grabaciones/ediciones de los avatares elegidos.</span></span>
              </label>
            </div>
            {verModal.scope === 'completa' && nombresAvatar.length > 1 && (
              <div className="mt-2 mb-1 pl-1">
                <div className="text-[11px] font-bold text-[#6B7280] mb-1.5">¿Para qué avatares? (se prepararán sus carpetas)</div>
                <div className="flex flex-col gap-1">
                  {nombresAvatar.map(n => (
                    <label key={n} className="flex gap-2 items-center text-[12px] text-[#3F4653] cursor-pointer">
                      <input type="checkbox" checked={verModal.avatars.has(n)} onChange={(e) => setVerModal(v => { const s = new Set(v.avatars); if (e.target.checked) s.add(n); else s.delete(n); return { ...v, avatars: s }; })} />
                      {n}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setVerModal(null)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
              <button onClick={confirmarVersion} className="py-2 px-4 rounded-lg border-none bg-[#7C3AED] text-white text-[13px] font-semibold cursor-pointer hover:brightness-95">Crear versión</button>
            </div>
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

      {/* Importador de archivos de Drive: pegás el link de una carpeta pública y elegís
          la carpeta destino; sube todo a Recursos (videos → Bunny, imágenes → almacenamiento),
          saltea duplicados y se transcribe/ordena solo con el flujo de siempre. */}
      {importOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }} onMouseDown={(e) => { if (e.target === e.currentTarget && !importBusy) setImportOpen(false); }}>
          <div className="bg-white rounded-2xl w-full max-w-[460px] p-5" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }}>
            <div className="flex items-center gap-2 mb-1">
              <FolderDown size={17} className="text-[#0891B2]" />
              <div className="text-[15px] font-bold text-[#1A1D26] flex-1">Importar archivos de Drive</div>
              {!importBusy && <button onClick={() => setImportOpen(false)} className="w-7 h-7 inline-flex items-center justify-center rounded-lg text-[#9098A4] hover:bg-[#F4F5F7] border-none bg-transparent cursor-pointer"><X size={15} /></button>}
            </div>
            <div className="text-[11.5px] text-[#9098A4] mb-3.5 leading-snug">Pegá el link de una carpeta de Drive —o de un archivo suelto— y elegí dónde guardarlo. Los videos se suben y se transcriben solos; los duplicados se saltean.</div>

            {!importRes?.ok ? (<>
              <label className="block text-[12px] font-semibold text-[#6B7280] mb-1">Link de Drive (carpeta o archivo)</label>
              <input type="url" value={importUrl} autoFocus disabled={importBusy}
                onChange={e => { setImportUrl(e.target.value); if (importRes?.error) setImportRes(null); }}
                placeholder="https://drive.google.com/file/d/… o /drive/folders/…"
                className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#0891B2] disabled:opacity-60" />

              <label className="block text-[12px] font-semibold text-[#6B7280] mt-3 mb-1">Carpeta destino</label>
              <select value={importBucket} disabled={importBusy} onChange={e => setImportBucket(e.target.value)}
                className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#0891B2] bg-white disabled:opacity-60">
                {IMPORT_DESTINOS.map(g => (
                  <optgroup key={g.grupo} label={g.grupo}>
                    {g.opciones.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </optgroup>
                ))}
              </select>

              {importRes?.error && <div className="text-[11.5px] text-[#DC2626] mt-2.5 leading-snug">{importRes.error}</div>}

              <div className="flex justify-end gap-2 mt-4">
                <button disabled={importBusy} onClick={() => setImportOpen(false)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer disabled:opacity-50">Cancelar</button>
                <button disabled={importBusy || !importUrl.trim()} onClick={ejecutarImportDrive} className="py-2 px-4 rounded-lg border-none bg-[#0891B2] text-white text-[13px] font-semibold cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5">
                  {importBusy ? <><Loader2 size={13} className="animate-spin" />Importando…</> : 'Importar'}
                </button>
              </div>
              {importBusy && <div className="text-[11px] text-[#9098A4] mt-2 text-center">Puede tardar un rato si hay muchos videos. No cierres esta ventana.</div>}
            </>) : (<>
              {/* Resultado */}
              <div className="rounded-xl border border-[#D9F2E5] bg-[#F0FBF5] p-3.5 mb-1">
                <div className="text-[13px] font-bold text-[#15803D] mb-1.5">Importación lista ✓</div>
                <div className="text-[12.5px] text-[#3F4653] leading-relaxed">
                  <b>{importRes.importados || 0}</b> recurso{(importRes.importados === 1) ? '' : 's'} importado{(importRes.importados === 1) ? '' : 's'}
                  {` (${importRes.videos || 0} video${importRes.videos === 1 ? '' : 's'}, ${importRes.imagenes || 0} imagen${importRes.imagenes === 1 ? '' : 'es'}${importRes.otros ? `, ${importRes.otros} otros` : ''}).`}
                  {importRes.duplicados > 0 && <><br /><b>{importRes.duplicados}</b> saltado{importRes.duplicados === 1 ? '' : 's'} por estar repetido{importRes.duplicados === 1 ? '' : 's'}.</>}
                  {importRes.restantes > 0 && <><br />Quedan <b>{importRes.restantes}</b> archivo{importRes.restantes === 1 ? '' : 's'} sin procesar: volvé a importar la misma carpeta para seguir.</>}
                  {importRes.bunny === 'daily_cap' && <><br /><span className="text-[#B45309]">Se alcanzó el tope diario de gasto de video: los videos que faltan no se subieron.</span></>}
                  {importRes.bunny === 'frozen' && <><br /><span className="text-[#B45309]">La subida de video está en pausa por el candado de gasto: los videos no se subieron.</span></>}
                  {importRes.videos_saltados_por_tope > 0 && <><br /><b>{importRes.videos_saltados_por_tope}</b> video{importRes.videos_saltados_por_tope === 1 ? '' : 's'} no se subieron por el tope de gasto.</>}
                </div>
                {importRes.errores?.length > 0 && (
                  <div className="mt-2">
                    <div className="text-[12px] font-bold text-[#B91C1C] mb-0.5">{importRes.errores.length} con error:</div>
                    <ul className="ml-3.5 list-disc text-[11.5px] text-[#B91C1C] leading-snug">
                      {importRes.errores.map((m, i) => <li key={i} className="break-words">{m}</li>)}
                    </ul>
                  </div>
                )}
                <div className="text-[11px] text-[#6B7280] mt-2">Los videos se transcriben solos en los próximos minutos y el título/avatar se afinan con el flujo de siempre.</div>
              </div>
              <div className="flex justify-end gap-2 mt-3">
                <button onClick={() => { setImportRes(null); setImportUrl(''); }} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Importar otra</button>
                <button onClick={() => { setImportOpen(false); setImportUrl(''); setImportRes(null); }} className="py-2 px-4 rounded-lg border-none bg-[#0891B2] text-white text-[13px] font-semibold cursor-pointer">Listo</button>
              </div>
            </>)}
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
            {imgList === null ? (
              <div className="p-4 overflow-y-auto">
                <div className="py-10 text-center text-[12px] text-[#9098A4] flex items-center justify-center gap-2"><Loader2 size={14} className="animate-spin" />Cargando imágenes…</div>
              </div>
            ) : imgList.length === 0 ? (
              <div className="p-4 overflow-y-auto">
                <div className="py-10 text-center">
                  <ImageIcon size={26} className="text-[#D0D5DD] mx-auto mb-2" />
                  <div className="text-[12.5px] text-[#6B7280] font-semibold">Todavía no hay imágenes en Recursos</div>
                  <div className="text-[11px] text-[#9098A4] mt-1">Subí imágenes en la pestaña Recursos y acá te aparecen para insertar.</div>
                </div>
              </div>
            ) : (() => {
              // Navegación carpeta-primero: una fila de chips (una por carpeta con imágenes)
              // y abajo SOLO las imágenes de la carpeta elegida, para no marear con una lista larga.
              const grupos = agruparImagenes(imgList);
              const activo = grupos.find(g => g.key === imgCat) || grupos[0];
              return (
                <>
                  <div className="flex gap-1.5 flex-wrap py-2.5 px-4 border-b border-[#EDF0F5] shrink-0">
                    {grupos.map(g => {
                      const sel = g.key === activo.key;
                      return (
                        <button key={g.key} onClick={() => setImgCat(g.key)}
                          className="text-[11px] font-bold rounded-full px-2.5 py-1 cursor-pointer border transition-colors"
                          style={sel ? { background: '#2E69E0', color: '#fff', borderColor: '#2E69E0' } : { background: '#fff', color: '#6B7280', borderColor: '#E2E5EB' }}>
                          {g.label} · {g.items.length}
                        </button>
                      );
                    })}
                  </div>
                  <div className="p-4 overflow-y-auto flex-1 min-h-0">
                    <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(120px,1fr))' }}>
                      {activo.items.map(r => (
                        <button key={r.id} onClick={() => elegirImagen(r)} title={`Insertar: ${r.title}`} className="group flex flex-col rounded-lg border border-[#E7EAF0] bg-white overflow-hidden cursor-pointer hover:border-[#2E69E0] p-0">
                          <span className="w-full aspect-[4/3] bg-[#F4F5F7] overflow-hidden"><img src={r.public_url} alt={r.title} loading="lazy" className="w-full h-full object-cover" /></span>
                          <span className="text-[10.5px] font-semibold text-[#3F4653] truncate px-1.5 py-1">{r.title}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}

      {aviso && (
        <div className="fixed left-1/2 bottom-6 z-[60] -translate-x-1/2 flex items-center gap-2 py-2 px-3.5 rounded-lg text-[12px] font-semibold"
          style={{ background: '#15803D', color: '#fff', boxShadow: '0 8px 24px rgba(10,22,40,.22)' }}>
          <Check size={13} strokeWidth={3} />{aviso}
        </div>
      )}
    </div>
  );
}
