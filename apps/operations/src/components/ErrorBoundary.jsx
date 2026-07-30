// ErrorBoundary — aísla el fallo de una sección para que NO tumbe todo el panel.
// Si el subárbol tira un error en runtime, muestra un aviso amable y deja el
// resto del sistema funcionando (el sidebar, las otras áreas, etc.).

import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Queda en la consola para diagnóstico; no rompe la app.
    console.error('[ErrorBoundary]', this.props.label || '', error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        <div className="h-full grid place-items-center p-6">
          <div className="max-w-md text-center bg-surface border border-border rounded-xl p-6 shadow-sm">
            <div className="text-[15px] font-bold text-text mb-1">Esta sección tuvo un problema</div>
            <p className="text-[12.5px] text-text2 mb-4">
              El resto del panel sigue funcionando. Probá recargar la página; si vuelve a pasar, avisá al equipo técnico.
            </p>
            <div className="flex items-center justify-center gap-2">
              <button onClick={this.reset} className="bg-purple text-white rounded-lg px-3 py-1.5 text-[12.5px] font-semibold cursor-pointer hover:opacity-90">Reintentar</button>
              <button onClick={() => window.location.reload()} className="bg-surface border border-border text-text2 rounded-lg px-3 py-1.5 text-[12.5px] font-medium cursor-pointer hover:border-purple hover:text-purple">Recargar página</button>
            </div>
            {this.state.error?.message && (
              <p className="mt-3 text-[10.5px] text-text3 break-words">{String(this.state.error.message)}</p>
            )}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
