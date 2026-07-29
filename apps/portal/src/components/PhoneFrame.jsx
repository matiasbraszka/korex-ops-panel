// Shell de la app: ocupa toda la pantalla (100dvh) y adentro cada pantalla
// scrollea con .kxs — igual que el "teléfono" del prototipo pero sin marco.
// En PC (≥1024px) el CSS de index.css convierte la tab bar en menú lateral.
export default function PhoneFrame({ children }) {
  return (
    <div style={{ height: '100dvh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--mk-bg-panel)' }}>
      {children}
    </div>
  );
}

// Envoltorio de pantalla del prototipo: columna a pantalla completa con fade
// de entrada. `keyed` fuerza a que la animación se repita al cambiar de ruta.
export function KxScreen({ children, style }) {
  return (
    <div data-kx-screen="" style={{ height: '100%', display: 'flex', flexDirection: 'column', position: 'relative', animation: 'kxFade .25s ease', ...style }}>
      {children}
    </div>
  );
}
