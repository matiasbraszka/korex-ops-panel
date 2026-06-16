import { useState } from 'react';

// Celda editable al click (estilo Google Sheets). type: text | num | date.
// Muestra el valor; al clickear se vuelve input; guarda al salir / Enter (si cambió).
export default function EditableCell({ value, type = 'text', onSave, display, align = 'left', className = '' }) {
  const [editing, setEditing] = useState(false);
  const fmt = display || ((v) => (v == null || v === '' ? '—' : String(v)));

  if (!editing) {
    return (
      <button type="button" onClick={() => setEditing(true)}
        className={`w-full bg-transparent border border-transparent rounded px-1 py-0.5 cursor-text hover:border-border ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
        {fmt(value)}
      </button>
    );
  }
  const commit = (e) => {
    const nv = e.target.value;
    setEditing(false);
    if (String(nv) !== String(value ?? '')) onSave?.(nv);
  };
  return (
    <input autoFocus
      type={type === 'date' ? 'date' : 'text'}
      inputMode={type === 'num' ? 'decimal' : undefined}
      defaultValue={value == null ? '' : value}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); if (e.key === 'Escape') setEditing(false); }}
      className={`w-full text-[12px] border border-[#0EA5A4] rounded px-1 py-0.5 outline-none bg-white ${align === 'right' ? 'text-right' : ''}`}
    />
  );
}
