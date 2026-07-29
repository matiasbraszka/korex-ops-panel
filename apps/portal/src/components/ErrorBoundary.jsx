import { Component } from 'react';
import PhoneFrame from './PhoneFrame';

// Evita la "pantalla en blanco": si una pantalla tira un error, mostramos un
// mensaje amable con opción de reintentar en vez de romper toda la app.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[portal] error de pantalla:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <PhoneFrame>
          <div style={{ margin: 'auto', padding: '40px 24px', textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#1A1D26', margin: '0 0 8px' }}>Se nos trabó algo</h1>
            <p style={{ fontSize: 15, color: '#6B7280', lineHeight: 1.5, margin: '0 0 20px' }}>
              No pudimos mostrar esta pantalla. Prueba de nuevo; si sigue igual, escríbenos por WhatsApp.
            </p>
            <button
              onClick={() => { this.setState({ error: null }); window.location.assign('/'); }}
              style={{ height: 50, padding: '0 24px', borderRadius: 14, border: 'none', background: '#5B7CF5', color: '#FFFFFF', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
            >
              Volver al inicio
            </button>
          </div>
        </PhoneFrame>
      );
    }
    return this.props.children;
  }
}
