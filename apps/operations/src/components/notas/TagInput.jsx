import { useState } from 'react';
import { X } from 'lucide-react';

// Input de tags libres. Enter o coma commit-ean el tag.
//
// Props:
//   tags: string[]
//   onChange: (tags: string[]) => void
//   suggestions: string[] (lista de tags ya usados por el equipo, para chips clickeables)

const normalize = (t) => t.trim().toLowerCase().replace(/^#+/, '').replace(/\s+/g, '-').slice(0, 30);

export default function TagInput({ tags = [], onChange, suggestions = [] }) {
  const [draft, setDraft] = useState('');

  const addTag = (raw) => {
    const t = normalize(raw);
    if (!t) return;
    if (tags.includes(t)) return;
    onChange?.([...tags, t]);
    setDraft('');
  };

  const removeTag = (t) => onChange?.(tags.filter((x) => x !== t));

  const handleKey = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (draft.trim()) addTag(draft);
    } else if (e.key === 'Backspace' && !draft && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  const visibleSuggestions = suggestions.filter((s) => !tags.includes(s)).slice(0, 6);

  return (
    <div>
      <div className="border border-gray-200 rounded-lg py-1.5 px-2 bg-white focus-within:border-blue-400 flex flex-wrap gap-1 items-center">
        {tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-[11px] font-semibold rounded-full py-0.5 pl-2 pr-1">
            #{t}
            <button
              type="button"
              onClick={() => removeTag(t)}
              className="hover:bg-blue-100 rounded-full p-0.5 text-blue-500 bg-transparent border-none cursor-pointer"
              aria-label={`Quitar tag ${t}`}
            ><X size={10} /></button>
          </span>
        ))}
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKey}
          onBlur={() => { if (draft.trim()) addTag(draft); }}
          placeholder={tags.length ? '' : 'Escribí un tag y Enter (ej: estrategia, urgente)'}
          className="flex-1 min-w-[100px] border-none outline-none text-[12px] font-sans py-0.5 px-1 bg-transparent"
        />
      </div>
      {visibleSuggestions.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mr-0.5">Usados:</span>
          {visibleSuggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addTag(s)}
              className="text-[10.5px] text-gray-500 hover:text-blue-600 hover:bg-blue-50 bg-transparent border border-gray-200 hover:border-blue-300 rounded-full py-0.5 px-2 cursor-pointer font-sans transition-colors"
            >+ #{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
