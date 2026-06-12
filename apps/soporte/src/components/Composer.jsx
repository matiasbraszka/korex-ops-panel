import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useSoporte } from '../context/SoporteContext.jsx';

// Caja de respuesta: Enter envía, Shift+Enter hace salto de línea.
// Mantiene un borrador por conversación (ref en el contexto, sobrevive al cambiar de chat).
export default function Composer({ onSent }) {
  const { selectedId, sendMessage, getDraft, setDraft } = useSoporte();
  const [text, setText] = useState('');
  const taRef = useRef(null);

  // Cambiar de conversación: restaurar borrador y enfocar.
  useEffect(() => {
    setText(getDraft(selectedId));
    const ta = taRef.current;
    if (ta) {
      ta.style.height = 'auto';
      ta.focus();
    }
  }, [selectedId, getDraft]);

  const autosize = () => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
  };

  const onChange = (e) => {
    setText(e.target.value);
    setDraft(selectedId, e.target.value);
    autosize();
  };

  const submit = () => {
    const body = text.trim();
    if (!body) return;
    sendMessage(selectedId, body);
    setText('');
    setDraft(selectedId, '');
    const ta = taRef.current;
    if (ta) ta.style.height = 'auto';
    onSent?.();
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="bg-white border-t border-border p-2.5 flex items-end gap-2 shrink-0">
      <textarea
        ref={taRef}
        value={text}
        onChange={onChange}
        onKeyDown={onKeyDown}
        rows={1}
        placeholder="Escribí un mensaje… (Enter envía)"
        className="flex-1 resize-none text-[13px] leading-relaxed px-3 py-2 rounded-xl border border-border bg-surface2 outline-none focus:border-[#F59E0B] focus:bg-white transition-colors min-h-[40px] max-h-[120px]"
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        className={`shrink-0 w-10 h-10 rounded-full border-0 flex items-center justify-center transition-colors ${text.trim() ? 'bg-[#22C55E] text-white cursor-pointer hover:bg-[#16A34A]' : 'bg-surface2 text-text3 cursor-default'}`}
      >
        <Send size={16} />
      </button>
    </div>
  );
}
