import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '@korex/auth';
import { envMissing } from '@korex/db';
import { AppProvider } from './context/AppContext';
import App from './App.jsx';
import './index.css';

function EnvMissingScreen() {
  return (
    <div style={{ padding: 32, fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '64px auto', lineHeight: 1.5 }}>
      <h1 style={{ color: '#DC2626', fontSize: 22, marginBottom: 12 }}>Faltan variables de entorno</h1>
      <p>El panel no puede conectarse a la base de datos. En el dashboard de Vercel, en <strong>Project Settings → Environment Variables</strong>, configurá:</p>
      <ul>
        <li><code>VITE_SUPABASE_URL</code></li>
        <li><code>VITE_SUPABASE_ANON_KEY</code></li>
      </ul>
      <p>Marcá los 3 environments (Production, Preview, Development) y redeploy.</p>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {envMissing ? (
      <EnvMissingScreen />
    ) : (
      <BrowserRouter>
        <AuthProvider>
          <AppProvider>
            <App />
          </AppProvider>
        </AuthProvider>
      </BrowserRouter>
    )}
  </StrictMode>,
);
