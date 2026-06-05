import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { suggestMentions, slugifyName } from '../../utils/mentions';
import TeamAvatar from '../TeamAvatar';

// Textarea con autocomplete @mention. Wrappea un <textarea> normal y muestra
// un dropdown flotante cuando el usuario escribe "@" + (opcional) texto.
//
// - Detecta @palabra terminando en el cursor (la palabra no puede tener espacios).
// - Arrow Up/Down navegan, Enter/Tab insertan, Esc cierra.
// - Al insertar reemplaza @palabra por @primer-nombre + espacio.
//
// Props: value, onChange, onSubmit (Ctrl/Cmd+Enter), onCancel (Esc cuando NO hay
// dropdown abierto), teamMembers, excludeId, placeholder, autoFocus, disabled,
// className, style, rows.

const MENTION_RE = /(^|\s)@([a-zA-ZÀ-ſ0-9._-]*)$/;

const MentionTextarea = forwardRef(function MentionTextarea({
  value,
  onChange,
  onSubmit,
  onCancel,
  teamMembers = [],
  excludeId = null,
  placeholder,
  autoFocus = false,
  disabled = false,
  className = '',
  style = {},
  rows = 2,
  singleLine = false,
}, externalRef) {
  const taRef = useRef(null);
  useImperativeHandle(externalRef, () => taRef.current);

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useEffect(() => {
    if (autoFocus && taRef.current) {
      taRef.current.focus();
      const len = taRef.current.value.length;
      try { taRef.current.setSelectionRange(len, len); } catch {}
    }
  }, [autoFocus]);

  // Autosize (solo textarea).
  useEffect(() => {
    if (singleLine || !taRef.current) return;
    taRef.current.style.height = 'auto';
    const max = 160;
    taRef.current.style.height = Math.min(max, taRef.current.scrollHeight) + 'px';
  }, [value, singleLine]);

  const suggestions = open ? suggestMentions(query, teamMembers, { excludeId, limit: 6 }) : [];

  const closeMenu = () => { setOpen(false); setQuery(''); setHighlight(0); };

  // Detecta si hay un "@palabra" pegado al cursor; si si, abre menu.
  const detect = (val, caret) => {
    const before = val.slice(0, caret);
    const m = before.match(MENTION_RE);
    if (!m) { closeMenu(); return; }
    setQuery(m[2] || '');
    setHighlight(0);
    setOpen(true);
    // Posicion del dropdown: aproximacion simple debajo del textarea.
    if (taRef.current) {
      const r = taRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
    }
  };

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    detect(v, e.target.selectionStart || v.length);
  };

  const insertMention = (member) => {
    if (!taRef.current) return;
    const el = taRef.current;
    const caret = el.selectionStart || (value || '').length;
    const before = (value || '').slice(0, caret);
    const after = (value || '').slice(caret);
    const m = before.match(MENTION_RE);
    if (!m) { closeMenu(); return; }
    const prefix = m[1]; // espacio o '' al inicio
    const startIdx = before.length - m[0].length + prefix.length; // posicion del @
    const handle = slugifyName(member.name.split(/\s+/)[0] || member.name);
    const insert = '@' + handle + ' ';
    const next = before.slice(0, startIdx) + insert + after;
    onChange(next);
    closeMenu();
    // Reponer cursor justo despues del @nombre + espacio
    requestAnimationFrame(() => {
      try {
        const c = startIdx + insert.length;
        el.focus();
        el.setSelectionRange(c, c);
      } catch {}
    });
  };

  const handleKeyDown = (e) => {
    if (open && suggestions.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setHighlight(h => (h + 1) % suggestions.length); return; }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setHighlight(h => (h - 1 + suggestions.length) % suggestions.length); return; }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[highlight]);
        return;
      }
      if (e.key === 'Escape')   { e.preventDefault(); closeMenu(); return; }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      if (onSubmit) onSubmit();
      return;
    }
    if (e.key === 'Escape' && onCancel) {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <>
      {singleLine ? (
        <input
          ref={taRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(closeMenu, 120)}
          placeholder={placeholder}
          disabled={disabled}
          className={className}
          style={style}
        />
      ) : (
        <textarea
          ref={taRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onBlur={() => setTimeout(closeMenu, 120)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={className}
          style={style}
        />
      )}
      {open && suggestions.length > 0 && (
        <div
          className="fixed z-[300] bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px]"
          style={{ top: pos.top, left: pos.left }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onClick={() => insertMention(m)}
              onMouseEnter={() => setHighlight(i)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left bg-transparent border-none cursor-pointer ${
                i === highlight ? 'bg-purple-50' : 'hover:bg-gray-50'
              }`}
            >
              <TeamAvatar member={{ ...m, avatar: m.avatar_url || m.avatar }} size={20} />
              <div className="flex flex-col leading-tight">
                <span className="text-[12px] font-semibold text-gray-800">{m.name}</span>
                {m.role && <span className="text-[10px] text-gray-500">{m.role}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </>
  );
});

export default MentionTextarea;
