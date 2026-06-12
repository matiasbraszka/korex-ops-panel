import { useEffect, useRef, useState } from 'react';
import { Send, MessageCircle } from 'lucide-react';
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
    <div className="bg-white border-t border-border px-3 py-2.5 shrink-0">
      <div className="flex items-end gap-2 rounded-2xl border border-border bg-white px-2.5 py-1.5 focus-within:border-[#5B7CF5] transition-colors">
        <MessageCircle size={17} className="text-text3 shrink-0 mb-2" />
        <textarea
          ref={taRef}
          value={text}
          onChange={onChange}
          onKeyDown={onKeyDown}
          rows={1}
          placeholder="Escribí un mensaje…"
          className="flex-1 resize-none text-[13px] leading-relaxed py-1.5 border-0 bg-transparent outline-none min-h-[32px] max-h-[120px]"
        />
        <button
          onClick={submit}
          disabled={!text.trim()}
          className={`shrink-0 w-9 h-9 rounded-xl border-0 flex items-center justify-center transition-colors ${text.trim() ? 'bg-[#5B7CF5] text-white cursor-pointer hover:bg-[#4A67D8]' : 'bg-surface2 text-text3 cursor-default'}`}
        >
          <Send size={15} />
        </button>
      </div>
      <div className="text-[10px] text-text3 mt-1 px-1">Enter envía · Shift+Enter salto de línea</div>
    </div>
  );
}
