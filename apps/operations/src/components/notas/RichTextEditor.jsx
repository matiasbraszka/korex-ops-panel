import { useEffect, useRef, useState } from 'react';
import { Bold, Underline as UnderlineIcon, Italic, Heading1, Heading2, Heading3, List, ListOrdered, ListChecks, Link2, Eraser, Baseline, Table, Image as ImageIcon, UserPlus, PaintBucket } from 'lucide-react';
import { sanitizeNoteHtml } from './sanitize';

// Editor WYSIWYG minimo basado en contentEditable + execCommand.
// Acepta HTML inicial, devuelve HTML sanitizado on every change.
//
// Props:
//   value: string (HTML)
//   onChange: (html: string) => void
//   placeholder: string
//   minHeight: number (px)
//
// El value es ONE-WAY-INIT: solo se inserta cuando cambia la "key" del editor
// (ej: al abrir el modal con otra nota). No se hace re-render sincronizado
// porque rompe la posicion del cursor durante la escritura.

// Paleta de colores de letra disponibles en la barra.
// Caja de color: pinta el fondo de TODO el párrafo (bloque redondeado con aire),
// para avisos y consejos. La primera opción la quita.
const BOX_COLORS = [
  { c: null,      label: 'Quitar caja' },
  { c: '#FEF3C7', label: 'Amarillo (aviso)' },
  { c: '#E7EDFF', label: 'Azul (consejo)' },
  { c: '#E8F7EE', label: 'Verde (bien)' },
  { c: '#FDE8E8', label: 'Rojo (cuidado)' },
  { c: '#F3F4F6', label: 'Gris (nota)' },
  { c: '#0E1F38', label: 'Azul oscuro (destacado, letra blanca)' },
];

const TEXT_COLORS = [
  { label: 'Predeterminado', value: '#1F2937' },
  { label: 'Gris',     value: '#6B7280' },
  { label: 'Rojo',     value: '#DC2626' },
  { label: 'Naranja',  value: '#EA580C' },
  { label: 'Amarillo', value: '#CA8A04' },
  { label: 'Verde',    value: '#16A34A' },
  { label: 'Azul',     value: '#2563EB' },
  { label: 'Violeta',  value: '#7C3AED' },
  { label: 'Rosa',     value: '#DB2777' },
];

const isHeading = (el) => !!el && /^H[1-6]$/.test(el.tagName);
const headingLevel = (el) => Number(el.tagName[1]);

