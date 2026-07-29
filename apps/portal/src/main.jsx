import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { PortalAuthProvider } from './auth/PortalAuthProvider';
import { envMissing } from './lib/supabase';
import App from './App.jsx';
import './index.css';

function EnvMissing() {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 520, margin: '64px auto', lineHeight: 1.6 }}>
      <h1 style={{ color: '#DC2626', fontSize: 20, marginBottom: 12 }}>Faltan variables de entorno</h1>
      <p>Copiá <code>.env.example</code> a <code>.env</code> y completá:</p>
      <ul>
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_ANON_KEY</code></li>
      </ul>
      <p>La anon key está en <code>korex-ops-panel/apps/operations/.env</code> (mismo proyecto Supabase).</p>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {envMissing ? (
      <EnvMissing />
    ) : (
      <BrowserRouter>
        <PortalAuthProvider>
          <App />
        </PortalAuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);
