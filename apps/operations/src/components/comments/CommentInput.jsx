import { useRef } from 'react';
import MentionTextarea from './MentionTextarea';
import { useApp } from '../../context/AppContext';

// CommentInput — textarea con @mention autocomplete + boton enviar.
// Ctrl/Cmd + Enter envia. Auto-resize hasta 6 lineas y despues scroll.

export default function CommentInput({
  value,
  onChange,
  onSubmit,
  onCancel,
  saving = false,
  autoFocus = false,
  placeholder = 'Escribí un comentario… Usá @ para etiquetar (Ctrl+Enter para enviar)',
  submitLabel = 'Comentar',
  showCancel = false,
}) {
  const { teamMembers, currentUser } = useApp();
  const ref = useRef(null);

  const canSubmit = !saving && String(value || '').trim().length > 0;

  return (
    <div className="flex flex-col gap-1.5">
      <MentionTextarea
        ref={ref}
        value={value}
        onChange={onChange}
        onSubmit={() => canSubmit && onSubmit()}
        onCancel={showCancel ? onCancel : undefined}
        teamMembers={teamMembers || []}
        excludeId={currentUser?.id}
        placeholder={placeholder}
        autoFocus={autoFocus}
        disabled={saving}
        rows={2}
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
