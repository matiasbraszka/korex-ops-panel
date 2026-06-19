import { useState, useEffect, useRef } from 'react';

// Desplegable con búsqueda: SOLO se puede elegir de las opciones provistas (gente ya
// registrada en la Base de datos). El texto tipeado solo filtra; el valor se setea al
// hacer click en una opción. Si el valor actual no está en las opciones, lo muestra
// arriba marcado para mantenerlo o reemplazarlo. Reutilizable en cualquier formulario.
export default function Combo({ value, onChange, options, placeholder = 'elegir…', empty }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(null); // null = muestra el value; string = buscando
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) { setOpen(false); setQuery(null); } };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);
  const opts = options || [];
  const q = (query || '').trim().toLowerCase();
  const list = (q ? opts.filter((o) => o.toLowerCase().includes(q)) : opts).slice(0, 80);
  const notReg = value && !opts.some((o) => o.toLowerCase() === String(value).toLowerCase());
  const pick = (v) => { onChange(v); setOpen(false); setQuery(null); };
  const inpS = { width: '100%', border: '1px solid #E2E5EB', borderRadius: 8, padding: '8px 10px', fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };
  const optS = { padding: '8px 10px', fontSize: 13, cursor: 'pointer', borderTop: '1px solid #F4F6F9' };
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input value={query == null ? (value || '') : query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => { setOpen(true); setQuery(''); }}
        placeholder={placeholder} style={{ ...inpS, paddingRight: value ? 26 : 10 }} />
      {value && <button type="button" onMouseDown={(e) => { e.preventDefault(); pick(null); }} title="quitar"
        style={{ position: 'absolute', right: 7, top: 9, border: 0, background: 'transparent', color: '#9AA4B2', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, marginTop: 4, background: '#fff', border: '1px solid #E2E5EB', borderRadius: 8, boxShadow: '0 10px 30px rgba(13,17,23,.14)', maxHeight: 220, overflowY: 'auto' }}>
          {notReg && (
            <div onMouseDown={(e) => { e.preventDefault(); pick(value); }} style={{ ...optS, borderTop: 0, color: '#b45309', background: '#FFFBEB' }}>
              {value} <span style={{ fontSize: 11 }}>· actual (sin registrar)</span>
            </div>
          )}
          {list.length === 0
            ? <div style={{ padding: '10px', fontSize: 12, color: '#9AA4B2' }}>{empty || 'Sin coincidencias. Agregalo primero en Base de datos.'}</div>
            : list.map((o) => <div key={o} onMouseDown={(e) => { e.preventDefault(); pick(o); }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#F6FBFB'; }} onMouseLeave={(e) => { e.currentTarget.style.background = '#fff'; }}
                style={optS}>{o}</div>)}
        </div>
      )}
    </div>
  );
}