// `sanitize` permite reusar este editor con una whitelist mas ancha (ej: el DEL,
// que trae tablas). Default = el de las notas, que NO cambia.
// `delTools` agrega los botones del DEL (tabla · tamaño de letra · imagen · avatar).
// `onInsertImage`/`onNewAvatar` son ganchos opcionales: si vienen, mandan (ej. abrir la
// galería de Recursos); si no, el editor hace la versión simple (pegar link / plantilla).
export default function RichTextEditor({ value, onChange, placeholder = 'Escribí acá…', minHeight = 180, sanitize = sanitizeNoteHtml, delTools = false, onInsertImage, onNewAvatar, noToolbar = false, onActive }) {
  const ref = useRef(null);
  const rootRef = useRef(null);
  const lastInjected = useRef(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [boxOpen, setBoxOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // diálogo nativo (tabla/imagen/avatar/aviso)
  // Imagen seleccionada (con delTools): click en una imagen → menú de tamaño /
  // reemplazar / quitar, como cualquier otra herramienta del editor.
  const [imgSel, setImgSel] = useState(null); // { el, top, left }
  const cerrarImgSel = () => {
    if (imgSel?.el) imgSel.el.classList.remove('rte-img-sel');
    setImgSel(null);
  };
  const setImgWidth = (pct) => {
    if (!imgSel?.el) return;
    mutarNodo(imgSel.el, (c) => {
      c.classList.remove('rte-img-sel');
      if (!c.getAttribute('class')) c.removeAttribute('class');
      c.style.width = pct + '%';
      c.style.maxWidth = '100%';
      c.removeAttribute('width');
    });
    setImgSel(null);
  };
  const quitarImg = () => {
    if (!imgSel?.el) return;
    borrarNodo(imgSel.el);
    setImgSel(null);
  };
  const reemplazarImg = () => {
    if (!imgSel?.el) return;
    setDialog({ type: 'image', url: '', replaceEl: imgSel.el });
  };

  useEffect(() => {
    if (!ref.current) return;
    // Inicializamos contenido SOLO si cambia respecto a la ultima inyeccion,
    // asi no pisamos lo que el usuario va tipeando.
    if (lastInjected.current !== value) {
      ref.current.innerHTML = value || '';
      lastInjected.current = value || '';
    }
  }, [value]);

  const exec = (cmd, arg = null) => {
    snapshot(true);
    document.execCommand(cmd, false, arg);
    handleInput();
    ref.current?.focus();
  };

  const handleInput = () => {
    if (!ref.current) return;
    const raw = ref.current.innerHTML;
    const clean = sanitize(raw);
    lastInjected.current = clean;
    onChange?.(clean);
  };

  // ── Historial propio de deshacer ─────────────────────────────────────────────
  // El historial nativo del navegador no registra los cambios que las herramientas
  // hacen sobre el DOM (cajas, imágenes, checklist), y reemplazar nodos vía
  // execCommand para "engañarlo" rompe bloques complejos (parte párrafos y arrastra
  // lo que sigue). Solución: el editor guarda sus propios estados y Ctrl+Z / Ctrl+Y
  // usan SIEMPRE este historial, para el tipeo y para las herramientas por igual.
  const undoStack = useRef([]);
  const redoStack = useRef([]);
  const lastSnapAt = useRef(0);
  const snapshot = (force = false) => {
    const el = ref.current;
    if (!el) return;
    const now = Date.now();
    if (!force && now - lastSnapAt.current < 700) return; // agrupa el tipeo en ráfagas
    lastSnapAt.current = now;
    const html = el.innerHTML;
    if (undoStack.current[undoStack.current.length - 1] === html) return;
    undoStack.current.push(html);
    if (undoStack.current.length > 200) undoStack.current.shift();
    redoStack.current = [];
  };
  const restaurar = (html) => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = html;
    // No sabemos dónde estaba el cursor en ese estado: lo dejamos al final.
    const sel = window.getSelection();
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);
    setImgSel(null);
    lastSnapAt.current = 0;
    handleInput();
  };
  const undo = () => {
    const cur = ref.current?.innerHTML;
    let prev;
    while (undoStack.current.length) {
      const t = undoStack.current.pop();
      if (t !== cur) { prev = t; break; }
    }
    if (prev === undefined) return;
    redoStack.current.push(cur);
    restaurar(prev);
  };
  const redo = () => {
    const cur = ref.current?.innerHTML;
    let next;
    while (redoStack.current.length) {
      const t = redoStack.current.pop();
      if (t !== cur) { next = t; break; }
    }
    if (next === undefined) return;
    undoStack.current.push(cur);
    restaurar(next);
  };

  // Cambios de las herramientas: estado al historial y mutación DIRECTA del nodo
  // (sin trucos de reemplazo, que es lo que rompía los bloques).
  const mutarNodo = (node, mutate) => {
    snapshot(true);
    mutate(node);
    handleInput();
  };
  const borrarNodo = (node) => {
    snapshot(true);
    node.remove();
    handleInput();
  };

  const handlePaste = (e) => {
    // Pegar como texto plano evita arrastrar estilos raros de Word/Google Docs.
    e.preventDefault();
    snapshot(true);
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
    handleInput();
  };

  // Deshacer / rehacer (Ctrl+Z · Ctrl+Y · Ctrl+Shift+Z) con el historial PROPIO del
  // editor. Además, antes de cada tecla que modifica el contenido se guarda el
  // estado (agrupado en ráfagas de ~1s, así un Ctrl+Z deshace de a frases, no letra
  // por letra).
  const handleKeyDown = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod) {
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if ((k === 'z' && e.shiftKey) || k === 'y') { e.preventDefault(); redo(); return; }
      if (k === 'b' || k === 'i' || k === 'u' || k === 'x' || k === 'v') snapshot(true);
      return;
    }
    if (e.key.length === 1 || e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Enter') snapshot();
  };

  const addLink = () => {
    const url = window.prompt('URL del link (http/https):');
    if (!url) return;
    const safe = url.trim();
    if (!/^https?:\/\//i.test(safe)) {
      alert('La URL debe empezar con http:// o https://');
      return;
    }
    exec('createLink', safe);
  };

  const applyColor = (color) => {
    // styleWithCSS=true => foreColor genera <span style="color:..."> en vez de <font>.
    snapshot(true);
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
    document.execCommand('styleWithCSS', false, false);
    handleInput();
    setColorOpen(false);
    ref.current?.focus();
  };

  // Marcador / resaltado: pinta el FONDO del texto seleccionado. 'transparent' lo quita.
  const applyHighlight = (color) => {
    snapshot(true);
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('hiliteColor', false, color);
    document.execCommand('styleWithCSS', false, false);
    handleInput();
    ref.current?.focus();
  };

  // Checklist: una lista con casilleros ☐ en vez de puntos. Por dentro es una <ul>
  // normal con el casillero como marcador (list-style-type con string), así Enter
  // sigue agregando casilleros solo y el estilo viaja inline (sobrevive al
  // sanitizador y se ve igual en el portal del cliente).
  const CHECK_MARKER = '"☐  "';
  const closestUl = () => {
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    if (!n) return null;
    const el = n.nodeType === 1 ? n : n.parentElement;
    const ul = el?.closest?.('ul');
    return (ul && ref.current?.contains(ul)) ? ul : null;
  };
  const toggleChecklist = () => {
    let ul = closestUl();
    if (ul && ul.style.listStyleType) {
      // Ya es checklist: el botón la saca (cada ítem vuelve a párrafo normal).
      snapshot(true);
      const frag = document.createDocumentFragment();
      [...ul.children].forEach((li) => {
        const p = document.createElement('p');
        while (li.firstChild) p.appendChild(li.firstChild);
        frag.appendChild(p);
      });
      ul.replaceWith(frag);
      handleInput();
    } else if (ul) {
      // Era lista de viñetas: la convierte en checklist.
      mutarNodo(ul, (c) => { c.style.listStyleType = CHECK_MARKER; });
    } else {
      snapshot(true);
      document.execCommand('insertUnorderedList');
      ul = closestUl();
      if (ul) ul.style.listStyleType = CHECK_MARKER;
      handleInput();
    }
    ref.current?.focus();
  };

  // Caja de color: fondo pintado del párrafo entero (aviso/consejo). Va como estilo
  // inline sobre el bloque, así sobrevive al sanitizador y se ve igual en el portal.
  const closestBlock = () => {
    const sel = window.getSelection();
    const n = sel?.anchorNode;
    if (!n) return null;
    const el = n.nodeType === 1 ? n : n.parentElement;
    const b = el?.closest?.('p,h1,h2,h3,h4,h5,h6,li,blockquote');
    return (b && ref.current?.contains(b) && b !== ref.current) ? b : null;
  };
  const applyBox = (bg) => {
    let block = closestBlock();
    if (!block) { document.execCommand('formatBlock', false, 'P'); block = closestBlock(); }
    if (!block) return;
    // La caja azul oscuro lleva la letra en blanco (también las negritas, que en el
    // DEL tienen color propio por CSS y sin esto quedarían invisibles). Al cambiar a
    // una caja clara o quitarla, ese blanco se limpia solo.
    const esBlanco = (v) => v === 'rgb(255, 255, 255)' || v === '#ffffff' || v === 'white';
    const limpiarBlanco = (c) => {
      if (esBlanco(c.style.color)) c.style.color = '';
      c.querySelectorAll('strong,b').forEach((s) => {
        if (esBlanco(s.style.color)) {
          s.style.color = '';
          if (!s.getAttribute('style')) s.removeAttribute('style');
        }
      });
    };
    mutarNodo(block, (c) => {
      if (bg) {
        const oscura = bg === '#0E1F38';
        c.style.background = bg;
        c.style.borderRadius = oscura ? '14px' : '10px';
        c.style.padding = oscura ? '16px 18px' : '12px 14px';
        if (oscura) {
          c.style.color = '#ffffff';
          c.querySelectorAll('strong,b').forEach((s) => { if (!s.style.color) s.style.color = '#ffffff'; });
        } else {
          limpiarBlanco(c);
        }
      } else {
        c.style.background = '';
        c.style.borderRadius = '';
        c.style.padding = '';
        limpiarBlanco(c);
        if (!c.getAttribute('style')) c.removeAttribute('style');
      }
    });
    setBoxOpen(false);
    ref.current?.focus();
  };

  const clearFormat = () => {
    exec('removeFormat');
    // removeFormat no quita headings/lists. Los limpiamos a mano envolviendo en <p>.
    document.execCommand('formatBlock', false, 'P');
    handleInput();
  };

  // ── Herramientas del DEL (solo con delTools) ─────────────────────────────────
  // Los diálogos son NATIVOS de la plataforma (no window.prompt del navegador). Al
  // abrir uno, el foco sale del editor y se pierde el cursor: por eso guardamos el
  // rango de selección y lo restauramos justo antes de insertar.
  const savedRange = useRef(null);
  const saveSelection = () => {
    const sel = window.getSelection();
    savedRange.current = (sel && sel.rangeCount && ref.current?.contains(sel.anchorNode)) ? sel.getRangeAt(0).cloneRange() : null;
  };
  const insertHTML = (html) => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    sel.removeAllRanges();
    if (savedRange.current) {
      sel.addRange(savedRange.current);
    } else {
      // Sin selección previa (ej. no habías tocado el texto): inserta al final.
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel.addRange(r);
    }
    snapshot(true);
    document.execCommand('insertHTML', false, html);
    savedRange.current = null;
    handleInput();
  };

  // Tamaño de letra: agranda/achica el texto seleccionado (relativo, con span+style).
  // No abre diálogo: opera directo sobre la selección.
  const changeFontSize = (bigger) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setDialog({ type: 'aviso', msg: 'Seleccioná primero el texto que querés ' + (bigger ? 'agrandar' : 'achicar') + '.' }); return; }
    const range = sel.getRangeAt(0);
    // Envuelve cada pedazo de texto POR SEPARADO, en su lugar. Arrancar el contenido
    // de la selección entera (extractContents) rompía las tablas cuando la selección
    // cruzaba de una celda a otra: quedaban celdas fantasma fuera de la tabla.
    const { startContainer, startOffset, endContainer, endOffset } = range;
    const raiz = range.commonAncestorContainer;
    let textos = [];
    if (raiz.nodeType === 3) {
      textos = [raiz];
    } else {
      const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        if (range.intersectsNode(n) && n.nodeValue.trim() !== '') textos.push(n);
      }
    }
    if (!textos.length) return;
    snapshot(true);
    for (const n of textos) {
      if (n === endContainer && endOffset === 0) continue;
      if (n === startContainer && startOffset >= n.length) continue;
      let nodo = n;
      if (n === endContainer && endOffset < n.length) n.splitText(endOffset);
      if (n === startContainer && startOffset > 0) nodo = n.splitText(startOffset);
      const span = document.createElement('span');
      span.style.fontSize = bigger ? 'larger' : 'smaller';
      nodo.parentNode.insertBefore(span, nodo);
      span.appendChild(nodo);
    }
    sel.removeAllRanges();
    handleInput();
    ref.current?.focus();
  };

  // Abren los diálogos nativos (guardando la selección).
  const openTable = () => { saveSelection(); setDialog({ type: 'table', cols: '3', rows: '3' }); };
  const openImage = () => { saveSelection(); if (onInsertImage) { onInsertImage(insertHTML); return; } setDialog({ type: 'image', url: '' }); };
  const openAvatar = () => { saveSelection(); setDialog({ type: 'avatar', name: '' }); };
  // Inserta una estructura de landing pre-armada (blueprint) en la posición del cursor.
  const insertBlueprint = (html) => { saveSelection(); insertHTML(html); };

  // Confirmación de cada diálogo.
  const doTable = () => {
    const c = Math.min(12, Math.max(1, parseInt(dialog.cols, 10) || 0));
    const r = Math.min(60, Math.max(1, parseInt(dialog.rows, 10) || 0));
    let html = '<table><thead><tr>';
    for (let j = 0; j < c; j++) html += '<th>Columna ' + (j + 1) + '</th>';
    html += '</tr></thead><tbody>';
    for (let i = 0; i < r; i++) { html += '<tr>'; for (let j = 0; j < c; j++) html += '<td></td>'; html += '</tr>'; }
    html += '</tbody></table><p></p>';
    setDialog(null); insertHTML(html);
  };
  const doImage = () => {
    const safe = (dialog.url || '').trim();
    if (!/^https?:\/\//i.test(safe)) { setDialog({ ...dialog, err: 'El link debe empezar con http:// o https://' }); return; }
    // Reemplazar: cambia el src de la imagen seleccionada, conservando su tamaño.
    if (dialog.replaceEl) {
      mutarNodo(dialog.replaceEl, (c) => {
        c.src = safe;
        c.classList.remove('rte-img-sel');
        if (!c.getAttribute('class')) c.removeAttribute('class');
      });
      setDialog(null);
      setImgSel(null);
      return;
    }
    setDialog(null);
    insertHTML(`<img src="${safe.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;border-radius:8px;margin:8px 0" /><p></p>`);
  };
  const doAvatar = () => {
    const nombre = (dialog.name || '').trim();
    if (!nombre) { setDialog({ ...dialog, err: 'Poné un nombre.' }); return; }
    setDialog(null);
    // El título ES el avatar: se inserta como H2 (todo lo que siga, hasta el próximo
    // título, es de este avatar). Si el padre quiere hacer algo más (registrar el
    // avatar y crear sus carpetas), le pasamos el nombre y el insertor.
    if (onNewAvatar) { onNewAvatar(nombre, insertHTML); return; }
    const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    insertHTML(`<h2>${e(nombre)}</h2><h3>Segmentación</h3><p></p><h3>Descripción</h3><p></p>`);
  };

  // --- Plegado de secciones por titulo (estilo Google Docs) ---
  // Es estado de VISTA: no se guarda. Al hacer click en la flechita del titulo
  // se ocultan/muestran los elementos siguientes hasta el proximo titulo de
  // nivel igual o superior. Las clases/atributos se quitan al sanitizar, asi
  // que el HTML guardado queda limpio y NO se pierde contenido (solo se oculta).
  const collapseSection = (heading) => {
    const level = headingLevel(heading);
    let el = heading.nextElementSibling;
    while (el) {
      if (isHeading(el) && headingLevel(el) <= level) break;
      el.classList.add('rte-collapsed-hidden');
      el = el.nextElementSibling;
    }
    heading.setAttribute('data-collapsed', '1');
  };

  const expandSection = (heading) => {
    const level = headingLevel(heading);
    let el = heading.nextElementSibling;
    while (el) {
      if (isHeading(el) && headingLevel(el) <= level) break;
      el.classList.remove('rte-collapsed-hidden');
      // Si encontramos un subtitulo que esta plegado, respetamos su estado:
      // mostramos el subtitulo pero saltamos su contenido (sigue oculto).
      if (isHeading(el) && el.getAttribute('data-collapsed') === '1') {
        const subLevel = headingLevel(el);
        el = el.nextElementSibling;
        while (el) {
          if (isHeading(el) && headingLevel(el) <= subLevel) break;
          el = el.nextElementSibling;
        }
        continue;
      }
      el = el.nextElementSibling;
    }
    heading.removeAttribute('data-collapsed');
  };

  const handleClick = (e) => {
    // Selección de imagen (herramienta del DEL): click en la imagen → menú.
    if (delTools && e.target.tagName === 'IMG' && ref.current?.contains(e.target)) {
      e.preventDefault();
      if (imgSel?.el && imgSel.el !== e.target) imgSel.el.classList.remove('rte-img-sel');
      e.target.classList.add('rte-img-sel');
      const rRoot = rootRef.current.getBoundingClientRect();
      const rImg = e.target.getBoundingClientRect();
      setImgSel({ el: e.target, top: rImg.top - rRoot.top - 38, left: Math.max(8, rImg.left - rRoot.left + 8) });
      return;
    }
    if (imgSel) cerrarImgSel();
    const h = e.target.closest?.('h1,h2,h3');
    if (!h || !ref.current?.contains(h)) return;
    // Solo togglear si el click cae en la "canaleta" izquierda donde vive la flecha.
    const rect = h.getBoundingClientRect();
    if (e.clientX < rect.left - 4) {
      e.preventDefault();
      if (h.getAttribute('data-collapsed') === '1') expandSection(h);
      else collapseSection(h);
    }
  };

  // API para una barra EXTERNA compartida (una sola arriba, tipo Google Docs): cuando
  // este editor toma el foco, avisa con onActive(api) y la barra opera sobre ÉL. Así la
  // barra no se repite en cada sección. Ver DelToolbar en DelEditor.
  const apiRef = useRef({});
  apiRef.current = { exec, changeFontSize, openTable, openImage, openAvatar, addLink, applyColor, applyHighlight, clearFormat, insertBlueprint, toggleChecklist, applyBox };
  const handleFocus = () => onActive?.(apiRef.current);

  const Btn = ({ Icon, title, onClick, label }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault() /* no pierde el foco/selection */}
      onClick={onClick}
      title={title}
      className="w-7 h-7 flex items-center justify-center rounded text-gray-500 hover:bg-gray-100 hover:text-gray-800 bg-transparent border-none cursor-pointer transition-colors"
    >
      {Icon ? <Icon size={14} /> : <span className="text-[11px] font-bold">{label}</span>}
    </button>
  );

  const Divider = () => <div className="w-px h-5 bg-gray-200" />;

  return (
    <div ref={rootRef} className="relative border border-gray-200 rounded-lg bg-white focus-within:border-blue-400 transition-colors">
      {!noToolbar && (
      <div className="sticky top-0 z-20 flex items-center gap-0.5 px-1.5 py-1 border-b border-gray-200 bg-gray-50 rounded-t-lg flex-wrap">
        <Btn Icon={Bold}          title="Negrita (Ctrl+B)"   onClick={() => exec('bold')} />
        <Btn Icon={Italic}        title="Cursiva (Ctrl+I)"   onClick={() => exec('italic')} />
        <Btn Icon={UnderlineIcon} title="Subrayado (Ctrl+U)" onClick={() => exec('underline')} />
        <Divider />
        <Btn Icon={Heading1} title="Título principal (H1) — clic en la flecha para plegar" onClick={() => exec('formatBlock', 'H1')} />
        <Btn Icon={Heading2} title="Título grande (H2) — clic en la flecha para plegar" onClick={() => exec('formatBlock', 'H2')} />
        <Btn Icon={Heading3} title="Título chico (H3) — clic en la flecha para plegar"  onClick={() => exec('formatBlock', 'H3')} />
        <Divider />
        <Btn Icon={List}        title="Lista con viñetas" onClick={() => exec('insertUnorderedList')} />
        <Btn Icon={ListOrdered} title="Lista numerada"    onClick={() => exec('insertOrderedList')} />
        <Btn Icon={ListChecks}  title="Checklist (casilleros ☐)" onClick={toggleChecklist} />
        <Divider />
        {/* Color de letra: botón con popover de swatches */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setColorOpen(v => !v)}
            title="Color de letra"
            className={`w-7 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer transition-colors ${colorOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
          >
            <Baseline size={14} />
          </button>
          {colorOpen && (
            <>
              {/* backdrop para cerrar al hacer click afuera */}
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setColorOpen(false)}
                className="fixed inset-0 z-30 bg-transparent border-none cursor-default"
                aria-label="Cerrar"
              />
              <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-5 gap-1.5 w-[176px]">
                {TEXT_COLORS.map(c => (
                  <button
                    key={c.value}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyColor(c.value)}
                    title={c.label}
                    className="w-6 h-6 rounded-full border border-gray-200 cursor-pointer hover:scale-110 transition-transform"
                    style={{ background: c.value }}
                  />
                ))}
              </div>
            </>
          )}
        </div>
        {/* Caja de color: popover de fondos para el párrafo entero */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setBoxOpen(v => !v)}
            title="Caja de color (pinta el fondo del párrafo)"
            className={`w-7 h-7 flex items-center justify-center rounded bg-transparent border-none cursor-pointer transition-colors ${boxOpen ? 'bg-gray-200 text-gray-800' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
          >
            <PaintBucket size={14} />
          </button>
          {boxOpen && (
            <>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => setBoxOpen(false)}
                className="fixed inset-0 z-30 bg-transparent border-none cursor-default"
                aria-label="Cerrar"
              />
              <div className="absolute left-0 top-9 z-40 bg-white border border-gray-200 rounded-lg shadow-lg p-2 grid grid-cols-3 gap-1.5 w-[132px]">
                {BOX_COLORS.map(b => (
                  <button
                    key={b.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => applyBox(b.c)}
                    title={b.label}
                    className="w-6 h-6 rounded-md border border-gray-200 cursor-pointer hover:scale-110 transition-transform flex items-center justify-center"
                    style={{ background: b.c || '#fff' }}
                  >
                    {!b.c && <span className="text-[13px] text-[#9098A4] leading-none">⌀</span>}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {delTools && (<>
          <Divider />
          <Btn label="A−" title="Achicar la letra seleccionada" onClick={() => changeFontSize(false)} />
          <Btn label="A+" title="Agrandar la letra seleccionada" onClick={() => changeFontSize(true)} />
          <Btn Icon={Table}     title="Insertar tabla" onClick={openTable} />
          <Btn Icon={ImageIcon} title="Insertar imagen (por link o desde Recursos)" onClick={openImage} />
          <Btn Icon={UserPlus}  title="Insertar un avatar (nombre + segmentación + descripción)" onClick={openAvatar} />
        </>)}
        <Divider />
        <Btn Icon={Link2}  title="Insertar link" onClick={addLink} />
        <Btn Icon={Eraser} title="Quitar formato"  onClick={clearFormat} />
      </div>
      )}
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        onFocus={handleFocus}
        data-placeholder={placeholder}
        className="rte-content py-2.5 pr-3 pl-7 text-[13px] font-sans outline-none text-gray-800 leading-relaxed"
        style={{ minHeight }}
      />

      {/* Menú flotante de imagen: tamaño / reemplazar / quitar (herramienta del DEL). */}
      {imgSel && (
        <div className="absolute z-30 flex items-center gap-0.5 bg-white border border-[#E2E5EB] rounded-lg px-1 py-0.5" style={{ top: Math.max(2, imgSel.top), left: imgSel.left, boxShadow: '0 6px 18px rgba(10,22,40,.16)' }}
          onMouseDown={(e) => e.preventDefault()}>
          {[25, 50, 75, 100].map((p) => (
            <button key={p} type="button" onClick={() => setImgWidth(p)}
              className="py-1 px-1.5 rounded text-[10.5px] font-bold text-[#4B5563] hover:bg-[#EEF2FF] hover:text-[#2E69E0] border-none bg-transparent cursor-pointer">{p}%</button>
          ))}
          <div className="w-px h-4 bg-gray-200" />
          <button type="button" onClick={reemplazarImg} className="py-1 px-1.5 rounded text-[10.5px] font-bold text-[#4B5563] hover:bg-[#EEF2FF] hover:text-[#2E69E0] border-none bg-transparent cursor-pointer">Reemplazar</button>
          <button type="button" onClick={quitarImg} className="py-1 px-1.5 rounded text-[10.5px] font-bold text-[#DC2626] hover:bg-[#FEF2F2] border-none bg-transparent cursor-pointer">Quitar</button>
          <button type="button" onClick={cerrarImgSel} className="py-1 px-1 rounded text-[10.5px] font-bold text-[#9CA3AF] hover:text-[#4B5563] border-none bg-transparent cursor-pointer">✕</button>
        </div>
      )}

      {/* Diálogo NATIVO de la plataforma (nada de window.prompt del navegador). */}
      {dialog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(15,23,42,.45)' }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}>
          <div className="bg-white rounded-2xl w-full max-w-[380px] p-5" style={{ boxShadow: '0 20px 60px rgba(10,22,40,.28)' }} onMouseDown={(e) => e.stopPropagation()}>
            {dialog.type === 'aviso' && (<>
              <div className="text-[14px] font-bold text-[#1A1D26] mb-1.5">Un momento</div>
              <div className="text-[13px] text-[#4B5563] leading-snug">{dialog.msg}</div>
              <div className="flex justify-end mt-4"><button onClick={() => setDialog(null)} className="py-2 px-4 rounded-lg border-none bg-[#2E69E0] text-white text-[13px] font-semibold cursor-pointer">Entendido</button></div>
            </>)}

            {dialog.type === 'table' && (<>
              <div className="text-[15px] font-bold text-[#1A1D26] mb-3.5">Insertar tabla</div>
              <div className="flex items-center gap-3">
                <label className="flex-1 text-[12px] font-semibold text-[#6B7280]">Columnas
                  <input type="number" min="1" max="12" value={dialog.cols} autoFocus onChange={(e) => setDialog({ ...dialog, cols: e.target.value })} className="mt-1 w-full py-2 px-3 border border-[#E2E5EB] rounded-lg text-[14px] text-[#1A1D26] outline-none focus:border-[#2E69E0]" />
                </label>
                <label className="flex-1 text-[12px] font-semibold text-[#6B7280]">Filas
                  <input type="number" min="1" max="60" value={dialog.rows} onChange={(e) => setDialog({ ...dialog, rows: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') doTable(); }} className="mt-1 w-full py-2 px-3 border border-[#E2E5EB] rounded-lg text-[14px] text-[#1A1D26] outline-none focus:border-[#2E69E0]" />
                </label>
              </div>
              <div className="text-[11px] text-[#9098A4] mt-2">La primera fila queda como encabezado.</div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDialog(null)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
                <button onClick={doTable} className="py-2 px-4 rounded-lg border-none bg-[#2E69E0] text-white text-[13px] font-semibold cursor-pointer">Insertar</button>
              </div>
            </>)}

            {dialog.type === 'image' && (<>
              <div className="text-[15px] font-bold text-[#1A1D26] mb-3.5">Insertar imagen</div>
              <input type="url" value={dialog.url} autoFocus placeholder="https://…" onChange={(e) => setDialog({ ...dialog, url: e.target.value, err: null })} onKeyDown={(e) => { if (e.key === 'Enter') doImage(); }} className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#2E69E0]" />
              <div className="text-[11px] text-[#9098A4] mt-2">Pegá el link de la imagen. (La galería de Recursos viene después.)</div>
              {dialog.err && <div className="text-[11.5px] text-[#DC2626] mt-1.5">{dialog.err}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDialog(null)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
                <button onClick={doImage} className="py-2 px-4 rounded-lg border-none bg-[#2E69E0] text-white text-[13px] font-semibold cursor-pointer">Insertar</button>
              </div>
            </>)}

            {dialog.type === 'avatar' && (<>
              <div className="text-[15px] font-bold text-[#1A1D26] mb-1">Insertar avatar</div>
              <div className="text-[11.5px] text-[#9098A4] mb-3">Inserta el bloque en orden: nombre → Segmentación → Descripción.</div>
              <input type="text" value={dialog.name} autoFocus placeholder="Nombre del avatar" onChange={(e) => setDialog({ ...dialog, name: e.target.value, err: null })} onKeyDown={(e) => { if (e.key === 'Enter') doAvatar(); }} className="w-full py-2.5 px-3 border border-[#E2E5EB] rounded-lg text-[13px] text-[#1A1D26] outline-none focus:border-[#2E69E0]" />
              {dialog.err && <div className="text-[11.5px] text-[#DC2626] mt-1.5">{dialog.err}</div>}
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setDialog(null)} className="py-2 px-4 rounded-lg border border-[#E2E5EB] bg-white text-[#4B5563] text-[13px] font-semibold cursor-pointer">Cancelar</button>
                <button onClick={doAvatar} className="py-2 px-4 rounded-lg border-none bg-[#2E69E0] text-white text-[13px] font-semibold cursor-pointer">Insertar</button>
              </div>
            </>)}
          </div>
        </div>
      )}
      <style>{`
        .rte-content:empty:before {
          content: attr(data-placeholder);
          color: #9CA3AF;
          pointer-events: none;
        }
        .rte-content h1 { font-size: 22px; font-weight: 800; margin: 12px 0 6px; color: #0F172A; line-height: 1.25; }
        .rte-content h2 { font-size: 16px; font-weight: 700; margin: 10px 0 4px; color: #111827; }
        .rte-content h3 { font-size: 14px; font-weight: 700; margin: 8px 0 3px; color: #1F2937; }
        .rte-content p  { margin: 4px 0; }
        .rte-content ul { list-style-type: disc; padding-left: 22px; margin: 6px 0; }
        .rte-content ol { list-style-type: decimal; padding-left: 22px; margin: 6px 0; }
        .rte-content li { margin: 2px 0; display: list-item; }
        .rte-content li::marker { color: #111827; }
        .rte-content a  { color: #3B82F6; text-decoration: underline; }
        /* Tablas y h4-h6: solo aparecen en el DEL (las notas no los generan). */
        .rte-content h4, .rte-content h5, .rte-content h6 { font-size: 12px; font-weight: 800; margin: 8px 0 3px; color: #6B7280; text-transform: uppercase; letter-spacing: .05em; }
        .rte-content table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 12px; }
        .rte-content td, .rte-content th { border: 1px solid #E2E5EB; padding: 6px 9px; vertical-align: top; min-width: 80px; }
        .rte-content figure[data-drive-image] { margin: 8px 0; padding: 10px; border: 1px dashed #D0D5DD; border-radius: 8px; background: #F7F8FA; color: #9098A4; font-size: 11px; font-style: italic; text-align: center; }
        .rte-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; cursor: pointer; }
        .rte-content img.rte-img-sel { outline: 2px solid #2E69E0; outline-offset: 2px; }
        /* Flechita de plegado (estilo Google Docs) en la canaleta izquierda */
        .rte-content h1, .rte-content h2, .rte-content h3 { position: relative; }
        .rte-content h1::before, .rte-content h2::before, .rte-content h3::before {
          content: '▾';
          position: absolute;
          left: -20px;
          top: 0.15em;
          width: 16px;
          font-size: 0.62em;
          line-height: 1.4;
          color: #9CA3AF;
          text-align: center;
          cursor: pointer;
          user-select: none;
        }
        .rte-content h1:hover::before, .rte-content h2:hover::before, .rte-content h3:hover::before { color: #4B5563; }
        .rte-content h1[data-collapsed]::before,
        .rte-content h2[data-collapsed]::before,
        .rte-content h3[data-collapsed]::before { content: '▸'; color: #2563EB; }
        .rte-collapsed-hidden { display: none !important; }
      `}</style>
    </div>
  );
}
