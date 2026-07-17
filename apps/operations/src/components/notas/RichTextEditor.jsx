import { useEffect, useRef, useState } from 'react';
import { Bold, Underline as UnderlineIcon, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Eraser, Baseline, Table, Image as ImageIcon, UserPlus } from 'lucide-react';
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
export default function RichTextEditor({ value, onChange, placeholder = 'Escribí acá…', minHeight = 180, sanitize = sanitizeNoteHtml, delTools = false, onInsertImage, onNewAvatar }) {
  const ref = useRef(null);
  const lastInjected = useRef(null);
  const [colorOpen, setColorOpen] = useState(false);
  const [dialog, setDialog] = useState(null); // diálogo nativo (tabla/imagen/avatar/aviso)

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

  const handlePaste = (e) => {
    // Pegar como texto plano evita arrastrar estilos raros de Word/Google Docs.
    e.preventDefault();
    const text = (e.clipboardData || window.clipboardData).getData('text');
    document.execCommand('insertText', false, text);
    handleInput();
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
    document.execCommand('styleWithCSS', false, true);
    document.execCommand('foreColor', false, color);
    document.execCommand('styleWithCSS', false, false);
    handleInput();
    setColorOpen(false);
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
    ref.current?.focus();
    if (savedRange.current) { const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(savedRange.current); }
    document.execCommand('insertHTML', false, html);
    savedRange.current = null;
    handleInput();
  };

  // Tamaño de letra: agranda/achica el texto seleccionado (relativo, con span+style).
  // No abre diálogo: opera directo sobre la selección.
  const changeFontSize = (bigger) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) { setDialog({ type: 'aviso', msg: 'Seleccioná primero el texto que querés ' + (bigger ? 'agrandar' : 'achicar') + '.' }); return; }
    const span = document.createElement('span');
    span.style.fontSize = bigger ? 'larger' : 'smaller';
    const range = sel.getRangeAt(0);
    try { span.appendChild(range.extractContents()); range.insertNode(span); } catch { return; }
    sel.removeAllRanges();
    handleInput();
    ref.current?.focus();
  };

  // Abren los diálogos nativos (guardando la selección).
  const openTable = () => { saveSelection(); setDialog({ type: 'table', cols: '3', rows: '3' }); };
  const openImage = () => { saveSelection(); if (onInsertImage) { onInsertImage(insertHTML); return; } setDialog({ type: 'image', url: '' }); };
  const openAvatar = () => { saveSelection(); if (onNewAvatar) { onNewAvatar(insertHTML); return; } setDialog({ type: 'avatar', name: '' }); };

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
    setDialog(null);
    insertHTML(`<img src="${safe.replace(/"/g, '&quot;')}" alt="" style="max-width:100%;border-radius:8px;margin:8px 0" /><p></p>`);
  };
  const doAvatar = () => {
    const nombre = (dialog.name || '').trim();
    if (!nombre) { setDialog({ ...dialog, err: 'Poné un nombre.' }); return; }
    const e = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    setDialog(null);
    insertHTML(`<h2>Avatar — ${e(nombre)}</h2><h3>Segmentación</h3><p></p><h3>Descripción</h3><p></p>`);
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
    <div className="border border-gray-200 rounded-lg bg-white focus-within:border-blue-400 transition-colors">
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
      <div
        ref={ref}
        contentEditable
        suppressContentEditableWarning
        onInput={handleInput}
        onPaste={handlePaste}
        onClick={handleClick}
        data-placeholder={placeholder}
        className="rte-content py-2.5 pr-3 pl-7 text-[13px] font-sans outline-none text-gray-800 leading-relaxed"
        style={{ minHeight }}
      />

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
        .rte-content img { max-width: 100%; height: auto; border-radius: 8px; margin: 8px 0; }
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
