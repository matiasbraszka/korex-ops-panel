// Marco mobile-first: columna centrada (440px en el teléfono; en PC se ensancha
// vía la clase .mk-shell de index.css). Se usa en todas las pantallas.
export default function PhoneFrame({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'stretch', background: '#E9EBF0' }}>
      <div className="mk-shell">
        {children}
      </div>
    </div>
  );
}
