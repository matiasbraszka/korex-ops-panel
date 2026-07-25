import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
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
import { OnboardingProvider } from './onboarding/OnboardingProvider';
import BarraDemo from './onboarding/components/BarraDemo';
import OnboardingIndex from './onboarding/screens/OnboardingIndex';
import AgendarScreen from './onboarding/screens/AgendarScreen';
import TramoScreen from './onboarding/screens/TramoScreen';
import PreguntaScreen from './onboarding/screens/PreguntaScreen';
import RepasoScreen from './onboarding/screens/RepasoScreen';
import CelebracionScreen from './onboarding/screens/CelebracionScreen';

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

        {/* Onboarding: pantalla completa, SIN tabs ni menú lateral, para que el
            cliente no se distraiga. Es donde cae el magic link del mail. Su
            Provider envuelve solo estas rutas: el resto del portal no necesita
            cargar el catálogo de preguntas. */}
        <Route path="/onboarding" element={<OnboardingProvider><PhoneFrame><BarraDemo /><Outlet /></PhoneFrame></OnboardingProvider>}>
          <Route index element={<OnboardingIndex />} />
          <Route path="agendar" element={<AgendarScreen />} />
          <Route path="repaso" element={<RepasoScreen />} />
          <Route path="listo" element={<CelebracionScreen />} />
          <Route path=":tramo" element={<TramoScreen />} />
          <Route path=":tramo/:qkey" element={<PreguntaScreen />} />
        </Route>

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
