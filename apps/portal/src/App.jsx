import { Routes, Route, Navigate } from 'react-router-dom';
import { usePortalAuth } from './auth/PortalAuthProvider';
import Layout from './components/Layout';
import PhoneFrame from './components/PhoneFrame';
import ErrorBoundary from './components/ErrorBoundary';
import { Loading } from './components/ui';
import LoginScreen from './screens/LoginScreen';
import InicioScreen from './screens/InicioScreen';
import GuionesTabScreen from './screens/GuionesTabScreen';
import DocumentoScreen from './screens/DocumentoScreen';
import EmbudosScreen from './screens/EmbudosScreen';
import EmbudoScreen from './screens/EmbudoScreen';
import EntregablesScreen from './screens/EntregablesScreen';
import MaterialScreen from './screens/MaterialScreen';
import SubirPedidoScreen from './screens/SubirPedidoScreen';
import AccesoMetaScreen from './screens/AccesoMetaScreen';

export default function App() {
  const { authed, loading } = usePortalAuth();

  if (loading) {
    return <PhoneFrame><div style={{ margin: 'auto' }}><Loading label="Abriendo tu espacio…" /></div></PhoneFrame>;
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
        {/* Tabs con navegación inferior (menú lateral en PC): Inicio · Guiones · Embudos · Material */}
        <Route element={<Layout />}>
          <Route path="/" element={<InicioScreen />} />
          <Route path="/embudos" element={<EmbudosScreen />} />
          <Route path="/material" element={<MaterialScreen />} />
        </Route>
        {/* Guiones: bienvenida la primera vez; después va DIRECTO al documento */}
        <Route path="/guiones" element={<GuionesTabScreen />} />
        {/* Pantallas inmersivas (con "Volver") */}
        <Route path="/documento/:sid/:tipo" element={<DocumentoScreen />} />
        <Route path="/embudo/:id" element={<EmbudoScreen />} />
        <Route path="/entregables/:id" element={<EntregablesScreen />} />
        <Route path="/pedido/:id" element={<SubirPedidoScreen />} />
        <Route path="/meta" element={<AccesoMetaScreen />} />
        {/* Rutas del portal viejo → sus equivalentes nuevas */}
        <Route path="/funnels" element={<Navigate to="/embudos" replace />} />
        <Route path="/avance" element={<Navigate to="/embudos" replace />} />
        <Route path="/recursos" element={<Navigate to="/material" replace />} />
        <Route path="/perfil" element={<Navigate to="/" replace />} />
        <Route path="/funnel/:id" element={<Navigate to="/embudos" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}
