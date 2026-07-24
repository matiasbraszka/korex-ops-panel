import { Routes, Route, Navigate } from 'react-router-dom';
import { usePortalAuth } from './auth/PortalAuthProvider';
import Layout from './components/Layout';
import PhoneFrame from './components/PhoneFrame';
import ErrorBoundary from './components/ErrorBoundary';
import { Loading } from './components/ui';
import LoginScreen from './screens/LoginScreen';
import InicioScreen from './screens/InicioScreen';
import FunnelsScreen from './screens/FunnelsScreen';
import RecursosScreen from './screens/RecursosScreen';
import PerfilScreen from './screens/PerfilScreen';
import FunnelScreen from './screens/FunnelScreen';
import GuionesDocScreen from './screens/GuionesDocScreen';
import GuionDocScreen from './screens/GuionDocScreen';
import CarpetaDetalleScreen from './screens/CarpetaDetalleScreen';

export default function App() {
  const { authed, loading } = usePortalAuth();

  if (loading) {
    return <PhoneFrame><div style={{ margin: 'auto' }}><Loading label="Abriendo tu plataforma…" /></div></PhoneFrame>;
  }

  if (!authed) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
        <Route path="/login" element={<Navigate to="/" replace />} />
        {/* Tabs con header + navegación inferior: Home · Funnels · Recursos · Perfil */}
        <Route element={<Layout />}>
          <Route path="/" element={<InicioScreen />} />
          <Route path="/funnels" element={<FunnelsScreen />} />
          <Route path="/recursos" element={<RecursosScreen />} />
          <Route path="/perfil" element={<PerfilScreen />} />
        </Route>
        {/* La vieja pantalla "Avance" ahora es el tab Funnels (pipeline por funnel). */}
        <Route path="/avance" element={<Navigate to="/funnels" replace />} />
        <Route path="/funnel/:id" element={<FunnelScreen />} />
        <Route path="/funnel/:id/guiones/:tipo" element={<GuionesDocScreen />} />
        <Route path="/guiones/:id" element={<GuionDocScreen />} />
        {/* Carpeta abierta desde un funnel: viaja el funnel (fid) para que la subida
            caiga en la carpeta REAL de ese funnel en operaciones. */}
        <Route path="/funnel/:fid/carpeta/:id" element={<CarpetaDetalleScreen />} />
        <Route path="/carpetas/:id" element={<CarpetaDetalleScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
