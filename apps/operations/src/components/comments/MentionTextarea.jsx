import { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import { createPortal } from 'react-dom';
import { suggestMentions, slugifyName } from '../../utils/mentions';
import TeamAvatar from '../TeamAvatar';

// Textarea/input con autocomplete @mention. Dropdown renderizado en portal
// (document.body) y z-index altísimo para escapar de cualquier contenedor
// con overflow/zindex (side panels, modales).
//
// Detecta @palabra terminando en el cursor. Arrow keys navegan, Enter/Tab
// insertan, Esc cierra. Al insertar reemplaza @palabra por @primer-nombre+espacio.

const MENTION_RE = /(^|\s|\()@([\w.\-]*)$/;

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

  useEffect(() => {
    if (singleLine || !taRef.current) return;
    taRef.current.style.height = 'auto';
    const max = 160;
    taRef.current.style.height = Math.min(max, taRef.current.scrollHeight) + 'px';
  }, [value, singleLine]);

  const suggestions = open ? suggestMentions(query, teamMembers, { excludeId, limit: 6 }) : [];

  const closeMenu = () => { setOpen(false); setQuery(''); setHighlight(0); };

  const updatePos = () => {
    if (!taRef.current) return;
    const r = taRef.current.getBoundingClientRect();
    const dropdownHeight = 240;
    const spaceBelow = window.innerHeight - r.bottom;
    const top = spaceBelow < dropdownHeight ? Math.max(8, r.top - dropdownHeight - 4) : r.bottom + 4;
    setPos({ top, left: r.left });
  };

  const detect = (val, caret) => {
    const safeCaret = typeof caret === 'number' ? caret : val.length;
    const before = val.slice(0, safeCaret);
    const m = before.match(MENTION_RE);
    if (!m) { closeMenu(); return; }
    setQuery(m[2] || '');
    setHighlight(0);
    setOpen(true);
    updatePos();
  };

  // Reposicionar si la ventana cambia mientras el menu esta abierto.
  useEffect(() => {
    if (!open) return;
    const handler = () => updatePos();
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
    };
  }, [open]);

  const handleChange = (e) => {
    const v = e.target.value;
    onChange(v);
    detect(v, e.target.selectionStart);
  };

  // Tambien detectamos al hacer click o keyup (mover cursor sin tipear).
  const handleKeyUp = (e) => {
    if (['ArrowDown','ArrowUp','Enter','Tab','Escape'].includes(e.key) && open) return;
    detect(e.target.value, e.target.selectionStart);
  };
  const handleClick = (e) => {
    detect(e.target.value, e.target.selectionStart);
  };

  const insertMention = (member) => {
    if (!taRef.current) return;
    const el = taRef.current;
    const caret = typeof el.selectionStart === 'number' ? el.selectionStart : (value || '').length;
    const before = (value || '').slice(0, caret);
    const after = (value || '').slice(caret);
    const m = before.match(MENTION_RE);
    if (!m) { closeMenu(); return; }
    const prefix = m[1];
    const startIdx = before.length - m[0].length + prefix.length;
    const handle = slugifyName(member.name.split(/\s+/)[0] || member.name);
    const insert = '@' + handle + ' ';
    const next = before.slice(0, startIdx) + insert + after;
    onChange(next);
    closeMenu();
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
      if (e.key === 'Escape') { e.preventDefault(); closeMenu(); return; }
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

  const dropdown = open && (
    <div
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 9999,
        background: 'white',
        border: '1px solid #E5E7EB',
        borderRadius: 8,
        boxShadow: '0 10px 30px rgba(0,0,0,0.15)',
        padding: '4px 0',
        minWidth: 240,
        maxHeight: 240,
        overflowY: 'auto',
      }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {suggestions.length === 0 ? (
        <div className="px-3 py-2 text-[12px] text-gray-400">Sin coincidencias para "{query}"</div>
      ) : suggestions.map((m, i) => (
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
  );

  return (
    <>
      {singleLine ? (
        <input
          ref={taRef}
          type="text"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          onBlur={() => setTimeout(closeMenu, 150)}
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
          onKeyUp={handleKeyUp}
          onClick={handleClick}
          onBlur={() => setTimeout(closeMenu, 150)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={className}
          style={style}
        />
      )}
      {dropdown && createPortal(dropdown, document.body)}
    </>
  );
});

export default MentionTextarea;
