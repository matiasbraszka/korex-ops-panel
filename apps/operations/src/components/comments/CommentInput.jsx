import { useEffect, useRef } from 'react';

// CommentInput — textarea + boton enviar. Modo controlado por el padre.
// Ctrl/Cmd + Enter envia. Auto-resize hasta 6 lineas y despues scroll.

export default function CommentInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving = false,
  autoFocus = false,
  placeholder = 'Escribí un comentario… (Ctrl+Enter para enviar)',
  submitLabel = 'Comentar',
  showCancel = false,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (autoFocus && ref.current) {
      ref.current.focus();
      // Cursor al final
      const len = ref.current.value.length;
      try { ref.current.setSelectionRange(len, len); } catch {}
    }
  }, [autoFocus]);

  // Autosize: ajusta el alto segun contenido (hasta ~6 lineas).
  useEffect(() => {
    if (!ref.current) return;
    ref.current.style.height = 'auto';
    const max = 140;
    ref.current.style.height = Math.min(max, ref.current.scrollHeight) + 'px';
  }, [value]);

  const canSubmit = !saving && String(value || '').trim().length > 0;

  const handleKeyDown = (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (canSubmit) onSubmit();
    } else if (e.key === 'Escape' && showCancel && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div className="flex flex-col gap-1.5">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={saving}
        className="w-full border border-gray-200 rounded-lg py-2 px-3 text-[12.5px] font-sans outline-none focus:border-blue-400 resize-none bg-white disabled:bg-gray-50"
        style={{ minHeight: 44 }}
      />
      <div className="flex items-center justify-end gap-1.5">
        {showCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="text-[11.5px] text-gray-500 hover:text-gray-700 bg-transparent border-none cursor-pointer px-2 py-1 rounded disabled:opacity-50"
          >Cancelar</button>
        )}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`text-[11.5px] font-semibold rounded-md px-3 py-1.5 transition-colors ${
            canSubmit
              ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
          }`}
        >{saving ? 'Guardando…' : submitLabel}</button>
      </div>
    </div>
  );
}
