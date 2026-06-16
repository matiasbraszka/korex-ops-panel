// Bits de UI compartidos del diseño de Finanzas (estilos inline).

// Buscador con lupa, usado en todas las pestañas.
export function Search({ value, onChange, placeholder, width = 260 }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9AA4B2" strokeWidth="2" style={{ position: 'absolute', left: 10 }}><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        style={{ border: '1px solid #E2E5EB', borderRadius: 9, padding: '8px 12px 8px 32px', fontSize: 13, width, outline: 'none', background: '#fff' }} />
    </div>
  );
}

// Botón "Nuevo …" (acción primaria teal / gris si está en modo cancelar).
export function AddButton({ active, label, onClick }) {
  return (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: '#fff', border: 0, borderRadius: 9, padding: '8px 13px', cursor: 'pointer', whiteSpace: 'nowrap', background: active ? '#64748b' : '#0EA5A4' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M5 12h14M12 5v14" /></svg>{label}
    </button>
  );
}

// Mensaje de estado centrado (cargando / error).
export const Msg = ({ children }) => <div style={{ color: '#9AA4B2', textAlign: 'center', padding: '80px 0' }}>{children}</div>;
