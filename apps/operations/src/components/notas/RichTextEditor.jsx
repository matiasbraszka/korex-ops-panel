import { useEffect, useRef } from 'react';
import { Bold, Underline as UnderlineIcon, Italic, Heading1, Heading2, Heading3, List, ListOrdered, Link2, Eraser } from 'lucide-react';
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

export default function RichTextEditor({ value, onChange, placeholder = 'Escribí acá…', minHeight = 180 }) {
  const ref = useRef(null);
  const lastInjected = useRef(null);

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
    const clean = sanitizeNoteHtml(raw);
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

  const clearFormat = () => {
    exec('removeFormat');
    // removeFormat no quita headings/lists. Los limpiamos a mano envolviendo en <p>.
    document.execCommand('formatBlock', false, 'P');
    handleInput();
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
        <Btn Icon={Heading1} title="Título principal (H1)" onClick={() => exec('formatBlock', 'H1')} />
        <Btn Icon={Heading2} title="Título grande (H2)" onClick={() => exec('formatBlock', 'H2')} />
        <Btn Icon={Heading3} title="Título chico (H3)"  onClick={() => exec('formatBlock', 'H3')} />
        <Divider />
        <Btn Icon={List}        title="Lista con viñetas" onClick={() => exec('insertUnorderedList')} />
        <Btn Icon={ListOrdered} title="Lista numerada"    onClick={() => exec('insertOrderedList')} />
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
        data-placeholder={placeholder}
        className="rte-content py-2.5 px-3 text-[13px] font-sans outline-none text-gray-800 leading-relaxed"
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
      `}</style>
    </div>
  );
}
