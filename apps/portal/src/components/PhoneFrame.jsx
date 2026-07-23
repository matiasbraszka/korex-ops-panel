// Marco mobile-first: columna centrada de máx 440px sobre fondo gris, como en el
// prototipo. Se usa tanto en las pantallas con nav como en las de detalle.
export default function PhoneFrame({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'stretch', background: '#E9EBF0' }}>
      <div style={{ width: '100%', maxWidth: 440, minHeight: '100vh', background: '#F7F8FA', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 0 60px rgba(10,22,40,.10)' }}>
        {children}
      </div>
    </div>
  );
}
