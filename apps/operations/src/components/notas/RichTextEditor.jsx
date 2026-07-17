import { useEffect, useRef, useState } from 'react';
import { Bold, Underline as UnderlineIcon, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Eraser, Baseline } from 'lucide-react';
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
export default function RichTextEditor({ value, onChange, placeholder = 'Escribí acá…', minHeight = 180, sanitize = sanitizeNoteHtml }) {
  const ref = useRef(null);
  const lastInjected = useRef(null);
  const [colorOpen, setColorOpen] = useState(false);

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
